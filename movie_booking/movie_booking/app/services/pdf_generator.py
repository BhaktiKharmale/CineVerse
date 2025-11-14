"""
PDF Ticket Generator with QR Code and Custom Logo
Black, Golden, Red & White Theme
"""
import os
import qrcode  # type: ignore[import-untyped]
import hashlib
import json
from reportlab.lib.pagesizes import letter, A4  # type: ignore[import-untyped]
from reportlab.lib.units import inch  # type: ignore[import-untyped]
from reportlab.pdfgen import canvas  # type: ignore[import-untyped]
from reportlab.lib import colors  # type: ignore[import-untyped]
from reportlab.platypus import Table, TableStyle  # type: ignore[import-untyped]
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle  # type: ignore[import-untyped]
from reportlab.platypus import Paragraph  # type: ignore[import-untyped]
from reportlab.pdfbase import pdfmetrics  # type: ignore[import-untyped]
from reportlab.pdfbase.ttfonts import TTFont  # type: ignore[import-untyped]
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

# Create media directory for tickets
MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
TICKETS_DIR = os.path.join(MEDIA_DIR, "tickets")
os.makedirs(TICKETS_DIR, exist_ok=True)

# Custom logo path
LOGO_PATH = r"D:\P99SOFT Taining\final project\frontend\public\logo.jpg"

# Color Theme
BLACK = "#000000"
GOLDEN = "#D4AF37"  # Rich gold
RED = "#C41E3A"     # Deep red
WHITE = "#FFFFFF"
DARK_GRAY = "#1a1a1a"
LIGHT_GOLD = "#F0E68C"  # Light gold for accents


