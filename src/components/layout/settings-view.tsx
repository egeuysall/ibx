"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ThemePreference } from "@/hooks/useTheme";
import { useTheme } from "@/hooks/useTheme";
import { apiClient } from "@/lib/apiClient";
import { clearLocalThoughts } from "@/lib/indexedDb";

export function SettingsView() {
  const router = useRouter();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [isClearing, startClearTransition] = useTransition();
  const [isSigningOut, startSignOutTransition] = useTransition();

  const setThemeFromGroup = (values: string[]) => {
    const nextTheme = values[0];
    if (nextTheme === "light" || nextTheme === "dark" || nextTheme === "system") {
      setTheme(nextTheme as ThemePreference);
    }
  };

  const activeTheme = theme === "system" ? (resolvedTheme ?? "system") : theme;

  const handleClearQueue = () => {
    startClearTransition(async () => {
      await clearLocalThoughts();
      toast.message("Local queue cleared");
    });
  };

  const handleSignOut = () => {
    startSignOutTransition(async () => {
      await apiClient.logout();
      await clearLocalThoughts();
      toast.message("Signed out");
      router.replace("/");
      router.refresh();
    });
  };

  return (
    <>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="h-12 border-b p-0">
            <div className="flex h-12 items-center justify-between px-3 group-data-[collapsible=icon]:hidden">
              <p className="text-sm">inbox</p>
              <SidebarTrigger size="icon-sm" variant="ghost" />
            </div>
            <div className="hidden h-12 items-center justify-center group-data-[collapsible=icon]:flex">
              <SidebarTrigger size="icon-sm" variant="ghost" />
            </div>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>views</SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/?view=today" prefetch={false} />}
                    className="group-data-[collapsible=icon]:justify-center"
                  >
                    <span className="group-data-[collapsible=icon]:hidden">today</span>
                    <span className="hidden group-data-[collapsible=icon]:inline">{"\\"}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/?view=upcoming" prefetch={false} />}
                    className="group-data-[collapsible=icon]:justify-center"
                  >
                    <span className="group-data-[collapsible=icon]:hidden">upcoming</span>
                    <span className="hidden group-data-[collapsible=icon]:inline">/</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href="/?view=archive" prefetch={false} />}
                    className="group-data-[collapsible=icon]:justify-center"
                  >
                    <span className="group-data-[collapsible=icon]:hidden">archive</span>
                    <span className="hidden group-data-[collapsible=icon]:inline">[</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive
                    render={<Link href="/settings" prefetch={false} />}
                    className="group-data-[collapsible=icon]:justify-center"
                  >
                    <span className="group-data-[collapsible=icon]:hidden">settings</span>
                    <span className="hidden group-data-[collapsible=icon]:inline">]</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <p className="px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {format(new Date(), "EEE, MMM d").toLowerCase()}
            </p>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>

        <SidebarInset className="min-h-dvh flex flex-col">
          <header className="sticky top-0 z-20 flex h-12 items-center border-b bg-background px-4 md:px-6">
            <p className="text-sm text-muted-foreground">{"> settings"}</p>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto py-4">
            <section className="border-b px-4 pb-4 md:px-6">
              <p className="text-sm">theme</p>
              <p className="mt-1 text-xs text-muted-foreground">
                choose how the interface should appear.
              </p>
              <ToggleGroup
                multiple={false}
                value={[activeTheme]}
                onValueChange={setThemeFromGroup}
                variant="default"
                size="sm"
                className="mt-3"
              >
                <ToggleGroupItem value="system">system</ToggleGroupItem>
                <ToggleGroupItem value="light">light</ToggleGroupItem>
                <ToggleGroupItem value="dark">dark</ToggleGroupItem>
              </ToggleGroup>
            </section>

            <section className="border-b px-4 py-4 md:px-6">
              <p className="text-sm">session</p>
              <p className="mt-1 text-xs text-muted-foreground">
                manage local queue and active access session.
              </p>
              <div className="mt-3 flex max-w-xl flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-auto"
                  disabled={isClearing || isSigningOut}
                  onClick={handleClearQueue}
                >
                  {isClearing ? "clearing..." : "clear local queue"}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="w-auto border border-input bg-white text-black hover:bg-white/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
                  disabled={isSigningOut}
                  onClick={handleSignOut}
                >
                  {isSigningOut ? "signing out..." : "sign out"}
                </Button>
              </div>
            </section>
          </main>
        </SidebarInset>
      </SidebarProvider>

      <Toaster position="bottom-right" />
    </>
  );
}
