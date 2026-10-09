import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PactError } from "../errors";
import type { DocumentRepresentation, FileRecord } from "../files/types";
import type { RunRecord } from "../runs/types";
import type { StorageAdapter } from "./types";

// Development persistence: JSON files under the data directory. Enough to
// survive restarts locally; not meant for more than one server process.
// Writes to the same file are serialised and made atomic (write temp, then
// rename) because a run saves many times in quick succession.

const SAFE_ID = /^[a-z]+_[a-z0-9]+$/;
const READ_RETRIES = 6;
const WRITE_RETRIES = 8;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class FileStorage implements StorageAdapter {
  readonly kind = "file";

  async ping() {
    return true;
  }
  private readonly runsDir: string;
  private readonly filesDir: string;
  private ready: Promise<void> | null = null;
  private readonly queues = new Map<string, Promise<void>>();
  private seq = 0;

  constructor(root: string) {
    this.runsDir = path.join(root, "runs");
    this.filesDir = path.join(root, "files");
  }

  private async init() {
    if (!this.ready) {
      this.ready = Promise.all([mkdir(this.runsDir, { recursive: true }), mkdir(this.filesDir, { recursive: true })]).then(() => undefined);
    }
    await this.ready;
  }

  private check(id: string) {
    if (!SAFE_ID.test(id)) throw new PactError("INVALID_REQUEST", "Invalid id.");
  }

  private async readJson<T>(file: string): Promise<T | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return JSON.parse(await readFile(file, "utf8")) as T;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        // A write may be replacing the file at this instant; try again briefly.
        const transient =
          code === "EPERM" || code === "EBUSY" || code === "EACCES" || error instanceof SyntaxError || (code === "ENOENT" && this.queues.has(file));
        if (transient && attempt < READ_RETRIES) {
          await sleep(15 * (attempt + 1));
          continue;
        }
        if (code === "ENOENT") return null;
        throw new PactError("STORAGE_FAILURE", "Stored data could not be read.", error);
      }
    }
  }

  private writeJson(file: string, value: unknown): Promise<void> {
    const previous = this.queues.get(file) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const json = JSON.stringify(value);
        const tmp = `${file}.${process.pid}.${++this.seq}.tmp`;
        await writeFile(tmp, json, "utf8");
        for (let attempt = 0; ; attempt++) {
          try {
            await rename(tmp, file);
            return;
          } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            // Windows refuses to replace a file another handle is reading; wait and retry.
            if ((code === "EPERM" || code === "EBUSY" || code === "EACCES") && attempt < WRITE_RETRIES) {
              await sleep(10 * (attempt + 1));
              continue;
            }
            // Last resort: write in place. Readers retry on a partially written file.
            await writeFile(file, json, "utf8");
            await unlink(tmp).catch(() => undefined);
            return;
          }
        }
      });
    this.queues.set(file, next);
    return next
      .catch((error) => {
        throw new PactError("STORAGE_FAILURE", "Data could not be saved.", error);
      })
      .finally(() => {
        if (this.queues.get(file) === next) this.queues.delete(file);
      });
  }

  async getRun(id: string) {
    this.check(id);
    await this.init();
    return this.readJson<RunRecord>(path.join(this.runsDir, `${id}.json`));
  }

  async saveRun(run: RunRecord) {
    this.check(run.id);
    await this.init();
    // Snapshot now: the caller keeps mutating the record while the write is queued.
    const snapshot = JSON.parse(JSON.stringify(run)) as RunRecord;
    await this.writeJson(path.join(this.runsDir, `${run.id}.json`), snapshot);
  }

  async listRuns(userId: string, limit = 50, surface?: "app" | "onchain") {
    await this.init();
    const names = (await readdir(this.runsDir)).filter((n) => n.endsWith(".json"));
    const runs: RunRecord[] = [];
    for (const name of names) {
      const run = await this.readJson<RunRecord>(path.join(this.runsDir, name));
      if (run && run.userId === userId && (!surface || (run.surface ?? "app") === surface)) runs.push(run);
    }
    return runs.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  async getFile(id: string) {
    this.check(id);
    await this.init();
    return this.readJson<FileRecord>(path.join(this.filesDir, `${id}.meta.json`));
  }

  async saveFile(record: FileRecord, bytes: Uint8Array, document: DocumentRepresentation | null) {
    this.check(record.id);
    await this.init();
    try {
      await writeFile(path.join(this.filesDir, `${record.id}.bin`), bytes);
    } catch (error) {
      throw new PactError("STORAGE_FAILURE", "The file could not be saved.", error);
    }
    await this.writeJson(path.join(this.filesDir, `${record.id}.meta.json`), record);
    if (document) await this.writeJson(path.join(this.filesDir, `${record.id}.doc.json`), document);
  }

  async getDocument(id: string) {
    this.check(id);
    await this.init();
    return this.readJson<DocumentRepresentation>(path.join(this.filesDir, `${id}.doc.json`));
  }

  async listFiles(userId: string, limit = 100) {
    await this.init();
    const names = (await readdir(this.filesDir)).filter((n) => n.endsWith(".meta.json"));
    const files: FileRecord[] = [];
    for (const name of names) {
      const record = await this.readJson<FileRecord>(path.join(this.filesDir, name));
      if (record && record.userId === userId) files.push(record);
    }
    return files.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
}
