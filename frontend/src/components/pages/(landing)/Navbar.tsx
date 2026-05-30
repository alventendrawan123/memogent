import Image from "next/image";
import Link from "next/link";
import { LaunchAppButton } from "./LaunchAppButton";

const NAV_LINKS = [
  { label: "Memory", href: "#memory" },
  { label: "Trust", href: "#trust" },
  { label: "Capsule", href: "#capsule" },
  { label: "Heirs", href: "#heirs" },
];

export function Navbar() {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-50 pointer-events-none">
      <nav className="pointer-events-auto backdrop-blur-md bg-transparent border border-black/10 rounded-full px-6 py-3 flex items-center justify-between">
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

        <LaunchAppButton />
      </nav>
    </div>
  );
}
