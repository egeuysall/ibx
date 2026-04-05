import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";

import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ICON_VERSION = "20260407";

export const metadata: Metadata = {
  title: "ibx",
  description: "Private thought ibx and todo generator.",
  icons: {
    icon: `/icon?size=512&v=${ICON_VERSION}`,
    apple: `/apple-icon?v=${ICON_VERSION}`,
    shortcut: `/favicon.ico?v=${ICON_VERSION}`,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f8" },
    { media: "(prefers-color-scheme: dark)", color: "#f8f8f8" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-mono">
        <TooltipProvider delay={120}>
          <ServiceWorkerRegister />
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
