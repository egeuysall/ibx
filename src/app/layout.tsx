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
  metadataBase: new URL((process.env.NEXT_PUBLIC_SITE_URL ?? "https://ibx.egeuysal.com").replace(/\/+$/, "")),
  title: {
    default: "ibx | tasks, notes, drive, and cli",
    template: "%s | ibx",
  },
  description: "turn thoughts into tasks, keep notes and files together, and continue across the web, cli, and phone.",
  applicationName: "ibx",
  authors: [{ name: "Ege Uysal", url: "https://egeuysal.com" }],
  creator: "Ege Uysal",
  publisher: "ibx",
  category: "productivity",
  referrer: "strict-origin-when-cross-origin",
  formatDetection: { telephone: false, email: false, address: false },
  keywords: ["ibx", "task manager", "todo", "notes", "file drive", "cli", "calendar", "offline productivity"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    title: "ibx | tasks, notes, drive, and cli",
    description: "turn thoughts into tasks, keep notes and files together, and continue across the web, cli, and phone.",
    siteName: "ibx",
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "ibx tasks, notes, drive, and cli" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ibx | tasks, notes, drive, and cli",
    description: "turn thoughts into tasks, keep notes and files together, and continue across the web, cli, and phone.",
    creator: "@egecreates",
    images: ["/opengraph-image"],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
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
