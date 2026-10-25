import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";

import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const ICON_VERSION = "20260408";

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
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
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
        <Script id="ibx-theme" strategy="beforeInteractive">
          {`try {
            const preference = localStorage.getItem("ibx:appearance");
            const dark = preference === "dark" || (preference !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
            document.documentElement.classList.toggle("dark", dark);
            document.documentElement.dataset.theme = dark ? "dark" : "light";
          } catch {}`}
        </Script>
        <ClerkProvider appearance={{ theme: shadcn }}>
          <TooltipProvider delay={120}>
            <ServiceWorkerRegister />
            {children}
          </TooltipProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
