"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";
import { SidebarAccount } from "@/components/layout/sidebar-account";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";

export function FilesShell({ children, username }: { children: ReactNode; username: string | null }) {
  useTheme();
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-12 border-b p-0">
          <div className="flex h-12 items-center justify-between px-3 group-data-[collapsible=icon]:hidden">
            <p className="text-sm">ibx</p><SidebarTrigger size="icon-sm" variant="ghost" />
          </div>
          <div className="hidden h-12 items-center justify-center group-data-[collapsible=icon]:flex">
            <SidebarTrigger size="icon-sm" variant="ghost" />
          </div>
        </SidebarHeader>
        <SidebarContent>
          {[
            { label: "focus", links: [
              ["zen", "/app?view=zen", ">"], ["today", "/app?view=today", "\\"],
              ["upcoming", "/app?view=upcoming", "/"], ["archive", "/app?view=archive", "["],
            ] },
            { label: "workspace", links: [["files", "/files", "~"], ["settings", "/settings", "]"]] },
          ].map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent><SidebarMenu>
                {group.links.map(([label, href, symbol]) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton isActive={href === "/files"} tooltip={label} aria-label={label}
                      render={<Link href={href} prefetch={false} />}
                      className="group-data-[collapsible=icon]:justify-center">
                      <span className="group-data-[collapsible=icon]:hidden">{label}</span>
                      <span aria-hidden className="hidden group-data-[collapsible=icon]:inline">{symbol}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter className="border-t"><SidebarAccount /></SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 flex h-12 shrink-0 items-center justify-between gap-3 border-b bg-background px-4 md:px-6">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" size="icon-sm" variant="ghost" />
            <h1 className="text-sm text-muted-foreground">{"> files"}</h1>
          </div>
          {username && <Link href={`/${encodeURIComponent(username)}`} className="text-xs no-underline">public profile</Link>}
        </header>
        <main className="flex min-w-0 flex-1 flex-col gap-4 px-4 py-4 md:px-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
