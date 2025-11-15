# app/routers/payment_routes.py
"""
Payment routes (Razorpay + dev-friendly fallback)
Fixed: Using showtime instead of show, with proper foreign key handling
"""
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Header, Body, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from redis.asyncio import Redis
import hmac
import hashlib
import logging
import os
import time
import re
import uuid

# Local imports
from app.database.database import get_db
from app.database.payment_models import Payment, Order
from app.database.models import Booking, Showtime, Movie, Theatre
from app.services.pdf_generator import generate_ticket_pdf, get_ticket_url
from app.core.redis import get_redis
from app.services.lock_validation import validate_locks_for_booking, release_seat_locks_simple
from app.core.config import settings as config_settings
from app.routers.public_routes import _generate_seat_layout_template

# Optional razorpay import
try:
    import razorpay  # type: ignore
    from razorpay.errors import BadRequestError  # type: ignore
except Exception:
    razorpay = None
    BadRequestError = Exception  # fallback

logger = logging.getLogger(__name__)

RAZORPAY_KEY_ID: Optional[str] = getattr(config_settings, "RAZORPAY_KEY_ID", None)
RAZORPAY_KEY_SECRET: Optional[str] = getattr(config_settings, "RAZORPAY_KEY_SECRET", None)
PAYMENTS_WEBHOOK_SECRET: Optional[str] = getattr(config_settings, "PAYMENTS_WEBHOOK_SECRET", None)
PUBLIC_BASE_URL: str = getattr(config_settings, "PUBLIC_BASE_URL", "http://127.0.0.1:8001")
PAYMENT_GATEWAY: str = getattr(config_settings, "PAYMENT_GATEWAY", "razorpay")

razorpay_client: Optional[Any] = None
if razorpay and RAZORPAY_KEY_ID is not None and RAZORPAY_KEY_SECRET is not None:
    try:
        razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))  # type: ignore
    except Exception as e:
        logger.warning("Failed to initialize razorpay client: %s", e)
        razorpay_client = None

router = APIRouter(prefix="/payments", tags=["Payments"])


class CreateOrderResponse(BaseModel):
    key_id: Optional[str] = None
    order_id: str
    amount: int  # paise
    currency: str
    notes: Dict[str, Any] = {}
    user_email: str
    breakdown: Optional[Dict[str, Any]] = None  # Optional breakdown for frontend display


class VerifyPaymentResponse(BaseModel):
    booking_id: int
    download_url: str
    message: str
    amount: float


# helpers
def _parse_amount_rupees(amount_raw: Any) -> float:
    if amount_raw is None:
        raise ValueError("amount missing")
    if isinstance(amount_raw, (int, float)) and not isinstance(amount_raw, bool):
        if isinstance(amount_raw, int) and amount_raw >= 10000:
            return float(amount_raw) / 100.0
        return float(amount_raw)
    if isinstance(amount_raw, str):
        s = amount_raw.strip()
        s = re.sub(r"[^\d\.]", "", s)
        if s == "":
            raise ValueError("amount string empty after cleaning")
        return float(s)
    raise ValueError("unsupported amount type")


def _normalize_seat_ids(seat_ids_raw: Any) -> List[int]:
    seat_ids: List[int] = []
    if isinstance(seat_ids_raw, list):
        for it in seat_ids_raw:
            if isinstance(it, int):
                seat_ids.append(it)
            elif isinstance(it, str) and it.isdigit():
                seat_ids.append(int(it))
            elif isinstance(it, dict):
                sid = it.get("seatId") or it.get("seat_id") or it.get("id")
                if sid is not None:
                    try:
                        if isinstance(sid, str) and not sid.isdigit():
                            continue
                        seat_ids.append(int(sid))
                    except Exception:
                        continue
    elif isinstance(seat_ids_raw, str):
        parts = [p.strip() for p in seat_ids_raw.split(",") if p.strip()]
        for p in parts:
            if p.isdigit():
                seat_ids.append(int(p))
    return seat_ids


def _normalize_owner(data: Dict[str, Any]) -> str:
    return (
        data.get("owner")
        or data.get("lockOwner")
        or data.get("owner_token")
        or data.get("lock_id")
        or data.get("lockId")
        or ""
    )


