import Tesseract from 'tesseract.js';
import { createWorker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../lib/logger';
import { Day, Period, CourseType, RoomType } from '@samayak/types';
import { ParseFailure } from '@samayak/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ParsedTimetableCell {
  courseCode: string | null;
  roomId: string | null;   // raw room string from PDF
  facultyInitials: string | null;
  rawText: string;
  isParsed: boolean;
  isLab: boolean;
  isFree: boolean;
}

export interface ParsedTimetableRow {
  section: string;   // e.g. "CS-VI-A"
  semester: number;
  branch: string;    // e.g. "CS", "MCA", "M.Tech"
  slots: Map<`${Day}_${Period}`, ParsedTimetableCell>;
}

export interface ParsedCourse {
  code: string;
  name: string;
  credits: number;
  type: CourseType;
  ltp: string; // e.g. "3-1-0"
  coordinator: string;
}

export interface ParsedFaculty {
  initials: string;
  fullName: string;
}

export interface ParsedTimetable {
  departmentName: string;
  session: string;
  rows: ParsedTimetableRow[];
  courses: ParsedCourse[];
  faculty: ParsedFaculty[];
  parseFailures: ParseFailure[];
  rawText: string;
}

// ─── Period mapping (BIT Mesra format) ──────────────────────────────────────

const PERIOD_MAP: Record<string, Period> = {
  'I': Period.I, '1': Period.I,
  'II': Period.II, '2': Period.II,
  'III': Period.III, '3': Period.III,
  'IV': Period.IV, '4': Period.IV,
  'V': Period.V, '5': Period.V,
  'VI': Period.VI, '6': Period.VI,
  'VII': Period.VII, '7': Period.VII,
  'VIII': Period.VIII, '8': Period.VIII,
  'IX': Period.IX, '9': Period.IX,
};

const DAY_MAP: Record<string, Day> = {
  'MONDAY': Day.MONDAY, 'MON': Day.MONDAY,
  'TUESDAY': Day.TUESDAY, 'TUE': Day.TUESDAY,
  'WEDNESDAY': Day.WEDNESDAY, 'WED': Day.WEDNESDAY,
  'THURSDAY': Day.THURSDAY, 'THU': Day.THURSDAY,
  'FRIDAY': Day.FRIDAY, 'FRI': Day.FRIDAY,
};

// ─── Section pattern recognition ─────────────────────────────────────────────

const SECTION_PATTERN = /^(CS|IT|AIML|MCA|MTECH|M\.TECH|ECE|EEE|CIVIL|MECH|CHEM)\s*[-–]?\s*(I{1,3}V?|IV|VI?I?I?|[1-8])\s*[-–]?\s*([A-D]?)$/i;

function normalizeSectionName(raw: string): { branch: string; semester: number; section: string } | null {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  const match = SECTION_PATTERN.exec(cleaned);
  if (!match) return null;

  const branch = match[1].replace('MTECH', 'M.TECH');
  const semRoman = match[2];
  const section = match[3] || 'A';

  const semMap: Record<string, number> = {
    'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  };
  const semester = semMap[semRoman] ?? 0;
  if (!semester) return null;

  return { branch, semester, section };
}

// ─── Cell parser ─────────────────────────────────────────────────────────────

/**
 * Cell format: "CS201 (219) / VKB" or "CS201/219/VKB" or "LAB (Lab1) / VKB+DKM"
 * Labs may span multiple periods.
 */
function parseCell(rawText: string): ParsedTimetableCell {
  const text = rawText.trim();

  if (!text || /^(FREE|BREAK|LUNCH|-)$/i.test(text)) {
    return { courseCode: null, roomId: null, facultyInitials: null, rawText: text, isParsed: true, isLab: false, isFree: true };
  }

  // Try pattern: CODE (ROOM) / INITIALS
  const pattern1 = /([A-Z]{2,5}\s*\d{3,4}[A-Z]?)\s*\(([^)]+)\)\s*[/\\]\s*([A-Z+]+)/i;
  const match1 = pattern1.exec(text);
  if (match1) {
    return {
      courseCode: match1[1].replace(/\s+/g, '').toUpperCase(),
      roomId: match1[2].trim(),
      facultyInitials: match1[3].trim(),
      rawText: text,
      isParsed: true,
      isLab: /lab/i.test(match1[2]),
      isFree: false,
    };
  }

  // Try pattern: CODE / ROOM / INITIALS (slash-separated)
  const pattern2 = /([A-Z]{2,5}\d{3,4}[A-Z]?)\s*[/\\]\s*([A-Z0-9\s]+?)\s*[/\\]\s*([A-Z+]+)/i;
  const match2 = pattern2.exec(text);
  if (match2) {
    return {
      courseCode: match2[1].toUpperCase(),
      roomId: match2[2].trim(),
      facultyInitials: match2[3].trim(),
      rawText: text,
      isParsed: true,
      isLab: /lab/i.test(match2[2]),
      isFree: false,
    };
  }

  // Try just course code extraction
  const codeMatch = /([A-Z]{2,5}\d{3,4}[A-Z]?)/.exec(text.toUpperCase());
  if (codeMatch) {
    return {
      courseCode: codeMatch[1],
      roomId: null,
      facultyInitials: null,
      rawText: text,
      isParsed: false,
      isLab: /lab/i.test(text),
      isFree: false,
    };
  }

  return { courseCode: null, roomId: null, facultyInitials: null, rawText: text, isParsed: false, isLab: false, isFree: false };
}

