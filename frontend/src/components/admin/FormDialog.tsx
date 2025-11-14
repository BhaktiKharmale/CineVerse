import React, { useEffect } from "react";
import { X } from "lucide-react";

interface FormDialogProps {
  title: string;
  description?: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  children: React.ReactNode;
}

const FormDialog: React.FC<FormDialogProps> = ({
  title,
  description,
  isOpen,
  onClose,
  onSubmit,
  submitLabel = "Save",
  isSubmitting = false,
  children,
}) => {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handler);
    }
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
      <div className="relative w-full max-w-xl rounded-3xl border border-[#1f1f25] bg-[#09090f] p-6 shadow-[0_40px_120px_-60px_rgba(246,200,0,0.35)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-[#1f1f25] bg-[#11111a] text-gray-400 transition hover:text-white"
          aria-label="Close dialog"
        >
          <X size={18} />
        </button>
        <div className="pr-12">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {description && <p className="mt-2 text-sm text-gray-400">{description}</p>}
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {children}
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#1f1f25] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-gray-300 transition hover:bg-[#11111a]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-[#f6c800] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[#ffd836] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] disabled:cursor-not-allowed disabled:bg-gray-500"
            >
              {isSubmitting ? "Saving..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FormDialog;
