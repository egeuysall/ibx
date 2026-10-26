export type PublicFile = {
  fileName: string;
  folderPath: string[];
  href: string;
  contentType: string;
  size: number;
};

export type TerminalLine = { text: string; file?: PublicFile };
export type PublicTerminalResult = { lines: TerminalLine[]; directory: string[] };

type PublicTreeNode = { type: "folder"; name: string; children: PublicTreeNode[] } | { type: "file"; name: string; file: PublicFile };

function renderPublicTree(files: PublicFile[]): TerminalLine[] {
  const root: PublicTreeNode[] = [];
  for (const file of files) {
    let siblings = root;
    for (const name of file.folderPath) {
      let folder = siblings.find((node): node is Extract<PublicTreeNode, { type: "folder" }> => node.type === "folder" && node.name === name);
      if (!folder) {
        folder = { type: "folder", name, children: [] };
        siblings.push(folder);
      }
      siblings = folder.children;
    }
    siblings.push({ type: "file", name: file.fileName, file });
  }

  const lines: TerminalLine[] = [];
  function visit(nodes: PublicTreeNode[], prefix = "") {
    const sorted = [...nodes].sort((a, b) => a.type === b.type
      ? a.name.localeCompare(b.name)
      : a.type === "folder" ? -1 : 1);
    sorted.forEach((node, index) => {
      const last = index === sorted.length - 1;
      const branch = last ? "└── " : "├── ";
      if (node.type === "folder") {
        lines.push({ text: `${prefix}${branch}${node.name}/` });
        visit(node.children, `${prefix}${last ? "    " : "│   "}`);
      } else {
        lines.push({ text: `${prefix}${branch}${node.name}`, file: node.file });
      }
    });
  }
  visit(root);
  return lines;
}

function resolvePath(directory: string[], value: string) {
  const normalized = value.trim().replace(/\\/g, "/");
  const absolute = normalized.startsWith("/");
  const parts = absolute ? [] : [...directory];
  const segments = normalized.split("/").filter(Boolean);
  if (segments[0]?.toLowerCase() === "drive") {
    parts.length = 0;
    segments.shift();
  }
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts;
}

function filesAtDirectory(files: PublicFile[], directory: string[]) {
  return files
    .filter((file) => directory.every((segment, index) => file.folderPath[index] === segment))
    .map((file) => ({ ...file, folderPath: file.folderPath.slice(directory.length) }));
}

export function runPublicFileCommand(
  command: string,
  username: string,
  files: PublicFile[],
  directory: string[] = [],
): PublicTerminalResult {
  const value = command.trim();
  const normalized = value.toLowerCase();
  const result = (lines: TerminalLine[], nextDirectory = directory): PublicTerminalResult => ({ lines, directory: nextDirectory });
  const currentFiles = filesAtDirectory(files, directory);
  if (normalized === "cd" || normalized.startsWith("cd ")) {
    const target = value.slice(2).trim();
    if (!target) return result([{ text: "$ cd" }, { text: "usage: cd <directory>" }]);
    const nextDirectory = resolvePath(directory, target);
    const exists = nextDirectory.length === 0 || files.some((file) =>
      nextDirectory.every((segment, index) => file.folderPath[index] === segment),
    );
    if (!exists) return result([{ text: `$ cd ${target}` }, { text: "directory not found" }]);
    return result(
      [{ text: `$ cd ${target}` }, { text: `/${username}${nextDirectory.length ? `/${nextDirectory.join("/")}` : ""}` }],
      nextDirectory,
    );
  }
  if (normalized === "open" || normalized.startsWith("open ")) {
    const target = value.slice(4).trim();
    if (!target) return result([{ text: "$ open" }, { text: "usage: open <file name or path>" }]);
    const targetPath = resolvePath(directory, target).join("/");
    const hasPath = /[\\/]/.test(target);
    const matches = files.filter((file) => {
      const path = [...file.folderPath, file.fileName].join("/").toLowerCase();
      return path === targetPath.toLowerCase() || (!hasPath && directory.length === 0 && file.fileName.toLowerCase() === target.toLowerCase());
    });
    if (matches.length === 1) return result([{ text: `$ open ${target}` }, { text: [...matches[0].folderPath, matches[0].fileName].join("/"), file: matches[0] }]);
    if (matches.length > 1) return result([{ text: `$ open ${target}` }, { text: "multiple files match; open one by path:" }, ...matches.map((file) => ({ text: [...file.folderPath, file.fileName].join("/"), file }))]);
    return result([{ text: `$ open ${target}` }, { text: "file not found" }]);
  }
  switch (normalized) {
    case "tree":
      return result([{ text: "$ tree" }, { text: `${directory.length ? `drive/${directory.join("/")}` : "drive"}/` }, ...renderPublicTree(currentFiles)]);
    case "ls":
      return result([{ text: "$ ls" }, ...currentFiles.map((file) => ({
        text: `  ${file.folderPath.length ? `${file.folderPath.join("/")}/` : ""}${file.fileName}`,
        file,
      }))]);
    case "pwd":
      return result([{ text: "$ pwd" }, { text: `/${username}${directory.length ? `/${directory.join("/")}` : ""}` }]);
    case "help":
      return result([{ text: "$ help" }, { text: "commands: help, pwd, cd <directory>, ls, tree, open <file>, clear" }, { text: "read-only public file browser" }]);
    case "clear":
      return result([]);
    default:
      return result([{ text: `$ ${value}` }, { text: "unknown command; type help" }]);
  }
}
