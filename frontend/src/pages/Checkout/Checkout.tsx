import React, { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import paymentService from "../../services/paymentService";
import { getOwnerToken } from "../../utils/ownerToken";
import toast from "react-hot-toast";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const CheckoutPage: React.FC = () => {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const orderFromState = (location.state && (location.state as any).order) || null;

  useEffect(() => {
    const openCheckout = async () => {
      try {
        let order = orderFromState;

        if (!order && orderId) {
          order = await paymentService.getOrder(orderId);
        }

        if (!order) {
          toast.error("Order details missing. Please try again.");
          navigate("/home");
          return;
        }

        const options = {
          key: order.key_id,
          amount: order.amount,
          currency: order.currency || "INR",
          name: "CineVerse",
          description: "Movie booking",
          order_id: order.order_id,
          handler: async function (response: any) {
            try {
                const verifyPayload = {
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    orderId: order.order_id,
                    owner: getOwnerToken(),
                    gatewayPayload: response,
                  };
                  
              const res = await paymentService.verifyPayment(verifyPayload);
              toast.success(res.message || "Booking confirmed!");
              // FIXED: Navigate to success page
              navigate(`/booking/${res.booking_id}/success`, { replace: true });
            } catch (err: any) {
              console.error("Verify error", err);
              toast.error(err?.response?.data?.detail || "Payment verification failed");
              // Navigate back to seat selection on error
              navigate(-1);
            }
          },
          modal: {
            ondismiss: function () {
              toast("Payment closed.");
              // FIXED: Navigate back to seat selection
              navigate(-1);
            },
          },
        };

        const rzp = new window.Razorpay(options);
        rzp.open();
      } catch (e) {
        console.error(e);
        toast.error("Unable to open payment gateway");
        navigate(-1);
      }
    };

    openCheckout();
  }, [orderFromState, orderId, navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <div className="text-white text-lg">Opening payment gateway…</div>
    </div>
  );
};

export default CheckoutPage;