import { analyseTable, describeAnalysis } from "../files/analysis";
import { getDocument } from "../files/store";
import { PactError } from "../errors";
import type { Evidence, Tool } from "./types";

interface Input {
  fileId: string;
  sheet?: string;
}

interface Output {
  fileId: string;
  name: string;
  tables: number;
  rowsAnalysed: number;
  findings: number;
}

/** Deterministic statistics, group totals and trends for CSV/XLSX/JSON tables. The model never does this arithmetic. */
export const dataAnalyzeTool: Tool<Input, Output> = {
  name: "data_analyze",
  description: "Compute totals, averages, group breakdowns, top rows and period-over-period change for an uploaded CSV, XLSX or JSON table.",
  stage: "analyzing",
  inputSchema: {
    type: "object",
    properties: { fileId: { type: "string", description: "Id of an uploaded tabular file" }, sheet: { type: "string", description: "Sheet name, for workbooks (default: all)" } },
    required: ["fileId"],
  },
  outputSchema: { type: "object", properties: { fileId: { type: "string" }, name: { type: "string" }, tables: { type: "number" }, rowsAnalysed: { type: "number" }, findings: { type: "number" } } },
  isAvailable: () => ({ available: true }),
  async execute(input, context) {
    const doc = await getDocument(input.fileId, context.userId);
    if (!doc) throw new PactError("NOT_FOUND", "That file is no longer available.");
    let tables = doc.tables ?? (doc.table ? [doc.table] : []);
    if (input.sheet) tables = tables.filter((t) => t.sheet?.toLowerCase() === input.sheet!.toLowerCase());
    if (!tables.length) throw new PactError("INVALID_REQUEST", `${doc.name} has no table to analyse${input.sheet ? ` on sheet “${input.sheet}”` : ""}.`);

    const evidence: Evidence[] = [];
    let rowsAnalysed = 0;
    let findings = 0;
    for (const table of tables.slice(0, 6)) {
      const analysis = analyseTable(table);
      rowsAnalysed += analysis.rowsAnalysed;
      findings += analysis.findings.length;
      const label = `${doc.name}${table.sheet ? ` · ${table.sheet}` : ""}`;
      evidence.push({ kind: "analysis", label: `${label} (analysis)`, text: describeAnalysis(analysis, label) });
    }
    return {
      data: { fileId: doc.id, name: doc.name, tables: tables.length, rowsAnalysed, findings },
      summary: `Analysed ${doc.name}: ${rowsAnalysed.toLocaleString("en-US")} rows, ${findings} ${findings === 1 ? "finding" : "findings"}`,
      evidence,
    };
  },
};
