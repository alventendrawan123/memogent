import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Memogent — A quiet guardian for your digital legacy",
  description:
    "Register your will once. An autonomous agent watches over your wallet, and when the time comes, your final words and wishes reach the people you trust.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
