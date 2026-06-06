const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

async function main() {
  const files = [
    'SampleDepartmentData.xlsx',
    'SampleRoomData.xlsx',
    'SampleCourseData.xlsx',
    'SampleFacultyData.xlsx'
  ];

  console.log('--- EXCEL FILES DATA ---');
  for (const file of files) {
    try {
      const filePath = path.join(__dirname, '..', '..', '..', file);
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet);
      console.log(`\nFile: ${file} (Sheet: ${sheetName}), Rows count: ${rows.length}`);
      console.log('First few rows:', JSON.stringify(rows.slice(0, 5), null, 2));
    } catch (e) {
      console.error(`Error reading ${file}:`, e.message);
    }
  }

  console.log('\n--- PRISMA DATABASE DEPARTMENTS ---');
  const prisma = new PrismaClient();
  try {
    const departments = await prisma.department.findMany();
    console.log('Departments in DB:', JSON.stringify(departments, null, 2));
  } catch (e) {
    console.error('Error connecting to database:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
