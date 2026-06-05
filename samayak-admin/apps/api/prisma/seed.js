"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Seeding Samayak database...');
    // ── Departments ──────────────────────────────────────────────────────────────
    const cse = await prisma.department.upsert({
        where: { shortCode: 'CSE' },
        update: {},
        create: { name: 'Computer Science & Engineering', shortCode: 'CSE' },
    });
    const it = await prisma.department.upsert({
        where: { shortCode: 'IT' },
        update: {},
        create: { name: 'Information Technology', shortCode: 'IT' },
    });
    const mca = await prisma.department.upsert({
        where: { shortCode: 'MCA' },
        update: {},
        create: { name: 'Master of Computer Applications', shortCode: 'MCA' },
    });
    console.log('✓ Departments seeded');
    // ── Rooms ────────────────────────────────────────────────────────────────────
    const roomData = [
        { number: '219', type: 'CLASSROOM', capacity: 60, departmentId: cse.id },
        { number: '220', type: 'CLASSROOM', capacity: 60, departmentId: cse.id },
        { number: '301', type: 'CLASSROOM', capacity: 80, departmentId: cse.id },
        { number: 'Lab 1', type: 'LAB', capacity: 40, departmentId: cse.id },
        { number: 'Lab 2', type: 'LAB', capacity: 40, departmentId: cse.id },
        { number: 'OOPDP Lab', type: 'LAB', capacity: 36, departmentId: cse.id },
        { number: 'Network Lab', type: 'LAB', capacity: 32, departmentId: cse.id },
        { number: '115', type: 'CLASSROOM', capacity: 70, departmentId: it.id },
        { number: 'IT Lab 1', type: 'LAB', capacity: 36, departmentId: it.id },
        { number: 'MCA Hall', type: 'CLASSROOM', capacity: 60, departmentId: mca.id },
        { number: 'MCA Lab', type: 'LAB', capacity: 30, departmentId: mca.id },
    ];
    for (const room of roomData) {
        await prisma.room.upsert({
            where: { number_departmentId: { number: room.number, departmentId: room.departmentId } },
            update: {},
            create: room,
        });
    }
    console.log('✓ Rooms seeded');
    // ── Branches ─────────────────────────────────────────────────────────────────
    const branchCSE6A = await prisma.branch.upsert({
        where: { departmentId_semester_section: { departmentId: cse.id, semester: 6, section: 'A' } },
        update: {},
        create: { name: 'B.Tech CSE VI Sem - Section A', semester: 6, section: 'A', departmentId: cse.id },
    });
    const branchCSE6B = await prisma.branch.upsert({
        where: { departmentId_semester_section: { departmentId: cse.id, semester: 6, section: 'B' } },
        update: {},
        create: { name: 'B.Tech CSE VI Sem - Section B', semester: 6, section: 'B', departmentId: cse.id },
    });
    const branchMCA2 = await prisma.branch.upsert({
        where: { departmentId_semester_section: { departmentId: mca.id, semester: 2, section: 'A' } },
        update: {},
        create: { name: 'MCA II Sem', semester: 2, section: 'A', departmentId: mca.id },
    });
    console.log('✓ Branches seeded');
    // ── Admin and Faculty accounts ────────────────────────────────────────────────
    const adminHash = await bcryptjs_1.default.hash('Admin@2024', 12);
    const coordHash = await bcryptjs_1.default.hash('Coord@2024', 12);
    const defaultHash = await bcryptjs_1.default.hash('Samayak@2024', 12);
    const admin = await prisma.faculty.upsert({
        where: { email: 'admin@samayak.edu' },
        update: {},
        create: {
            name: 'System Admin',
            email: 'admin@samayak.edu',
            passwordHash: adminHash,
            role: 'ADMIN',
            initials: 'SA',
            departmentId: cse.id,
        },
    });
    const coordinator = await prisma.faculty.upsert({
        where: { email: 'coordinator@samayak.edu' },
        update: {},
        create: {
            name: 'Timetable Coordinator',
            email: 'coordinator@samayak.edu',
            passwordHash: coordHash,
            role: 'COORDINATOR',
            initials: 'TC',
            departmentId: cse.id,
        },
    });
    const demoFaculty = [
        { name: 'Dr. Vandana K. Bhattacherjee', email: 'vkb@samayak.edu', initials: 'VKB' },
        { name: 'Dr. Deepak Kumar Mahto', email: 'dkm@samayak.edu', initials: 'DKM' },
        { name: 'Dr. Pragati Shukla', email: 'ps@samayak.edu', initials: 'PS' },
        { name: 'Dr. Arunima Jaiswal', email: 'aj@samayak.edu', initials: 'AJ' },
        { name: 'Dr. Neeraj Kumar Singh', email: 'nks@samayak.edu', initials: 'NKS' },
        { name: 'Prof. Supriya Sinha', email: 'ss@samayak.edu', initials: 'SS' },
        { name: 'Dr. Rajesh Kumar', email: 'rk@samayak.edu', initials: 'RK' },
    ];
    const facultyMap = {};
    for (const f of demoFaculty) {
        const member = await prisma.faculty.upsert({
            where: { email: f.email },
            update: {},
            create: {
                name: f.name,
                email: f.email,
                passwordHash: defaultHash,
                role: 'PROFESSOR',
                initials: f.initials,
                departmentId: cse.id,
            },
        });
        facultyMap[f.initials] = member.id;
    }
    console.log('✓ Faculty seeded');
    // ── Courses ──────────────────────────────────────────────────────────────────
    const courses = [
        { code: 'CS301', name: 'Operating Systems', credits: 4, type: 'LECTURE', branchId: branchCSE6A.id },
        { code: 'CS302', name: 'Computer Networks', credits: 4, type: 'LECTURE', branchId: branchCSE6A.id },
        { code: 'CS303', name: 'Software Engineering', credits: 3, type: 'LECTURE', branchId: branchCSE6A.id },
        { code: 'CS304', name: 'Database Management Systems', credits: 4, type: 'LECTURE', branchId: branchCSE6A.id },
        { code: 'CS305', name: 'CS301 Lab', credits: 2, type: 'LAB', branchId: branchCSE6A.id },
        { code: 'CS306', name: 'Networks Lab', credits: 2, type: 'LAB', branchId: branchCSE6A.id },
        { code: 'CS301', name: 'Operating Systems', credits: 4, type: 'LECTURE', branchId: branchCSE6B.id },
        { code: 'CS302', name: 'Computer Networks', credits: 4, type: 'LECTURE', branchId: branchCSE6B.id },
        { code: 'CS303', name: 'Software Engineering', credits: 3, type: 'LECTURE', branchId: branchCSE6B.id },
        { code: 'MCA201', name: 'Advanced Algorithms', credits: 4, type: 'LECTURE', branchId: branchMCA2.id },
        { code: 'MCA202', name: 'Web Technologies', credits: 3, type: 'LECTURE', branchId: branchMCA2.id },
    ];
    const courseMap = {};
    for (const c of courses) {
        const course = await prisma.course.upsert({
            where: { code_branchId: { code: c.code, branchId: c.branchId } },
            update: {},
            create: c,
        });
        courseMap[`${c.code}_${c.branchId}`] = course.id;
    }
    console.log('✓ Courses seeded');
    // ── Timetable Slots (sample for CSE VI A) ───────────────────────────────────
    const rooms219 = await prisma.room.findFirst({ where: { number: '219', departmentId: cse.id } });
    const rooms220 = await prisma.room.findFirst({ where: { number: '220', departmentId: cse.id } });
    const labRoom = await prisma.room.findFirst({ where: { number: 'Lab 1', departmentId: cse.id } });
    const sampleSlots = [
        { day: 'MONDAY', period: 'I', roomId: rooms219?.id, courseCode: 'CS301', startTime: '09:00', endTime: '09:50' },
        { day: 'MONDAY', period: 'II', roomId: rooms219?.id, courseCode: 'CS302', startTime: '10:00', endTime: '10:50' },
        { day: 'MONDAY', period: 'III', roomId: rooms220?.id, courseCode: 'CS303', startTime: '11:00', endTime: '11:50' },
        { day: 'MONDAY', period: 'IV', roomId: rooms219?.id, courseCode: 'CS304', startTime: '12:00', endTime: '12:50' },
        { day: 'TUESDAY', period: 'I', roomId: rooms220?.id, courseCode: 'CS302', startTime: '09:00', endTime: '09:50' },
        { day: 'TUESDAY', period: 'II', roomId: rooms219?.id, courseCode: 'CS301', startTime: '10:00', endTime: '10:50' },
        { day: 'TUESDAY', period: 'V', roomId: labRoom?.id, courseCode: 'CS305', startTime: '13:00', endTime: '13:50' },
        { day: 'WEDNESDAY', period: 'I', roomId: rooms219?.id, courseCode: 'CS304', startTime: '09:00', endTime: '09:50' },
        { day: 'WEDNESDAY', period: 'III', roomId: rooms220?.id, courseCode: 'CS303', startTime: '11:00', endTime: '11:50' },
        { day: 'THURSDAY', period: 'II', roomId: labRoom?.id, courseCode: 'CS306', startTime: '10:00', endTime: '10:50' },
        { day: 'FRIDAY', period: 'I', roomId: rooms220?.id, courseCode: 'CS301', startTime: '09:00', endTime: '09:50' },
        { day: 'FRIDAY', period: 'III', roomId: rooms219?.id, courseCode: 'CS302', startTime: '11:00', endTime: '11:50' },
    ];
    for (const slot of sampleSlots) {
        const courseId = courseMap[`${slot.courseCode}_${branchCSE6A.id}`];
        if (!courseId || !slot.roomId)
            continue;
        await prisma.timetableSlot.upsert({
            where: { day_period_branchId: { day: slot.day, period: slot.period, branchId: branchCSE6A.id } },
            update: {},
            create: {
                day: slot.day,
                period: slot.period,
                startTime: slot.startTime,
                endTime: slot.endTime,
                roomId: slot.roomId,
                courseId,
                branchId: branchCSE6A.id,
            },
        });
    }
    console.log('✓ Timetable slots seeded');
    console.log('\n✅ Database seeded successfully!');
    console.log('\n📧 Demo accounts:');
    console.log('   admin@samayak.edu  /  Admin@2024  (ADMIN)');
    console.log('   coordinator@samayak.edu  /  Coord@2024  (COORDINATOR)');
    console.log('   vkb@samayak.edu  /  Samayak@2024  (PROFESSOR)');
}
main()
    .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map