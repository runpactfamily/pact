// Hand-built file fixtures so parser tests need no binary assets in the repo.

const enc = new TextEncoder();

/** A one-page PDF with the given text wrapped into lines, written with a correct xref table. */
export function makePdf(text: string): Uint8Array {
  const escape = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  // Wrap at ~60 characters: pdf.js drops glyphs placed beyond the page edge, as a real PDF never has.
  const lines: string[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (!lines.length || `${lines[lines.length - 1]} ${word}`.length > 60) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  const body = lines.map((l, i) => `${i ? "T* " : ""}(${escape(l)}) Tj`).join(" ");
  const stream = `BT /F1 14 Tf 40 740 Td 18 TL ${body || "( ) Tj"} ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}

// ---- minimal ZIP writer (stored entries) for DOCX fixtures ----

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

export function makeZip(entries: Record<string, string>): Uint8Array {
  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(content);
    const crc = crc32(data);
    const header = [0x50, 0x4b, 0x03, 0x04, ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)];
    local.push(...header, ...nameBytes, ...data);
    central.push(0x50, 0x4b, 0x01, 0x02, ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nameBytes);
    offset += header.length + nameBytes.length + data.length;
  }
  const end = [0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(Object.keys(entries).length), ...u16(Object.keys(entries).length), ...u32(central.length), ...u32(local.length), ...u16(0)];
  return new Uint8Array([...local, ...central, ...end]);
}

/** A DOCX with a heading, two paragraphs and a 2×2 table. */
export function makeDocx(): Uint8Array {
  const p = (text: string, style?: string) => `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}<w:r><w:t>${text}</w:t></w:r></w:p>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${p("Quarterly Review", "Heading1")}
${p("Revenue grew eleven percent while margin slipped.")}
${p("Receivables need attention before the next close.")}
<w:tbl><w:tr><w:tc>${p("Metric")}</w:tc><w:tc>${p("Value")}</w:tc></w:tr><w:tr><w:tc>${p("Margin")}</w:tc><w:tc>${p("43.7%")}</w:tc></w:tr></w:tbl>
</w:body></w:document>`;
  return makeZip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": document,
  });
}

/** A two-sheet workbook built with exceljs. */
export async function makeXlsx(): Promise<Uint8Array> {
  const mod = (await import("exceljs")) as unknown as { default?: typeof import("exceljs") } & typeof import("exceljs");
  const ExcelJS = mod.default ?? mod;
  const wb = new ExcelJS.Workbook();
  const q1 = wb.addWorksheet("Q1");
  q1.addRow(["product", "units", "revenue"]);
  q1.addRow(["Alpha", 10, 1200]);
  q1.addRow(["Beta", 30, 3900]);
  q1.addRow(["Gamma", 5, 610]);
  const q2 = wb.addWorksheet("Q2");
  q2.addRow(["product", "units", "revenue"]);
  q2.addRow(["Alpha", 14, 1700]);
  q2.addRow(["Beta", 28, 3600]);
  q2.addRow(["Gamma", 9, 1100]);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
