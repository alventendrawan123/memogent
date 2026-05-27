import { LuChevronRight } from "react-icons/lu";

export function SceneCrumb({ trail }: { trail: string[] }) {
  return (
    <nav
      aria-label="Scene"
      className="flex items-center gap-2 font-apple text-[11px] uppercase tracking-[0.18em] text-[#1a1a1a]/50"
    >
      {trail.map((segment, index) => (
        <span key={segment} className="inline-flex items-center gap-2">
          {index > 0 && (
            <LuChevronRight className="size-3 opacity-50" aria-hidden />
          )}
          <span>{segment}</span>
        </span>
      ))}
    </nav>
  );
}
