import path from "node:path";
import { LocalBlobStore } from "../blobs/local";
import { SupabaseBlobStore } from "../blobs/supabase";
import type { BlobStore } from "../blobs/types";
import { getConfig } from "../config";
import { isWorkers } from "../runtime";
import { FileStorage } from "./file";
import { MemoryStorage } from "./memory";
import { SupabaseStorage } from "./supabase";
import type { StorageAdapter } from "./types";

// PACT_STORAGE picks the adapter: memory (tests only), file (JSON under
// PACT_DATA_DIR, for a machine without a database), supabase, or auto:
// Supabase whenever SUPABASE_URL and a secret key are set, else file.
// A configured database that cannot be reached is an error on every call,
// never a silent switch to something else.
//
// Raw file bytes: PACT_BLOBS=local keeps them on disk; otherwise they go to
// Supabase Storage whenever Supabase is configured (always on Workers, which
// has no disk).

const g = globalThis as unknown as { __pactStorage?: StorageAdapter };

function blobStore(config = getConfig()): BlobStore {
  const supabase = Boolean(config.keys.supabaseUrl && config.keys.supabaseSecret);
  const wantLocal = process.env.PACT_BLOBS === "local" && !isWorkers();
  if (supabase && !wantLocal) return new SupabaseBlobStore(config.keys.supabaseUrl!, config.keys.supabaseSecret!);
  return new LocalBlobStore(path.resolve(process.cwd(), config.dataDir, "blobs"));
}

export function getStorage(): StorageAdapter {
  if (!g.__pactStorage) {
    const config = getConfig();
    const kind = process.env.NODE_ENV === "test" ? "memory" : config.storage;
    const supabaseConfigured = Boolean(config.keys.supabaseUrl && config.keys.supabaseSecret);
    if (kind === "memory") g.__pactStorage = new MemoryStorage();
    else if (kind === "file") g.__pactStorage = new FileStorage(path.resolve(process.cwd(), config.dataDir));
    else if (kind === "supabase" || (kind === "auto" && supabaseConfigured)) {
      if (!supabaseConfigured) throw new Error("PACT_STORAGE=supabase but SUPABASE_URL / SUPABASE_SECRET_KEY are not set");
      g.__pactStorage = new SupabaseStorage(config.keys.supabaseUrl!, config.keys.supabaseSecret!, blobStore(config));
    } else g.__pactStorage = new FileStorage(path.resolve(process.cwd(), config.dataDir));
  }
  return g.__pactStorage;
}

/** Kept for callers from earlier phases; selection is synchronous now. */
export function storageReady(): Promise<void> {
  getStorage();
  return Promise.resolve();
}

/** Test hook. */
export function setStorage(storage: StorageAdapter | null) {
  g.__pactStorage = storage ?? undefined;
}
