"use client";

import * as RadixLabel from "@radix-ui/react-label";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type LabelProps = React.ComponentPropsWithoutRef<typeof RadixLabel.Root>;

export const Label = forwardRef<
  React.ComponentRef<typeof RadixLabel.Root>,
  LabelProps
>(({ className, ...props }, ref) => (
  <RadixLabel.Root
    ref={ref}
    className={cn(
      "font-apple text-[13px] font-medium text-[#1a1a1a]/80",
      className,
    )}
    {...props}
  />
));
Label.displayName = "Label";
