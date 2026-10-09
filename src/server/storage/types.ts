import type { DocumentRepresentation, FileRecord } from "../files/types";
import type { RunRecord } from "../runs/types";

// Persistence boundary. The run manager and file store talk to this; the
// adapter decides where bytes and JSON live. Swapping in Postgres/Supabase
// means implementing this interface (see supabase/schema.sql).

export interface StorageAdapter {
  readonly kind: "memory" | "file" | "supabase";
  /** True when the backing store answers. */
  ping(): Promise<boolean>;
  getRun(id: string): Promise<RunRecord | null>;
  saveRun(run: RunRecord): Promise<void>;
  listRuns(userId: string, limit?: number, surface?: "app" | "onchain"): Promise<RunRecord[]>;

  getFile(id: string): Promise<FileRecord | null>;
  saveFile(record: FileRecord, bytes: Uint8Array, document: DocumentRepresentation | null): Promise<void>;
  getDocument(id: string): Promise<DocumentRepresentation | null>;
  listFiles(userId: string, limit?: number): Promise<FileRecord[]>;
}
