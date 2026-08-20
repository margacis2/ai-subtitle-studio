import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Subtitle Studio",
  description:
    "GPU-aware, multilingual, parallel AI subtitle workstation — transcribe, translate, edit and export SRT/VTT/ASS.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-fs="md" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}