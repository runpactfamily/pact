// Minimal declarations for the Workers runtime pieces this app touches.
// (The full generated types from `wrangler types` clash with the DOM lib the
// Next.js app is checked against, so they are kept out of tsconfig.)

declare module "*.open-next/worker.js" {
  const handler: { fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> };
  export default handler;
}

declare module "cloudflare:workers" {
  interface DurableObjectStorage {
    get<T = unknown>(key: string): Promise<T | undefined>;
    put<T>(key: string, value: T): Promise<void>;
    deleteAll(): Promise<void>;
    setAlarm(scheduledTime: number | Date): Promise<void>;
  }
  interface DurableObjectState {
    storage: DurableObjectStorage;
    waitUntil(promise: Promise<unknown>): void;
  }
  export class DurableObject<Env = unknown> {
    constructor(ctx: DurableObjectState, env: Env);
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
  }
}
