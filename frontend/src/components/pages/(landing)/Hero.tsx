"use client";

import { motion } from "motion/react";
import { TypingMessages } from "./TypingMessages";

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260427_054418_a6d194f0-ac86-4df9-abe5-ded73e596d7c.mp4";

const HEADLINE_EASE = [0.16, 1, 0.3, 1] as const;

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center overflow-hidden bg-[#F3F4ED] pt-24 md:pt-32">
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          aria-hidden
          className="h-full w-full object-cover"
        >
          <source src={VIDEO_SRC} type="video/mp4" />
          <track kind="captions" />
        </video>
        <div className="absolute inset-0 bg-white/5" />
      </div>

      <div className="pointer-events-none relative z-20 px-4 text-center">
        <motion.h1
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.5, ease: HEADLINE_EASE }}
          className="font-instrument mb-6 text-[38px] leading-[0.85] tracking-tight text-[#1a1a1a] md:text-[56px] lg:text-[72px]"
        >
          Quiet guardian. <br /> Lasting peace.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 0.3, ease: HEADLINE_EASE }}
          className="mx-auto max-w-xl font-apple text-[16px] font-normal leading-relaxed tracking-tight text-[#1a1a1a]/70 md:text-[18px]"
        >
          Register your will once. An autonomous agent watches over your wallet,
          and when the time comes, your final words and wishes reach the people
          you trust.
        </motion.p>
      </div>

      <TypingMessages />
    </section>
  );
}
