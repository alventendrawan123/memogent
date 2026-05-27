import { Hero } from "./Hero";
import { Navbar } from "./Navbar";

export function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-x-hidden">
      <Navbar />
      <Hero />
    </main>
  );
}
