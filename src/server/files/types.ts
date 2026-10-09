export type FileKind = "pdf" | "docx" | "csv" | "xlsx" | "txt" | "json" | "md";

export interface FileRecord {
  id: string;
  userId: string;
  name: string;
  kind: FileKind;
  mime: string;
  size: number;
  createdAt: number;
  /** Set once extraction has run. */
  extracted: boolean;
  /** Extraction problem, if any. Safe to show. */
  extractionError?: string;
}

export interface ColumnStats {
  name: string;
  type: "number" | "text" | "date" | "empty";
  nonEmpty: number;
  distinct: number;
  min?: number;
  max?: number;
  mean?: number;
  sum?: number;
  sample: string[];
}

export interface TableData {
  columns: string[];
  rowCount: number;
  /** First rows, for display and for the model. */
  rows: string[][];
  /** Rows kept for deterministic analysis (bounded; see MAX_ROWS_STORED). */
  data: string[][];
  rowsStored: number;
  stats: ColumnStats[];
  sheet?: string;
}

export interface PdfPage {
  pageNumber: number;
  text: string;
}

/** What the agent sees for a file. Stored next to the raw bytes. */
export interface DocumentRepresentation {
  id: string;
  name: string;
  kind: FileKind;
  mime: string;
  size: number;
  createdAt: number;
  /** Normalised text: page-separated for PDFs, structured for DOCX, per-sheet for XLSX. */
  text: string;
  /** First table (CSV, JSON array, first sheet). */
  table?: TableData;
  /** Every table: one per sheet for workbooks. */
  tables?: TableData[];
  pages?: PdfPage[];
  meta: {
    pages?: number;
    chars: number;
    sheets?: string[];
    headings?: string[];
    /** Present when a PDF had no extractable text (image-only, no OCR). */
    textUnavailable?: string;
  };
}
