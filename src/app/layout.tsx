import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import { Nav } from "@/components/nav";
import "./globals.css";

/**
 * Fonts are vendored under public/fonts (SIL Open Font License, see the OFL
 * files) so the build has no network dependency. `--font-mono` falls back to the
 * system monospace stack defined in globals.css.
 */
const display = localFont({
  src: "../../public/fonts/syne.ttf",
  variable: "--font-display",
  display: "swap",
});

const ui = localFont({
  src: "../../public/fonts/outfit.ttf",
  variable: "--font-ui",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SAAF Policy Circuit Breaker",
  description:
    "A support agent may propose a refund. SAAF decides whether that proposal can reach a mock ledger, needs human review, or must be blocked — and quarantines the agent when its policy or memory drifts.",
  openGraph: {
    title: "SAAF Policy Circuit Breaker",
    description:
      "Model proposal → deterministic policy decision → allowlisted mock action → replayable workpaper.",
    images: ["/images/og-cover.svg"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${ui.variable} antialiased`}>
        <div className="relative z-10">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
