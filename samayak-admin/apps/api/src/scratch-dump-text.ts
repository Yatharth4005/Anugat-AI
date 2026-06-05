import { parsePdfTimetable } from './services/pdfParser';
import * as fs from 'fs';

async function main() {
  const pdfPath = 'f:/Anugat AI/CSE(8).pdf';
  console.log(`Parsing PDF and dumping text...`);
  
  const result = await parsePdfTimetable(pdfPath);
  fs.writeFileSync('f:/Anugat AI/samayak-admin/apps/api/raw_ocr_output.txt', result.rawText);
  console.log('Done!');
}

main().catch(console.error);
