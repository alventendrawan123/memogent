"use client";

import * as RadixProgress from "@radix-ui/react-progress";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type ProgressProps = React.ComponentPropsWithoutRef<
  typeof RadixProgress.Root
> & {
  value: number;
};

export const Progress = forwardRef<
  React.ComponentRef<typeof RadixProgress.Root>,
  ProgressProps
>(({ className, value, ...props }, ref) => (
  <RadixProgress.Root
    ref={ref}
    className={cn(
      "relative h-1.5 w-full overflow-hidden rounded-full bg-black/[0.06]",
      className,
    )}
    value={value}
    {...props}
  >
    <RadixProgress.Indicator
      className="h-full bg-[#0871E7] transition-transform duration-500 ease-out"
      style={{ transform: `translateX(-${100 - value}%)` }}
    />
  </RadixProgress.Root>
));
Progress.displayName = "Progress";
