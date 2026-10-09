import { log } from "../log";

// Progress is saved on every activity line and step change, which can mean
// dozens of writes within a few seconds. The coalescer writes immediately when
// the last write is old enough and otherwise schedules one trailing write, so
// a burst of changes costs one request. The object passed in is mutated in
// place by the caller, so the trailing write always stores the latest state.

export class WriteCoalescer<T> {
  private lastWrite = 0;
  private inFlight: Promise<void> | null = null;
  private dirty: T | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly minGapMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Writes now if allowed, otherwise merges into the pending trailing write. */
  async save(value: T): Promise<void> {
    if (this.closed) return;
    const elapsed = this.now() - this.lastWrite;
    if (!this.inFlight && elapsed >= this.minGapMs) {
      await this.run(value);
      return;
    }
    this.dirty = value;
    this.schedule(this.inFlight ? this.minGapMs : this.minGapMs - elapsed);
  }

  /** Drops any pending trailing write; the caller is about to store the final state itself. */
  cancel(): void {
    this.closed = true;
    this.dirty = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Waits for a write in flight (if any). */
  settle(): Promise<void> {
    return this.inFlight ?? Promise.resolve();
  }

  private schedule(delay: number) {
    if (this.timer || this.closed) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      const value = this.dirty;
      this.dirty = null;
      if (value === null || this.closed) return;
      if (this.inFlight) {
        this.dirty = value;
        this.schedule(this.minGapMs);
        return;
      }
      void this.run(value).catch((error) => log.warn("storage.trailing_write_failed", { error: String(error) }));
    }, Math.max(0, delay));
  }

  private async run(value: T): Promise<void> {
    this.lastWrite = this.now();
    this.inFlight = this.write(value).finally(() => {
      this.inFlight = null;
      this.lastWrite = this.now();
      if (this.dirty !== null) this.schedule(this.minGapMs);
    });
    await this.inFlight;
  }
}
