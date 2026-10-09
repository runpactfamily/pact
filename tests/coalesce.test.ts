import assert from "node:assert/strict";
import { test } from "node:test";
import { WriteCoalescer } from "../src/server/runs/coalesce";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("a burst of saves becomes one immediate write and one trailing write", async () => {
  const writes: number[] = [];
  const state = { n: 0 };
  const coalescer = new WriteCoalescer<typeof state>(async (v) => {
    writes.push(v.n);
  }, 50);

  for (let i = 1; i <= 6; i++) {
    state.n = i;
    await coalescer.save(state);
  }
  assert.deepEqual(writes, [1]);
  await sleep(90);
  assert.deepEqual(writes, [1, 6]);
});

test("saves spaced beyond the gap are written immediately", async () => {
  const writes: number[] = [];
  const coalescer = new WriteCoalescer<{ n: number }>(async (v) => {
    writes.push(v.n);
  }, 20);
  await coalescer.save({ n: 1 });
  await sleep(30);
  await coalescer.save({ n: 2 });
  assert.deepEqual(writes, [1, 2]);
});

test("cancel drops the pending trailing write", async () => {
  const writes: number[] = [];
  const coalescer = new WriteCoalescer<{ n: number }>(async (v) => {
    writes.push(v.n);
  }, 40);
  await coalescer.save({ n: 1 });
  await coalescer.save({ n: 2 });
  coalescer.cancel();
  await sleep(70);
  assert.deepEqual(writes, [1]);
});

test("an immediate write failure is reported to the caller", async () => {
  const coalescer = new WriteCoalescer<number>(async () => {
    throw new Error("down");
  }, 10);
  await assert.rejects(() => coalescer.save(1), /down/);
});
