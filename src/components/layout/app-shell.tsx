"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";

import { LoginScreen } from "@/components/auth/login-screen";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useTheme } from "@/hooks/useTheme";
import { apiClient, ApiError } from "@/lib/apiClient";
import { cn } from "@/lib/utils";
import type { TodoItem, TodoRecurrence } from "@/lib/types";

type AppShellProps = {
  initialAuthenticated: boolean;
  initialFilter?: TodoFilter;
};

const PROMPT_INPUT_STORAGE_KEY = "inbox:prompt-input";
const FILTER_STORAGE_KEY = "inbox:active-view";
const DAY_MS = 24 * 60 * 60 * 1000;
const NOTE_PREVIEW_LENGTH = 160;

function readStoredPromptInput() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(PROMPT_INPUT_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function readStoredFilter() {
  if (typeof window === "undefined") {
    return "today" as TodoFilter;
  }

  try {
    return normalizeFilter(window.localStorage.getItem(FILTER_STORAGE_KEY));
  } catch {
    return "today" as TodoFilter;
  }
}

function displayDueDate(timestamp: number | null) {
  if (!timestamp) {
    return "no date";
  }

  return format(new Date(timestamp), "MMM d, yyyy");
}

function displayDateInputValue(timestamp: number | null) {
  if (!timestamp) {
    return "mm/dd/yyyy";
  }

  return format(new Date(timestamp), "MM/dd/yyyy");
}

function getStartOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isDueTodayUtc(timestamp: number | null, todayStartUtc: number) {
  if (!timestamp) {
    return false;
  }

  return timestamp >= todayStartUtc && timestamp < todayStartUtc + DAY_MS;
}

function parseErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

function displayRecurrence(recurrence: TodoRecurrence) {
  if (recurrence === "none") {
    return "once";
  }

  return recurrence;
}

function displayPriority(priority: number) {
  return `p${priority}`;
}

function getPreviewNotes(notes: string) {
  if (notes.length <= NOTE_PREVIEW_LENGTH) {
    return notes;
  }

  return `${notes.slice(0, NOTE_PREVIEW_LENGTH)}…`;
}

function sortTodos(todos: TodoItem[]) {
  return [...todos].sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "open" ? -1 : 1;
    }

    if (a.status === "open" && b.status === "open" && a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    const aDueDate = a.dueDate ?? Number.MAX_SAFE_INTEGER;
    const bDueDate = b.dueDate ?? Number.MAX_SAFE_INTEGER;

    if (aDueDate !== bDueDate) {
      return aDueDate - bDueDate;
    }

    return b.createdAt - a.createdAt;
  });
}

type TodoFilter = "today" | "upcoming" | "archive";

function normalizeFilter(value: string | null | undefined): TodoFilter {
  if (value === "upcoming" || value === "archive") {
    return value;
  }

  return "today";
}

