import { LuCheck } from "react-icons/lu";
import { cn } from "@/lib/utils";

export type OnboardStep = {
  key: string;
  label: string;
  href: string;
};

export const ONBOARD_STEPS: OnboardStep[] = [
  { key: "create", label: "Create", href: "/onboard/create" },
  { key: "deposit", label: "Deposit", href: "/onboard/deposit" },
  { key: "invite", label: "Invite", href: "/onboard/invite" },
  { key: "telegram", label: "Telegram", href: "/onboard/telegram" },
  { key: "capsule", label: "Capsule", href: "/onboard/capsule" },
];

export function Stepper({ currentKey }: { currentKey: string }) {
  const currentIndex = ONBOARD_STEPS.findIndex(
    (step) => step.key === currentKey,
  );

  return (
    <ol className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 pb-2">
      {ONBOARD_STEPS.map((step, index) => {
        const status =
          index < currentIndex
            ? "done"
            : index === currentIndex
              ? "current"
              : "pending";
        return (
          <li key={step.key} className="flex flex-1 items-center gap-3">
            <span
              aria-current={status === "current" ? "step" : undefined}
              className={cn(
                "flex size-7 items-center justify-center rounded-full font-apple text-[12px] font-medium transition",
                status === "done" && "bg-[#1B5E20] text-white",
                status === "current" &&
                  "bg-[#0871E7] text-white shadow-[inset_0_-3px_3px_rgba(255,255,255,0.35)]",
                status === "pending" &&
                  "border border-black/10 bg-white text-[#1a1a1a]/40",
              )}
            >
              {status === "done" ? <LuCheck className="size-4" /> : index + 1}
            </span>
            <span
              className={cn(
                "font-apple text-[12px] uppercase tracking-[0.16em]",
                status === "pending"
                  ? "text-[#1a1a1a]/40"
                  : "text-[#1a1a1a]/80",
              )}
            >
              {step.label}
            </span>
            {index < ONBOARD_STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-px flex-1",
                  status === "done" ? "bg-[#1B5E20]/40" : "bg-black/10",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
