import { NextRequest, NextResponse } from "next/server";

const INSTALL_SHORTCUT_NAME = "ibx-capture.shortcut";
const UNSIGNED_SHORTCUT_PATH = "/shortcuts/ibx-capture-unsigned.shortcut";
const SIGNED_SHORTCUT_HOST = "www.icloud.com";
const SIGNED_SHORTCUT_PATH_PREFIX = "/shortcuts/";

function getSignedShortcutInstallUrl() {
  const raw = process.env.SIGNED_SHORTCUT_URL?.trim();
  if (!raw) {
    return null;
  }

  try {
    const url = new URL(raw);
    const isValidSignedShortcutUrl =
      url.protocol === "https:" &&
      url.hostname === SIGNED_SHORTCUT_HOST &&
      url.pathname.startsWith(SIGNED_SHORTCUT_PATH_PREFIX);

    return isValidSignedShortcutUrl ? url : null;
  } catch {
    return null;
  }
}

type ShortcutRouteContext = {
  params: Promise<{ shortcut: string }>;
};

export async function GET(request: NextRequest, context: ShortcutRouteContext) {
  const { shortcut } = await context.params;
  if (shortcut !== INSTALL_SHORTCUT_NAME) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const signedUrl = getSignedShortcutInstallUrl();
  if (signedUrl) {
    return NextResponse.redirect(signedUrl);
  }

  const fallbackUnsignedUrl = new URL(UNSIGNED_SHORTCUT_PATH, request.url);
  return NextResponse.redirect(fallbackUnsignedUrl);
}
