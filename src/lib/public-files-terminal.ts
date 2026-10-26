export type PublicFile = {
  fileName: string;
  folderPath: string[];
  href: string;
  contentType: string;
  size: number;
};

export type TerminalLine = { text: string; file?: PublicFile };

export function runPublicFileCommand(command: string, username: string, files: PublicFile[]): TerminalLine[] {
  switch (command.trim().toLowerCase()) {
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
      return [{ text: "$ help" }, { text: "commands: help, pwd, ls, tree, clear" }, { text: "read-only public file browser" }];
    case "clear":
      return [];
    default:
      return [{ text: `$ ${command.trim()}` }, { text: "unknown command; type help" }];
  }
}
