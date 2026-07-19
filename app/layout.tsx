import type { Metadata } from "next";
import { Kanit, Sarabun } from "next/font/google";
import { MotionConfig } from "framer-motion";
import "./globals.css";

const kanit = Kanit({ subsets: ["thai", "latin"], weight: ["500", "600", "700"], variable: "--font-kanit" });
const sarabun = Sarabun({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--font-sarabun" });

export const metadata: Metadata = {
  title: "TravelAss",
  description: "วางแผนและบันทึกทริปท่องเที่ยว",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TravelAss",
  },
  icons: { apple: "/apple-touch-icon.png" },
  // Next 16's Metadata API only emits the unprefixed "mobile-web-app-capable"
  // tag for appleWebApp.capable; iOS Safari's standalone/no-address-bar mode
  // still keys off the apple- prefixed one, so it's added explicitly here.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${kanit.variable} ${sarabun.variable}`}>
      <body className="bg-bg text-text font-body min-h-dvh overflow-x-hidden">
        <div aria-hidden="true" className="doodle-bg" />
        <div className="relative z-[1]">
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </div>
      </body>
    </html>
  );
}