def generate_qr_code(data: dict) -> str:
    """
    Generate QR code with booking data and checksum
    Returns path to QR code image
    """
    # Add checksum for verification
    checksum = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]
    data['checksum'] = checksum
    
    # Generate QR code with theme colors
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(json.dumps(data))
    qr.make(fit=True)
    
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
    Generate PDF ticket with QR code and custom logo
    Black, Golden, Red & White Theme
    
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
        
        # === PREMIUM BLACK BACKGROUND ===
        c.setFillColor(colors.HexColor(BLACK))
        c.rect(0, 0, width, height, fill=1, stroke=0)
        
        # === GOLDEN BORDER ===
        c.setStrokeColor(colors.HexColor(GOLDEN))
        c.setLineWidth(4)
        c.rect(15, 15, width - 30, height - 30, stroke=1, fill=0)
        
        # === LUXURY HEADER WITH LOGO ===
        header_height = 100
        c.setFillColor(colors.HexColor(BLACK))
        c.rect(20, height - header_height - 15, width - 40, header_height, fill=1, stroke=0)
        
        # Golden accent line in header
        c.setStrokeColor(colors.HexColor(GOLDEN))
        c.setLineWidth(2)
        c.line(20, height - header_height - 10, width - 20, height - header_height - 10)
        
        # Add logo with golden border
        if os.path.exists(LOGO_PATH):
            try:
                # Golden circle behind logo
                c.setFillColor(colors.HexColor(GOLDEN))
                c.circle(70, height - 70, 35, fill=1, stroke=0)
                
                # Logo
                c.drawImage(LOGO_PATH, 50, height - 90, width=40, height=40, preserveAspectRatio=True, mask='auto')
            except Exception as e:
                logger.warning(f"Could not load logo: {e}")
        
        # Header text with golden and red accents
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 28)
        c.drawString(120, height - 60, "CineVerse")
        
        c.setFillColor(colors.HexColor(GOLDEN))
        c.setFont("Helvetica-Bold", 16)
        c.drawString(120, height - 85, "PREMIUM CINEMA EXPERIENCE")
        
        # Booking ID in golden
        c.setFillColor(colors.HexColor(GOLDEN))
        c.setFont("Helvetica-Bold", 14)
        c.drawRightString(width - 40, height - 60, f"#{booking_id}")
        c.setFont("Helvetica", 10)
        c.drawRightString(width - 40, height - 75, "BOOKING REFERENCE")
        
        # === MOVIE TITLE SECTION - RED ACCENT ===
        y = height - 140
        
        # Red background for movie title
        c.setFillColor(colors.HexColor(RED))
        c.roundRect(30, y - 45, width - 60, 45, 10, fill=1, stroke=0)
        
        # Movie title in white
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 20)
        c.drawCentredString(width/2, y - 30, movie_title.upper())
        
        y -= 70
        
        # === PREMIUM INFO CARDS ===
        card_width = (width - 80) / 2
        card_height = 90
        
        # Left card - Theatre & Showtime (Golden Theme)
        c.setFillColor(colors.HexColor(DARK_GRAY))
        c.roundRect(30, y - card_height, card_width, card_height, 8, fill=1, stroke=1)
        c.setStrokeColor(colors.HexColor(GOLDEN))
        
        c.setFillColor(colors.HexColor(GOLDEN))
        c.setFont("Helvetica-Bold", 11)
        c.drawString(40, y - 20, "🎭 THEATRE")
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 14)
        c.drawString(40, y - 38, theatre_name)
        
        c.setFillColor(colors.HexColor(GOLDEN))
        c.setFont("Helvetica-Bold", 11)
        c.drawString(40, y - 58, "🕐 SHOWTIME")
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica", 12)
        c.drawString(40, y - 75, showtime)
        
        # Right card - Seats & Amount (Red Theme)
        c.setFillColor(colors.HexColor(DARK_GRAY))
        c.roundRect(50 + card_width, y - card_height, card_width, card_height, 8, fill=1, stroke=1)
        c.setStrokeColor(colors.HexColor(RED))
        
        c.setFillColor(colors.HexColor(RED))
        c.setFont("Helvetica-Bold", 11)
        c.drawString(60 + card_width, y - 20, "💺 SEATS")
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 16)
        c.drawString(60 + card_width, y - 40, seats)
        
        c.setFillColor(colors.HexColor(RED))
        c.setFont("Helvetica-Bold", 11)
        c.drawString(60 + card_width, y - 60, "💰 AMOUNT PAID")
        c.setFillColor(colors.HexColor(GOLDEN))
        c.setFont("Helvetica-Bold", 15)
        c.drawString(60 + card_width, y - 78, f"₹{amount:.2f}")
        
        y -= 120
        
        # === BOOKING DETAILS SECTION ===
        c.setFillColor(colors.HexColor(GOLDEN))
        c.setFont("Helvetica-Bold", 18)
        c.drawString(30, y, "Booking Details")
        
        # Golden underline
        c.setStrokeColor(colors.HexColor(GOLDEN))
        c.setLineWidth(1)
        c.line(30, y - 5, 200, y - 5)
        
        y -= 30
        
        # Booking details table with golden accents
        data = [
            ["🎯 Customer Email:", user_email],
            ["📅 Booking Date:", datetime.now().strftime("%d %b %Y, %I:%M %p")],
            ["🎬 Showtime ID:", str(showtime_id)],
            ["✅ Ticket Status:", "CONFIRMED"]
        ]
        
        table = Table(data, colWidths=[150, 300])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor(DARK_GRAY)),
            ('BACKGROUND', (1, 0), (1, -1), colors.HexColor("#2a2a2a")),
            ('FONT', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONT', (1, 0), (1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 11),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor(GOLDEN)),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor(WHITE)),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor(GOLDEN)),
        ]))
        table.wrapOn(c, width, height)
        table.drawOn(c, 30, y - 100)
        
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
        
        # QR code container with golden border
        qr_y = y - 280
        c.setFillColor(colors.HexColor(DARK_GRAY))
        c.roundRect(width - 200, qr_y, 160, 180, 10, fill=1, stroke=1)
        c.setStrokeColor(colors.HexColor(GOLDEN))
        
        # Draw QR code
        c.drawImage(qr_path, width - 180, qr_y + 50, width=120, height=120, preserveAspectRatio=True)
        
        c.setFillColor(colors.HexColor(GOLDEN))
        c.setFont("Helvetica-Bold", 12)
        c.drawCentredString(width - 120, qr_y + 30, "DIGITAL TICKET")
        c.setFont("Helvetica", 9)
        c.setFillColor(colors.HexColor(WHITE))
        c.drawCentredString(width - 120, qr_y + 15, "Scan for verification")
        
        # === PREMIUM INSTRUCTIONS SECTION ===
        instructions_y = qr_y - 40
        
        c.setFillColor(colors.HexColor(RED))
        c.setFont("Helvetica-Bold", 16)
        c.drawString(30, instructions_y, "🎬 Premium Experience Guidelines")
        
        instructions_y -= 30
        
        instructions = [
            "🌟 Arrive 20 minutes before showtime for premium seating",
            "📱 Present this digital ticket for scanning",
            "🆔 Valid ID proof required for verification",
            "🍿 Gourmet snacks available at our premium counters",
            "🤫 Maintain the luxury cinema ambiance",
            "📵 Silent mode for uninterrupted viewing",
            "👑 Premium seating with enhanced comfort",
            "💎 Experience the ultimate in cinema luxury"
        ]
        
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica", 10)
        
        for i, instruction in enumerate(instructions):
            # Alternate colors for visual interest
            if i % 2 == 0:
                c.setFillColor(colors.HexColor(WHITE))
            else:
                c.setFillColor(colors.HexColor(LIGHT_GOLD))
            c.drawString(40, instructions_y, instruction)
            instructions_y -= 18
        
        # === LUXURY FOOTER ===
        footer_y = 70
        
        # Footer background with golden top border
        c.setStrokeColor(colors.HexColor(GOLDEN))
        c.setLineWidth(2)
        c.line(20, footer_y + 40, width - 20, footer_y + 40)
        
        c.setFillColor(colors.HexColor(BLACK))
        c.rect(20, 20, width - 40, footer_y, fill=1, stroke=0)
        
        # Footer text
        c.setFillColor(colors.HexColor(WHITE))
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(width/2, 45, "CineVerse Premium Cinema")
        c.setFont("Helvetica", 8)
        c.drawCentredString(width/2, 35, "For exclusive support: vip@cineverse.com | +91-9876543210")
        c.drawCentredString(width/2, 25, f"Generated on: {datetime.now().strftime('%d %b %Y at %I:%M %p')}")
        
        # Premium security watermark
        c.setFillColor(colors.HexColor(GOLDEN))
        c.setFont("Helvetica-Bold", 36)
        c.setFillAlpha(0.05)  # Very transparent
        c.rotate(45)
        c.drawString(150, 100, f"PREMIUM #{booking_id}")
        c.setFillAlpha(1.0)
        c.rotate(-45)
        
        # Luxury corner decorations
        c.setStrokeColor(colors.HexColor(GOLDEN))
        c.setLineWidth(2)
        corner_size = 20
        
        # Function to draw luxury corner
        def draw_luxury_corner(x, y, horizontal, vertical):
            c.line(x, y, x + corner_size * horizontal, y)
            c.line(x, y, x, y + corner_size * vertical)
            # Add small decorative dots
            c.setFillColor(colors.HexColor(RED))
            c.circle(x + 8 * horizontal, y + 8 * vertical, 2, fill=1, stroke=0)
        
        # Draw corners
        draw_luxury_corner(20, height - 20, 1, -1)  # Top-left
        draw_luxury_corner(width - 20, height - 20, -1, -1)  # Top-right
        draw_luxury_corner(20, 20, 1, 1)  # Bottom-left
        draw_luxury_corner(width - 20, 20, -1, 1)  # Bottom-right
        
        # Golden decorative elements along borders
        c.setStrokeColor(colors.HexColor(GOLDEN))
        c.setLineWidth(1)
        for i in range(1, 6):
            # Top border decorations
            c.line(50 * i, height - 20, 50 * i + 10, height - 20)
            # Bottom border decorations
            c.line(50 * i, 20, 50 * i + 10, 20)
        
        # Save PDF
        c.save()
        
        logger.info(f"Generated luxury ticket PDF: {pdf_path}")
        return pdf_path
        
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise


def get_ticket_url(booking_id: int, public_base_url: str) -> str:
    """Get public URL for ticket download"""
    return f"{public_base_url}/bookings/{booking_id}/ticket.pdf"