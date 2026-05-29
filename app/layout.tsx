import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter-tight",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["SOFT"],
  variable: "--font-fraunces",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sprouty — Voice-first garden coach",
  description:
    "From 'I have no idea where to start' to a 12-week vegetable garden plan in 90 seconds of voice.",
  applicationName: "Sprouty",
  authors: [{ name: "Cory Micek", url: "https://mysickbuilds.com" }],
  keywords: ["gardening", "voice agent", "qdrant", "livekit", "mistral", "vector search"],
  openGraph: {
    title: "Sprouty — Voice-first garden coach",
    description:
      "Talk for 90 seconds. Get a personalized 12-week vegetable garden plan grounded in your knowledge base.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f8f6f0",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${interTight.variable} ${fraunces.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
