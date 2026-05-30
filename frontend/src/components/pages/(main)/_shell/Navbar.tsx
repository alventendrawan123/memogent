"use client";

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
                  className={`relative inline-flex items-center rounded-full px-4 py-1.5 font-sans text-[14px] transition-colors ${
                    active
                      ? "bg-[#0871E7]/10 font-medium text-[#0871E7]"
                      : "text-[#1a1a1a] hover:bg-black/[0.04]"
                  }`}
                >
                  {link.label}
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
