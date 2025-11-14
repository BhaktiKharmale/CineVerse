import React from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  loading = false,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
      <div className="w-full max-w-md rounded-3xl border border-[#1f1f25] bg-[#09090f] p-8 text-white shadow-[0_40px_120px_-60px_rgba(246,200,0,0.35)]">
        <div className="flex items-start gap-4">
          <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f6c800]/20 text-[#f6c800]">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-white">{title}</h2>
            <p className="mt-2 text-sm text-gray-400">{message}</p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-[#1f1f25] px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-gray-300 transition hover:bg-[#11111a]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="rounded-full bg-[#f64040] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-[#ff6a6a] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:cursor-not-allowed disabled:bg-gray-500"
          >
            {loading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
