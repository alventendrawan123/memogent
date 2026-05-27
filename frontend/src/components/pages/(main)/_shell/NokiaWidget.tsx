"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

export function NokiaWidget({
  messages,
  caption,
}: {
  messages: string[];
  caption?: string;
}) {
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"typing" | "pausing" | "deleting">(
    "typing",
  );

  useEffect(() => {
    if (messages.length === 0) return;
    const current = messages[index % messages.length];

    if (phase === "typing") {
      if (text.length < current.length) {
        const t = setTimeout(
          () => setText(current.slice(0, text.length + 1)),
          100,
        );
        return () => clearTimeout(t);
      }
      setPhase("pausing");
      return;
    }

    if (phase === "pausing") {
      const t = setTimeout(() => setPhase("deleting"), 2200);
      return () => clearTimeout(t);
    }

    if (phase === "deleting") {
      if (text.length > 0) {
        const t = setTimeout(
          () => setText(current.slice(0, text.length - 1)),
          45,
        );
        return () => clearTimeout(t);
      }
      setIndex((i) => i + 1);
      setPhase("typing");
    }
  }, [text, phase, index, messages]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[220px] rounded-[28px] border-2 border-[#2B1810]/30 bg-[#E0E2DA] p-3 shadow-[0_10px_30px_rgba(43,24,16,0.08)]">
        <div className="flex h-32 flex-col justify-between rounded-[12px] bg-[#B7C880] p-3 shadow-inner">
          <div className="flex items-center justify-between font-nokia text-[10px] text-[#2A3616]">
            <span aria-hidden>✉</span>
            <span>12:36</span>
          </div>
          <p className="font-nokia text-[14px] leading-tight text-[#2A3616] break-words min-h-[1.5em]">
            {text}
            <motion.span
              aria-hidden
              className="inline-block h-3 w-1.5 align-middle ml-1 bg-[#2A3616]"
              animate={{ opacity: [0, 1, 0] }}
              transition={{
                duration: 0.8,
                repeat: Number.POSITIVE_INFINITY,
                ease: "linear",
              }}
            />
          </p>
          <div className="flex items-center justify-between font-nokia text-[10px] text-[#2A3616]">
            <span aria-hidden>Y</span>
            <span aria-hidden>▮▮▮</span>
          </div>
        </div>
      </div>
      {caption && (
        <p className="font-apple text-[11px] uppercase tracking-[0.18em] text-[#1a1a1a]/50">
          {caption}
        </p>
      )}
    </div>
  );
}
