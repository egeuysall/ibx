"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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

const FILTER_STORAGE_KEY = "inbox:active-view";
const PROMPT_AUTOFOCUS_STORAGE_KEY = "inbox:prompt-autofocus";
const PICKER_ITEM_CLASS =
  "border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background";

type DefaultView = "today" | "upcoming" | "archive";

function readStoredDefaultView(): DefaultView {
  if (typeof window === "undefined") {
    return "today";
  }

  const stored = window.localStorage.getItem(FILTER_STORAGE_KEY);
  return stored === "upcoming" || stored === "archive" ? stored : "today";
}

function readStoredPromptAutofocus() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.localStorage.getItem(PROMPT_AUTOFOCUS_STORAGE_KEY) !== "0";
}

export function SettingsView() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [isClearing, startClearTransition] = useTransition();
  const [isSigningOut, startSignOutTransition] = useTransition();
  const [defaultView, setDefaultView] = useState<DefaultView>(() => readStoredDefaultView());
  const [promptAutofocus, setPromptAutofocus] = useState(() => readStoredPromptAutofocus());

  const setThemeFromGroup = (values: string[]) => {
    const nextTheme = values[0];
    if (nextTheme === "light" || nextTheme === "dark" || nextTheme === "system") {
      setTheme(nextTheme as ThemePreference);
    }
  };

  const setDefaultViewFromGroup = (values: string[]) => {
    const nextView = values[0];
    if (nextView !== "today" && nextView !== "upcoming" && nextView !== "archive") {
      return;
    }

    setDefaultView(nextView);
    window.localStorage.setItem(FILTER_STORAGE_KEY, nextView);
    toast.message(`startup view set to ${nextView}`);
  };

  const setPromptAutofocusFromGroup = (values: string[]) => {
    const nextValue = values[0];
    if (nextValue !== "on" && nextValue !== "off") {
      return;
    }

    const nextAutofocus = nextValue === "on";
    setPromptAutofocus(nextAutofocus);
    window.localStorage.setItem(PROMPT_AUTOFOCUS_STORAGE_KEY, nextAutofocus ? "1" : "0");
    toast.message(`prompt autofocus ${nextAutofocus ? "enabled" : "disabled"}`);
  };

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
                value={[theme]}
                onValueChange={setThemeFromGroup}
                variant="default"
                size="sm"
                className="mt-3"
              >
                <ToggleGroupItem value="system" className={PICKER_ITEM_CLASS}>
                  system
                </ToggleGroupItem>
                <ToggleGroupItem value="light" className={PICKER_ITEM_CLASS}>
                  light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" className={PICKER_ITEM_CLASS}>
                  dark
                </ToggleGroupItem>
              </ToggleGroup>
            </section>

            <section className="border-b px-4 py-4 md:px-6">
              <p className="text-sm">behavior</p>
              <p className="mt-1 text-xs text-muted-foreground">
                tune startup and input interaction defaults.
              </p>

              <div className="mt-3 flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">startup view</p>
                  <ToggleGroup
                    multiple={false}
                    value={[defaultView]}
                    onValueChange={setDefaultViewFromGroup}
                    variant="default"
                    size="sm"
                  >
                    <ToggleGroupItem value="today" className={PICKER_ITEM_CLASS}>
                      today
                    </ToggleGroupItem>
                    <ToggleGroupItem value="upcoming" className={PICKER_ITEM_CLASS}>
                      upcoming
                    </ToggleGroupItem>
                    <ToggleGroupItem value="archive" className={PICKER_ITEM_CLASS}>
                      archive
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <div className="flex flex-col gap-1">
                  <p className="text-xs text-muted-foreground">prompt autofocus</p>
                  <ToggleGroup
                    multiple={false}
                    value={[promptAutofocus ? "on" : "off"]}
                    onValueChange={setPromptAutofocusFromGroup}
                    variant="default"
                    size="sm"
                  >
                    <ToggleGroupItem value="on" className={PICKER_ITEM_CLASS}>
                      on
                    </ToggleGroupItem>
                    <ToggleGroupItem value="off" className={PICKER_ITEM_CLASS}>
                      off
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </div>
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
