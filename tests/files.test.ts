import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { extract } from "../src/server/files/extract";
import { ingestFile, getDocument } from "../src/server/files/store";
import { buildTable, describeTable, parseCsv } from "../src/server/files/table";
import { sanitizeFilename, validateUpload } from "../src/server/files/validate";
import { fresh } from "./helpers";

const enc = (s: string) => new TextEncoder().encode(s);

test("filenames are sanitized", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename("C:\\Users\\x\\report<1>.pdf"), "report_1_.pdf");
  assert.equal(sanitizeFilename("...hidden.txt"), "hidden.txt");
  assert.equal(sanitizeFilename(`${"a".repeat(200)}.csv`).length, 120);
});

test("upload validation: type, magic bytes, size", () => {
  fresh({}, { MAX_UPLOAD_BYTES: "2048" });
  assert.throws(() => validateUpload("x.exe", enc("hello")), (e: Error & { code?: string }) => e.code === "UNSUPPORTED_FILE");
  assert.throws(() => validateUpload("x.pdf", enc("not a pdf")), /not a valid PDF/);
  assert.throws(() => validateUpload("x.docx", enc("plain")), /not a valid DOCX/);
  assert.throws(() => validateUpload("big.txt", new Uint8Array(4096)), (e: Error & { code?: string }) => e.code === "FILE_TOO_LARGE");
  assert.throws(() => validateUpload("empty.txt", new Uint8Array(0)), /empty/);
  assert.deepEqual(validateUpload("notes.MD", enc("# hi")), { name: "notes.MD", kind: "md", mime: "text/markdown" });
});

test("csv parsing handles quotes and computes column statistics in code", () => {
  const rows = parseCsv('name,amount,note\n"Acme, Inc",120,"said ""hi"""\nBeta,80,\nGamma,100,ok\n');
  assert.deepEqual(rows[1], ["Acme, Inc", "120", 'said "hi"']);
  const table = buildTable(rows);
  assert.equal(table.rowCount, 3);
  const amount = table.stats.find((s) => s.name === "amount")!;
  assert.equal(amount.type, "number");
  assert.equal(amount.sum, 300);
  assert.equal(amount.mean, 100);
  assert.equal(amount.min, 80);
  assert.equal(amount.max, 120);
  assert.match(describeTable(table), /amount: numeric, 3 values, min 80, max 120, mean 100, sum 300/);
});

test("json arrays of objects become tables; other json becomes text", async () => {
  const arr = await extract("json", enc(JSON.stringify([{ a: 1, b: "x" }, { a: 3, b: "y" }])));
  assert.equal(arr.table?.rowCount, 2);
  assert.equal(arr.table?.stats[0].sum, 4);
  const obj = await extract("json", enc(JSON.stringify({ hello: "world" })));
  assert.equal(obj.table, undefined);
  assert.match(obj.text, /hello/);
  await assert.rejects(extract("json", enc("{nope")), /could not be parsed/);
});

test("ingest stores a document the agent can read", async () => {
  fresh();
  const record = await ingestFile("user-a", "sales.csv", enc("region,units\nNorth,10\nSouth,30\n"));
  assert.equal(record.kind, "csv");
  assert.equal(record.extracted, true);
  const doc = await getDocument(record.id, "user-a");
  assert.equal(doc?.table?.rowCount, 2);
  assert.equal(await getDocument(record.id, "user-b"), null, "files are scoped to their owner");
});
