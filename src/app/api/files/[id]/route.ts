import { assertId, handler, json } from "@/server/api";
import { getUserId } from "@/server/auth";
import { PactError } from "@/server/errors";
import { getDocument, getFileRecord } from "@/server/files/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/files/:id — metadata, plus a preview of the extracted text. */
export const GET = handler(async (request: Request, { params }: Params) => {
  const id = assertId((await params).id, "file");
  const userId = getUserId(request);
  const file = await getFileRecord(id, userId);
  if (!file) throw new PactError("NOT_FOUND", "File not found.");
  const document = await getDocument(id, userId);
  return json({
    file,
    document: document
      ? { preview: document.text.slice(0, 2000), chars: document.meta.chars, pages: document.meta.pages, sheets: document.meta.sheets, table: document.table ? { columns: document.table.columns, rowCount: document.table.rowCount, stats: document.table.stats } : undefined }
      : null,
  });
});
