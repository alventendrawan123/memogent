import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-apple text-[11px] font-medium uppercase tracking-wide",
  {
    variants: {
      tone: {
        neutral: "bg-black/[0.04] text-[#1a1a1a]/70",
        active: "bg-[#E8F5E9] text-[#1B5E20]",
        warning: "bg-[#FFF3E0] text-[#B45309]",
        inactive: "bg-[#FCE4EC] text-[#B91C1C]",
        info: "bg-[#E3F2FD] text-[#1E40AF]",
        accent: "bg-[#0871E7]/10 text-[#0866D6]",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
