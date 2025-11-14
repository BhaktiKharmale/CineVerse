/**
 * Razorpay Payment Integration - Frontend Component
 * 
 * USAGE:
 * 1. Copy this code into your Payment/Checkout component
 * 2. Update the API_BASE_URL to match your backend
 * 3. Load Razorpay SDK in your HTML: 
 *    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
 */

import { useState } from 'react';

const API_BASE_URL = "http://127.0.0.1:8001";

/**
 * Payment Component
 * Handles the complete Razorpay payment flow
 */
export function PaymentFlow({ showtimeId, seatIds, userEmail, amount, ownerToken }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [bookingResult, setBookingResult] = useState(null);

    /**
     * Step 1: Create Razorpay Order
     */
    const createOrder = async () => {
        const response = await fetch(`${API_BASE_URL}/payments/create-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                showtime_id: showtimeId,
                seat_ids: seatIds,
                user_email: userEmail,
                amount: amount,
                currency: "INR",
                owner_token: ownerToken  // From seat locking
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail?.message || "Failed to create order");
        }

        return await response.json();
    };

    /**
     * Step 2: Verify Payment After Razorpay Success
     */
    const verifyPayment = async (paymentData) => {
        const response = await fetch(`${API_BASE_URL}/payments/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                razorpay_order_id: paymentData.razorpay_order_id,
                razorpay_payment_id: paymentData.razorpay_payment_id,
                razorpay_signature: paymentData.razorpay_signature,
                owner_token: ownerToken
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Payment verification failed");
        }

        return await response.json();
    };

    /**
     * Step 3: Initialize Razorpay Checkout
     */
    const initiatePayment = async () => {
        setLoading(true);
        setError(null);

        try {
            // 1. Create order
            const orderData = await createOrder();

            // 2. Initialize Razorpay Checkout
            const options = {
                key: orderData.key_id,  // Only public key, never secret!
                amount: orderData.amount,  // Amount in paise
                currency: orderData.currency,
                name: "CineVerse",
                description: "Movie Ticket Booking",
                order_id: orderData.order_id,
                prefill: {
                    email: userEmail,
                    name: userEmail.split('@')[0],
                },
                theme: {
                    color: "#D32F2F"  // CineVerse red
                },
                handler: async function (response) {
                    // Payment successful, verify signature
                    try {
                        const verifyResult = await verifyPayment(response);
                        setBookingResult(verifyResult);
                        
                        // Navigate to success page
                        window.location.href = `/booking-success?booking_id=${verifyResult.booking_id}`;
                    } catch (err) {
                        setError(err.message);
                        alert(`Payment verification failed: ${err.message}`);
                    } finally {
                        setLoading(false);
                    }
                },
                modal: {
                    ondismiss: function() {
                        setLoading(false);
                        // User closed the payment modal
                        // Seats remain locked for TTL duration
                        alert("Payment cancelled. Your seats are still reserved for 3 minutes.");
                    }
                }
            };

            const rzp = new window.Razorpay(options);
            rzp.open();

        } catch (err) {
            setError(err.message);
            setLoading(false);
            alert(`Error: ${err.message}`);
        }
    };

    return (
        <div className="payment-container">
            <h2>Payment Summary</h2>
            <div className="payment-details">
                <p><strong>Email:</strong> {userEmail}</p>
                <p><strong>Seats:</strong> {seatIds.join(', ')}</p>
                <p><strong>Amount:</strong> ₹{amount}</p>
            </div>

            {error && (
                <div className="error-message" style={{ color: 'red', padding: '10px', margin: '10px 0' }}>
                    {error}
                </div>
            )}

            {bookingResult && (
                <div className="success-message" style={{ color: 'green', padding: '10px', margin: '10px 0' }}>
                    <p>✓ Booking confirmed! ID: {bookingResult.booking_id}</p>
                    <a href={bookingResult.download_url} download>Download Ticket PDF</a>
                </div>
            )}

            <button 
                onClick={initiatePayment} 
                disabled={loading}
                style={{
                    padding: '15px 30px',
                    fontSize: '16px',
                    backgroundColor: '#D32F2F',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1
                }}
            >
                {loading ? 'Processing...' : `Pay ₹${amount}`}
            </button>

            <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                Secure payment powered by Razorpay
            </p>
        </div>
    );
}

/**
 * Success Page Component
 * Shows booking confirmation and PDF download
 */
export function BookingSuccess() {
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('booking_id');

    return (
        <div className="success-page">
            <h1>🎉 Booking Confirmed!</h1>
            <p>Booking ID: <strong>{bookingId}</strong></p>
            
            <div className="actions">
                <a 
                    href={`${API_BASE_URL}/bookings/${bookingId}/ticket.pdf`}
                    className="download-btn"
                    style={{
                        display: 'inline-block',
                        padding: '12px 24px',
                        backgroundColor: '#1976D2',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '5px',
                        margin: '10px'
                    }}
                >
                    📥 Download Ticket PDF
                </a>

                <a 
                    href="/my-bookings"
                    style={{
                        display: 'inline-block',
                        padding: '12px 24px',
                        backgroundColor: '#43A047',
                        color: 'white',
                        textDecoration: 'none',
                        borderRadius: '5px',
                        margin: '10px'
                    }}
                >
                    View My Bookings
                </a>
            </div>

            <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '5px' }}>
                <h3>What's Next?</h3>
                <ul style={{ textAlign: 'left', maxWidth: '500px', margin: '0 auto' }}>
                    <li>Check your email for the ticket confirmation</li>
                    <li>Download and save your ticket PDF</li>
                    <li>Arrive at the theatre 15 minutes early</li>
                    <li>Bring a valid ID for verification</li>
                </ul>
            </div>
        </div>
    );
}

/**
 * HTML Head Setup (Add to your index.html)
 */
/*
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CineVerse - Movie Booking</title>
    
    <!-- Razorpay Checkout SDK -->
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
</head>
<body>
    <div id="root"></div>
</body>
</html>
*/

/**
 * Complete Flow Example
 */
/*
// 1. User selects seats and locks them
const ownerToken = crypto.randomUUID(); // Generate once per session
localStorage.setItem('seat_owner_token', ownerToken);

const lockResponse = await fetch('/api/showtimes/123/redis-lock-seats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        seat_ids: [101, 102],
        owner: ownerToken,
        ttl_ms: 180000  // 3 minutes
    })
});

// 2. Show payment page with PaymentFlow component
<PaymentFlow 
    showtimeId={123}
    seatIds={[101, 102]}
    userEmail="user@example.com"
    amount={500}
    ownerToken={ownerToken}
/>

// 3. After successful payment, user redirected to BookingSuccess
// 4. Seats automatically released from Redis after booking creation
*/

export default PaymentFlow;

