import { migrateFileToR2 } from "../src/lib/files-server";
import { api, convex } from "../src/lib/convex-server";
import type { Doc } from "../convex/_generated/dataModel";

const apply = process.argv.includes("--apply");
const pageSize = 25;
let cursor: string | null = null;
let migrated = 0;
let alreadyInR2 = 0;
let skipped = 0;
let failed = 0;

do {
  const page = await convex.query(api.attachments.listAllForMigration, {
    paginationOpts: { numItems: pageSize, cursor },
  }) as { page: Doc<"attachments">[]; continueCursor: string | null; isDone: boolean };
  for (const file of page.page) {
    if (file.storageProvider === "r2" && file.r2Key) { alreadyInR2 += 1; continue; }
    if (file.status !== "uploaded" || typeof file.deletedAt === "number" || !file.storageId) { skipped += 1; continue; }
    if (!apply) { migrated += 1; continue; }
    try {
      await migrateFileToR2(file);
      migrated += 1;
    } catch {
      failed += 1;
      console.error(`Could not migrate attachment ${file._id}; the Convex original was retained.`);
    }
  }
  cursor = page.continueCursor;
  if (page.isDone) break;
} while (cursor);

console.log(`${apply ? "Migrated" : "Would migrate"} ${migrated} files; ${alreadyInR2} already in R2; ${skipped} deleted/incomplete; ${failed} failed.`);
if (failed) process.exitCode = 1;
