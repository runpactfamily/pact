import { PactError } from "../errors";
import { log } from "../log";
import type { BlobStore } from "./types";

// Raw file bytes in Supabase Storage (a private bucket), through the REST
// API with the server-side secret. Used wherever there is no local disk.

const SAFE_KEY = /^[a-z0-9_./-]{1,200}$/i;

export class SupabaseBlobStore implements BlobStore {
  readonly kind = "supabase";
  private ready: Promise<void> | null = null;

  constructor(
    url: string,
    private readonly secret: string,
    private readonly bucket = "pact-files",
    private readonly fetchImpl: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = `${url.replace(/\/+$/, "")}/storage/v1`;
  }

  private readonly base: string;

  private headers(extra: Record<string, string> = {}) {
    return { apikey: this.secret, authorization: `Bearer ${this.secret}`, ...extra };
  }

  private check(key: string) {
    if (!SAFE_KEY.test(key) || key.includes("..")) throw new PactError("INVALID_REQUEST", "Invalid blob key.");
  }

  /** Creates the private bucket once per process if it does not exist yet. */
  private async init() {
    if (!this.ready) {
      this.ready = (async () => {
        const probe = await this.fetchImpl(`${this.base}/bucket/${this.bucket}`, { headers: this.headers() });
        if (probe.ok) return;
        const create = await this.fetchImpl(`${this.base}/bucket`, {
          method: "POST",
          headers: this.headers({ "content-type": "application/json" }),
          body: JSON.stringify({ id: this.bucket, name: this.bucket, public: false }),
        });
        if (!create.ok && create.status !== 409) {
          log.error("blobs.bucket_failed", { status: String(create.status) });
          throw new PactError("STORAGE_FAILURE", "File storage is not available.");
        }
      })().catch((error) => {
        this.ready = null;
        throw error;
      });
    }
    await this.ready;
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    this.check(key);
    await this.init();
    const response = await this.fetchImpl(`${this.base}/object/${this.bucket}/${key}`, {
      method: "POST",
      headers: this.headers({ "content-type": contentType || "application/octet-stream", "x-upsert": "true" }),
      body: bytes as unknown as BodyInit,
    });
    if (!response.ok) {
      log.error("blobs.put_failed", { status: String(response.status) });
      throw new PactError("STORAGE_FAILURE", "The file could not be saved.");
    }
  }

  async get(key: string) {
    this.check(key);
    await this.init();
    const response = await this.fetchImpl(`${this.base}/object/${this.bucket}/${key}`, { headers: this.headers() });
    if (response.status === 404) return null;
    if (!response.ok) throw new PactError("STORAGE_FAILURE", "The file could not be read.");
    return new Uint8Array(await response.arrayBuffer());
  }

  async delete(key: string) {
    this.check(key);
    await this.init();
    await this.fetchImpl(`${this.base}/object/${this.bucket}`, {
      method: "DELETE",
      headers: this.headers({ "content-type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
    }).catch(() => undefined);
  }
}
