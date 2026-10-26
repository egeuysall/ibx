export type PublicFile = {
  fileName: string;
  folderPath: string[];
  href: string;
  contentType: string;
  size: number;
};

export type TerminalLine = { text: string; file?: PublicFile };

export function runPublicFileCommand(command: string, username: string, files: PublicFile[]): TerminalLine[] {
  const value = command.trim();
  const normalized = value.toLowerCase();
  if (normalized === "open" || normalized.startsWith("open ")) {
    const target = value.slice(4).trim().replace(/^\/+/, "").replace(/^drive\//i, "");
    if (!target) return [{ text: "$ open" }, { text: "usage: open <file name or path>" }];
    const matches = files.filter((file) => {
      const path = [...file.folderPath, file.fileName].join("/");
      return path.toLowerCase() === target.toLowerCase() || (!target.includes("/") && file.fileName.toLowerCase() === target.toLowerCase());
    });
    if (matches.length === 1) return [{ text: `$ open ${target}` }, { text: [...matches[0].folderPath, matches[0].fileName].join("/"), file: matches[0] }];
    if (matches.length > 1) return [{ text: `$ open ${target}` }, { text: "multiple files match; open one by path:" }, ...matches.map((file) => ({ text: [...file.folderPath, file.fileName].join("/"), file }))];
    return [{ text: `$ open ${target}` }, { text: "file not found" }];
  }
  switch (normalized) {
    case "tree":
      return [{ text: "$ tree" }, { text: "drive/" }, ...files.map((file) => ({
        text: `├── ${file.folderPath.length ? `${file.folderPath.join("/")}/` : ""}${file.fileName}`,
        file,
      }))];
    case "ls":
      return [{ text: "$ ls" }, ...files.map((file) => ({
        text: `  ${file.folderPath.length ? `${file.folderPath.join("/")}/` : ""}${file.fileName}`,
        file,
      }))];
    case "pwd":
      return [{ text: "$ pwd" }, { text: `/${username}` }];
    case "help":
      return [{ text: "$ help" }, { text: "commands: help, pwd, ls, tree, open <file>, clear" }, { text: "read-only public file browser" }];
    case "clear":
      return [];
    default:
      return [{ text: `$ ${value}` }, { text: "unknown command; type help" }];
  }
}
