"""
Modern PDF Ticket Generator with QR Code and Custom Logo
Clean, Professional Design
"""
import os
import qrcode  # type: ignore[import-untyped]
import hashlib
import json
from reportlab.lib.pagesizes import A4  # type: ignore[import-untyped]
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]
from reportlab.lib import colors  # type: ignore[import-untyped]
from reportlab.platypus import Table, TableStyle  # type: ignore[import-untyped]
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Create media directory for tickets
MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
TICKETS_DIR = os.path.join(MEDIA_DIR, "tickets")
os.makedirs(TICKETS_DIR, exist_ok=True)

# Custom logo path - try multiple possible locations
LOGO_PATHS = [
    r"D:\P99SOFT Taining\final project\frontend\public\logo.jpg",
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "frontend", "public", "logo.jpg"),
    "logo.jpg"  # Fallback to current directory
]

LOGO_PATH = None
for path in LOGO_PATHS:
    if os.path.exists(path):
        LOGO_PATH = path
        break

# Modern Color Theme
BLACK = "#0A0A0A"
DARK_BG = "#111111"
ACCENT_GOLD = "#F6C800"
ACCENT_GOLD_LIGHT = "#FFD836"
WHITE = "#FFFFFF"
GRAY_LIGHT = "#E5E5E5"
GRAY_MEDIUM = "#666666"
GRAY_DARK = "#333333"


def generate_qr_code(data: dict) -> str:
    """
    Generate QR code with booking data and checksum
    Returns path to QR code image
    """
    # Add checksum for verification
    checksum = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]
    data['checksum'] = checksum
    
    # Generate QR code with modern colors
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(json.dumps(data))
    qr.make(fit=True)
    
    # Use black on white for better scanning reliability
    qr_img = qr.make_image(fill_color=BLACK, back_color=WHITE)
    
    # Save QR code
    qr_path = os.path.join(TICKETS_DIR, f"qr_{data['booking_id']}.png")
    qr_img.save(qr_path)
    
    return qr_path


