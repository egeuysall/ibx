"use client";

import { useState, type FormEvent } from "react";
import { runPublicFileCommand, type PublicFile, type TerminalLine } from "@/lib/public-files-terminal";

export function PublicFilesTerminal({ username, files }: { username: string; files: PublicFile[] }) {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState(() => runPublicFileCommand("tree", username, files));

  function runCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = input.trim();
    if (!command) return;
    setInput("");
    const result = runPublicFileCommand(command, username, files);
    setLines(result);
    if (/^open\s+/i.test(command) && result.length === 2 && result[1].file) {
      window.open(result[1].file.href, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <section className="overflow-hidden rounded-sm border border-border" aria-label="Public files terminal">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs text-muted-foreground">
        <span>ibx terminal</span><span>public · read-only</span>
      </div>
      <div className="max-h-[min(40vh,18rem)] min-h-32 overflow-y-auto p-3 font-mono text-xs leading-5">
        <div role="log" aria-live="polite" className="whitespace-pre-wrap break-all">
          {lines.map((line, index) => <div key={`${index}:${line.text}`}>
            {line.file ? <a href={line.file.href} target="_blank" rel="noreferrer" className="text-foreground no-underline transition-opacity hover:opacity-70">{line.text}</a> : line.text}
            {line.file && <span className="text-muted-foreground"> · {line.file.contentType.split("/")[1]} · {line.file.size >= 1024 * 1024 ? `${(line.file.size / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(line.file.size / 1024)} KB`}</span>}
          </div>)}
        </div>
      </div>
      <form onSubmit={runCommand} className="flex items-center gap-2 border-t px-3 py-2 font-mono text-xs">
        <span aria-hidden="true">$</span>
        <input aria-label="Public terminal command" value={input} onChange={(event) => setInput(event.target.value)} maxLength={240} placeholder="help, ls, tree, open <file>" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
      </form>
    </section>
  );
}
