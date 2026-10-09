import "./setup";
import assert from "node:assert/strict";
import { test } from "node:test";
import { analyseTable } from "../src/server/files/analysis";
import { extract, htmlToStructuredText, PDF_NO_TEXT } from "../src/server/files/extract";
import { buildTable, parseCsv } from "../src/server/files/table";
import { validateUpload } from "../src/server/files/validate";
import { makeDocx, makePdf, makeXlsx, makeZip } from "./fixtures";
import { fresh } from "./helpers";

test("pdf: text is extracted per page with page metadata", async () => {
  fresh();
  const bytes = makePdf("Pact reads documents locally.");
  assert.equal(validateUpload("brief.pdf", bytes).kind, "pdf");
  const out = await extract("pdf", bytes);
  assert.equal(out.meta.pages, 1);
  assert.equal(out.pages?.[0].pageNumber, 1);
  assert.match(out.pages?.[0].text ?? "", /Pact reads documents locally/);
  assert.match(out.text, /^\[Page 1\]/);
  assert.equal(out.meta.textUnavailable, undefined);
  assert.equal(bytes.buffer.byteLength > 0 && bytes.byteLength > 0, true, "the caller's bytes are not detached by the parser");
});

test("pdf: image-only documents report that text is unavailable, malformed ones fail cleanly", async () => {
  fresh();
  const empty = await extract("pdf", makePdf(" "));
  assert.equal(empty.meta.textUnavailable, PDF_NO_TEXT);
  assert.equal(empty.text, PDF_NO_TEXT);
  await assert.rejects(extract("pdf", new TextEncoder().encode("%PDF-1.4\ngarbage")), (e: Error & { code?: string }) => e.code === "UNSUPPORTED_FILE");
});

test("docx: headings, paragraphs and tables become structured text", async () => {
  fresh();
  const bytes = makeDocx();
  assert.equal(validateUpload("review.docx", bytes).kind, "docx");
  const out = await extract("docx", bytes);
  assert.match(out.text, /^# Quarterly Review/m);
  assert.match(out.text, /Revenue grew eleven percent/);
  assert.match(out.text, /Metric \| Value/);
  assert.match(out.text, /Margin \| 43\.7%/);
  assert.deepEqual(out.meta.headings, ["Quarterly Review"]);
  await assert.rejects(extract("docx", makeZip({ "nothing.txt": "x" })), (e: Error & { code?: string }) => e.code === "UNSUPPORTED_FILE");
});

test("html to structured text handles lists and entities", () => {
  const { text, headings } = htmlToStructuredText("<h2>Plan &amp; scope</h2><p>Intro</p><ul><li>One</li><li>Two</li></ul>");
  assert.match(text, /^## Plan & scope/m);
  assert.match(text, /- One\n- Two/);
  assert.deepEqual(headings, ["Plan & scope"]);
});

test("xlsx: every sheet is parsed with its name, columns and statistics", async () => {
  fresh();
  const bytes = await makeXlsx();
  assert.equal(validateUpload("sales.xlsx", bytes).kind, "xlsx");
  const out = await extract("xlsx", bytes);
  assert.deepEqual(out.meta.sheets, ["Q1", "Q2"]);
  assert.equal(out.tables?.length, 2);
  assert.equal(out.tables?.[0].sheet, "Q1");
  assert.deepEqual(out.tables?.[0].columns, ["product", "units", "revenue"]);
  assert.equal(out.tables?.[1].stats.find((s) => s.name === "revenue")?.sum, 6400);
  assert.match(out.text, /## Sheet: Q2/);
});

test("csv: structured rows, not a blob of text; deterministic analysis finds totals, groups and trends", () => {
  const rows = parseCsv("period,region,units,revenue\n2024-Q1,North,10,1200\n2024-Q1,South,30,3900\n2024-Q2,North,12,1500\n2024-Q2,South,25,3300\n");
  const table = buildTable(rows);
  assert.equal(table.rowCount, 4);
  assert.equal(table.stats.find((s) => s.name === "period")?.type, "date");
  assert.equal(table.stats.find((s) => s.name === "region")?.type, "text");
  const a = analyseTable(table);
  assert.equal(a.numeric.find((n) => n.name === "revenue")?.sum, 9900);
  const byRegion = a.groups.find((g) => g.by === "region" && g.metric === "revenue");
  assert.equal(byRegion?.totals[0].group, "South");
  assert.equal(byRegion?.totals[0].sum, 7200);
  const trend = a.trends.find((t) => t.metric === "revenue");
  assert.ok(a.findings.some((f) => /South has the highest revenue/.test(f)));
  assert.equal(trend?.first.value, 5100, "period totals, not the first row");
  assert.equal(trend?.last.value, 4800);
  assert.ok(a.findings.some((f) => /Total revenue by period: 2024-Q1 5,100, 2024-Q2 4,800; from 2024-Q1 to 2024-Q2 that is down 300/.test(f)));
  assert.ok(a.findings.some((f) => /By region, North grew the most in units/.test(f)));
});

test("large tables: analysis uses stored rows and says when it is partial", () => {
  const header = ["id", "amount"];
  const body = Array.from({ length: 6000 }, (_, i) => [String(i), String(i % 100)]);
  const table = buildTable([header, ...body]);
  assert.equal(table.rowCount, 6000);
  assert.equal(table.rowsStored, 5000);
  assert.equal(table.rows.length, 50);
  const a = analyseTable(table);
  assert.equal(a.rowsAnalysed, 5000);
  assert.ok(a.findings[0].startsWith("Only the first 5,000 of 6,000 rows"));
});
