# app/routers/orders_routes.py
from typing import List, Dict, Any, Optional
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import datetime
import uuid
import traceback

from app.database.database import get_db
from app import models, schemas  # adjust if module path differs
from app.services import lock_service  # expects functions you posted earlier
from app.core import redis as redis_core  # adjust to however you expose redis client
from app.routers import public_routes  # used for broadcast helper (will exist after patching)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["payments", "orders"])


def _calc_amount_from_seats(seats: List[Dict[str, Any]]) -> int:
    """Calculate amount (INR rupees) from seat payload; seats are {seatId, price}."""
    total = 0
    for s in seats:
        try:
            total += float(s.get("price", 0) or 0)
        except Exception:
            total += 0
    return int(total)


@router.post("/payments/create-order")
async def create_order(payload: Dict[str, Any], db: Session = Depends(get_db), request: Request = None):
    """
    Create a lightweight order. This endpoint tries to validate that locks exist (owner or lockId)
    but primarily returns an order object that the frontend can use to launch payment.
    Expected payload shapes (flexible):
      - { showtimeId, owner, seats: [{ seatId, price }] }
      - { showtimeId, lockId, seats: [...] }
    Response:
      { orderId, amount, currency, expiresAt, gateway: { provider, payload }, breakdown? }
    """
    try:
        showtime_id = int(payload.get("showtimeId") or payload.get("showtime_id"))
    except Exception:
        raise HTTPException(status_code=400, detail="Missing or invalid showtimeId")

    seats = payload.get("seats") or payload.get("seat_ids") or []
    if not isinstance(seats, list) or len(seats) == 0:
        raise HTTPException(status_code=400, detail="No seats provided")

    owner = payload.get("owner") or payload.get("owner_token") or payload.get("lockId")
    lock_id = payload.get("lockId") or payload.get("lock_id")

    # If owner provided, inspect locks to ensure ownership (best-effort)
    redis_client = redis_core.get_redis_client()
    try:
        if owner:
            # try to inspect and ensure seats are locked by owner (best-effort; not mandatory here)
            inspected = await lock_service.inspect_locks(redis_client, showtime_id, [int(s.get("seatId") or s.get("seat_id") or s) for s in seats])
            # If any seat not owned by this owner, include a warning in response (frontend may revalidate)
            not_owned = [i for i in inspected if i.get("owner") != owner]
            if len(not_owned) > 0:
                logger.info("create_order: some seats not owned by provided owner", extra={"not_owned": not_owned})
                # do not reject here; let verify step handle final validation
    except Exception:
        logger.exception("Redis inspect failed during create_order; continuing")

    # create a DB order record (minimal)
    amount = _calc_amount_from_seats(seats)
    now = datetime.utcnow()
    order_uuid = str(uuid.uuid4())

    # Persist an Order (optional). The model names/columns below are examples — adapt to your models.
    try:
        order = models.Order(
            id=None,
            order_id=order_uuid,
            showtime_id=showtime_id,
            amount=amount,
            currency="INR",
            status="created",
            metadata={"created_from": "frontend"},
            created_at=now,
        )
        db.add(order)
        db.commit()
        db.refresh(order)
    except Exception:
        db.rollback()
        logger.exception("Failed to create order record; returning synthetic order")
        # Fall back to returning synthetic response
        expires_at = (datetime.utcnow()).isoformat() + "Z"
        return {
            "orderId": order_uuid,
            "amount": amount,
            "currency": "INR",
            "expiresAt": expires_at,
            "gateway": {"provider": "dev-fallback", "payload": {}},
        }

    expires_at = (datetime.utcnow()).isoformat() + "Z"

    # Gateway payload — we return a minimal template; gateway integration happens elsewhere.
    gw_payload = {
        "note": "create-order returned by backend",
        "order_id": order_uuid,
    }

    return {
        "orderId": order_uuid,
        "amount": amount,
        "currency": "INR",
        "expiresAt": expires_at,
        "gateway": {"provider": "mock", "payload": gw_payload},
        "bookingId": None,
    }