// ─── Course list parser ───────────────────────────────────────────────────────

function parseCourseLine(line: string): ParsedCourse | null {
  // Format: CODE  Course Name  L-T-P  Credits  Coordinator
  // e.g.: CS201  Engineering Mathematics  3-1-0  4  Dr. ABC
  const parts = line.trim().split(/\s{2,}|\t/);
  if (parts.length < 4) return null;

  const code = parts[0]?.toUpperCase();
  if (!code || !/^[A-Z]{2,5}\d{3,4}[A-Z]?$/.test(code)) return null;

  const name = parts[1] || '';
  const ltpStr = parts.find((p) => /^\d+-\d+-\d+$/.test(p)) ?? '3-1-0';
  const creditsStr = parts.find((p) => /^\d+(\.\d+)?$/.test(p) && !p.includes('-'));
  const credits = creditsStr ? parseFloat(creditsStr) : 4;
  const coordinator = parts[parts.length - 1] || '';

  const ltpParts = ltpStr.split('-').map(Number);
  const labHours = ltpParts[2] ?? 0;
  const type: CourseType = labHours >= 2 ? CourseType.LAB : CourseType.LECTURE;

  return { code, name, credits, type, ltp: ltpStr, coordinator };
}

// ─── Faculty list parser ──────────────────────────────────────────────────────

function parseFacultyLine(line: string): ParsedFaculty | null {
  // Format: Initials  Full Name  or  Full Name (Initials)
  const trimmed = line.trim();

  // Pattern 1: "VKB  Dr. Vandana K. Bhattacherjee"
  const pattern1 = /^([A-Z]{2,5})\s{2,}(.+)$/;
  const match1 = pattern1.exec(trimmed);
  if (match1) {
    return { initials: match1[1], fullName: match1[2].trim() };
  }

  // Pattern 2: "Dr. Vandana K. Bhattacherjee (VKB)"
  const pattern2 = /^(.+?)\s*\(([A-Z]{2,5})\)$/;
  const match2 = pattern2.exec(trimmed);
  if (match2) {
    return { initials: match2[2], fullName: match2[1].trim() };
  }

  return null;
}

// ─── Main OCR + Parse Pipeline ────────────────────────────────────────────────

