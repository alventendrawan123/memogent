"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

const MESSAGES = [
  "Are you still here?",
  "Yes, I'm alive.",
  "Check-in received.",
];

const TYPING_SPEED_MS = 100;
const DELETING_SPEED_MS = 50;
const PAUSE_BEFORE_DELETE_MS = 2000;

type Phase = "typing" | "pausing" | "deleting";

export function TypingMessages() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayedText, setDisplayedText] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");

  useEffect(() => {
    const currentMessage = MESSAGES[messageIndex];

    if (phase === "typing") {
      if (displayedText.length < currentMessage.length) {
        const timer = setTimeout(() => {
          setDisplayedText(currentMessage.slice(0, displayedText.length + 1));
        }, TYPING_SPEED_MS);
        return () => clearTimeout(timer);
      }
      setPhase("pausing");
      return;
    }

    if (phase === "pausing") {
      const timer = setTimeout(() => setPhase("deleting"), PAUSE_BEFORE_DELETE_MS);
      return () => clearTimeout(timer);
    }

    if (phase === "deleting") {
      if (displayedText.length > 0) {
        const timer = setTimeout(() => {
          setDisplayedText(currentMessage.slice(0, displayedText.length - 1));
        }, DELETING_SPEED_MS);
        return () => clearTimeout(timer);
      }
      setMessageIndex((index) => (index + 1) % MESSAGES.length);
      setPhase("typing");
    }
  }, [displayedText, phase, messageIndex]);

  return (
    <div className="absolute left-[48.5%] md:left-[47.5%] lg:left-[48.5%] -translate-x-1/2 bottom-[32%] z-30 w-[110px] sm:w-[130px] flex justify-start text-left">
      <span className="font-nokia text-[#2A3616] text-[10px] sm:text-[14px] leading-tight break-words min-h-[1.5em]">
        {displayedText}
        <motion.span
          className="inline-block w-1.5 h-3 bg-[#2A3616] ml-1 align-middle"
          animate={{ opacity: [0, 1, 0] }}
          transition={{
            duration: 0.8,
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear",
          }}
        />
      </span>
    </div>
  );
}
