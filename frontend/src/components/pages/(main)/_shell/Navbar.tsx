import Link from "next/link";
import { WalletButton } from "./WalletButton";

const NAV_LINKS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "History", href: "/history" },
  { label: "Audit", href: "/audit" },
];

export function MainNavbar() {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-50 pointer-events-none">
      <nav className="pointer-events-auto flex items-center justify-between rounded-full border border-black/10 bg-white/70 px-6 py-3 backdrop-blur-md">
        <Link
          href="/"
          aria-label="Memogent home"
          className="font-instrument text-[28px] tracking-tight text-[#1a1a1a] leading-none"
        >
          memogent.
        </Link>

        <ul className="hidden md:flex items-center gap-10">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="font-sans text-[14px] text-[#1a1a1a] transition-opacity hover:opacity-60"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <WalletButton />
      </nav>
    </div>
  );
}
