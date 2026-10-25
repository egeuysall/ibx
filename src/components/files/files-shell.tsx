"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useTheme } from "@/hooks/useTheme";
import { SidebarAccount } from "@/components/layout/sidebar-account";
import { Input } from "@/components/ui/input";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger,
} from "@/components/ui/sidebar";

type FileTreeNode = { type: "folder" | "file"; id: string; name: string; children?: FileTreeNode[] };

export function FilesShell({ children, username, terminalStorageKey }: { children: ReactNode; username: string | null; terminalStorageKey: string }) {
  useTheme();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalHydrated, setTerminalHydrated] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(terminalStorageKey) ?? "null");
      if (saved && typeof saved.open === "boolean") {
        setTerminalOpen(saved.open);
        setTerminalOutput(Array.isArray(saved.output) ? saved.output.slice(-40) : []);
        setTerminalInput(typeof saved.input === "string" ? saved.input : "");
      }
    } catch { /* Ignore malformed terminal state. */ }
    setTerminalHydrated(true);
  }, [terminalStorageKey]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== "`") return;
      event.preventDefault();
      setTerminalOpen((open) => !open);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  useEffect(() => {
    if (!terminalHydrated) return;
    try {
      const previous = JSON.parse(localStorage.getItem(terminalStorageKey) ?? "{}") as Record<string, unknown>;
      localStorage.setItem(terminalStorageKey, JSON.stringify({ ...previous, open: terminalOpen, input: terminalInput, output: terminalOutput }));
    } catch { /* Storage may be unavailable in private browsing. */ }
  }, [terminalStorageKey, terminalHydrated, terminalOpen, terminalInput, terminalOutput]);
  async function runTerminalCommand() {
    const input = terminalInput.trim();
    if (!input) return;
    setTerminalInput("");
    const [command] = input.toLowerCase().split(/\s+/);
    const addOutput = (line: string) => setTerminalOutput((current) => [...current.slice(-38), `$ ${input}`, line]);
    if (command === "clear") { setTerminalOutput([]); return; }
    if (command === "help") { addOutput("commands: help, pwd, ls, tree, mkdir /path, rename <id|path|name> --to <new name>, clear"); return; }
    if (command === "pwd") { addOutput("/ibx/files"); return; }
    if (command === "mkdir") {
      const path = input.replace(/^\S+\s*/, "").trim();
      if (!path) { addOutput("usage: mkdir /content/YYYY/MM/DD"); return; }
      try {
        const response = await fetch("/api/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not create directory.");
        addOutput(`created ${path.replace(/\/+$/, "")}/`);
      } catch (error) { addOutput(error instanceof Error ? error.message : "Could not create directory."); }
      return;
    }
    if (command === "rename") {
      const separator = input.indexOf(" --to ");
      if (separator < 0) { addOutput("usage: rename <file id|path|name> --to <new name>"); return; }
      const target = input.slice("rename ".length, separator).trim();
      const targetPath = target.replace(/^\/+|\/+$/g, "");
      const fileName = input.slice(separator + " --to ".length).trim();
      if (!target || !fileName) { addOutput("usage: rename <file id|path|name> --to <new name>"); return; }
      try {
        const treeResponse = await fetch("/api/files/tree", { cache: "no-store" });
        const treePayload = await treeResponse.json();
        if (!treeResponse.ok) throw new Error(treePayload.error ?? "Could not load files.");
        const tree = treePayload.tree as FileTreeNode[];
        const matches: Array<{ id: string; type: "folder" | "file"; name: string; path: string }> = [];
        const visit = (nodes: FileTreeNode[], path: string[] = []) => nodes.forEach((node) => {
          if (node.type === "folder") {
            const fullPath = [...path, node.name].join("/");
            if (node.id === target || fullPath === targetPath || node.name === target) matches.push({ id: node.id, type: node.type, name: node.name, path: fullPath });
            visit(node.children ?? [], [...path, node.name]);
          }
          else {
            const fullPath = [...path, node.name].join("/");
            if (node.id === target || fullPath === targetPath || node.name === target) matches.push({ id: node.id, type: node.type, name: node.name, path: fullPath });
          }
        });
        visit(tree);
        if (!matches.length) throw new Error("File not found.");
        if (matches.length > 1) throw new Error("File name is ambiguous; use its directory path or ID.");
        const renameResponse = await fetch(`/api/files/${encodeURIComponent(matches[0].id)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName }),
        });
        const result = await renameResponse.json();
        if (!renameResponse.ok) throw new Error(result.error ?? "Could not rename item.");
        addOutput(`renamed ${matches[0].path} to ${result.fileName}`);
      } catch (error) { addOutput(error instanceof Error ? error.message : "Could not rename file."); }
      return;
    }
    if (command === "ls" || command === "tree") {
      try {
        const response = await fetch("/api/files/tree", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load file tree.");
        const lines = ["drive/"];
        const visit = (nodes: FileTreeNode[], prefix = "") => nodes.forEach((node, index) => {
          const last = index === nodes.length - 1;
          lines.push(`${prefix}${last ? "└── " : "├── "}${node.type === "folder" ? `${node.name}/` : node.name}`);
          if (node.type === "folder") visit(node.children ?? [], `${prefix}${last ? "    " : "│   "}`);
        });
        visit(payload.tree ?? []);
        if (payload.truncated) lines.push("… tree truncated after 5,000 files");
        addOutput(lines.join("\n"));
      } catch (error) { addOutput(error instanceof Error ? error.message : "Could not load file tree."); }
      return;
    }
    addOutput("Unknown command. Type help for file commands.");
  }
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
      {terminalOpen && <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background px-4 py-3 text-foreground md:px-6" role="dialog" aria-label="IBX terminal">
        <div className="mb-2 flex items-center justify-between font-mono text-xs text-muted-foreground"><span>ibx terminal // help, pwd, ls, tree, mkdir</span><button type="button" onClick={() => setTerminalOpen(false)}>close</button></div>
        <div className="h-[34vh] min-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5">{terminalOutput.flatMap((line) => line.split("\n")).map((line, index) => <div key={`${index}:${line}`}>{line}</div>)}
          <div className="flex items-center gap-2"><span>$</span><Input aria-label="Terminal command" value={terminalInput} onChange={(event) => setTerminalInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runTerminalCommand(); } if (event.key === "Escape") setTerminalOpen(false); }} className="h-5 flex-1 border-0 bg-transparent px-0 font-mono text-xs shadow-none focus-visible:ring-0" autoFocus /></div>
        </div>
      </div>}
    </SidebarProvider>
  );
}
