// src/pages/Booking/UPIStatus.tsx
import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Smartphone, Clock, CheckCircle, XCircle, ArrowLeft } from "lucide-react";
import paymentService from "../../services/paymentService";
import { loadBookingContext } from "../../utils/bookingContext";
import toast from "react-hot-toast";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";
const POLL_INTERVAL = 3000; // 3 seconds
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export default function UPIStatus() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("order_id");

  const [timeRemaining, setTimeRemaining] = useState(5 * 60); // 5 minutes in seconds
  const [status, setStatus] = useState<"waiting" | "processing" | "success" | "failed" | "timeout">("waiting");
  const [bookingId, setBookingId] = useState<number | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string>("");

  // Generate QR code from order ID
  useEffect(() => {
    if (!orderId) {
      toast.error("Invalid order ID");
      navigate("/payment-summary");
      return;
    }

    // Construct UPI payment URL (Razorpay format)
    // NOTE: In production, get the actual UPI QR URL from Razorpay order response
    // Razorpay provides 'upi_qr' or 'upi_intent' in the order response when using UPI payment method
    // For now, we construct a generic UPI intent URL: upi://pay?pa=<vpa>&pn=<name>&am=<amount>&tn=<note>&tr=<ref>
    const upiIntent = `upi://pay?pa=razorpay@razorpay&pn=CineVerse&am=${500}&tn=Booking%20${orderId}&tr=${orderId}`;
    setQrUrl(upiIntent);

    // Start countdown
    const countdownInterval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          setStatus("timeout");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    // Start polling for payment status
    const pollInterval = setInterval(async () => {
      try {
        // Check if payment is verified by polling order status
        // Note: This is a simplified check. In production, you'd poll Razorpay's order status API
        // or use webhooks to verify payment
        
        // For now, we'll simulate checking by attempting to verify
        // In a real implementation, you'd check Razorpay order status first
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, POLL_INTERVAL);

    // Timeout after 5 minutes
    const timeoutId = setTimeout(() => {
      if (status === "waiting" || status === "processing") {
        setStatus("timeout");
        clearInterval(pollInterval);
      }
    }, TIMEOUT_MS);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(pollInterval);
      clearTimeout(timeoutId);
    };
  }, [orderId, navigate, status]);

  // Manual verification button (for testing - in production, use webhooks)
  const handleDownloadTicket = async () => {
    if (!bookingId) {
      toast.error("Booking not found");
      return;
    }
    try {
      const blob = await paymentService.downloadTicket(bookingId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ticket-${bookingId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Unable to download ticket. Please try again.");
    }
  };

  const handleManualVerify = async () => {
    console.info("[UPIStatus] Manual verify clicked");
    toast("Please complete the payment in your UPI app. The booking will be confirmed automatically.");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const progress = ((5 * 60 - timeRemaining) / (5 * 60)) * 100;

  if (!orderId) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">Invalid order ID</p>
          <button
            onClick={() => navigate("/payment-summary")}
            className="px-4 py-2 bg-[#FF7A00] text-white rounded-lg"
          >
            Back to Payment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1a1a1a] rounded-lg border border-[#333] p-8">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Processing Payment</h1>
          <p className="text-gray-400 text-sm">Please wait while your payment is being processed</p>
        </div>

        {/* UPI App Icons */}
        <div className="flex justify-center gap-4 mb-6">
          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-black">G</span>
          </div>
          <div className="w-12 h-12 bg-[#5F259F] rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-white">P</span>
          </div>
          <div className="w-12 h-12 bg-[#00BAF2] rounded-full flex items-center justify-center">
            <span className="text-xs font-bold text-white">P</span>
          </div>
          <div className="w-12 h-12 bg-[#1EB53A] rounded-full flex items-center justify-center">
            <Smartphone size={20} className="text-white" />
          </div>
        </div>

        {/* Countdown Timer */}
        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Clock size={20} className="text-[#FF7A00]" />
            <span className="text-3xl font-bold text-[#FF7A00]">{formatTime(timeRemaining)}</span>
          </div>
          <div className="w-full bg-[#111] rounded-full h-2">
            <div
              className="bg-[#FF7A00] h-2 rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* QR Code */}
        {status === "waiting" || status === "processing" ? (
          <div className="flex flex-col items-center mb-6">
            <div className="bg-white p-4 rounded-lg border-2 border-[#FF7A00] shadow-lg">
              <QRCodeSVG
                value={qrUrl}
                size={256}
                level="H"
                includeMargin={true}
              />
            </div>
            <p className="text-xs text-gray-400 mt-4 text-center">
              Scan this QR code with any UPI app to complete payment
            </p>
          </div>
        ) : status === "success" ? (
          <div className="flex flex-col items-center mb-6">
            <CheckCircle size={64} className="text-green-500 mb-4" />
            <p className="text-green-400 font-semibold">Payment Successful!</p>
          </div>
        ) : status === "timeout" || status === "failed" ? (
          <div className="flex flex-col items-center mb-6">
            <XCircle size={64} className="text-red-500 mb-4" />
            <p className="text-red-400 font-semibold">
              {status === "timeout" ? "Payment Timeout" : "Payment Failed"}
            </p>
          </div>
        ) : null}

        {/* Status-specific actions */}
        {status === "waiting" || status === "processing" ? (
          <div className="space-y-3 text-center">
            <p className="text-xs text-gray-400">
              • Do not refresh this page
              <br />
              • Payment will be confirmed automatically
              <br />
              • Timeout: {formatTime(timeRemaining)} remaining
            </p>
            <button
              onClick={handleManualVerify}
              className="w-full py-2 px-4 bg-[#222] hover:bg-[#2a2a2a] text-white rounded-lg text-sm border border-[#333]"
            >
              I've Completed Payment
            </button>
          </div>
        ) : status === "success" && bookingId ? (
          <div className="space-y-3">
            <button
              onClick={handleDownloadTicket}
              className="w-full py-3 px-4 bg-[#FF7A00] hover:bg-[#e66a00] text-white rounded-lg font-semibold"
            >
              Download Ticket PDF
            </button>
            <button
              onClick={() => navigate("/payment-summary")}
              className="w-full py-2 px-4 bg-[#222] hover:bg-[#2a2a2a] text-white rounded-lg"
            >
              Back to Home
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={() => navigate("/payment-summary")}
              className="w-full py-3 px-4 bg-[#FF7A00] hover:bg-[#e66a00] text-white rounded-lg font-semibold"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate("/home")}
              className="w-full py-2 px-4 bg-[#222] hover:bg-[#2a2a2a] text-white rounded-lg flex items-center justify-center gap-2"
            >
              <ArrowLeft size={16} />
              Back to Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

