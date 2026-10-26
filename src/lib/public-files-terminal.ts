export type PublicFile = {
  fileName: string;
  folderPath: string[];
  href: string;
  contentType: string;
  size: number;
};

export type TerminalLine = { text: string; file?: PublicFile };

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
      return [{ text: "$ tree" }, { text: "drive/" }, ...renderPublicTree(files)];
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
