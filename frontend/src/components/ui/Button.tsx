"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group relative inline-flex cursor-pointer items-center justify-center gap-2 font-sans text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0871E7]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F3F4ED]",
  {
    variants: {
      variant: {
        primary:
          "overflow-hidden rounded-full bg-[#0871E7] text-white shadow-[inset_0_-4px_4px_rgba(255,255,255,0.39)] outline-1 outline-[#0871E7] -outline-offset-1 hover:bg-[#0866D6]",
        secondary:
          "rounded-full border border-black/10 bg-white text-[#1a1a1a] hover:bg-black/[0.03]",
        ghost: "rounded-full text-[#1a1a1a] hover:bg-black/[0.04]",
        danger:
          "rounded-full bg-[#E11D48] text-white shadow-[inset_0_-4px_4px_rgba(255,255,255,0.28)] hover:bg-[#BE123C]",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-5",
        lg: "h-12 px-6 text-[15px]",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const showGlint = variant === "primary" || variant === "danger";

    if (asChild) {
      return (
        <Comp
          ref={ref as React.Ref<HTMLButtonElement>}
          className={cn(buttonVariants({ variant, size }), className)}
          {...props}
        >
          {children}
        </Comp>
      );
    }

    return (
      <button
        ref={ref}
        type={props.type ?? "button"}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {showGlint && (
          <span
            aria-hidden
            className="absolute left-[10%] top-[1px] h-4 w-[80%] rounded-[12px] bg-gradient-to-b from-white/55 to-transparent transition-transform duration-300 group-hover:scale-x-105"
          />
        )}
        <span className="relative z-10 inline-flex items-center gap-2">
          {children}
        </span>
      </button>
    );
  },
);

Button.displayName = "Button";

export { buttonVariants };
