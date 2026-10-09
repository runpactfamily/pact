import { handler, json } from "@/server/api";
import { getUserId } from "@/server/auth";
import { getConfig } from "@/server/config";
import { PactError } from "@/server/errors";
import { ingestFile, listFiles } from "@/server/files/store";
import type { Attachment } from "@/lib/pact/types";

export const dynamic = "force-dynamic";

function toAttachment(record: { id: string; name: string; size: number; extractionError?: string }): Attachment {
  const kb = record.size < 1024 * 1024 ? `${Math.max(1, Math.round(record.size / 1024))} KB` : `${(record.size / (1024 * 1024)).toFixed(1)} MB`;
  return { id: record.id, kind: "file", label: record.name, detail: record.extractionError ? `${kb} · could not be read` : kb, fileId: record.id };
}

/** POST /api/files — multipart upload with a single "file" field. */
export const POST = handler(async (request: Request) => {
  const userId = getUserId(request);
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length && length > getConfig().maxUploadBytes + 4096) {
    throw new PactError("FILE_TOO_LARGE", `Files must be ${Math.round(getConfig().maxUploadBytes / (1024 * 1024))} MB or smaller.`);
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new PactError("INVALID_REQUEST", "Send the file as multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new PactError("INVALID_REQUEST", 'Attach the file in a "file" field.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const record = await ingestFile(userId, file.name, bytes);
  return json({ file: record, attachment: toAttachment(record) }, 201);
});

/** GET /api/files — the caller's uploaded files. */
export const GET = handler(async (request: Request) => {
  const files = await listFiles(getUserId(request));
  return json({ files });
});
