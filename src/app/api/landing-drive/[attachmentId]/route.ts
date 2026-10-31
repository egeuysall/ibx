import { api, convex } from "@/lib/convex-server";
import { streamStoredFile } from "@/lib/files-server";
import { createSessionDemoCredentials, LANDING_SESSION_PATTERN } from "@/lib/landing-demo";

export const runtime = "nodejs";

function readSessionId(request: Request) {
  const value = new URL(request.url).searchParams.get("demo");
  return value && LANDING_SESSION_PATTERN.test(value) ? value : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  const sessionId = readSessionId(request);
  const { attachmentId } = await params;
  if (!sessionId || !/^[a-z0-9]{20,64}$/i.test(attachmentId)) {
    return Response.json({ error: "File not found." }, { status: 404 });
  }

  const { ownerKey } = createSessionDemoCredentials(sessionId);
  const file = await convex.query(api.attachments.getAttachmentDetails, {
    ownerKey,
    attachmentId: attachmentId as never,
  });
  if (!file) return Response.json({ error: "File not found." }, { status: 404 });
  return streamStoredFile(file, request, file.visibility === "public");
}
