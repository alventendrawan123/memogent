import Link from "next/link";

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

        <Link
          href="/onboard/create"
          className="group relative inline-flex items-center justify-center overflow-hidden rounded-full bg-[#0871E7] px-5 py-2 font-sans text-[14px] text-white shadow-[inset_0_-4px_4px_rgba(255,255,255,0.39)] outline-1 outline-[#0871E7] -outline-offset-1"
        >
          <span
            aria-hidden
            className="absolute left-[10%] top-[1px] h-4 w-[80%] rounded-[12px] bg-gradient-to-b from-[#DEF0FC] to-transparent transition-transform duration-300 group-hover:scale-x-105"
          />
          <span className="relative z-10">Begin</span>
        </Link>
      </nav>
    </div>
  );
}
