// Writes sample files for manual testing: npx tsx scripts/make-fixtures.ts <dir>
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeDocx, makePdf, makeXlsx } from "../tests/fixtures";

async function main() {
const dir = process.argv[2] ?? ".pact-data/fixtures";
await mkdir(dir, { recursive: true });
await writeFile(path.join(dir, "brief.pdf"), makePdf("Pact Expansion Brief. We are expanding into Indonesia and the US next year. Payments must support cards in the US and bank transfer plus e-wallets in Indonesia. Budget for integration is six weeks."));
await writeFile(path.join(dir, "review.docx"), makeDocx());
await writeFile(path.join(dir, "sales.xlsx"), await makeXlsx());
await writeFile(
  path.join(dir, "sales.csv"),
  [
    "period,product,region,units,revenue",
    "2025-Q1,Alpha,North,120,14400",
    "2025-Q1,Beta,North,80,12000",
    "2025-Q1,Gamma,South,40,5200",
    "2025-Q2,Alpha,North,150,18000",
    "2025-Q2,Beta,North,70,10500",
    "2025-Q2,Gamma,South,65,8450",
    "2025-Q3,Alpha,North,190,22800",
    "2025-Q3,Beta,North,60,9000",
    "2025-Q3,Gamma,South,90,11700",
    "",
  ].join("\n"),
);
console.log(`fixtures written to ${dir}`);
}

void main();