def generate_ticket_pdf(
    booking_id: int,
    movie_title: str,
    theatre_name: str,
    showtime: str,
    seats: str,
    amount: float,
    user_email: str,
    showtime_id: int
) -> str:
    """
    Generate modern PDF ticket with QR code and custom logo
    Clean, professional design
    
    Args:
        booking_id: Booking ID
        movie_title: Movie title
        theatre_name: Theatre name
        showtime: Showtime (formatted string)
        seats: Seat numbers (e.g., "A5, A6, A7")
        amount: Total amount paid
        user_email: User email
        showtime_id: Showtime ID
    
    Returns:
        Path to generated PDF
    """
    try:
        # PDF file path
        pdf_path = os.path.join(TICKETS_DIR, f"ticket_{booking_id}.pdf")
        
        # Create canvas
        c = canvas.Canvas(pdf_path, pagesize=A4)
        width, height = A4
        
        # === MODERN DARK BACKGROUND ===
        c.setFillColor(colors.HexColor(BLACK))
        c.rect(0, 0, width, height, fill=1, stroke=0)
        
        # === HEADER SECTION ===
        header_y = height - 50
        header_height = 120
        
        # Subtle top accent line
        c.setStrokeColor(colors.HexColor(ACCENT_GOLD))
        c.setLineWidth(3)
        c.line(0, height, width, height)
        
        # Header background
        c.setFillColor(colors.HexColor(DARK_BG))
        c.rect(0, header_y - header_height, width, header_height, fill=1, stroke=0)
        
        # Logo and branding
        logo_size = 60
        logo_x = 50
        logo_y = header_y - 40
        
        if LOGO_PATH and os.path.exists(LOGO_PATH):
            try:
                c.drawImage(LOGO_PATH, logo_x, logo_y - logo_size/2, width=logo_size, height=logo_size, preserveAspectRatio=True, mask='auto')
            except Exception as e:
                logger.warning(f"Could not load logo: {e}")
        
        # Brand name
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 32)
        brand_x = logo_x + logo_size + 20
        c.drawString(brand_x, logo_y + 10, "CineVerse")
        
        # Tagline
        c.setFillColor(colors.HexColor(GRAY_MEDIUM))
        c.setFont("Helvetica", 12)
        c.drawString(brand_x, logo_y - 10, "Premium Cinema Experience")
        
        # Booking ID (top right)
        c.setFillColor(colors.HexColor(ACCENT_GOLD))
        c.setFont("Helvetica-Bold", 18)
        c.drawRightString(width - 50, logo_y + 10, f"#{booking_id}")
        c.setFillColor(colors.HexColor(GRAY_MEDIUM))
        c.setFont("Helvetica", 9)
        c.drawRightString(width - 50, logo_y - 5, "BOOKING ID")
        
        # === MOVIE TITLE SECTION ===
        y = header_y - header_height - 30
        
        # Movie title with accent background
        c.setFillColor(colors.HexColor(ACCENT_GOLD))
        title_rect_height = 50
        c.roundRect(50, y - title_rect_height, width - 100, title_rect_height, 8, fill=1, stroke=0)
        
        c.setFillColor(colors.HexColor(BLACK))
        c.setFont("Helvetica-Bold", 24)
        c.drawCentredString(width/2, y - 30, movie_title.upper())
        
        y -= title_rect_height + 40
        
        # === INFO CARDS SECTION ===
        card_width = (width - 150) / 2
        card_height = 100
        card_spacing = 30
        
        # Left card - Theatre & Showtime
        card_x = 50
        c.setFillColor(colors.HexColor(DARK_BG))
        c.roundRect(card_x, y - card_height, card_width, card_height, 10, fill=1, stroke=1)
        c.setStrokeColor(colors.HexColor(GRAY_DARK))
        c.setLineWidth(1)
        
        # Card content
        c.setFillColor(colors.HexColor(ACCENT_GOLD))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(card_x + 15, y - 20, "THEATRE")
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 16)
        c.drawString(card_x + 15, y - 42, theatre_name)
        
        c.setFillColor(colors.HexColor(ACCENT_GOLD))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(card_x + 15, y - 60, "SHOWTIME")
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica", 13)
        c.drawString(card_x + 15, y - 80, showtime)
        
        # Right card - Seats & Amount
        card_x_right = card_x + card_width + card_spacing
        c.setFillColor(colors.HexColor(DARK_BG))
        c.roundRect(card_x_right, y - card_height, card_width, card_height, 10, fill=1, stroke=1)
        c.setStrokeColor(colors.HexColor(GRAY_DARK))
        c.setLineWidth(1)
        
        # Card content
        c.setFillColor(colors.HexColor(ACCENT_GOLD))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(card_x_right + 15, y - 20, "SEATS")
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 18)
        c.drawString(card_x_right + 15, y - 42, seats)
        
        c.setFillColor(colors.HexColor(ACCENT_GOLD))
        c.setFont("Helvetica-Bold", 10)
        c.drawString(card_x_right + 15, y - 60, "AMOUNT PAID")
        c.setFillColor(colors.HexColor(ACCENT_GOLD))
        c.setFont("Helvetica-Bold", 20)
        c.drawString(card_x_right + 15, y - 85, f"₹{amount:.2f}")
        
        y -= card_height + 40
        
        # === BOOKING DETAILS SECTION ===
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, y, "Booking Details")
        
        # Subtle underline
        c.setStrokeColor(colors.HexColor(ACCENT_GOLD))
        c.setLineWidth(2)
        c.line(50, y - 8, 250, y - 8)
        
        y -= 35
        
        # Booking details in clean table format
        details_data = [
            ["Customer Email", user_email],
            ["Booking Date", datetime.now().strftime("%d %b %Y, %I:%M %p")],
            ["Showtime ID", str(showtime_id)],
            ["Status", "CONFIRMED"]
        ]
        
        detail_table = Table(details_data, colWidths=[140, 350])
        detail_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor(DARK_BG)),
            ('BACKGROUND', (1, 0), (1, -1), colors.HexColor(DARK_BG)),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor(GRAY_MEDIUM)),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor(WHITE)),
            ('FONT', (0, 0), (0, -1), 'Helvetica'),
            ('FONT', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 15),
            ('RIGHTPADDING', (0, 0), (-1, -1), 15),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor(GRAY_DARK)),
        ]))
        detail_table.wrapOn(c, width, height)
        detail_table.drawOn(c, 50, y - 80)
        
        # === QR CODE SECTION ===
        qr_data = {
            "booking_id": booking_id,
            "showtime_id": showtime_id,
            "seats": seats,
            "email": user_email,
            "movie": movie_title,
            "theatre": theatre_name,
            "showtime": showtime
        }
        qr_path = generate_qr_code(qr_data)
        
        # QR code positioned on the right
        qr_size = 140
        qr_x = width - qr_size - 50
        qr_y = y - 80
        
        # QR code container
        c.setFillColor(colors.HexColor(DARK_BG))
        c.roundRect(qr_x - 10, qr_y - qr_size - 30, qr_size + 20, qr_size + 50, 10, fill=1, stroke=1)
        c.setStrokeColor(colors.HexColor(ACCENT_GOLD))
        c.setLineWidth(2)
        
        # Draw QR code
        c.drawImage(qr_path, qr_x, qr_y - qr_size, width=qr_size, height=qr_size, preserveAspectRatio=True)
        
        # QR code label
        c.setFillColor(colors.HexColor(ACCENT_GOLD))
        c.setFont("Helvetica-Bold", 11)
        c.drawCentredString(qr_x + qr_size/2, qr_y - qr_size - 15, "DIGITAL TICKET")
        c.setFillColor(colors.HexColor(GRAY_MEDIUM))
        c.setFont("Helvetica", 8)
        c.drawCentredString(qr_x + qr_size/2, qr_y - qr_size - 5, "Scan for verification")
        
        # === INSTRUCTIONS SECTION ===
        instructions_y = y - 200
        
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 14)
        c.drawString(50, instructions_y, "Important Information")
        
        instructions = [
            "• Arrive 15 minutes before showtime",
            "• Present this ticket at the entrance",
            "• Valid ID required for verification",
            "• Seats are non-refundable and non-transferable"
        ]
        
        c.setFillColor(colors.HexColor(GRAY_LIGHT))
        c.setFont("Helvetica", 10)
        for i, instruction in enumerate(instructions):
            c.drawString(50, instructions_y - 25 - (i * 18), instruction)
        
        # === FOOTER ===
        footer_y = 50
        
        # Footer separator
        c.setStrokeColor(colors.HexColor(GRAY_DARK))
        c.setLineWidth(1)
        c.line(50, footer_y + 30, width - 50, footer_y + 30)
        
        # Footer text
        c.setFillColor(colors.HexColor(GRAY_MEDIUM))
        c.setFont("Helvetica", 9)
        c.drawCentredString(width/2, footer_y + 15, "CineVerse Premium Cinema")
        c.drawCentredString(width/2, footer_y + 5, f"Generated on {datetime.now().strftime('%d %b %Y at %I:%M %p')}")
        
        # Save PDF
        c.save()
        
        logger.info(f"Generated modern ticket PDF: {pdf_path}")
        return pdf_path
        
    except Exception as e:
        logger.error(f"Error generating PDF: {e}", exc_info=True)
        raise


def get_ticket_url(booking_id: int, public_base_url: str) -> str:
    """Get public URL for ticket download"""
    return f"{public_base_url}/bookings/{booking_id}/ticket.pdf"