export async function parsePdfTimetable(
  filePath: string,
  onProgress?: (progress: number, message: string) => void
): Promise<ParsedTimetable> {
  const parseFailures: ParseFailure[] = [];
  const result: ParsedTimetable = {
    departmentName: '',
    session: '',
    rows: [],
    courses: [],
    faculty: [],
    parseFailures,
    rawText: '',
  };

  logger.info('Starting PDF OCR parse', { filePath });
  onProgress?.(5, 'Initializing OCR engine...');

  // Use pdfjs-dist to get page count and extract any embedded text first
  let allText = '';

  try {
    // Try to get text directly first (for vector PDFs)
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.js');
    const pdfData = new Uint8Array(fs.readFileSync(filePath));
    const pdfDoc = await getDocument({ data: pdfData }).promise;
    const numPages = pdfDoc.numPages;

    logger.info(`PDF has ${numPages} pages`);
    onProgress?.(10, `PDF loaded: ${numPages} pages. Starting text extraction...`);

    // Try direct text extraction first
    for (let p = 1; p <= numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: unknown) => (item as { str?: string }).str ?? '')
        .join(' ');
      allText += `\n=== PAGE ${p} ===\n${pageText}`;
    }

    const hasText = allText.replace(/[=\s]/g, '').length > 100;

    if (!hasText) {
      // Scanned PDF — use OCR
      logger.info('PDF appears scanned, using OCR...');
      onProgress?.(15, 'PDF is scanned. Running OCR (this may take 1-2 minutes)...');
      allText = await ocrPdf(filePath, numPages, onProgress);
    } else {
      onProgress?.(40, 'Text extracted directly from PDF. Parsing structure...');
    }
  } catch (pdfError) {
    logger.warn('PDF.js extraction failed, falling back to OCR', { error: pdfError });
    onProgress?.(15, 'Falling back to OCR...');
    allText = await ocrPdf(filePath, 13, onProgress); // assume 13 pages like CSE PDF
  }

  result.rawText = allText;

  // ─── Parse the text ──────────────────────────────────────────────────────────
  onProgress?.(70, 'Parsing timetable structure...');

  const lines = allText.split('\n').map((l) => l.trim()).filter(Boolean);

  // Extract department name from header
  for (const line of lines.slice(0, 20)) {
    if (/department\s+of/i.test(line)) {
      result.departmentName = line.replace(/department\s+of\s*/i, '').trim();
      break;
    }
    if (/B\.?I\.?T\.?\s+Mesra/i.test(line)) continue;
    if (line.length > 10 && line.length < 80 && /[A-Z]{3,}/.test(line) && !result.departmentName) {
      result.departmentName = line.trim();
    }
  }

  // Extract session info
  const sessionMatch = lines.join(' ').match(/(?:Spring|Autumn|Winter|Summer)\s+\d{4}/i);
  if (sessionMatch) result.session = sessionMatch[0];

  // Parse timetable rows
  let currentSection: string | null = null;
  let currentDay: Day | null = null;
  const periodHeaders: Period[] = [];
  let inTimetableSection = false;
  let inCourseSection = false;
  let inFacultySection = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];

    // Detect section transitions
    if (/course\s+list|list\s+of\s+course/i.test(line)) {
      inTimetableSection = false;
      inCourseSection = true;
      inFacultySection = false;
      continue;
    }
    if (/faculty\s+list|list\s+of\s+faculty|sl\.?\s*no\.?\s+name|teacher\s+list/i.test(line)) {
      inTimetableSection = false;
      inCourseSection = false;
      inFacultySection = true;
      continue;
    }

    // Detect period headers (Roman numerals I through IX)
    if (/^(I{1,3}V?|IV|VI?I?I?|IX)\s+(I{1,3}V?|IV|VI?I?I?|IX)/.test(line) ||
        /^Period\s+I/i.test(line)) {
      inTimetableSection = true;
      periodHeaders.length = 0;
      const periodMatches = line.matchAll(/\b(I{1,3}V?|IV|VI?I?I?|IX)\b/g);
      for (const m of periodMatches) {
        const p = PERIOD_MAP[m[0]];
        if (p) periodHeaders.push(p);
      }
      continue;
    }

    // Detect day changes
    const dayUpper = line.toUpperCase().split(/\s/)[0] ?? '';
    if (DAY_MAP[dayUpper]) {
      currentDay = DAY_MAP[dayUpper] ?? null;
      continue;
    }

    // Detect section headers like "CS-VI-A" or "MCA-II"
    const sectionInfo = normalizeSectionName(line);
    if (sectionInfo) {
      currentSection = line.trim();
      const existingRow = result.rows.find((r) => r.section === currentSection);
      if (!existingRow) {
        result.rows.push({
          section: currentSection,
          semester: sectionInfo.semester,
          branch: sectionInfo.branch,
          slots: new Map(),
        });
      }
      inTimetableSection = true;
      continue;
    }

    // Parse timetable cell line (pipe or tab separated)
    if (inTimetableSection && currentSection && currentDay && periodHeaders.length > 0) {
      const cells = line.split(/\s{3,}|\t|\|/).filter(Boolean);
      if (cells.length >= 3) {
        const rowEntry = result.rows.find((r) => r.section === currentSection);
        if (rowEntry) {
          cells.forEach((cellText, idx) => {
            const period = periodHeaders[idx];
            if (!period) return;
            const key = `${currentDay}_${period}` as `${Day}_${Period}`;
            const parsedCell = parseCell(cellText);
            if (!parsedCell.isParsed && !parsedCell.isFree) {
              parseFailures.push({
                location: `Page/Section ${currentSection}, Day ${currentDay}, Period ${period}`,
                reason: 'Could not parse cell format',
                rawContent: cellText,
              });
            }
            rowEntry.slots.set(key, parsedCell);
          });
        }
      }
    }

    // Parse course list entries
    if (inCourseSection) {
      const parsedCourse = parseCourseLine(line);
      if (parsedCourse) result.courses.push(parsedCourse);
    }

    // Parse faculty list entries
    if (inFacultySection) {
      const parsedFaculty = parseFacultyLine(line);
      if (parsedFaculty) result.faculty.push(parsedFaculty);
    }
  }

  onProgress?.(90, 'Parse complete. Building entity map...');
  logger.info('PDF parse complete', {
    department: result.departmentName,
    sections: result.rows.length,
    courses: result.courses.length,
    faculty: result.faculty.length,
    failures: parseFailures.length,
  });

  return result;
}

async function ocrPdf(
  filePath: string,
  numPages: number,
  onProgress?: (progress: number, message: string) => void
): Promise<string> {
  let allText = '';

  // Use Tesseract on the PDF directly — tesseract.js can handle this
  const worker = await createWorker('eng', 1, {
    logger: (m: unknown) => {
      const msg = m as { status?: string; progress?: number };
      if (msg.status === 'recognizing text' && msg.progress !== undefined) {
        const pct = 15 + Math.floor(msg.progress * 50);
        onProgress?.(pct, `OCR in progress: ${Math.floor(msg.progress * 100)}%`);
      }
    },
  });

  try {
    const result = await worker.recognize(filePath);
    allText = result.data.text;
  } finally {
    await worker.terminate();
  }

  return allText;
}
