"use client";

import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletButton } from "./WalletButton";

const NAV_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "History", href: "/history" },
  { label: "Audit", href: "/audit" },
];

export function MainNavbar() {
  const pathname = usePathname();

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-50 pointer-events-none">
      <nav className="pointer-events-auto flex items-center justify-between rounded-full border border-black/10 bg-white/70 px-6 py-3 backdrop-blur-md">
        <Link
          href="/"
          aria-label="Memogent home"
          className="inline-flex items-center gap-2 font-instrument text-[28px] tracking-tight text-[#1a1a1a] leading-none"
        >
          <Image
            src="/Assets/Images/Logo-Brand/memogent-logo.png"
            alt=""
            width={32}
            height={32}
            priority
            className="size-7"
          />
          memogent.
        </Link>

        <ul className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative inline-flex items-center px-3 py-1.5 font-sans text-[14px] transition-colors duration-200 ${
                    active
                      ? "font-medium text-[#1a1a1a]"
                      : "text-[#1a1a1a]/45 hover:text-[#1a1a1a]/80"
                  }`}
                >
                  <span className="relative">
                    {link.label}
                    {active ? (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute -bottom-1.5 left-0 right-0 h-[2px] rounded-full bg-[#1a1a1a]"
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 32,
                        }}
                      />
                    ) : (
                      <span className="absolute -bottom-1.5 left-0 right-0 h-[2px] origin-left scale-x-0 rounded-full bg-[#1a1a1a]/25 transition-transform duration-200 ease-out group-hover:scale-x-100" />
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <WalletButton />
      </nav>
    </div>
  );
}
