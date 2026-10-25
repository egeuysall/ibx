import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ATTACHMENT_CONTENT_TYPES, MAX_ATTACHMENT_BYTES } from "./attachment-policy";

export const uploadMetadataSchema = z.object({
  parentKind: z.enum(["todo", "thought", "file"]),
  parentId: z.string().trim().min(1).max(128),
  fileName: z.string().trim().min(1).max(180),
  contentType: z.string().refine((value) => ATTACHMENT_CONTENT_TYPES.includes(value)),
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
});
const ticketSchema = uploadMetadataSchema.extend({
  ownerKey: z.string().nullable(),
  r2Key: z.string().regex(/^uploads\/[a-f0-9]{64}\/[a-f0-9-]{36}$/),
  expiresAt: z.number().int(),
});
export type UploadTicket = z.infer<typeof ticketSchema>;

export function ownerStoragePrefix(ownerKey: string | null) {
  return `uploads/${createHash("sha256").update(ownerKey ?? "legacy").digest("hex")}/`;
}

export function signUploadTicket(ticket: UploadTicket, secret: string) {
  if (secret.length < 32) throw new Error("File uploads are not configured.");
  const body = Buffer.from(JSON.stringify(ticketSchema.parse(ticket))).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function verifyUploadTicket(token: unknown, ownerKey: string | null, secret: string): UploadTicket {
  if (typeof token !== "string" || token.length > 4_000 || secret.length < 32) throw new Error("Invalid upload ticket.");
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra || !/^[A-Za-z0-9_-]{43}$/.test(signature)) throw new Error("Invalid upload ticket.");
  const expected = createHmac("sha256", secret).update(body).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, "base64url"))) throw new Error("Invalid upload ticket.");
  const ticket = ticketSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
  if (ticket.ownerKey !== ownerKey || ticket.expiresAt <= Date.now() || !ticket.r2Key.startsWith(ownerStoragePrefix(ownerKey))) {
    throw new Error("Upload ticket expired or belongs to another account.");
  }
  return ticket;
}
