import chalk from "chalk";

export interface CsvRow {
  phone?: string;
  name?: string;
  message?: string;
  [key: string]: string | undefined;
}

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
  errors: string[];
}

/**
 * Parse a single CSV line respecting quoted fields.
 * Handles: "value with, comma", plain value, "value with ""escaped"" quotes"
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ("") or end of quoted field
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // skip next quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

/**
 * Parse a CSV file into structured rows.
 * Requires at least one identifier column: 'phone' or 'name'.
 */
export async function parseCsv(filePath: string): Promise<ParsedCsv> {
  const file = Bun.file(filePath);
  const exists = await file.exists();
  if (!exists) {
    throw new Error(`Archivo no encontrado: ${filePath}`);
  }

  const text = await file.text();
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (rawLines.length < 2) {
    throw new Error(
      "El CSV debe tener al menos un header y una fila de datos.",
    );
  }

  const headers = parseCsvLine(rawLines[0]).map((h) => h.toLowerCase());

  const hasPhone = headers.includes("phone");
  const hasName = headers.includes("name");

  if (!hasPhone && !hasName) {
    throw new Error(
      `El CSV necesita al menos una columna ${chalk.bold("phone")} o ${chalk.bold("name")}.\n` +
        chalk.gray(
          "  Ejemplo: phone,name,message\n           +51987654321,Juan,Hola {{name}}",
        ),
    );
  }

  const rows: CsvRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rawLines.length; i++) {
    const fields = parseCsvLine(rawLines[i]);
    const row: CsvRow = {};

    headers.forEach((header, idx) => {
      const value = fields[idx] || "";
      if (value) row[header] = value;
    });

    // Validate: at least one identifier
    if (!row.phone && !row.name) {
      errors.push(`Fila ${i + 1}: sin phone ni name, saltando`);
      continue;
    }

    rows.push(row);
  }

  return { headers, rows, errors };
}
