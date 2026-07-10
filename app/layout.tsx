import type { Metadata } from "next";
import { Prompt, Sarabun } from "next/font/google";
import "./globals.css";

const prompt = Prompt({ subsets: ["thai", "latin"], weight: ["600", "700"], variable: "--font-prompt" });
const sarabun = Sarabun({ subsets: ["thai", "latin"], weight: ["400", "500", "600"], variable: "--font-sarabun" });

export const metadata: Metadata = { title: "TravelAss", description: "วางแผนและบันทึกทริปท่องเที่ยว" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${prompt.variable} ${sarabun.variable}`}>
      <body className="bg-bg text-text font-body min-h-dvh">{children}</body>
    </html>
  );
}
