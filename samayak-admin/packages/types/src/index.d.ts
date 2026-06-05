export declare enum Role {
    ADMIN = "ADMIN",
    COORDINATOR = "COORDINATOR",
    HOD = "HOD",
    DEAN = "DEAN",
    PROFESSOR = "PROFESSOR"
}
export declare enum RoomType {
    CLASSROOM = "CLASSROOM",
    LAB = "LAB",
    OTHER = "OTHER"
}
export declare enum CourseType {
    LECTURE = "LECTURE",
    LAB = "LAB",
    TUTORIAL = "TUTORIAL"
}
export declare enum Day {
    MONDAY = "MONDAY",
    TUESDAY = "TUESDAY",
    WEDNESDAY = "WEDNESDAY",
    THURSDAY = "THURSDAY",
    FRIDAY = "FRIDAY"
}
export declare enum Period {
    I = "I",
    II = "II",
    III = "III",
    IV = "IV",
    V = "V",
    VI = "VI",
    VII = "VII",
    VIII = "VIII",
    IX = "IX"
}
export declare enum ImportJobStatus {
    QUEUED = "QUEUED",
    PARSING = "PARSING",
    INTEGRATING = "INTEGRATING",
    DONE = "DONE",
    FAILED = "FAILED"
}
export declare enum EntityStatus {
    ACTIVE = "ACTIVE",
    PENDING = "PENDING",
    ARCHIVED = "ARCHIVED"
}
export interface Department {
    id: string;
    name: string;
    shortCode: string;
    createdAt: string;
    updatedAt: string;
    branches?: Branch[];
    _count?: {
        branches: number;
        rooms: number;
    };
}
export interface Branch {
    id: string;
    name: string;
    semester: number;
    section: string;
    departmentId: string;
    department?: Department;
    courses?: Course[];
    timetableSlots?: TimetableSlot[];
}
export interface Room {
    id: string;
    number: string;
    type: RoomType;
    capacity: number | null;
    departmentId: string;
    department?: Department;
    status: EntityStatus;
    createdAt: string;
    updatedAt: string;
}
export interface Course {
    id: string;
    code: string;
    name: string;
    credits: number;
    type: CourseType;
    branchId: string;
    branch?: Branch;
    status: EntityStatus;
    createdAt: string;
    updatedAt: string;
    faculty?: FacultyCourse[];
}
export interface Faculty {
    id: string;
    name: string;
    email: string;
    role: Role;
    departmentId: string;
    department?: Department;
    initials: string;
    status: EntityStatus;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
    courses?: FacultyCourse[];
}
export interface FacultyCourse {
    facultyId: string;
    courseId: string;
    faculty?: Faculty;
    course?: Course;
}
export interface TimetableSlot {
    id: string;
    day: Day;
    period: Period;
    startTime: string;
    endTime: string;
    roomId: string | null;
    courseId: string | null;
    branchId: string;
    room?: Room;
    course?: Course;
    branch?: Branch;
}
export interface ImportJobResult {
    created: {
        departments: number;
        branches: number;
        rooms: number;
        courses: number;
        faculty: number;
        slots: number;
    };
    matched: {
        departments: number;
        branches: number;
        rooms: number;
        courses: number;
        faculty: number;
    };
    pending: ParseFailure[];
    summary: string;
}
export interface ParseFailure {
    location: string;
    reason: string;
    rawContent: string;
}
export interface ImportJob {
    id: string;
    status: ImportJobStatus;
    fileName: string;
    result: ImportJobResult | null;
    error: string | null;
    progress: number;
    createdAt: string;
    updatedAt: string;
}
export interface RoomUtilisation {
    roomId: string;
    roomNumber: string;
    roomType: RoomType;
    occupiedSlots: number;
    totalSlots: number;
    utilisationPct: number;
}
export interface SlotAvailability {
    period: Period;
    day: Day;
    freeRooms: number;
    totalRooms: number;
    probability: number;
}
export interface UnderRunningCourse {
    courseId: string;
    courseCode: string;
    courseName: string;
    credits: number;
    scheduledSlots: number;
    requiredSlots: number;
    gap: number;
    branchName: string;
    semester: number;
}
export interface AnalyticsDashboard {
    overallUtilisationPct: number;
    roomUtilisations: RoomUtilisation[];
    slotAvailabilities: SlotAvailability[];
    underRunningCourses: UnderRunningCourse[];
    avgEmptyRoomHoursPerDay: number;
    computedAt: string;
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
export interface PaginatedResponse<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export interface HealthStatus {
    status: 'ok' | 'degraded';
    db: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
    queue: 'active' | 'inactive';
    timestamp: string;
}
export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: Role;
    departmentId: string | null;
}
export interface LoginRequest {
    email: string;
    password: string;
}
export interface LoginResponse {
    token: string;
    user: AuthUser;
}
export declare const PERIOD_TIMES: Record<Period, {
    start: string;
    end: string;
}>;
//# sourceMappingURL=index.d.ts.map