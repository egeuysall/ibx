import "server-only";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ownerStoragePrefix, signUploadTicket, verifyUploadTicket, type UploadTicket } from "./file-upload-token";

function storage() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    throw new Error("Cloudflare R2 is not configured.");
  }
  return { bucket: R2_BUCKET_NAME, client: new S3Client({
    region: "auto", endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  }) };
}

export function r2Configured() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
}

export async function createR2Upload(input: Omit<UploadTicket, "r2Key" | "expiresAt">) {
  const { client, bucket } = storage();
  const ticket = { ...input, r2Key: `${ownerStoragePrefix(input.ownerKey)}${randomUUID()}`, expiresAt: Date.now() + 5 * 60_000 };
  const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
    Bucket: bucket, Key: ticket.r2Key, ContentType: ticket.contentType, ContentLength: ticket.size,
  }), { expiresIn: 300, signableHeaders: new Set(["content-type", "content-length"]) });
  return { uploadUrl, method: "PUT" as const, headers: { "Content-Type": ticket.contentType },
    uploadToken: signUploadTicket(ticket, process.env.IBX_CONVEX_SERVER_SECRET ?? "") };
}

export async function confirmR2Upload(token: unknown, ownerKey: string | null) {
  const ticket = verifyUploadTicket(token, ownerKey, process.env.IBX_CONVEX_SERVER_SECRET ?? "");
  const { client, bucket } = storage();
  const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: ticket.r2Key }));
  if (object.ContentLength !== ticket.size || object.ContentType !== ticket.contentType) throw new Error("Uploaded file does not match its signed metadata.");
  return ticket;
}

export async function r2DownloadUrl(key: string) {
  const { client, bucket } = storage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 60 });
}

export async function deleteR2Object(key: string) {
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function copyBytesToR2(key: string, bytes: Uint8Array, contentType: string) {
  const { client, bucket } = storage();
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: contentType }));
  const response = await fetch(await r2DownloadUrl(key), { cache: "no-store", headers: { "Accept-Encoding": "identity" } });
  if (!response.ok || !Buffer.from(await response.arrayBuffer()).equals(Buffer.from(bytes))) throw new Error("R2 migration verification failed; Convex original retained.");
}
