import React, { useState } from "react";
import { CreditCard, Wallet, Gift, Building2, Clock, Star, QrCode, Smartphone } from "lucide-react";

export type PaymentMethod =
  | "upi_app"
  | "upi_qr"
  | "card"
  | "wallet"
  | "gift_voucher"
  | "netbanking"
  | "pay_later"
  | "redeem_points";

interface PaymentOption {
  id: PaymentMethod;
  label: string;
  icon: React.ReactNode;
  description?: string;
  available?: boolean;
}

interface PaymentOptionsProps {
  selectedMethod: PaymentMethod | null;
  onSelectMethod: (method: PaymentMethod) => void;
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: "upi_app",
    label: "Pay by any UPI App",
    icon: <Smartphone size={20} />,
    description: "Google Pay, PhonePe, Paytm, BHIM UPI",
    available: true,
  },
  {
    id: "upi_qr",
    label: "Scan QR Code",
    icon: <QrCode size={20} />,
    description: "Scan and pay with any UPI app",
    available: true,
  },
  {
    id: "card",
    label: "Debit/Credit Card",
    icon: <CreditCard size={20} />,
    description: "Visa, Mastercard, RuPay, Amex",
    available: true,
  },
  {
    id: "wallet",
    label: "Mobile Wallets",
    icon: <Wallet size={20} />,
    description: "Paytm, PhonePe, Amazon Pay",
    available: true,
  },
  {
    id: "gift_voucher",
    label: "Gift Voucher",
    icon: <Gift size={20} />,
    description: "Redeem gift voucher code",
    available: false,
  },
  {
    id: "netbanking",
    label: "Net Banking",
    icon: <Building2 size={20} />,
    description: "All major banks",
    available: true,
  },
  {
    id: "pay_later",
    label: "Pay Later",
    icon: <Clock size={20} />,
    description: "Pay after booking confirmation",
    available: false,
  },
  {
    id: "redeem_points",
    label: "Redeem Points",
    icon: <Star size={20} />,
    description: "Use CineVerse rewards",
    available: false,
  },
];

export default function PaymentOptions({ selectedMethod, onSelectMethod }: PaymentOptionsProps) {
  const [expandedId, setExpandedId] = useState<PaymentMethod | null>("upi_app");

  const toggleExpand = (id: PaymentMethod) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleSelect = (method: PaymentMethod) => {
    if (method === "upi_app") {
      setExpandedId("upi_app");
    }
    onSelectMethod(method);
  };

  return (
    <div className="space-y-3">
      <h3 className="mb-4 text-xl font-semibold text-white">Payment Options</h3>

      {expandedId === "upi_app" && (
        <div className="mb-4 rounded-lg border border-[#333] bg-[#1a1a1a] p-4">
          <div className="mb-4 grid grid-cols-3 gap-3">
            {[
              { label: "Google Pay", color: "bg-white", text: "text-black", initial: "G" },
              { label: "PhonePe", color: "bg-[#5F259F]", text: "text-white", initial: "P" },
              { label: "Paytm", color: "bg-[#00BAF2]", text: "text-white", initial: "P" },
            ].map((app) => (
              <button
                key={app.label}
                onClick={() => handleSelect("upi_app")}
                className={`flex flex-col items-center justify-center rounded-lg border-2 p-3 transition-colors ${
                  selectedMethod === "upi_app"
                    ? "border-[#FF7A00] bg-[#FF7A00]/10"
                    : "border-[#333] bg-[#111] hover:border-[#444]"
                }`}
              >
                <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-full ${app.color}`}>
                  <span className={`text-xs font-bold ${app.text}`}>{app.initial}</span>
                </div>
                <span className="text-xs text-gray-300">{app.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => handleSelect("upi_qr")}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#333] bg-[#222] px-4 py-2 text-sm text-white transition hover:bg-[#2a2a2a]"
          >
            <QrCode size={16} />
            Scan QR Code
          </button>
        </div>
      )}

      {PAYMENT_OPTIONS.filter((option) => option.id !== "upi_app").map((option) => (
        <div
          key={option.id}
          className={`overflow-hidden rounded-lg border transition-all ${
            expandedId === option.id ? "border-[#FF7A00] bg-[#1a1a1a]" : "border-[#333] bg-[#111]"
          } ${!option.available ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-[#444]"}`}
        >
          <button
            onClick={() => {
              if (option.available) {
                toggleExpand(option.id);
                handleSelect(option.id);
              }
            }}
            disabled={!option.available}
            className="flex w-full items-center justify-between p-4 text-left"
          >
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${selectedMethod === option.id ? "bg-[#FF7A00]" : "bg-[#222]"}`}>
                <div className={selectedMethod === option.id ? "text-white" : "text-gray-400"}>{option.icon}</div>
              </div>
              <div>
                <div className="font-medium text-white">{option.label}</div>
                {option.description && <div className="mt-0.5 text-xs text-gray-400">{option.description}</div>}
              </div>
            </div>
            <div className={`flex items-center gap-2 ${selectedMethod === option.id ? "text-[#FF7A00]" : "text-gray-500"}`}>
              {selectedMethod === option.id && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FF7A00]">
                  <div className="h-2 w-2 rounded-full bg-white" />
                </div>
              )}
              <span>{expandedId === option.id ? "Hide" : "Select"}</span>
            </div>
          </button>

          {expandedId === option.id && (
            <div className="border-t border-[#333] bg-[#141414] p-4 text-sm text-gray-400">
              <p>Currently, this payment method is {option.available ? "available" : "temporarily unavailable"}.</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
