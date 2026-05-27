import type { ReactNode } from "react";
import { PageHeader } from "./PageHeader";
import { Stepper } from "./Stepper";

export function OnboardShell({
  stepKey,
  title,
  subtitle,
  children,
}: {
  stepKey: "create" | "deposit" | "telegram" | "capsule";
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <>
      <PageHeader
        trail={["Onboarding", title]}
        title={title}
        subtitle={subtitle}
      />
      <Stepper currentKey={stepKey} />
      <div className="mx-auto w-full max-w-5xl px-6 py-10">{children}</div>
    </>
  );
}
