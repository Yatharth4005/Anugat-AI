const xlsx = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const path = require('path');

async function main() {
  process.env.DATABASE_URL = 'postgresql://samayak:samayak@localhost:5432/samayak?schema=public';
  const prisma = new PrismaClient();

  // 1. Simulate Department Import
  console.log('--- Simulating Department Import ---');
  try {
    const deptPath = path.join(__dirname, '..', '..', '..', 'SampleDepartmentData.xlsx');
    const workbook = xlsx.readFile(deptPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const name = row['name'] || row['Name'] || row['DEPARTMENT NAME'];
        const shortCode = String(row['shortCode'] || row['Short Code'] || row['CODE'] || '').toUpperCase();
        
        console.log(`Processing row ${i + 2}: name="${name}", shortCode="${shortCode}"`);

        const dept = await prisma.department.upsert({
          where: { shortCode },
          create: { name, shortCode },
          update: { name },
        });
        console.log(`  Success: Department ID = ${dept.id}`);
      } catch (e) {
        console.error(`  Error on row ${i + 2}:`, e.message);
      }
    }
  } catch (e) {
    console.error('Failed to parse Department file:', e.message);
  }

  // 2. Simulate Room Import
  console.log('\n--- Simulating Room Import ---');
  try {
    const roomPath = path.join(__dirname, '..', '..', '..', 'SampleRoomData.xlsx');
    const workbook = xlsx.readFile(roomPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        let departmentId = row['departmentId'] || row['Department ID'] || row['department_id'] || row['department'] || row['Department'] || row['DEPARTMENT'] || row['departmentShortCode'] || row['Department Short Code'] || row['shortCode'] || row['Short Code'];
        if (!departmentId) {
          throw new Error('Department (ID, name, or code) is required');
        }

        const deptSearch = String(departmentId).trim();
        const dept = await prisma.department.findFirst({
          where: {
            OR: [
              { shortCode: { equals: deptSearch, mode: 'insensitive' } },
              { name: { equals: deptSearch, mode: 'insensitive' } },
            ]
          }
        });
        if (!dept) {
          throw new Error(`Department "${deptSearch}" not found`);
        }
        departmentId = dept.id;

        const rawCapacity = row['capacity'] || row['Capacity'] || row['CAPACITY'] || row['seatingCapacity'] || row['Seating Capacity'];
        const capacity = rawCapacity !== undefined && String(rawCapacity).trim() !== ''
          ? Number(String(rawCapacity).replace(/[^\d.]/g, ''))
          : null;

        const number = String(row['number'] || row['Room Number'] || row['ROOM'] || '').trim();
        const type = String(row['type'] || row['Type'] || row['ROOM TYPE'] || 'CLASSROOM').toUpperCase();

        console.log(`Processing row ${i + 2}: number="${number}", departmentId="${departmentId}", type="${type}"`);

        const existingRoom = await prisma.room.findUnique({
          where: { number_departmentId: { number, departmentId } },
        });

        if (existingRoom) {
          await prisma.room.update({
            where: { id: existingRoom.id },
            data: { capacity, type: type },
          });
          console.log(`  Success (updated): Room ID = ${existingRoom.id}`);
        } else {
          const newRoom = await prisma.room.create({
            data: { number, type: type, capacity, departmentId },
          });
          console.log(`  Success (created): Room ID = ${newRoom.id}`);
        }
      } catch (e) {
        console.error(`  Error on row ${i + 2}:`, e.message);
      }
    }
  } catch (e) {
    console.error('Failed to parse Room file:', e.message);
  }

  await prisma.$disconnect();
}

main();
