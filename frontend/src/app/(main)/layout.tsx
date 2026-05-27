import { MainGate } from "@/components/pages/(main)/_shell/MainGate";
import { MainNavbar } from "@/components/pages/(main)/_shell/Navbar";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#F3F4ED]">
      <MainNavbar />
      <MainGate>
        <main className="flex-1 pb-24">{children}</main>
      </MainGate>
    </div>
  );
}