export function AppShell({ initialAuthenticated }: AppShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useTheme();

  const [isAuthenticated, setIsAuthenticated] = useState(initialAuthenticated);
  const [filter, setFilter] = useState<TodoFilter>(() => readStoredFilter());
  const [promptInput, setPromptInput] = useState(() => readStoredPromptInput());
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [hasLoadedTodos, setHasLoadedTodos] = useState(false);
  const [isLoadingTodos, setIsLoadingTodos] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingTodoId, setPendingTodoId] = useState<string | null>(null);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Record<string, boolean>>({});
  const promptInputRef = useRef<HTMLInputElement | null>(null);
  const hasPlacedInitialCursor = useRef(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(PROMPT_INPUT_STORAGE_KEY, promptInput);
    } catch {
      // Ignore localStorage failures (private mode, blocked storage)
    }
  }, [promptInput]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, filter);
    } catch {
      // Ignore localStorage failures (private mode, blocked storage)
    }
  }, [filter]);

  const refreshTodos = useCallback(async (showLoading = false) => {
    if (!isAuthenticated) {
      return;
    }

    if (showLoading) {
      setIsLoadingTodos(true);
    }

    try {
      const { todos: nextTodos } = await apiClient.listAllTodos();
      setTodos(sortTodos(nextTodos));
      setHasLoadedTodos(true);
    } catch (error) {
      toast.error(parseErrorMessage(error));
    } finally {
      if (showLoading) {
        setIsLoadingTodos(false);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refreshTodos(true);
  }, [refreshTodos]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshTodos();
    }, 20_000);

    return () => window.clearInterval(timer);
  }, [isAuthenticated, refreshTodos]);

  const placePromptCursorAtEnd = useCallback(() => {
    const input = promptInputRef.current;
    if (!input || hasPlacedInitialCursor.current) {
      return;
    }

    const cursorPosition = input.value.length;
    input.setSelectionRange(cursorPosition, cursorPosition);
    hasPlacedInitialCursor.current = true;
  }, []);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const input = promptInputRef.current;
      if (!input || hasPlacedInitialCursor.current) {
        return;
      }

      input.focus({ preventScroll: true });
      const cursorPosition = input.value.length;
      input.setSelectionRange(cursorPosition, cursorPosition);
      hasPlacedInitialCursor.current = true;
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [placePromptCursorAtEnd]);

  useEffect(() => {
    const viewParam = searchParams.get("view");
    if (!viewParam) {
      setFilter(readStoredFilter());
      return;
    }

    setFilter(normalizeFilter(viewParam));
  }, [searchParams]);

  useEffect(() => {
    if (!searchParams.get("view")) {
      const nextFilter = readStoredFilter();
      setFilter(nextFilter);
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", nextFilter);
      router.replace(`/?${params.toString()}`, { scroll: false });
    }
  }, [router, searchParams]);

  const setActiveFilter = useCallback(
    (nextFilter: TodoFilter) => {
      setFilter(nextFilter);
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", nextFilter);
      router.replace(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const handleAuthenticated = () => {
    setIsAuthenticated(true);
    router.refresh();
    toast.message("access granted");
  };

  const handleGenerateTodos = async () => {
    const cleanInput = promptInput.trim();
    if (!cleanInput) {
      return;
    }

    setIsGenerating(true);
    try {
      const result = await apiClient.generateTodosFromInput(cleanInput);
      setPromptInput("");
      toast.message(`generated ${result.created} todos`);
      await refreshTodos();
    } catch (error) {
      toast.error(parseErrorMessage(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const updateTodoStatus = async (todo: TodoItem, checked: boolean) => {
    const nextStatus = checked ? "done" : "open";
    setPendingTodoId(todo.id);
    setTodos((previousTodos) =>
      sortTodos(
        previousTodos.map((item) =>
          item.id === todo.id
            ? {
                ...item,
                status: nextStatus,
              }
            : item,
        ),
      ),
    );

    try {
      await apiClient.updateTodo(todo.id, { status: nextStatus });
      await refreshTodos();
    } catch (error) {
      toast.error(parseErrorMessage(error));
      setTodos((previousTodos) =>
        sortTodos(
          previousTodos.map((item) =>
            item.id === todo.id
              ? {
                  ...item,
                  status: todo.status,
                }
              : item,
          ),
        ),
      );
    } finally {
      setPendingTodoId(null);
    }
  };

  const updateTodoDate = async (todo: TodoItem, nextDate: string) => {
    setPendingTodoId(todo.id);
    try {
      await apiClient.updateTodo(todo.id, {
        dueDate: nextDate.trim() ? nextDate : null,
      });
      await refreshTodos();
    } catch (error) {
      toast.error(parseErrorMessage(error));
    } finally {
      setPendingTodoId(null);
    }
  };

  const updateTodoRecurrence = async (todo: TodoItem, values: string[]) => {
    const nextRecurrence = values[0];
    if (
      nextRecurrence !== "none" &&
      nextRecurrence !== "daily" &&
      nextRecurrence !== "weekly" &&
      nextRecurrence !== "monthly"
    ) {
      return;
    }

    setPendingTodoId(todo.id);
    try {
      await apiClient.updateTodo(todo.id, {
        recurrence: nextRecurrence as TodoRecurrence,
      });
      await refreshTodos();
    } catch (error) {
      toast.error(parseErrorMessage(error));
    } finally {
      setPendingTodoId(null);
    }
  };

  const groupedTodos = useMemo(() => {
    const todayStartUtc = getStartOfUtcDay(Date.now());
    const openTodos = todos.filter((todo) => todo.status === "open");

    return {
      today: openTodos.filter((todo) => isDueTodayUtc(todo.dueDate, todayStartUtc)),
      upcoming: openTodos.filter((todo) => !isDueTodayUtc(todo.dueDate, todayStartUtc)),
      archive: todos.filter((todo) => todo.status === "done"),
    };
  }, [todos]);

  const filteredTodos = useMemo(() => {
    if (filter === "today") {
      return groupedTodos.today;
    }

    if (filter === "upcoming") {
      return groupedTodos.upcoming;
    }

    return groupedTodos.archive;
  }, [filter, groupedTodos]);

  const todayProgressLabel = useMemo(() => {
    const todayStartUtc = getStartOfUtcDay(Date.now());
    const openToday = todos.filter(
      (todo) => todo.status === "open" && isDueTodayUtc(todo.dueDate, todayStartUtc),
    ).length;
    const doneToday = todos.filter(
      (todo) => todo.status === "done" && isDueTodayUtc(todo.dueDate, todayStartUtc),
    ).length;
    const total = openToday + doneToday;

    return total > 0 ? `today ${doneToday}/${total}` : "today 0/0";
  }, [todos]);

  if (!isAuthenticated) {
    return (
      <>
        <LoginScreen onAuthenticated={handleAuthenticated} />
        <Toaster position="bottom-right" />
      </>
    );
  }

  return (
    <>
      <SidebarProvider>
        <Sidebar collapsible="icon">
          <SidebarHeader className="h-12 border-b p-0">
            <div className="flex h-12 items-center justify-between px-3 group-data-[collapsible=icon]:hidden">
              <p className="text-sm">Inbox</p>
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
                    isActive={filter === "today"}
                    onClick={() => setActiveFilter("today")}
                    className="group-data-[collapsible=icon]:justify-center"
                  >
                    <span className="group-data-[collapsible=icon]:hidden">today</span>
                    <span className="hidden group-data-[collapsible=icon]:inline">{"\\"}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={filter === "upcoming"}
                    onClick={() => setActiveFilter("upcoming")}
                    className="group-data-[collapsible=icon]:justify-center"
                  >
                    <span className="group-data-[collapsible=icon]:hidden">upcoming</span>
                    <span className="hidden group-data-[collapsible=icon]:inline">/</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={filter === "archive"}
                    onClick={() => setActiveFilter("archive")}
                    className="group-data-[collapsible=icon]:justify-center"
                  >
                    <span className="group-data-[collapsible=icon]:hidden">archive</span>
                    <span className="hidden group-data-[collapsible=icon]:inline">[</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
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
            <div className="flex w-full items-center gap-2">
              <span className="text-muted-foreground">{">"}</span>
              <Input
                ref={promptInputRef}
                value={promptInput}
                onChange={(event) => setPromptInput(event.target.value)}
                placeholder="type once, generate todos"
                autoFocus
                onFocus={() => placePromptCursorAtEnd()}
                className="h-8 border-0 bg-transparent px-0 shadow-none ring-0 focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleGenerateTodos();
                  }
                }}
                disabled={isGenerating}
              />
              <Button size="sm" onClick={() => void handleGenerateTodos()} disabled={isGenerating}>
                {isGenerating ? "running..." : "run"}
              </Button>
              <span className="text-xs text-muted-foreground">{todayProgressLabel}</span>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto py-4">
            {!hasLoadedTodos && isLoadingTodos ? (
              <p className="px-4 text-xs text-muted-foreground md:px-6">loading todos…</p>
            ) : filteredTodos.length === 0 ? (
              <p className="px-4 text-sm text-muted-foreground md:px-6">No todos in this view yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {filteredTodos.map((todo) => (
                  <article
                    key={todo.id}
                    className="border-b cursor-pointer"
                    onClick={() => setEditingTodoId(todo.id)}
                  >
                    <div className="flex flex-col gap-2 px-4 pb-4 md:px-6">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={todo.status === "done"}
                          onCheckedChange={(checked) => void updateTodoStatus(todo, Boolean(checked))}
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                          aria-label={`Toggle ${todo.title}`}
                          disabled={pendingTodoId === todo.id}
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={cn(
                                "text-sm",
                                todo.status === "done" && "line-through opacity-70",
                              )}
                            >
                              {todo.title}
                            </p>
                          </div>
                          {todo.notes ? (
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <p className="max-w-full break-words">
                                {expandedNoteIds[todo.id] ? todo.notes : getPreviewNotes(todo.notes)}
                              </p>
                              {todo.notes.length > NOTE_PREVIEW_LENGTH ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 px-1 text-[11px] text-muted-foreground hover:text-foreground"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setExpandedNoteIds((current) => ({
                                      ...current,
                                      [todo.id]: !current[todo.id],
                                    }));
                                  }}
                                  onPointerDown={(event) => event.stopPropagation()}
                                >
                                  {expandedNoteIds[todo.id] ? "less" : "more"}
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                          <p className="text-xs text-muted-foreground">
                            {displayPriority(todo.priority)} / due: {displayDueDate(todo.dueDate)} /{" "}
                            {displayRecurrence(todo.recurrence)}
                          </p>
                        </div>
                      </div>
                      {editingTodoId === todo.id ? (
                        <div
                          className="ml-8 flex flex-col gap-2 sm:flex-row sm:items-center"
                          onClick={(event) => event.stopPropagation()}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <Popover>
                            <PopoverTrigger
                              render={
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className={cn(
                                    "w-full justify-start sm:w-44",
                                    !todo.dueDate && "text-muted-foreground",
                                  )}
                                  disabled={pendingTodoId === todo.id}
                                />
                              }
                            >
                              {displayDateInputValue(todo.dueDate)}
                            </PopoverTrigger>
                            <PopoverContent className="w-auto gap-0 rounded-md bg-background p-1 shadow-none">
                              <Calendar
                                className="rounded-sm border border-border"
                                mode="single"
                                selected={todo.dueDate ? new Date(todo.dueDate) : undefined}
                                onSelect={(date) =>
                                  void updateTodoDate(todo, date ? format(date, "yyyy-MM-dd") : "")
                                }
                              />
                            </PopoverContent>
                          </Popover>
                          <ToggleGroup
                            multiple={false}
                            value={[todo.recurrence]}
                            onValueChange={(values) => void updateTodoRecurrence(todo, values)}
                            variant="default"
                            size="sm"
                          >
                            <ToggleGroupItem
                              value="none"
                              className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                            >
                              once
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="daily"
                              className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                            >
                              daily
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="weekly"
                              className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                            >
                              weekly
                            </ToggleGroupItem>
                            <ToggleGroupItem
                              value="monthly"
                              className="border border-input aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background data-[state=on]:border-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
                            >
                              monthly
                            </ToggleGroupItem>
                          </ToggleGroup>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>

      <Toaster position="bottom-right" />
    </>
  );
}
