"use client";

import { Clerk } from "@clerk/clerk-js";
import { ClerkProvider } from "@clerk/nextjs";
import { ui } from "@clerk/ui";
import { dark } from "@clerk/ui/themes";
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
  return () => observer.disconnect();
}

function getTheme() {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeAwareClerkProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light");

  // Bundle clerk-js and its UI instead of hot-loading them from the Clerk CDN. On the deployed site the hot-loaded script finished before
  // hydration, ClerkProvider never started Clerk, and <SignIn /> rendered nothing.
  return (
    <ClerkProvider Clerk={Clerk} ui={ui} appearance={theme === "dark" ? { theme: dark } : undefined}>
      {children}
    </ClerkProvider>
  );
}
