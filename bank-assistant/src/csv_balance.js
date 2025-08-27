import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

export function getBalanceById(csvPath, id) {
  const p = path.resolve(csvPath);
  if (!fs.existsSync(p)) throw new Error(`CSV no encontrado: ${p}`);
  const raw = fs.readFileSync(p, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true });
  const rec = rows.find(r => (r.id || "").toString().trim() === id.toString().trim());
  return rec || null;
}
