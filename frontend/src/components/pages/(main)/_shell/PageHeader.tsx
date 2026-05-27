import type { ReactNode } from "react";
import { SceneCrumb } from "./SceneCrumb";

export function PageHeader({
  trail,
  title,
  subtitle,
  aside,
}: {
  trail: string[];
  title: string;
  subtitle?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 pt-32 pb-10 md:flex-row md:items-end md:justify-between">
      <div className="flex flex-col gap-3">
        <SceneCrumb trail={trail} />
        <h1 className="font-instrument text-[40px] leading-[0.95] tracking-tight text-[#1a1a1a] md:text-[56px]">
          {title}
        </h1>
        {subtitle && (
          <p className="max-w-xl font-apple text-[15px] leading-relaxed text-[#1a1a1a]/65 md:text-[16px]">
            {subtitle}
          </p>
        )}
      </div>
      {aside && <div className="md:flex md:items-end">{aside}</div>}
    </header>
  );
}
