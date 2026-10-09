// Raw file bytes live behind this interface. Local disk now; an R2/S3
// implementation later needs no changes above it.

export interface BlobStore {
  readonly kind: string;
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}
