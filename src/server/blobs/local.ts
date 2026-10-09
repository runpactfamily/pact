import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PactError } from "../errors";
import type { BlobStore } from "./types";

const SAFE_KEY = /^[a-z0-9_./-]{1,200}$/i;

/** Blobs as files under <dataDir>/blobs. */
export class LocalBlobStore implements BlobStore {
  readonly kind = "local";
  private ready: Promise<void> | null = null;

  constructor(private readonly root: string) {}

  private async init() {
    if (!this.ready) this.ready = mkdir(this.root, { recursive: true }).then(() => undefined);
    await this.ready;
  }

  private resolve(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes("..")) throw new PactError("INVALID_REQUEST", "Invalid blob key.");
    return path.join(this.root, key);
  }

  async put(key: string, bytes: Uint8Array) {
    await this.init();
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await writeFile(file, bytes);
    } catch (error) {
      throw new PactError("STORAGE_FAILURE", "The file could not be saved.", error);
    }
  }

  async get(key: string) {
    await this.init();
    try {
      return new Uint8Array(await readFile(this.resolve(key)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new PactError("STORAGE_FAILURE", "The file could not be read.", error);
    }
  }

  async delete(key: string) {
    await this.init();
    await unlink(this.resolve(key)).catch(() => undefined);
  }
}
