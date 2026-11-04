import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Illini Scheduler",
  description: "Pick UIUC courses with GPA data, offering history, and a conflict-free schedule builder.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
