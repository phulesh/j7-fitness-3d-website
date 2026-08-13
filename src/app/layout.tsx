import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({
  src: [
    { path: "../../public/fonts/DejaVuSans.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/DejaVuSans-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

const serif = localFont({
  src: [
    { path: "../../public/fonts/DejaVuSerif.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/DejaVuSerif-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-serif",
  display: "swap",
});

const display = localFont({
  src: [
    { path: "../../public/fonts/DejaVuSerif.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/DejaVuSerif-Bold.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-display",
  display: "swap",
});

const devanagari = localFont({
  src: [{ path: "../../public/fonts/NotoSansDevanagari-Regular.ttf", weight: "400", style: "normal" }],
  variable: "--font-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Folio — Turn any topic into a research-based ebook",
    template: "%s · Folio",
  },
  description:
    "Enter a topic. Folio researches reliable sources, organizes the knowledge, and creates a professional ebook in your language — with citations, PDF, DOCX, and EPUB.",
  applicationName: "Folio",
  keywords: ["ebook generator", "research", "PDF", "multilingual", "syllabus", "citations"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#F3EDE3",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${serif.variable} ${devanagari.variable}`}>
      <body className="font-sans antialiased text-ink-700">{children}</body>
    </html>
  );
}
