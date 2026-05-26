export type TodoResourceLink = {
  url: string;
  label: string;
};

const NOTE_URL_REGEX = /\bhttps?:\/\/[^\s<>()]+/gi;
const NOTE_DOMAIN_REGEX =
  /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>()]*)?/gi;

export function normalizeNoteUrl(rawUrl: string) {
  const trimmed = rawUrl.replace(/[),.;!?]+$/g, "");
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    parsed.hostname = parsed.hostname.toLowerCase();
    if (parsed.pathname === "/") {
      parsed.pathname = "";
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function getTodoResourceLinks(notes: string | null): TodoResourceLink[] {
  if (!notes) {
    return [];
  }

  const matches = [
    ...(notes.match(NOTE_URL_REGEX) ?? []),
    ...(notes.match(NOTE_DOMAIN_REGEX) ?? []),
  ];
  if (matches.length === 0) {
    return [];
  }

  const links: TodoResourceLink[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const normalized = normalizeNoteUrl(match);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    let label = normalized;
    try {
      const parsed = new URL(normalized);
      const path =
        parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : "";
      label = `${parsed.hostname}${path}${parsed.hash}`;
    } catch {
      // Keep normalized URL label fallback.
    }

    links.push({ url: normalized, label });
  }

  return links;
}

export function parseTodoLinksInput(value: string) {
  const tokens = value
    .split(/[\s,]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

  const normalizedLinks: string[] = [];
  const seen = new Set<string>();
  let invalidCount = 0;

  for (const token of tokens) {
    const withProtocol = /^https?:\/\//i.test(token)
      ? token
      : /^[^\s]+\.[^\s]+$/.test(token)
        ? `https://${token}`
        : null;
    const normalized = withProtocol ? normalizeNoteUrl(withProtocol) : null;

    if (!normalized) {
      invalidCount += 1;
      continue;
    }

    if (!seen.has(normalized)) {
      seen.add(normalized);
      normalizedLinks.push(normalized);
    }
  }

  return {
    links: normalizedLinks,
    invalidCount,
  };
}

export function getTodoLinksInputValue(notes: string | null) {
  return getTodoResourceLinks(notes)
    .map((link) => link.url)
    .join(", ");
}

export function stripTodoLinksFromNotes(notes: string | null) {
  if (!notes) {
    return null;
  }

  const stripped = notes
    .replace(/\blinks?:\s*/gi, " ")
    .replace(NOTE_URL_REGEX, " ")
    .replace(NOTE_DOMAIN_REGEX, " ")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped || null;
}
