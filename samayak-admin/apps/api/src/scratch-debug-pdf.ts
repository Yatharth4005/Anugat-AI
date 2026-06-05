import { parsePdfTimetable } from './services/pdfParser';

async function main() {
  const pdfPath = 'f:/Anugat AI/CSE(8).pdf';
  console.log(`Parsing PDF: ${pdfPath}`);
  
  const result = await parsePdfTimetable(pdfPath);

  console.log('\n--- Parse Summary ---');
  console.log(`Department: "${result.departmentName}"`);
  console.log(`Session: "${result.session}"`);
  console.log(`Total rows: ${result.rows.length}`);
  console.log(`Total courses: ${result.courses.length}`);
  console.log(`Total faculty: ${result.faculty.length}`);
  console.log(`Total failures: ${result.parseFailures.length}`);
  
  if (result.parseFailures.length > 0) {
    console.log('\n--- Sample Parse Failures (First 30) ---');
    result.parseFailures.slice(0, 30).forEach((f, idx) => {
      console.log(`[${idx + 1}] Location: ${f.location} | Reason: ${f.reason} | Content: "${f.rawContent}"`);
    });
  }

  console.log('\n--- Section Slots ---');
  for (const row of result.rows) {
    const slots = Array.from(row.slots.entries());
    const validSlots = slots.filter(([_, cell]) => cell.courseCode !== null);
    console.log(`Section: "${row.section}" -> Total Slots: ${row.slots.size}, Valid Slots (with course): ${validSlots.length}`);
    if (validSlots.length > 0) {
      console.log('  Sample Slots:', validSlots.slice(0, 3).map(([k, v]) => `${k}: ${v.courseCode} (${v.roomId}) / ${v.facultyInitials}`));
    }
  }

  console.log('\n--- Sample Courses (First 5) ---');
  console.log(result.courses.slice(0, 5));

  console.log('\n--- Sample Faculty (First 5) ---');
  console.log(result.faculty.slice(0, 5));
}

main().catch(console.error);