def _normalize_showtime_id(data: Dict[str, Any]) -> Optional[int]:
    val = data.get("showtime_id") or data.get("showtimeId") or data.get("showtime")
    if isinstance(val, dict) and "id" in val:
        try:
            return int(val["id"])
        except Exception:
            return None
    try:
        return int(val) if val is not None else None
    except Exception:
        return None


@router.get("/health")
def payment_health() -> Dict[str, Any]:
    gateway_status: Dict[str, Any] = {
        "gateway": PAYMENT_GATEWAY,
        "razorpay_configured": bool(RAZORPAY_KEY_ID is not None and RAZORPAY_KEY_SECRET is not None),
        "status": "unhealthy",
    }

    if PAYMENT_GATEWAY == "razorpay":
        if RAZORPAY_KEY_ID is None or RAZORPAY_KEY_SECRET is None:
            gateway_status["message"] = "Razorpay credentials not configured"
            return gateway_status
        try:
            if razorpay_client is None:
                gateway_status["message"] = "Razorpay client not initialized"
                return gateway_status
            razorpay_client.order.all({"count": 1})  # type: ignore
            gateway_status["status"] = "healthy"
            gateway_status["key_id"] = RAZORPAY_KEY_ID
            gateway_status["message"] = "Razorpay integration operational"
            return gateway_status
        except Exception as e:
            gateway_status["error"] = str(e)
            return gateway_status
    else:
        gateway_status["status"] = "healthy"
        gateway_status["message"] = "Fallback gateway mode active"
        return gateway_status


@router.get("/gateway-status")
def get_gateway_status() -> Dict[str, Any]:
    return {
        "gateway": PAYMENT_GATEWAY,
        "razorpay_available": bool(RAZORPAY_KEY_ID is not None and RAZORPAY_KEY_SECRET is not None and razorpay_client is not None),
        "key_id": RAZORPAY_KEY_ID if RAZORPAY_KEY_ID is not None else None,
    }


