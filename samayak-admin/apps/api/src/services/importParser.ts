import * as XLSX from 'xlsx';

interface ParsedRow {
  [key: string]: string | number | undefined;
}

export async function parseCsvOrExcel(
  buffer: Buffer,
  mimetype: string
): Promise<ParsedRow[]> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Empty spreadsheet: no sheets found');

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Could not read sheet');

  const rows = XLSX.utils.sheet_to_json<ParsedRow>(sheet, {
    defval: '',
    raw: false,
  });

  if (rows.length === 0) throw new Error('No data rows found in file');
  if (rows.length > 10000) throw new Error('File too large: maximum 10,000 rows');

  return rows;
}