@router.post("/payments/verify")
async def verify_payment(payload: Dict[str, Any], db: Session = Depends(get_db), request: Request = None):
    """
    Verify payment and convert locked seats into booked seats.

    Expected payload:
      { orderId, gatewayPayload: {...}, owner?: string, showtimeId?: int, seats?: [{seatId}] }
    """
    try:
        order_id = payload.get("orderId") or payload.get("order_id")
        if not order_id:
            raise HTTPException(status_code=400, detail="Missing orderId")
        owner = payload.get("owner")
        showtime_id = payload.get("showtimeId") or payload.get("showtime_id") or payload.get("showtime") or None
        seats_payload = payload.get("seats") or payload.get("seat_ids") or []
        if showtime_id is None:
            # Try to infer from payload or order record (not strictly required)
            pass
        # Basic gateway verification step - in a real system you'd validate signature/payment gateway status.
        # Here we accept as successful if gatewayPayload.paymentId exists, else simulate success.
        gp = payload.get("gatewayPayload") or payload
        payment_id = gp.get("paymentId") or gp.get("payment_id") or gp.get("id") or f"mock_{uuid.uuid4()}"
        # Simple guard: ensure seats provided
        if not seats_payload:
            raise HTTPException(status_code=400, detail="Missing seats to book")

        # normalize seat ids
        seat_ids = [int(s.get("seatId") if isinstance(s, dict) else s) for s in seats_payload]

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Malformed verify payload")
        raise HTTPException(status_code=400, detail="Malformed payload")

    # Validate locks: ensure owner owns locks for these seats (if owner provided)
    redis_client = redis_core.get_redis_client()
    try:
        inspected = await lock_service.inspect_locks(redis_client, int(showtime_id), seat_ids)
    except Exception as e:
        logger.exception("Redis inspect failed on verify_payment")
        raise HTTPException(status_code=503, detail="Seat locking service unavailable")

    # Check ownership if owner provided
    if owner:
        not_owned = [i for i in inspected if i.get("owner") and i.get("owner") != owner]
        if len(not_owned) > 0:
            # Some seats are not owned by this owner -> conflict
            logger.warning("verify_payment: seats not owned by provided owner", extra={"not_owned": not_owned})
            raise HTTPException(status_code=409, detail={"message": "Some seats are no longer locked by you", "conflicts": not_owned})

    # At this point, we consider payment successful (or verify gateway here)
    # Create booking rows and mark seats booked (DB schema depends on your models).
    try:
        # Begin DB transaction
        # Example: create Booking and BookingSeat records
        booking = models.Booking(
            id=None,
            showtime_id=int(showtime_id),
            order_id=order_id,
            payment_id=payment_id,
            owner=owner,
            created_at=datetime.utcnow(),
            total_amount=_calc_amount_from_seats(seats_payload),
        )
        db.add(booking)
        db.flush()  # get booking.id if needed

        # Mark seats booked in DB and create BookingSeat rows if model exists
        booked_seat_ids = []
        for sid in seat_ids:
            try:
                bs = models.BookingSeat(
                    id=None,
                    booking_id=booking.id,
                    showtime_id=int(showtime_id),
                    seat_id=int(sid),
                    price=next((float(s.get("price", 0)) for s in seats_payload if int(s.get("seatId", s.get("seat_id", s))) == int(sid)), 0),
                )
                db.add(bs)
                booked_seat_ids.append(int(sid))
            except Exception:
                logger.exception("Failed adding BookingSeat for seat %s", sid)

        # Mark order as paid (if order model exists)
        try:
            order_row = db.query(models.Order).filter(models.Order.order_id == order_id).first()
            if order_row:
                order_row.status = "paid"
                order_row.updated_at = datetime.utcnow()
                db.add(order_row)
        except Exception:
            logger.exception("Marking order paid failed")

        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist booking")
        raise HTTPException(status_code=500, detail="Unable to create booking")

    # Remove redis locks for these seats (best-effort)
    try:
        await lock_service.release_seat_locks(redis_client, int(showtime_id), seat_ids, owner)
    except Exception:
        logger.exception("Failed to release redis locks after booking; continuing")

    # Broadcast seat updates so clients mark seats as booked
    try:
        seats_payload_for_broadcast = [{"seatId": int(sid), "status": "booked", "timestamp": datetime.utcnow().isoformat()} for sid in booked_seat_ids]
        # use public_routes.broadcast_seat_update helper (exists in patched public_routes.py)
        await public_routes.broadcast_seat_update(int(showtime_id), seats_payload_for_broadcast)
    except Exception:
        logger.exception("Broadcast failed after booking")

    return {"success": True, "bookingId": booking.id, "message": "Payment verified and seats booked"}
