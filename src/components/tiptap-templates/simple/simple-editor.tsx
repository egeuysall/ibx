"use client"

import { useEffect, useRef, useState } from "react"
import type { JSONContent } from "@tiptap/core"
import { EditorContent, EditorContext, useEditor, type Editor } from "@tiptap/react"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableRow } from "@tiptap/extension-table-row"
import { Mathematics } from "@tiptap/extension-mathematics"
import { Placeholder, Selection } from "@tiptap/extensions"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useWindowSize } from "@/hooks/use-window-size"
import { useCursorVisibility } from "@/hooks/use-cursor-visibility"

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils"
import { markdownMathToTiptapBlocks } from "@/lib/tiptap-markdown"
import { parseFileMention, toPublicLibraryFiles } from "@/lib/file-mention"

// --- Styles ---
import "@/components/tiptap-templates/simple/simple-editor.scss"

import demoContent from "@/components/tiptap-templates/simple/data/content.json"

type SimpleEditorChange = {
  text: string
  json: JSONContent
  html: string
}

type SimpleEditorProps = {
  value?: string | JSONContent
  placeholder?: string
  embedded?: boolean
  autoFocus?: boolean
  fileMentions?: boolean
  onChange?: (value: SimpleEditorChange) => void
  imageUpload?: (
    file: File,
    onProgress?: (event: { progress: number }) => void,
    abortSignal?: AbortSignal
  ) => Promise<string>
}

type SlashRange = {
  from: number
  to: number
}

type FileMentionRange = SlashRange & { query: string; left: number; top: number }
type PublicLibraryFile = { fileName: string; contentType: string; publicUrl: string; folderPath: string[] }

type SlashCommand = {
  id: string
  label: string
  hint: string
  run: (editor: Editor, range: SlashRange) => void
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "text",
    label: "Text",
    hint: "Plain paragraph",
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    id: "h1",
    label: "Heading 1",
    hint: "Large section title",
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 1 })
        .run(),
  },
  {
    id: "h2",
    label: "Heading 2",
    hint: "Medium section title",
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleHeading({ level: 2 })
        .run(),
  },
  {
    id: "bullet",
    label: "Bulleted list",
    hint: "Simple list",
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "numbered",
    label: "Numbered list",
    hint: "Ordered steps",
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "todo",
    label: "Todo list",
    hint: "Checklist",
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "Quote",
    hint: "Callout-style quote",
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "Code block",
    hint: "Snippet or command",
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "table",
    label: "Table",
    hint: "3 x 3 table",
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
]

const MARKDOWN_SEPARATOR_ROW = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/

function expandMarkdownTableLines(line: string) {
  const rowParts = line.split(/\|\s+\|/)
  if (rowParts.length >= 2) {
    return rowParts
      .map((part, index) => {
        const prefix = index === 0 ? "" : "|"
        const suffix = index === rowParts.length - 1 ? "" : "|"
        return `${prefix}${part}${suffix}`.trim()
      })
      .filter((row) => row.includes("|"))
  }

  return [line.trim()]
}

function parseMarkdownTableLines(lines: string[]): JSONContent | null {
  const normalizedLines = lines
    .flatMap(expandMarkdownTableLines)
    .map((line) => line.trim())
    .filter(Boolean)
  const headerIndex = normalizedLines.findIndex(
    (line, index) =>
      index < normalizedLines.length - 1 &&
      line.includes("|") &&
      MARKDOWN_SEPARATOR_ROW.test(normalizedLines[index + 1] ?? "")
  )

  if (headerIndex < 0) {
    return null
  }

  const tableLines = normalizedLines
    .slice(headerIndex)
    .filter((line) => line.includes("|"))
  const rows = tableLines
    .filter((_, index) => index !== 1)
    .map((line) =>
      line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim())
    )
  const columnCount = Math.max(...rows.map((row) => row.length))
  if (rows.length < 2 || columnCount < 2) {
    return null
  }

  return {
    type: "table",
    content: rows.map((row, rowIndex) => ({
      type: "tableRow",
      content: Array.from({ length: columnCount }, (_, index) => ({
        type: rowIndex === 0 ? "tableHeader" : "tableCell",
        content: [
          {
            type: "paragraph",
            content: row[index]
              ? [{ type: "text", text: row[index] }]
              : undefined,
          },
        ],
      })),
    })),
  }
}

function textBlock(line: string): JSONContent {
  return {
    type: "paragraph",
    content: line.trim() ? [{ type: "text", text: line.trim() }] : undefined,
  }
}

