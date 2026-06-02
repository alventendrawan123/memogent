"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

export function CheckInPopup({
  open,
  variant = "success",
  title,
  subtitle,
  onClose,
}: {
  open: boolean;
  variant?: "success" | "error";
  title: string;
  subtitle?: string | null;
  onClose: () => void;
}) {
  const [clock, setClock] = useState("12:36");

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    setClock(
      `${String(now.getHours()).padStart(2, "0")}:${String(
        now.getMinutes(),
      ).padStart(2, "0")}`,
    );
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(event) => event.stopPropagation()}
            initial={{ scale: 0.9, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.94, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="relative flex w-[300px] flex-col items-center gap-4"
          >
            <div className="w-full rounded-[32px] border-2 border-[#2B1810]/30 bg-[#E0E2DA] p-4 shadow-[0_24px_60px_rgba(43,24,16,0.22)]">
              <div className="flex h-44 flex-col justify-between rounded-[16px] bg-[#B7C880] p-4 shadow-inner">
                <div className="flex items-center justify-between font-nokia text-[12px] text-[#2A3616]">
                  <span aria-hidden>✉</span>
                  <span>{clock}</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="flex items-center font-nokia text-[22px] leading-none text-[#2A3616]">
                    {title}
                    <motion.span
                      aria-hidden
                      className="ml-1.5 inline-block h-5 w-2 bg-[#2A3616]"
                      animate={{ opacity: [0, 1, 0] }}
                      transition={{
                        duration: 0.8,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "linear",
                      }}
                    />
                  </p>
                  {subtitle && (
                    <p className="font-nokia text-[13px] leading-tight text-[#2A3616]/80">
                      {subtitle}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between font-nokia text-[14px] text-[#2A3616]">
                  <span aria-hidden>{variant === "success" ? "✓" : "✕"}</span>
                  <span aria-hidden>▮▮▮</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-full border border-[#2B1810]/15 bg-white/80 px-6 py-2 font-nokia text-[14px] text-[#2A3616] shadow-sm backdrop-blur-sm transition hover:bg-white"
            >
              Close
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
