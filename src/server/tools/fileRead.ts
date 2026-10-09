import { getDocument } from "../files/store";
import { describeTable } from "../files/table";
import { PactError } from "../errors";
import type { Evidence, Tool } from "./types";

interface Input {
  fileId: string;
}

interface Output {
  fileId: string;
  name: string;
  kind: string;
  chars: number;
  pages?: number;
  sheets?: number;
  textUnavailable?: boolean;
}

export const fileReadTool: Tool<Input, Output> = {
  name: "file_read",
  description: "Read an uploaded file that was attached to the job: text (page by page for PDFs), headings, and tables.",
  stage: "analyzing",
  inputSchema: { type: "object", properties: { fileId: { type: "string", description: "Id returned by POST /api/files" } }, required: ["fileId"] },
  outputSchema: { type: "object", properties: { fileId: { type: "string" }, name: { type: "string" }, kind: { type: "string" }, chars: { type: "number" }, pages: { type: "number" }, sheets: { type: "number" } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const doc = await getDocument(input.fileId, context.userId);
    if (!doc) throw new PactError("NOT_FOUND", "That file is no longer available.");
    const evidence: Evidence[] = [];
    if (doc.meta.textUnavailable) {
      evidence.push({ kind: "file", label: doc.name, text: doc.meta.textUnavailable });
    } else {
      evidence.push({ kind: "file", label: doc.name, text: doc.text });
    }
    for (const table of doc.tables ?? (doc.table ? [doc.table] : [])) {
      evidence.push({ kind: "table", label: `${doc.name}${table.sheet ? ` · ${table.sheet}` : ""} (table)`, text: describeTable(table) });
    }
    const tables = doc.tables?.length ?? (doc.table ? 1 : 0);
    const what = doc.meta.textUnavailable
      ? "no extractable text"
      : doc.meta.pages
        ? `${doc.meta.pages} ${doc.meta.pages === 1 ? "page" : "pages"}`
        : tables
          ? `${tables} ${tables === 1 ? "table" : "sheets"}, ${(doc.table?.rowCount ?? 0).toLocaleString("en-US")} rows in the first`
          : `${doc.text.length.toLocaleString("en-US")} characters`;
    return {
      data: { fileId: doc.id, name: doc.name, kind: doc.kind, chars: doc.text.length, pages: doc.meta.pages, sheets: doc.meta.sheets?.length, textUnavailable: Boolean(doc.meta.textUnavailable) },
      summary: `Read ${doc.name} (${what})`,
      evidence,
    };
  },
};
