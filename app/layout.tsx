import type { Metadata } from "next";
import { Kanit, IBM_Plex_Sans_Thai } from "next/font/google";
import "./globals.css";

const kanit = Kanit({ subsets: ["thai", "latin"], weight: ["500", "600", "700"], variable: "--font-kanit" });
const plex = IBM_Plex_Sans_Thai({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--font-plex" });

export const metadata: Metadata = { title: "TravelAss", description: "วางแผนและบันทึกทริปท่องเที่ยว" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${kanit.variable} ${plex.variable}`}>
      <body className="bg-bg text-text font-body min-h-dvh">{children}</body>
    </html>
  );
}
