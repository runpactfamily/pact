import { PactError } from "../errors";
import { log } from "../log";
import { getStorage } from "../storage";
import { newId } from "../utils/ids";
import { extract } from "./extract";
import type { DocumentRepresentation, FileRecord } from "./types";
import { validateUpload } from "./validate";

// Upload → validate → detect → extract locally → normalize → document → store.

export async function ingestFile(userId: string, rawName: string, bytes: Uint8Array): Promise<FileRecord> {
  const { name, kind, mime } = validateUpload(rawName, bytes);
  const id = newId("file");
  const started = Date.now();
  const record: FileRecord = { id, userId, name, kind, mime, size: bytes.byteLength, createdAt: started, extracted: false };

  let document: DocumentRepresentation | null = null;
  try {
    const extracted = await extract(kind, bytes);
    document = {
      id,
      name,
      kind,
      mime,
      size: bytes.byteLength,
      createdAt: started,
      text: extracted.text,
      table: extracted.table,
      tables: extracted.tables,
      pages: extracted.pages,
      meta: extracted.meta,
    };
    record.extracted = true;
    if (extracted.meta.textUnavailable) record.extractionError = extracted.meta.textUnavailable;
  } catch (error) {
    record.extractionError = error instanceof Error ? error.message : "The file could not be read.";
    log.warn("file.extract_failed", { fileId: id, kind, code: "UNSUPPORTED_FILE", detail: error instanceof Error ? `${error.name}: ${error.message}${(error as { detail?: unknown }).detail instanceof Error ? ` ← ${((error as { detail?: Error }).detail as Error).message}` : ""}` : String(error) });
  }

  await getStorage().saveFile(record, bytes, document);
  log.info("file.ingested", { fileId: id, kind, size: bytes.byteLength, durationMs: Date.now() - started, status: record.extracted ? "extracted" : "stored" });
  return record;
}

export async function getFileRecord(id: string, userId: string): Promise<FileRecord | null> {
  const record = await getStorage().getFile(id);
  return record && record.userId === userId ? record : null;
}

export async function getDocument(id: string, userId: string): Promise<DocumentRepresentation | null> {
  const record = await getFileRecord(id, userId);
  if (!record) return null;
  const document = await getStorage().getDocument(id);
  if (!document && record.extractionError) throw new PactError("UNSUPPORTED_FILE", `${record.name} could not be read: ${record.extractionError}`);
  return document;
}

export function listFiles(userId: string): Promise<FileRecord[]> {
  return getStorage().listFiles(userId);
}
