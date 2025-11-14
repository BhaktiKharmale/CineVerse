import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";

const Register = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const navigate = useNavigate();
  const BASE_URL = `${import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001"}/api/user`;

  const handleSendOtp = async () => {
    if (!email) {
      alert("Please enter your email first.");
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/send-otp`, { email });
      alert("OTP sent to your email!");
      setIsOtpSent(true);
      startResendCooldown();
    } catch (error: any) {
      alert(error.response?.data?.detail || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      alert("Enter the OTP you received.");
      return;
    }
    setLoading(true);
    try {
      const response = await axios.post(`${BASE_URL}/verify-otp`, {
        email,
        otp,
      });
      if (response.data.success || response.data.message === "OTP verified successfully") {
        alert("✅ Email verified successfully!");
        setIsVerified(true);
      } else {
        alert("Invalid OTP. Please try again.");
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || "OTP verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/resend-otp`, { email });
      alert("New OTP sent!");
      startResendCooldown();
    } catch (error: any) {
      alert(error.response?.data?.detail || "Failed to resend OTP");
    } finally {
      setLoading(false);
    }
  };

  const startResendCooldown = () => {
    setResendCooldown(30);
    const interval = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isVerified) {
      alert("Please verify your email first.");
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${BASE_URL}/register`, {
        name,
        email,
        password,
      });

      if (response.data.success || response.data.message === "User registered successfully") {
        alert("🎉 Registration successful! Redirecting to login...");
        navigate("/login");
      } else {
        alert("Registration failed. Try again.");
      }
    } catch (error: any) {
      alert(error.response?.data?.detail || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
      <div className="w-full max-w-md bg-[#111] p-8 rounded-2xl shadow-lg border border-gray-800">
        <h2 className="text-3xl font-bold text-center text-orange-500 mb-6">
          Join CineVerse
        </h2>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2 rounded bg-gray-900 border border-gray-700 focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm mb-1">Email Address</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isOtpSent}
                className="w-full p-2 rounded bg-gray-900 border border-gray-700 focus:ring-2 focus:ring-orange-500"
                required
              />
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={loading || isOtpSent}
                className="bg-orange-500 hover:bg-orange-600 px-3 py-2 rounded text-sm font-semibold disabled:opacity-50"
              >
                {isOtpSent ? "Sent" : "Send OTP"}
              </button>
            </div>
          </div>

          {isOtpSent && !isVerified && (
            <div>
              <label className="block text-sm mb-1">Enter OTP</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full p-2 rounded bg-gray-900 border border-gray-700 focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={handleVerifyOtp}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm font-semibold disabled:opacity-50"
                >
                  Verify
                </button>
              </div>

              <div className="text-right mt-2">
                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={loading || resendCooldown > 0}
                  className="text-orange-400 hover:text-orange-500 text-sm disabled:opacity-50"
                >
                  {resendCooldown > 0
                    ? `Resend OTP in ${resendCooldown}s`
                    : "Resend OTP"}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 rounded bg-gray-900 border border-gray-700 focus:ring-2 focus:ring-orange-500"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !isVerified}
            className="w-full bg-gradient-to-r from-red-600 to-orange-500 py-2 rounded text-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Processing..." : "Register"}
          </button>
        </form>

        <p className="text-center text-gray-400 mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-orange-500 hover:underline">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
