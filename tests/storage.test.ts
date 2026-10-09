import "./setup";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { FileStorage } from "../src/server/storage/file";
import type { RunRecord } from "../src/server/runs/types";

function run(id: string, userId: string): RunRecord {
  return { id, userId, title: "t", job: "j", attachments: [], status: "queued", stage: "understanding", createdAt: Date.now(), steps: [], toolCalls: [], activity: [], sources: [], selection: { mode: "auto" } };
}

test("file storage survives rapid concurrent saves of the same run", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pact-storage-"));
  try {
    const storage = new FileStorage(dir);
    const record = run("run_abc123", "user-a");
    // A run saves on every stage, activity line and step; these overlap in practice.
    await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        record.activity.push({ t: i, message: `line ${i}` });
        return storage.saveRun(record);
      }),
    );
    const stored = await storage.getRun("run_abc123");
    assert.equal(stored?.activity.length, 40);
    const leftovers = (await readdir(path.join(dir, "runs"))).filter((n) => n.endsWith(".tmp"));
    assert.equal(leftovers.length, 0, "no temp files are left behind");

    await storage.saveRun(run("run_def456", "user-b"));
    assert.deepEqual((await storage.listRuns("user-a")).map((r) => r.id), ["run_abc123"]);
    assert.equal(await storage.getRun("run_missing1"), null);
    await assert.rejects(storage.getRun("../escape"), /Invalid id/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("file storage tolerates reads racing with writes (Windows rename semantics)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pact-storage-"));
  try {
    const storage = new FileStorage(dir);
    const record = run("run_race001", "user-a");
    await storage.saveRun(record);
    let reads = 0;
    let stop = false;
    const reader = (async () => {
      while (!stop) {
        const r = await storage.getRun("run_race001");
        if (r) reads++;
      }
    })();
    try {
      for (let i = 0; i < 150; i++) {
        record.activity.push({ t: i, message: `line ${i}` });
        await storage.saveRun(record);
      }
    } finally {
      stop = true;
      await reader;
    }
    assert.ok(reads > 10, `reader kept up (${reads} reads)`);
    assert.equal((await storage.getRun("run_race001"))?.activity.length, 150);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