function parseMarkdownBlocks(text: string): JSONContent[] | null {
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return null
  }

  const blocks: JSONContent[] = []
  let parsedTable = false
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {
      continue
    }

    if (line.includes("|")) {
      const tableCandidate = [line]
      let nextIndex = index + 1
      while (nextIndex < lines.length && lines[nextIndex]?.includes("|")) {
        tableCandidate.push(lines[nextIndex] ?? "")
        nextIndex += 1
      }

      const table = parseMarkdownTableLines(tableCandidate)
      if (table) {
        blocks.push(table)
        parsedTable = true
        index = nextIndex - 1
        continue
      }
    }

    blocks.push(textBlock(line))
  }

  if (!parsedTable) {
    return null
  }

  return blocks
}

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  onHighlighterClick: () => void
  onLinkClick: () => void
  isMobile: boolean
}) => {
  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu
          modal={false}
          types={["bulletList", "orderedList", "taskList"]}
        />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" />
      </ToolbarGroup>

      <Spacer />

      {isMobile && <ToolbarSeparator />}

    </>
  )
}

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === "highlighter" ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
)

export function SimpleEditor({
  value,
  placeholder = "Write...",
  embedded = false,
  autoFocus = false,
  fileMentions = false,
  onChange,
  imageUpload = handleImageUpload,
}: SimpleEditorProps) {
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">(
    "main"
  )
  const [slashRange, setSlashRange] = useState<SlashRange | null>(null)
  const [fileMention, setFileMention] = useState<FileMentionRange | null>(null)
  const [publicFiles, setPublicFiles] = useState<PublicLibraryFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState(false)
  const [filesTruncated, setFilesTruncated] = useState(false)
  const filesLoadedRef = useRef(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)

  const updateSlashMenu = (nextEditor: Editor) => {
    const { selection } = nextEditor.state
    if (!selection.empty) {
      setSlashRange(null)
      return
    }

    const parentOffset = selection.$from.parentOffset
    const textBeforeCursor = selection.$from.parent.textBetween(0, parentOffset)
    if (textBeforeCursor.endsWith("/")) {
      setSlashRange({ from: selection.from - 1, to: selection.from })
      return
    }

    setSlashRange(null)
  }

  const updateFileMention = (nextEditor: Editor) => {
    if (!fileMentions) {
      setFileMention(null)
      return
    }
    const { selection } = nextEditor.state
    if (!selection.empty) {
      setFileMention(null)
      return
    }
    const parentOffset = selection.$from.parentOffset
    const textBeforeCursor = selection.$from.parent.textBetween(0, parentOffset)
    const mention = parseFileMention(textBeforeCursor)
    if (!mention) {
      setFileMention(null)
      return
    }
    const caret = nextEditor.view.coordsAtPos(selection.from)
    setFileMention({
      from: selection.from - parentOffset + mention.markerOffset,
      to: selection.from,
      query: mention.query,
      left: caret.left,
      top: caret.bottom,
    })
  }

  useEffect(() => {
    if (!fileMention || filesLoadedRef.current) return
    filesLoadedRef.current = true
    setFilesLoading(true)
    void (async () => {
      let cursor: string | null = null
      let isDone = false
      let pageCount = 0
      const files: PublicLibraryFile[] = []
      // shortcut: search scans at most 5,000 files; switch to server-side search if libraries exceed that.
      while (!isDone && pageCount < 100) {
        const params = new URLSearchParams()
        if (cursor) params.set("cursor", cursor)
        const response = await fetch(`/api/files${params.size ? `?${params}` : ""}`, { cache: "no-store" })
        if (!response.ok) throw new Error("Could not load public files.")
        const result = await response.json() as {
          files: Array<{ fileName: string; contentType: string; visibility: string; publicUrl: string | null; folderId?: string }>;
          folders: Array<{ id: string; path: string[] }>;
          cursor: string | null;
          isDone: boolean;
        }
        files.push(...toPublicLibraryFiles(result.files, result.folders, window.location.origin))
        cursor = result.cursor
        isDone = result.isDone
        pageCount += 1
      }
      setPublicFiles(files)
      setFilesTruncated(!isDone)
    })().catch(() => setFilesError(true)).finally(() => setFilesLoading(false))
  }, [fileMentions, fileMention])

  const insertPublicFile = (file: PublicLibraryFile) => {
    if (!editor || !fileMention) return
    const range = { from: fileMention.from, to: fileMention.to }
    const chain = editor.chain().focus().deleteRange(range)
    if (file.contentType.startsWith("image/")) {
      chain.setImage({ src: file.publicUrl, alt: file.fileName, title: file.fileName }).run()
    } else {
      chain.insertContent([
        { type: "text", text: file.fileName, marks: [{ type: "link", attrs: { href: file.publicUrl } }] },
        { type: "text", text: " " },
      ]).run()
    }
    setFileMention(null)
  }

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": placeholder,
        class: "simple-editor",
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain")
        if (!text) {
          return false
        }

        const blocks = markdownMathToTiptapBlocks(text) ?? parseMarkdownBlocks(text)
        if (!blocks) {
          return false
        }

        event.preventDefault()
        const editor = editorRef.current
        if (!editor) {
          return false
        }

        editor.chain().focus().insertContent(blocks).run()
        return true
      },
    },
    extensions: [
      StarterKit.configure({
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({
        placeholder,
      }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Selection,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Mathematics.configure({
        katexOptions: { output: "mathml", throwOnError: false },
      }),
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: imageUpload,
        onError: (error) => console.error("Upload failed:", error),
      }),
    ],
    content: value ?? (embedded ? "" : demoContent),
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      updateSlashMenu(editor)
      updateFileMention(editor)
      onChange?.({
        text: editor.getText(),
        json: editor.getJSON(),
        html: editor.getHTML(),
      })
    },
    onSelectionUpdate: ({ editor }) => updateFileMention(editor),
  })

  useEffect(() => {
    if (fileMention && editor && !editor.isFocused) editor.commands.focus()
  }, [editor, fileMention])

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  const runSlashCommand = (command: SlashCommand) => {
    if (!editor || !slashRange) {
      return
    }

    command.run(editor, slashRange)
    setSlashRange(null)
  }

  const rect = useCursorVisibility({
    editor,
    overlayHeight: 44,
  })

  const matchingPublicFiles = publicFiles.filter((file) =>
    `${file.fileName} ${file.folderPath.join("/")}`.toLowerCase().includes(fileMention?.query.toLowerCase() ?? ""),
  ).slice(0, 50)

  useEffect(() => {
    if (!editor || value === undefined || editor.isFocused) {
      return
    }

    const currentJSON = JSON.stringify(editor.getJSON())
    const nextJSON = typeof value === "string" ? null : JSON.stringify(value)
    const currentText = editor.getText()

    if (
      (typeof value === "string" && value !== currentText) ||
      (nextJSON && nextJSON !== currentJSON)
    ) {
      editor.commands.setContent(value)
    }
  }, [editor, value])

  return (
    <div className="simple-editor-wrapper" data-embedded={embedded}>
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={toolbarRef}
          data-plain={embedded}
          style={{
            ...(isMobile
              ? {
                  bottom: `calc(100% - ${height - rect.y}px)`,
                }
              : {}),
          }}
        >
          {mobileView === "main" ? (
            <MainToolbarContent
              onHighlighterClick={() => setMobileView("highlighter")}
              onLinkClick={() => setMobileView("link")}
              isMobile={isMobile}
            />
          ) : (
            <MobileToolbarContent
              type={mobileView === "highlighter" ? "highlighter" : "link"}
              onBack={() => setMobileView("main")}
            />
          )}
        </Toolbar>

        {editor && slashRange ? (
          <div className="simple-editor-slash-menu">
            {SLASH_COMMANDS.map((command) => (
              <button
                key={command.id}
                type="button"
                className="simple-editor-slash-item"
                onMouseDown={(event) => {
                  event.preventDefault()
                  runSlashCommand(command)
                }}
              >
                <span>{command.label}</span>
                <small>{command.hint}</small>
              </button>
            ))}
          </div>
        ) : null}

        {fileMentions && editor && fileMention ? (
          <DropdownMenu open modal={false} onOpenChange={(open) => { if (!open) setFileMention(null) }}>
            <DropdownMenuTrigger render={<button type="button" tabIndex={-1} aria-hidden="true" className="pointer-events-none fixed h-px w-px opacity-0" style={{ left: fileMention.left, top: fileMention.top }} />} />
            <DropdownMenuContent align="start" side="bottom" sideOffset={4} className="w-80 max-h-64" finalFocus={() => editor.view.dom}>
              <DropdownMenuLabel>public files</DropdownMenuLabel>
              <DropdownMenuGroup>
                {filesLoading ? <DropdownMenuItem disabled>loading files…</DropdownMenuItem>
                  : filesError ? <DropdownMenuItem disabled>could not load public files</DropdownMenuItem>
                    : matchingPublicFiles.length ? matchingPublicFiles.map((file) => (
                      <DropdownMenuItem key={file.publicUrl} onMouseDown={(event) => event.preventDefault()} onClick={() => insertPublicFile(file)}>
                        <span className="min-w-0 flex-1 truncate">{file.fileName}</span>
                        <span className="max-w-32 truncate text-muted-foreground">{file.folderPath.join("/") || "drive"}</span>
                      </DropdownMenuItem>
                    )) : <DropdownMenuItem disabled>no matching public files</DropdownMenuItem>}
                {filesTruncated && <DropdownMenuItem disabled>showing first 5,000 files</DropdownMenuItem>}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
      </EditorContext.Provider>
    </div>
  )
}
