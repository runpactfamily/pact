import type { DocumentRepresentation, FileRecord } from "../files/types";
import type { RunRecord } from "../runs/types";
import type { StorageAdapter } from "./types";

/** Keeps everything in process memory. Used by tests. */
export class MemoryStorage implements StorageAdapter {
  readonly kind = "memory";

  async ping() {
    return true;
  }
  private runs = new Map<string, RunRecord>();
  private files = new Map<string, { record: FileRecord; bytes: Uint8Array; document: DocumentRepresentation | null }>();

  async getRun(id: string) {
    const run = this.runs.get(id);
    return run ? structuredClone(run) : null;
  }

  async saveRun(run: RunRecord) {
    this.runs.set(run.id, structuredClone(run));
  }

  async listRuns(userId: string, limit = 50, surface?: "app" | "onchain") {
    return [...this.runs.values()]
      .filter((r) => r.userId === userId && (!surface || (r.surface ?? "app") === surface))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((r) => structuredClone(r));
  }

  async getFile(id: string) {
    return this.files.get(id)?.record ?? null;
  }

  async saveFile(record: FileRecord, bytes: Uint8Array, document: DocumentRepresentation | null) {
    this.files.set(record.id, { record, bytes, document });
  }

  async getDocument(id: string) {
    return this.files.get(id)?.document ?? null;
  }

  async listFiles(userId: string, limit = 100) {
    return [...this.files.values()]
      .map((f) => f.record)
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}