@router.post("/validate-locks")
async def validate_seat_locks(
    request_data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> Dict[str, Any]:
    try:
        showtime_id = _normalize_showtime_id(request_data)
        if showtime_id is None:
            raise HTTPException(status_code=400, detail="Missing showtime identifier")

        seat_ids = _normalize_seat_ids(
            request_data.get("seat_ids")
            or request_data.get("seatIds")
            or request_data.get("seats")
            or request_data.get("seat_list")
        )
        if not seat_ids:
            raise HTTPException(status_code=400, detail="seat_ids must be a non-empty array")

        owner = _normalize_owner(request_data)

        showtime_exists = db.query(Showtime).filter(Showtime.id == showtime_id).first()
        if showtime_exists is None:
            raise HTTPException(status_code=404, detail="Showtime not found")

        try:
            lock_result = await validate_locks_for_booking(
                redis=redis, showtime_id=showtime_id, seat_ids=seat_ids, owner=owner
            )
        except Exception as e:
            logger.warning("Lock validation runtime error (treating as warning): %s", e)
            return {"valid": True, "warning": "locks_unavailable", "message": "Seat locking service unavailable; proceeding without guaranteed locks."}

        if not lock_result.get("valid", False):
            return {
                "valid": False,
                "invalid_seats": lock_result.get("invalid_seats", []),
                "reason": lock_result.get("reason", "locks_invalid"),
                "message": "Your seats are no longer locked. Please pick new seats.",
            }
        return {"valid": True, "message": "Seats are locked and ready for payment"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error validating locks")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-order", response_model=CreateOrderResponse)
async def create_order(
    request_data: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> CreateOrderResponse:
    logger.debug("create_order payload: %s", request_data)

    try:
        showtime_id = _normalize_showtime_id(request_data)
        owner = _normalize_owner(request_data)
        user_email = request_data.get("user_email") or request_data.get("userEmail") or request_data.get("email")
        currency = request_data.get("currency") or "INR"

        amount_raw = (
            request_data.get("amount")
            or request_data.get("total")
            or request_data.get("totalAmount")
            or request_data.get("amount_rupees")
        )
        amount_paise_raw = request_data.get("amount_paise") or request_data.get("amountPaise")

        seat_ids = _normalize_seat_ids(
            request_data.get("seat_ids")
            or request_data.get("seatIds")
            or request_data.get("seats")
            or request_data.get("seat_list")
        )

        if showtime_id is None:
            raise HTTPException(status_code=400, detail="showtime_id is required")
        showtime = db.query(Showtime).filter(Showtime.id == int(showtime_id)).first()
        if showtime is None:
            raise HTTPException(status_code=404, detail="Showtime not found")

        if not seat_ids:
            raise HTTPException(status_code=400, detail="seat_ids must be provided")

        # derive amount
        if amount_paise_raw is not None:
            try:
                amount_rupees = float(int(amount_paise_raw) / 100.0)
            except Exception:
                raise HTTPException(status_code=400, detail="amount_paise must be integer paise")
        else:
            try:
                if amount_raw is None:
                    # FIXED: Calculate amount from seat prices if seats are provided with prices
                    seats_data = request_data.get("seats") or request_data.get("seat_list") or []
                    if isinstance(seats_data, list) and len(seats_data) > 0:
                        # Check if seats have price information
                        total_from_seats = 0.0
                        has_prices = False
                        seat_count = 0
                        for seat in seats_data:
                            if isinstance(seat, dict):
                                price = seat.get("price") or seat.get("price_rupees") or seat.get("amount")
                                if price is not None:
                                    try:
                                        price_float = float(price)
                                        total_from_seats += price_float
                                        has_prices = True
                                        seat_count += 1
                                        logger.debug("create_order: seat %s has price %s", seat.get("seatId") or seat.get("seat_id") or seat.get("id"), price_float)
                                    except (ValueError, TypeError) as e:
                                        logger.warning("create_order: invalid price for seat %s: %s", seat, e)
                                        pass
                        
                        if has_prices and total_from_seats > 0:
                            amount_rupees = total_from_seats
                            logger.info("create_order: calculated amount from %d seat prices: %s (total: %s)", seat_count, total_from_seats, amount_rupees)
                        else:
                            # Fallback to showtime price or default
                            fallback_price_per = getattr(showtime, "price", None) or request_data.get("price_per_seat") or 250.0
                            try:
                                fallback_price_per = float(fallback_price_per)
                            except Exception:
                                fallback_price_per = 250.0
                            amount_rupees = float(fallback_price_per) * max(1, len(seat_ids))
                            logger.debug("create_order: amount missing - computed fallback amount_rupees=%s", amount_rupees)
                    else:
                        # No seats data, use fallback
                        fallback_price_per = getattr(showtime, "price", None) or request_data.get("price_per_seat") or 250.0
                        try:
                            fallback_price_per = float(fallback_price_per)
                        except Exception:
                            fallback_price_per = 250.0
                        amount_rupees = float(fallback_price_per) * max(1, len(seat_ids))
                        logger.debug("create_order: amount missing - computed fallback amount_rupees=%s", amount_rupees)
                else:
                    amount_rupees = _parse_amount_rupees(amount_raw)
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"amount invalid: {e}")

        if amount_rupees <= 0:
            raise HTTPException(status_code=400, detail="amount must be greater than 0")

        lock_warning = None
        if not owner:
            owner = str(uuid.uuid4())
            lock_warning = "owner_synthesized"

        if user_email is None:
            user_email = f"guest+{int(time.time()*1000)}@cineverse.local"

        # validate locks (soft-fail)
        try:
            if owner:
                lock_validation = await validate_locks_for_booking(redis=redis, showtime_id=int(showtime_id), seat_ids=seat_ids, owner=owner)
            else:
                lock_validation = {"valid": True}
        except Exception as e:
            logger.warning("Lock validation error during create_order (continuing): %s", e)
            lock_warning = (lock_warning or "") + f";locks_unavailable:{e}"
            lock_validation = {"valid": True}

        if not lock_validation.get("valid", False):
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Seat locks invalid or expired",
                    "invalid_seats": lock_validation.get("invalid_seats", []),
                    "reason": lock_validation.get("reason", "locks_invalid"),
                },
            )

        if PAYMENT_GATEWAY == "razorpay" and (RAZORPAY_KEY_ID is None or RAZORPAY_KEY_SECRET is None or razorpay_client is None):
            raise HTTPException(
                status_code=503,
                detail="Razorpay gateway required but not configured. Set PAYMENT_GATEWAY to fallback if needed.",
            )

        amount_paise = int(round(amount_rupees * 100))
        movie = db.query(Movie).filter(Movie.id == showtime.movie_id).first() if getattr(showtime, "movie_id", None) is not None else None
        theatre = db.query(Theatre).filter(Theatre.id == showtime.theatre_id).first() if getattr(showtime, "theatre_id", None) is not None else None

        # build safe receipt (<=40 chars)
        base_receipt = f"bk_{showtime_id}_{str(user_email).split('@')[0]}"
        sanitized = re.sub(r"[^A-Za-z0-9_]", "", base_receipt)[:40]
        if len(sanitized) == 0:
            sanitized = f"bk_{showtime_id}_{uuid.uuid4().hex[:8]}"
        receipt_candidate = sanitized

        created_order: Dict[str, Any]
        try:
            if PAYMENT_GATEWAY == "razorpay" and razorpay_client is not None:
                try:
                    created_order = razorpay_client.order.create(
                        {
                            "amount": amount_paise,
                            "currency": currency,
                            "receipt": receipt_candidate,
                            "notes": {
                                "showtime_id": str(showtime_id),
                                "seat_ids": ",".join(map(str, seat_ids)),
                                "user_email": str(user_email),
                                "movie": movie.title if movie else "Unknown",
                                "theatre": theatre.name if theatre else "Unknown",
                            },
                        }
                    )
                except BadRequestError as bre:
                    msg = str(bre)
                    logger.warning("Razorpay BadRequestError while creating order: %s", msg)
                    if "receipt" in msg and "length" in msg:
                        short_receipt = f"bk{showtime_id}{uuid.uuid4().hex[:6]}"
                        short_receipt = re.sub(r"[^A-Za-z0-9_]", "", short_receipt)[:40]
                        logger.info("Retrying razorpay.order.create with short receipt: %s", short_receipt)
                        created_order = razorpay_client.order.create(
                            {
                                "amount": amount_paise,
                                "currency": currency,
                                "receipt": short_receipt,
                                "notes": {
                                    "showtime_id": str(showtime_id),
                                    "seat_ids": ",".join(map(str, seat_ids)),
                                    "user_email": str(user_email),
                                },
                            }
                        )
                    else:
                        raise
            else:
                now = int(time.time() * 1000)
                created_order = {
                    "id": f"dev-{now}",
                    "amount": amount_paise,
                    "currency": currency,
                    "notes": {
                        "showtime_id": str(showtime_id),
                        "seat_ids": ",".join(map(str, seat_ids)),
                        "user_email": str(user_email),
                    },
                }
        except BadRequestError as bre:
            logger.error("Razorpay BadRequestError (final fallback) creating order: %s", bre)
            now = int(time.time() * 1000)
            created_order = {
                "id": f"dev-{now}",
                "amount": amount_paise,
                "currency": currency,
                "notes": {
                    "showtime_id": str(showtime_id),
                    "seat_ids": ",".join(map(str, seat_ids)),
                    "user_email": str(user_email),
                    "razorpay_error": str(bre),
                },
            }
        except Exception as e:
            logger.exception("Failed to create gateway order")
            now = int(time.time() * 1000)
            created_order = {
                "id": f"dev-{now}",
                "amount": amount_paise,
                "currency": currency,
                "notes": {
                    "showtime_id": str(showtime_id),
                    "seat_ids": ",".join(map(str, seat_ids)),
                    "user_email": str(user_email),
                    "error": str(e),
                },
            }

        # persist order
        start_time_value = getattr(showtime, "start_time", None)
        order_record = Order(
            order_id=created_order.get("id"),
            amount=created_order.get("amount"),
            currency=currency,
            seats=",".join(map(str, seat_ids)),
            showtime_id=int(showtime_id),
            user_email=str(user_email),
            status="CREATED",
            meta={
                "movie_title": movie.title if movie else None,
                "theatre_name": theatre.name if theatre else None,
                "showtime": start_time_value.isoformat() if start_time_value is not None else None,
                **({"lock_warning": lock_warning} if lock_warning else {}),
            },
        )
        db.add(order_record)
        db.commit()

        logger.info(
            "Created order %s for %s (showtime=%s seats=%s amount_rupees=%s)",
            created_order.get("id"),
            user_email,
            showtime_id,
            seat_ids,
            amount_rupees,
        )

        # Calculate breakdown for frontend display
        # Base amount is the sum of seat prices (already calculated as amount_rupees)
        base_amount_rupees = amount_rupees
        # Convenience fee: Optional, can be configured (default 0 for now)
        convenience_fee_percent = request_data.get("convenience_fee_percent", 0) or 0
        convenience_fee_rupees = round(base_amount_rupees * (float(convenience_fee_percent) / 100.0), 2) if convenience_fee_percent > 0 else 0.0
        # Tax (GST): Optional, can be configured (default 0 for now)
        tax_percent = request_data.get("tax_percent", 0) or 0
        tax_rupees = round((base_amount_rupees + convenience_fee_rupees) * (float(tax_percent) / 100.0), 2) if tax_percent > 0 else 0.0
        # Total = base + fee + tax
        total_rupees = base_amount_rupees + convenience_fee_rupees + tax_rupees
        
        # Convert breakdown to paise for consistency
        breakdown = {
            "baseAmount": int(round(base_amount_rupees * 100)),  # in paise
            "convenienceFee": int(round(convenience_fee_rupees * 100)),  # in paise
            "tax": int(round(tax_rupees * 100)),  # in paise
        }
        
        # Final amount in paise (total including fees and tax)
        final_amount_paise = int(round(total_rupees * 100))

        return CreateOrderResponse(
            key_id=RAZORPAY_KEY_ID,
            order_id=str(created_order.get("id")),
            amount=final_amount_paise,  # Total including fees and tax
            currency=currency,
            notes=created_order.get("notes", {}),
            user_email=str(user_email),
            breakdown=breakdown,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error in create_order")
        raise HTTPException(status_code=500, detail=str(exc))


# -----------------------
# OpenAPI examples used by the /verify endpoint below
# -----------------------
VERIFY_EXAMPLES = {
    "razorpay": {
        "summary": "Razorpay production payload",
        "value": {
            "razorpay_order_id": "order_Rf6Cbf0fMUaEkg",
            "razorpay_payment_id": "pay_Rf6CmmCCUD38fa",
            "razorpay_signature": "a83a0edf775d7c4c1cf5cc3a15f4b17adc1b66503767a90e5509303d64ac1121"
        }
    },
    "dev_mock": {
        "summary": "Dev/mock payload",
        "value": {
            "orderId": "dev-1638400000000",
            "gatewayPayload": {
                "paymentId": "mock_1763009553728",
                "status": "PAID"
            },
            "owner": "aab80d23-4c77-4bd4-b977-5792e9b0e682"
        }
    }
}


# Documented, permissive request model for /verify so Swagger shows clean examples
class VerifyRequest(BaseModel):
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None
    orderId: Optional[str] = None
    gatewayPayload: Optional[Dict[str, Any]] = None
    owner: Optional[str] = None

    class Config:
        extra = "allow"  # allow arbitrary extra keys so runtime remains tolerant


@router.post("/verify", response_model=VerifyPaymentResponse)
async def verify_payment(
    request_data: Dict[str, Any] = Body(
        ...,
        examples=VERIFY_EXAMPLES,
        description=(
            "Verify payment - accepts either:\n\n"
            "- Razorpay production payloads (razorpay_order_id, razorpay_payment_id, razorpay_signature)\n"
            "- Dev/mock payloads { orderId, gatewayPayload: { paymentId, status }, owner }\n\n"
            "This endpoint is tolerant of slightly different field names (e.g. paymentId or payment_id)."
        ),
    ),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
) -> VerifyPaymentResponse:
    """
    Verify payment - accepts both:
      - Razorpay production payloads (razorpay_order_id, razorpay_payment_id, razorpay_signature)
      - Dev/mock payloads { orderId, gatewayPayload: { paymentId, status }, owner }
    """
    # No conversion needed - request_data is already a dict

    try:
        # normalize identifiers
        rp_order_id = (
            request_data.get("razorpay_order_id")
            or request_data.get("orderId")
            or request_data.get("order_id")
            or request_data.get("order")
        )
        rp_payment_id = (
            request_data.get("razorpay_payment_id")
            or request_data.get("payment_id")
            or request_data.get("paymentId")
            or request_data.get("payment")
        )
        rp_signature = request_data.get("razorpay_signature") or request_data.get("signature")
        owner_token = request_data.get("owner") or request_data.get("lock_owner") or request_data.get("owner_token") or ""

        gateway_payload = request_data.get("gatewayPayload") or {}
        # fallback to examine gatewayPayload for ids
        if isinstance(gateway_payload, dict):
            rp_payment_id = rp_payment_id or gateway_payload.get("paymentId") or gateway_payload.get("id") or gateway_payload.get("payment_id")
            rp_order_id = rp_order_id or gateway_payload.get("orderId") or gateway_payload.get("order_id")

        if rp_order_id is None:
            raise HTTPException(status_code=400, detail="Missing order identifier (orderId or razorpay_order_id)")

        # generate mock payment id for dev if missing
        if rp_payment_id is None:
            rp_payment_id = f"mock_{int(time.time() * 1000)}"

        # verify signature if present
        if rp_signature is not None:
            expected_sig = hmac.new((RAZORPAY_KEY_SECRET or "").encode(), f"{rp_order_id}|{rp_payment_id}".encode(), hashlib.sha256).hexdigest()
            if expected_sig != rp_signature:
                logger.warning("Signature mismatch for order %s", rp_order_id)
                raise HTTPException(status_code=400, detail="Signature verification failed")

        # idempotency - if payment exists and is PAID, return its booking
        try:
            existing_payment = db.query(Payment).filter(Payment.payment_id == str(rp_payment_id)).first()
        except Exception as e:
            try:
                db.rollback()
            except Exception:
                logger.exception("Failed to rollback DB session after error checking existing payment")
            logger.warning("Raw SQL check for existing payment failed (rolled back): %s", e)
            existing_payment = None

        if existing_payment is not None and getattr(existing_payment, "status", None) == "PAID":
            existing_booking_id = getattr(existing_payment, "booking_id", None)
            if existing_booking_id:
                booking_existing = db.query(Booking).filter(Booking.id == existing_booking_id).first()
                if booking_existing:
                    return VerifyPaymentResponse(
                        booking_id=booking_existing.id,
                        download_url=get_ticket_url(booking_existing.id, PUBLIC_BASE_URL),
                        message="Booking already processed",
                        amount=getattr(booking_existing, "amount", 0.0),
                    )

        # fetch order record (defensive rollback on DB error)
        try:
            order_record = db.query(Order).filter(Order.order_id == str(rp_order_id)).first()
        except Exception as e:
            try:
                db.rollback()
            except Exception:
                logger.exception("Failed to rollback DB session after order lookup error")
            logger.exception("DB error while fetching order %s: %s", rp_order_id, e)
            raise HTTPException(status_code=500, detail="Database error while fetching order")

        if order_record is None:
            raise HTTPException(status_code=404, detail="Order not found")

        # CRITICAL FIX: Check if the showtime exists
        showtime_exists = db.query(Showtime).filter(Showtime.id == order_record.showtime_id).first()
        if not showtime_exists:
            logger.error("Showtime ID %s not found in showtimes table", order_record.showtime_id)
            raise HTTPException(
                status_code=404, 
                detail=f"Showtime with ID {order_record.showtime_id} not found. Please check the showtime exists in the database."
            )

        # parse seat ids safely
        seats_field = getattr(order_record, "seats", "") or ""
        seat_ids_list: List[int] = []
        if isinstance(seats_field, str) and seats_field.strip():
            parts = [p.strip() for p in seats_field.split(",")]
            seat_ids_list = [int(p) for p in parts if p.isdigit()]

        # validate locks (if redis available)
        try:
            if redis is not None and owner_token:
                lock_validation = await validate_locks_for_booking(
                    redis=redis, showtime_id=order_record.showtime_id, seat_ids=seat_ids_list, owner=owner_token
                )
                if not lock_validation.get("valid", False):
                    payment_orphan = Payment(
                        order_id=str(rp_order_id),
                        payment_id=str(rp_payment_id),
                        status="PAID_ORPHANED",
                        amount=order_record.amount,
                        currency=order_record.currency,
                        user_email=order_record.user_email,
                        razorpay_signature=str(rp_signature or ""),
                        meta={"error": "locks_expired", "invalid_seats": lock_validation.get("invalid_seats", [])},
                    )
                    db.add(payment_orphan)
                    order_record.status = "FAILED"
                    db.commit()
                    raise HTTPException(status_code=409, detail="Payment received but seat locks expired. Contact support for refund.")
        except Exception as e:
            logger.warning("Redis/lock validation error during verify: %s", e)

        # -------------------------
        # Create booking (ALIGNED WITH YOUR ACTUAL BOOKING MODEL)
        # -------------------------
        booking_kwargs: Dict[str, Any] = {
            "user_email": order_record.user_email,
        }

        # Use the correct column names from your Booking model
        booking_kwargs["seats"] = len(seat_ids_list)  # seats = integer count
        booking_kwargs["seat_numbers"] = ",".join(map(str, seat_ids_list)) if seat_ids_list else ""
        
        # Convert amount from paise to rupees
        booking_kwargs["amount"] = (order_record.amount / 100.0) if getattr(order_record, "amount", None) is not None else 0.0
        booking_kwargs["payment_id"] = str(rp_payment_id)
        
        # CRITICAL FIX: Use show_id (not showtime_id) to match your Booking model
        booking_kwargs["show_id"] = order_record.showtime_id

        # CRITICAL FIX: Add status field to avoid NOT NULL violation
        booking_kwargs["status"] = "CONFIRMED"

        # Set user_id only if order_record has it
        if getattr(order_record, "user_id", None) is not None:
            booking_kwargs["user_id"] = order_record.user_id

        # Remove None entries
        booking_kwargs = {k: v for k, v in booking_kwargs.items() if v is not None}

        # defensive: rollback any prior aborted transaction
        try:
            db.rollback()
        except Exception:
            pass

        # --- SANITIZE booking_kwargs against actual Booking columns ---
        try:
            allowed_cols = {col.name for col in Booking.__table__.columns}
        except Exception:
            # fallback: check attributes on Booking class
            allowed_cols = set()
            for k in booking_kwargs.keys():
                if hasattr(Booking, k):
                    allowed_cols.add(k)

        sanitized_booking_kwargs = {k: v for k, v in booking_kwargs.items() if k in allowed_cols}
        dropped = [k for k in booking_kwargs.keys() if k not in sanitized_booking_kwargs]
        if dropped:
            logger.debug("Dropped invalid Booking kwargs (not columns on Booking): %s", dropped)

        logger.debug("Creating Booking with kwargs (sanitized): %s", {k: v for k, v in sanitized_booking_kwargs.items() if k != "payment_id"})

        # Create and save booking
        booking = Booking(**sanitized_booking_kwargs)
        db.add(booking)
        db.flush()  # to get booking.id

        # generate pdf ticket (best effort)
        showtime_obj = db.query(Showtime).filter(Showtime.id == order_record.showtime_id).first()
        movie_obj = db.query(Movie).filter(Movie.id == showtime_obj.movie_id).first() if showtime_obj else None
        theatre_obj = db.query(Theatre).filter(Theatre.id == showtime_obj.theatre_id).first() if showtime_obj else None
        start_time_value = getattr(showtime_obj, "start_time", None)
        showtime_str = start_time_value.strftime("%d %b %Y, %I:%M %p") if start_time_value else "TBD"

        # Convert seat IDs to seat labels (e.g., "A1", "B5" instead of "17220008")
        seat_labels_str = ", ".join(map(str, seat_ids_list))  # Fallback to IDs if conversion fails
        if showtime_obj and theatre_obj:
            try:
                # Generate seat layout to get seat ID to label mapping
                seat_map, premium_seats, regular_seats = _generate_seat_layout_template(
                    theatre_obj.id, 
                    order_record.showtime_id
                )
                
                # Create reverse mapping: seat_id -> (row, num)
                seat_id_to_label: Dict[int, str] = {}
                for seat in premium_seats + regular_seats:
                    seat_id = seat.get("seat_id")
                    row = seat.get("row")
                    num = seat.get("num")
                    if seat_id and row is not None and num is not None:
                        seat_id_to_label[seat_id] = f"{row}{num}"
                
                # Convert seat IDs to labels
                seat_labels = []
                for seat_id in seat_ids_list:
                    label = seat_id_to_label.get(seat_id)
                    if label:
                        seat_labels.append(label)
                    else:
                        # Fallback to seat ID if label not found
                        seat_labels.append(str(seat_id))
                
                seat_labels_str = ", ".join(seat_labels)
                logger.info(f"Converted seat IDs {seat_ids_list} to labels: {seat_labels_str}")
            except Exception as e:
                logger.warning(f"Failed to convert seat IDs to labels: {e}. Using seat IDs instead.")

        try:
            pdf_path = generate_ticket_pdf(
                booking_id=booking.id,
                movie_title=(movie_obj.title if movie_obj else "Unknown Movie"),
                theatre_name=(theatre_obj.name if theatre_obj else "Unknown Theatre"),
                showtime=showtime_str,
                seats=seat_labels_str,
                amount=booking.amount,
                user_email=order_record.user_email,
                showtime_id=order_record.showtime_id,
            )
            booking.ticket_pdf_path = pdf_path
        except Exception as e:
            logger.warning("Ticket PDF generation failed (non-fatal): %s", e)

        # record payment and finalize order
        payment_record = Payment(
            order_id=str(rp_order_id),
            payment_id=str(rp_payment_id),
            status="PAID",
            amount=order_record.amount,
            currency=order_record.currency,
            user_email=order_record.user_email,
            booking_id=booking.id,
            razorpay_signature=str(rp_signature or ""),
        )
        db.add(payment_record)
        order_record.status = "PAID"
        db.commit()

        # release seat locks best-effort
        try:
            await release_seat_locks_simple(redis=redis, showtime_id=order_record.showtime_id, seat_ids=seat_ids_list, owner=owner_token or "")
        except Exception as e:
            logger.warning("Lock release after payment failed (non-fatal): %s", e)

        logger.info("Payment verified and booking created: %s", booking.id)

        return VerifyPaymentResponse(
            booking_id=booking.id,
            download_url=get_ticket_url(booking.id, PUBLIC_BASE_URL),
            message="Booking confirmed successfully!",
            amount=booking.amount,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unexpected error in payment verify for payload=%s: %s", request_data, exc)
        try:
            db.rollback()
        except Exception:
            pass
        # Return more detailed error for debugging
        error_detail = f"Internal server error while verifying payment: {str(exc)}"
        if "NOT NULL constraint failed" in str(exc):
            error_detail += " - Missing required field in Booking model"
        elif "Foreign key constraint" in str(exc):
            error_detail += " - Referenced showtime not found in database"
        raise HTTPException(status_code=500, detail=error_detail)


@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    try:
        body_bytes = await request.body()

        if x_razorpay_signature is None or PAYMENTS_WEBHOOK_SECRET is None:
            logger.warning("Webhook: missing signature or secret")
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

        expected_signature = hmac.new(PAYMENTS_WEBHOOK_SECRET.encode(), body_bytes, hashlib.sha256).hexdigest()
        if expected_signature != x_razorpay_signature:
            logger.warning("Webhook signature mismatch")
            raise HTTPException(status_code=400, detail="Webhook signature verification failed")

        import json

        payload_json = json.loads(body_bytes.decode("utf-8"))
        event = payload_json.get("event")
        payload = payload_json.get("payload", {}).get("payment", {}).get("entity", {})

        if event == "payment.captured":
            order_id = payload.get("order_id")
            payment_obj = db.query(Payment).filter(Payment.order_id == order_id).first()
            if payment_obj is not None and getattr(payment_obj, "status", None) != "PAID":
                payment_obj.status = "PAID"
                payment_obj.payment_id = payload.get("id")
                db.commit()
                logger.info("Webhook: Payment captured %s", payload.get("id"))

        elif event == "payment.failed":
            order_id = payload.get("order_id")
            payment_obj = db.query(Payment).filter(Payment.order_id == order_id).first()
            if payment_obj:
                payment_obj.status = "FAILED"
                db.commit()
                logger.info("Webhook: Payment failed %s", order_id)

        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Webhook error: %s", e)
        return {"status": "error", "message": str(e)}


@router.get("/bookings/{booking_id}/ticket.pdf")
def download_ticket(booking_id: int, db: Session = Depends(get_db)):
    booking_obj = db.query(Booking).filter(Booking.id == booking_id).first()
    if booking_obj is None:
        raise HTTPException(status_code=404, detail="Booking not found")

    ticket_path = getattr(booking_obj, "ticket_pdf_path", None)
    if ticket_path is None or not os.path.exists(ticket_path):
        raise HTTPException(status_code=404, detail="Ticket PDF not found")

    return FileResponse(
        path=ticket_path,
        media_type="application/pdf",
        filename=f"ticket-{booking_id}.pdf",
        headers={"Content-Disposition": f"attachment; filename=ticket-{booking_id}.pdf"},
    )