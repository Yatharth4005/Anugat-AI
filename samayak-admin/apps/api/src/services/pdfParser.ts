import Tesseract from 'tesseract.js';
import { createWorker } from 'tesseract.js';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../lib/logger';
import { Day, Period, CourseType, RoomType } from '@samayak/types';
import { ParseFailure } from '@samayak/types';
import { PDFParse } from 'pdf-parse';

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

const ALL_DAYS = [Day.MONDAY, Day.TUESDAY, Day.WEDNESDAY, Day.THURSDAY, Day.FRIDAY];

// ─── Section pattern recognition ─────────────────────────────────────────────

const SECTION_PATTERN = /^(CS|IT|AIML|MCA|MTECH|M\.TECH|ECE|EEE|CIVIL|MECH|CHEM)\s*[-–]?\s*(I{1,3}V?|IV|VI?I?I?|[1-8])\s*[-–]?\s*([A-D]?)$/i;

function normalizeSectionName(raw: string): { branch: string; semester: number; section: string } | null {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, ' ');
  
  // 1. Try strict match first (for clean digital vector PDFs)
  const match = SECTION_PATTERN.exec(cleaned);
  if (match) {
    const branch = match[1].replace('MTECH', 'M.TECH');
    const semRoman = match[2];
    const section = match[3] || 'A';

    const semMap: Record<string, number> = {
      'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8,
      '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    };
    const semester = semMap[semRoman] ?? 0;
    if (semester) {
      return { branch, semester, section };
    }
  }

  // 2. Try fuzzy parsing for scanned/OCR lines
  const clean = cleaned.replace(/[^A-Z0-9:|#\-–]/g, ''); // Keep letters, digits, separators
  
  // Detect Branch
  let branch = '';
  if (clean.includes('AIML') || clean.includes('AML') || clean.includes('JAML')) {
    branch = 'AIML';
  } else if (clean.includes('MCA')) {
    branch = 'MCA';
  } else if (clean.includes('MTECH') || clean.includes('M.TECH')) {
    branch = 'M.TECH';
  } else if (clean.includes('CS') || clean.includes('JES') || clean.includes('65') || clean.includes('C5') || clean.includes('JS') || clean.includes('BTECH') || clean.includes('B.TECH')) {
    branch = 'CS';
  } else {
    return null;
  }

  // Detect Semester & Section
  let semester = 0;
  let section = 'A';

  // Check Semester 6
  if (clean.includes('SEMEST') && (clean.includes('VI') || clean.includes('V1'))) {
    semester = 6;
    if (clean.includes('VIA') || clean.includes('V1A') || clean.includes('SEMESTENVIA') || clean.includes('SEMESTERSVIA')) {
      section = 'A';
    } else if (clean.includes('VIB') || clean.includes('V1B') || clean.includes('VI#') || clean.includes('V1#')) {
      section = 'B';
    } else if (clean.includes('VIC') || clean.includes('V1C')) {
      section = 'C';
    } else if (clean.includes('VID') || clean.includes('V1D')) {
      section = 'D';
    }
  }
  // Check Semester 4
  else if (clean.includes('SEMEST') && (clean.includes('IV') || clean.includes('1V') || clean.includes('LV'))) {
    semester = 4;
    if (clean.includes('IVA') || clean.includes('1VA') || clean.includes('LVA')) {
      section = 'A';
    } else if (clean.includes('IVB') || clean.includes('1VB') || clean.includes('LVB') || clean.includes('IV#') || clean.includes('LV#')) {
      section = 'B';
    } else if (clean.includes('IVC') || clean.includes('1VC') || clean.includes('LVC')) {
      section = 'C';
    } else if (clean.includes('IVD') || clean.includes('1VD') || clean.includes('LVD')) {
      section = 'D';
    }
  }
  // Check Semester 2
  else if (clean.includes('SEMEST') && (clean.includes('II') || clean.includes('11') || clean.includes('STT'))) {
    semester = 2;
    section = 'A'; // default
  }
  // Check Semester 8
  else if (clean.includes('SEMEST') && (clean.includes('VIII') || clean.includes('V111'))) {
    semester = 8;
    section = 'A'; // default
  }
  
  if (semester === 0) {
    // Try matching using digits
    const semMatch = clean.match(/SEMEST[A-Z]*:?([1-8])/);
    if (semMatch && semMatch[1]) {
      semester = parseInt(semMatch[1], 10);
    } else {
      return null;
    }
  }

  return { branch, semester, section };
}

// ─── Normalizers & Day/Cell Split Helpers ────────────────────────────────────

function normalizeCourseCode(raw: string): string {
  let cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9€$]/g, '');
  
  // Replace common OCR typos
  cleaned = cleaned.replace(/^€S/, 'CS');
  cleaned = cleaned.replace(/^€8/, 'CS');
  cleaned = cleaned.replace(/^€B/, 'CS');
  cleaned = cleaned.replace(/^C€\$/, 'CS');
  cleaned = cleaned.replace(/^COSAS/, 'CS2205');
  cleaned = cleaned.replace(/^COSA/, 'CS2203');
  cleaned = cleaned.replace(/^CWAEOR/, 'MA24201');
  cleaned = cleaned.replace(/^ESAS/, 'CS24215');
  cleaned = cleaned.replace(/^824/, 'CS24');
  cleaned = cleaned.replace(/^524/, 'CS24');
  cleaned = cleaned.replace(/^C22/, 'CS22');
  cleaned = cleaned.replace(/^C53/, 'CS3');
  cleaned = cleaned.replace(/^C83/, 'CS3');
  cleaned = cleaned.replace(/^T13/, 'IT3');
  cleaned = cleaned.replace(/^113/, 'IT3');
  cleaned = cleaned.replace(/^CS524/, 'CS24');

  // If it starts with 524 and is 6 digits, e.g. 524213 -> CS24213
  if (/^\d{6}$/.test(cleaned) && cleaned.startsWith('524')) {
    cleaned = 'CS' + cleaned.slice(1);
  }
  
  // If it is just digits, prepend CS
  if (/^\d{5,6}$/.test(cleaned)) {
    cleaned = 'CS' + cleaned;
  }

  // If it starts with S followed by 3 digits, e.g. S336 -> CS336
  if (/^S\d{3}$/.test(cleaned)) {
    cleaned = 'CS' + cleaned.slice(1);
  }

  return cleaned;
}

export function extractFacultyFromTeacherString(teacherStr: string): ParsedFaculty[] {
  const list: ParsedFaculty[] = [];
  if (!teacherStr) return list;

  // Split by & or and or ,
  const names = teacherStr.split(/&|\band\b|,/).map(n => n.trim()).filter(Boolean);

  for (const rawName of names) {
    let name = rawName
      .replace(/\((Group|G)?\s*\d+\)/i, '')
      .replace(/\(Department of[^\)]+\)/i, '')
      .replace(/\([^\)]+\)/i, '')
      .replace(/\[/g, '')
      .replace(/\]/g, '')
      .trim();

    // 1. Remove leading garbage characters (non-letters) at the start
    name = name.replace(/^[^A-Za-z]+/, '').trim();

    // 2. Normalize titles (Dr., Prof., Mr., Mrs., Ms. - and common OCR errors like brs, tbr, br, or, [or, [br)
    name = name.replace(/^(Dr|Prof|Mr|Mrs|Ms|brs|tbr|br|or)\b\.?\s*/i, (match, title) => {
      const t = title.toLowerCase();
      if (t === 'prof') return 'Prof. ';
      if (t === 'mr') return 'Mr. ';
      if (t === 'mrs') return 'Mrs. ';
      if (t === 'ms') return 'Ms. ';
      return 'Dr. '; // default fallback for brs, tbr, br, or, dr
    });

    // 3. Strip trailing numbers, symbols, and garbage at the end
    name = name.replace(/[^A-Za-z\s\.]+$/, '').trim();

    // 4. Validate name: check if empty, too short, or blacklisted
    if (!name || name.length < 3) continue;

    // Discard any names containing words like Department, Mathematics, Management, or course-specific terms (Learning, systems, data, mooc, elective, etc.)
    if (/department|mathematics|management|humanities|science|engineering|system|systems|sysems|sysem|language|method|methods|theory|activity|total|credit|credits|skills|learning|retrieval|mooc|elective|data|communication|networks|network|security|application|applications|programming|course|title|syllabus|examination|controller|date|operating|operaing|opemig|design|analysis|algorithm|algorithms|formal|automata|numerical|knowledge|database|dbms|cryptography|blockchain|compiler|embedded/i.test(name)) {
      continue;
    }

    const nameWithoutTitles = name.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Dr|Prof|Mr|Mrs|Ms)\s+/i, '').trim();
    const parts = nameWithoutTitles.split(/[\s\.]+/).filter(Boolean);
    let initials = parts.map(p => p[0]).join('').toUpperCase();

    // Strip non-alphabetic chars from initials
    initials = initials.replace(/[^A-Z]/g, '');

    if (initials.length < 2 && parts[0]) {
      const cleanFirstPart = parts[0].replace(/[^A-Za-z]/g, '');
      initials = cleanFirstPart.slice(0, 2).toUpperCase();
    }

    if (initials.length >= 2) {
      // Avoid duplicate initials in the returned list
      if (!list.some(f => f.initials === initials)) {
        list.push({ initials, fullName: name });
      }
    }
  }

  return list;
}

function detectDayInLine(line: string): { day: Day; cleanLine: string } | null {
  const dayPatterns = [
    { day: Day.MONDAY, regex: /^(MON|MONDAY?|MOND;?|ONDA|MYONDAY?|OND;?|ONDAY?)\b/i },
    { day: Day.TUESDAY, regex: /^(TUE|TUESDAY?|TUES|UESDAY?|TUE;?)\b/i },
    { day: Day.WEDNESDAY, regex: /^(WED|WEDNESDAY?|WEDNES|EDNESDAY?|WED;?|weanesany)\b/i },
    { day: Day.THURSDAY, regex: /^(THU|THURSDAY?|THURS|HURSDAY?|THU;?|THURSD;?)\b/i },
    { day: Day.FRIDAY, regex: /^(FRI|FRIDAY?|RIDAY?|FRI;?|migy|tasty)\b/i },
  ];

  for (const p of dayPatterns) {
    const match = line.match(p.regex);
    if (match) {
      return { day: p.day, cleanLine: line.slice(match[0].length).trim() };
    }
  }

  const fuzzyPatterns = [
    { day: Day.MONDAY, regex: /\b(MONDAY?|MOND|ONDA|ONDAY?)\b/i },
    { day: Day.TUESDAY, regex: /\b(TUESDAY?|TUES|TUE)\b/i },
    { day: Day.WEDNESDAY, regex: /\b(WEDNESDAY?|WED|weanesany)\b/i },
    { day: Day.THURSDAY, regex: /\b(THURSDAY?|THUR|THU)\b/i },
    { day: Day.FRIDAY, regex: /\b(FRIDAY?|FRI|migy|tasty)\b/i },
  ];

  for (const p of fuzzyPatterns) {
    const match = line.match(p.regex);
    if (match && match.index !== undefined && match.index < 10) {
      const cleanLine = (line.slice(0, match.index) + line.slice(match.index + match[0].length)).trim();
      return { day: p.day, cleanLine };
    }
  }

  return null;
}

function isCourseHeader(line: string): boolean {
  const clean = line.toUpperCase();
  const hasCode = /CODE|COGE|CODA|COGA|COWNE|COMME|COUNS|COUNE/i.test(clean);
  const hasName = /NAME|MAME|NEME|NAM|TITLE/i.test(clean);
  const hasCredit = /CREDIT|CREA|CREAT|CRED/i.test(clean);
  const hasTeacher = /TEACHER|TEWCHER|WEWHER|TEWHWR|TECHE|TECH/i.test(clean);
  
  let score = 0;
  if (hasCode) score++;
  if (hasName) score++;
  if (hasCredit) score++;
  if (hasTeacher) score++;
  
  return score >= 2 || /course\s+list|list\s+of\s+course|course\s+code|course\s+title/i.test(line);
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function splitBlockByAbbreviations(block: string, abbreviations: string[]): string[] {
  const result: string[] = [];
  let remaining = block.trim();

  const validAbbrs = abbreviations.filter(a => a.trim().length >= 2);

  while (remaining.length > 0) {
    let found = false;
    const sortedAbbrs = [...validAbbrs].sort((a, b) => b.length - a.length);

    for (const abbr of sortedAbbrs) {
      const regex = new RegExp('^(' + escapeRegExp(abbr) + ')\\b', 'i');
      const match = remaining.match(regex);
      
      if (match) {
        if (match[0].length === 0) {
          // Safeguard against infinite loop
          break;
        }
        let nextAbbrIndex = remaining.length;
        
        for (const nextAbbr of sortedAbbrs) {
          const nextRegex = new RegExp('\\b' + escapeRegExp(nextAbbr) + '\\b', 'i');
          const nextMatch = remaining.slice(match[0].length).match(nextRegex);
          if (nextMatch && nextMatch.index !== undefined) {
            const indexInRemaining = match[0].length + nextMatch.index;
            if (indexInRemaining < nextAbbrIndex) {
              nextAbbrIndex = indexInRemaining;
            }
          }
        }

        const cellText = remaining.slice(0, nextAbbrIndex).trim();
        result.push(cellText);
        remaining = remaining.slice(nextAbbrIndex).trim();
        found = true;
        break;
      }
    }

    if (!found) {
      const firstSpace = remaining.indexOf(' ');
      if (firstSpace !== -1) {
        result.push(remaining.slice(0, firstSpace).trim());
        remaining = remaining.slice(firstSpace).trim();
      } else {
        result.push(remaining);
        remaining = '';
      }
    }
  }

  return result.filter(Boolean);
}

// ─── Cell parser ─────────────────────────────────────────────────────────────

function cleanCellText(text: string): string {
  let cleaned = text.trim();
  
  if (!cleaned) return 'FREE';

  // Replace known noise/garbage with empty string (which parses as free/empty cell)
  if (/^(FREE|BREAK|LUNCH|-|LUN|BRE|TYREE|owen|\[roe|\[ween|onday|Thursda|Dept|pays|pase|Online|\(Online|5-233|1:5-235|SXCLleH|“per|iGargy|rene|keen\))$/i.test(cleaned)) {
    return 'FREE';
  }
  
  if (/NCC|NSS|\bPT\b|Games|Creative|Sports|CONES/i.test(cleaned)) {
    return 'FREE';
  }

  if (/r\[33Cs-1@2/gi.test(cleaned)) {
    cleaned = 'CS-11 (219)';
  }

  // Group and Course name fixes
  cleaned = cleaned.replace(/\(Gat/gi, '(G2)');
  cleaned = cleaned.replace(/\(G2\//gi, '(G2)');
  cleaned = cleaned.replace(/CoG\)/gi, '(G3)');
  cleaned = cleaned.replace(/\bAMIS\b/gi, 'AIML');

  // Course abbreviation normalizations
  cleaned = cleaned.replace(/\bOMAN\b/gi, 'DBMS');
  cleaned = cleaned.replace(/\bOAN\b/gi, 'DAA');
  cleaned = cleaned.replace(/\bOWSAN\b/gi, 'OS');
  cleaned = cleaned.replace(/\bepg\b\)?/gi, 'CD');
  cleaned = cleaned.replace(/\bolLZ\b/gi, 'Col');
  cleaned = cleaned.replace(/\b1S\b/gi, 'CNS');
  cleaned = cleaned.replace(/\b1AI\b/gi, 'AI');
  cleaned = cleaned.replace(/\bDEON\b/gi, 'DCCN');
  cleaned = cleaned.replace(/\bFMOB\b/gi, 'FMOB');
  cleaned = cleaned.replace(/\b1A1\(G2\)/gi, 'AI (G2)');
  cleaned = cleaned.replace(/\b1AIQ216\b/gi, 'AI (216)');
  
  // Room and parenthesis normalizations
  cleaned = cleaned.replace(/21972200/g, '(219/220)');
  cleaned = cleaned.replace(/2197220/g, '(219/220)');
  cleaned = cleaned.replace(/219\/722/g, '(219/220)');
  cleaned = cleaned.replace(/E197220/g, '(219/220)');
  cleaned = cleaned.replace(/OLEI6/g, '(216)');
  cleaned = cleaned.replace(/paaiea\)/g, '(216)');
  cleaned = cleaned.replace(/EC@I6A\)/g, 'EC (216A)');
  cleaned = cleaned.replace(/0SQ216A\)/g, 'OS (216A)');
  cleaned = cleaned.replace(/1AIQ216\s*A\)/gi, 'AI (216A)');
  cleaned = cleaned.replace(/1AI\(216A\)/gi, 'AI (216A)');
  cleaned = cleaned.replace(/\b214\)/g, '(214)');
  cleaned = cleaned.replace(/\b11219\)/g, '(219)');
  cleaned = cleaned.replace(/\bAcA@14\)/gi, 'ACA (214)');
  cleaned = cleaned.replace(/\bSE@14\)/gi, 'SE (214)');
  cleaned = cleaned.replace(/C00\)/g, '(220)');

  // Safe room parenthesization
  cleaned = cleaned.replace(/\(?\b(213|214|216|216\s*A|216A|219|220|235|Lab\s*\d+|ILF)\b\)?/gi, '($1)');

  if (/^D\d{3}$/i.test(cleaned)) {
    cleaned = 'CD (' + cleaned.slice(1) + ')';
  }
  
  cleaned = cleaned.replace(/\b(CD|CNS|AIML|DBMS|FLAT|NM|OS|Col|DAA|IKS|DCCN|SE|FMOB|DL|RL|EC|MAI|DAI|BCT)\s*(\d{3})\b/gi, '$1 ($2)');

  // Normalize Open Electives
  cleaned = cleaned.replace(/\b(OE-1|OE\s*I{1,3}|OE-I{1,3}|OE)\b/gi, 'OE');

  return cleaned;
}

function isHeaderOrTimingsLine(line: string): boolean {
  const clean = line.toUpperCase();
  if (/BIRLA INSTITUTE|RANCHI|TIME TABLE|w\.e\.f\.|wef:/i.test(clean)) {
    return true;
  }
  if (/\b(Days|pays|bap|pp|Period|Subject|Room|Time)\b/i.test(clean) || /Period\/Time/i.test(clean)) {
    return true;
  }
  if (/\d{2}:\d{2}/.test(line) || 
      /osonosso|ovonanso|wanroso|imovtis|rzonizs/i.test(clean) ||
      /\b(00420|1301520|15301620|1630-1720)\b/.test(clean)) {
    return true;
  }
  return false;
}

function parseCell(rawText: string, courseAbbrMap: Map<string, string>): ParsedTimetableCell {
  const cleanedText = cleanCellText(rawText);
  const text = cleanedText.trim();

  if (!text || /^(FREE|BREAK|LUNCH|-|LUN|BRE)$/i.test(text) || text.length < 2) {
    return { courseCode: null, roomId: null, facultyInitials: null, rawText: rawText, isParsed: true, isLab: false, isFree: true };
  }

  const isRoomOnly = /^\d{3,4}$|^\([^)]+\)$|^(Lab\s*\d+|ILF|LF|LH\s*\d+|Lab)$/i.test(text) || /^\d{3}\s*[A-Z]+$/i.test(text);
  if (isRoomOnly) {
    const cleanRoomId = text.replace(/[()]/g, '').trim();
    return {
      courseCode: null,
      roomId: cleanRoomId,
      facultyInitials: null,
      rawText: rawText,
      isParsed: true,
      isLab: /lab/i.test(text),
      isFree: false,
    };
  }

  let subject = text;
  let roomId: string | null = null;
  let isLab = /lab/i.test(text);

  const bracketMatch = text.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (bracketMatch) {
    subject = bracketMatch[1].trim();
    roomId = bracketMatch[2].trim();
  } else {
    const slashMatch = text.match(/^(.+?)\s*[\/\\]\s*(.+)$/);
    if (slashMatch) {
      subject = slashMatch[1].trim();
      roomId = slashMatch[2].trim();
    }
  }

  const cleanSubject = subject.replace(/[^a-zA-Z0-9\s]/g, '').trim().toUpperCase();
  let courseCode = courseAbbrMap.get(cleanSubject) || null;

  if (!courseCode) {
    for (const [abbr, code] of courseAbbrMap.entries()) {
      if (cleanSubject.includes(abbr) || abbr.includes(cleanSubject)) {
        courseCode = code;
        break;
      }
    }
  }

  if (courseCode) {
    return {
      courseCode,
      roomId,
      facultyInitials: null,
      rawText: rawText,
      isParsed: true,
      isLab,
      isFree: false,
    };
  }

  if (/^[A-Z]{2,5}\d{3,4}/i.test(cleanSubject)) {
    return {
      courseCode: cleanSubject,
      roomId,
      facultyInitials: null,
      rawText: rawText,
      isParsed: true,
      isLab,
      isFree: false,
    };
  }

  const isGarbage = !roomId && (
    text.length <= 3 || 
    /^[^\w]+$/.test(text) || 
    /^(vn|ob|ie|un|ov|vt|ix|iv|ii|iii|vi|vii|viii|x)$/i.test(text)
  );

  if (isGarbage) {
    return {
      courseCode: null,
      roomId: null,
      facultyInitials: null,
      rawText: rawText,
      isParsed: true,
      isLab: false,
      isFree: true,
    };
  }

  return { courseCode: null, roomId, facultyInitials: null, rawText: rawText, isParsed: false, isLab, isFree: false };
}

// ─── Course list parser ───────────────────────────────────────────────────────

function parseCourseLine(line: string): ParsedCourse | null {
  const cleanedLine = line.trim().replace(/^\[|\]$/g, '').trim();
  if (cleanedLine.length < 5) return null;

  if (/\bco-?ordinator\b|\bdean\b|\bhod\b|\bbit\s+mesra\b|===\s+page|time\s*table|prakash|sarkhel|gautam|\bwef\b|\bdate\b|total\s+credit/i.test(cleanedLine)) {
    return null;
  }
  
  const firstWord = cleanedLine.split(/\s+/)[0] || '';
  let code = '';
  let rest = cleanedLine;

  const isCodeCandidate = 
    /^[A-Z€$]{1,4}\d{3,5}/i.test(firstWord) || 
    /^\d{5,6}$/.test(firstWord) ||
    /^(COSAS|COSA|CWAEOR|ESAS|C5333|C8335|T1349|11353|824219|524213|C2205|C5|C8|T1|11|J5|JS|CO)$/i.test(firstWord);

  if (isCodeCandidate) {
    code = normalizeCourseCode(firstWord);
    rest = cleanedLine.slice(firstWord.length).trim();
  } else {
    // If the code is not a standard code candidate, we fall back to TEMP_ codes.
    // Let's filter out lines that don't look like course lines to avoid parsing signature/garbage footers.
    // A course line must contain either a known coordinator title or a known abbreviation in parentheses.
    const hasAbbr = cleanedLine.match(/\((CNS|AIML|BCT|Col|DCCN|DMT|ToC|SE|FMOB|DL|MOT|DAI|RL|EC|MAT|DBMS|OS|FLAT|NM|IKS|AP|SK)\)/i);
    const hasCoordTitle = /\b(Dr|Prof|Mr|Mrs|Ms|brs|tbr|br|or)\b\.?\s+/i.test(cleanedLine);
    if (!hasAbbr && !hasCoordTitle) {
      return null;
    }

    const abbrMatch = cleanedLine.match(/\((CNS|AIML|BCT|Col|DCCN|DMT|ToC|SE|FMOB|DL|MOT|DAI|RL|EC|MAT|DBMS|OS|FLAT|NM|IKS|AP|SK)\)/i);
    if (abbrMatch) {
      code = 'TEMP_' + abbrMatch[1].toUpperCase();
    } else {
      code = 'TEMP_' + firstWord.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    }
  }

  // Pre-process rest: remove leading pipes, spaces and course type
  rest = rest.replace(/^[\s|]+/, '');
  rest = rest.replace(/^\s*\[?\s*(?:CORE|COE|COP|CAE|PE|OE|GE|AE|BREADTH|ELECTIVE|THEORY|LAB|SESSIONAL)\b\s*[|\]–-]?\s*/i, '').trim();

  let name = '';
  let credits = 3;
  let coordinator = '';

  // Try to split using splitCreditsMatch first
  const splitCreditsMatch = rest.match(/^(.*?)\s*(?:[\[\|]?\s*(\b\d(?:\.\d)?\b)\s*[\]\|]?)\s*(.+)$/);
  if (splitCreditsMatch) {
    name = splitCreditsMatch[1].trim();
    credits = parseFloat(splitCreditsMatch[2]);
    coordinator = splitCreditsMatch[3].trim();
  } else {
    // Fallback if no credit split matches
    const parts = rest.split(/\||\t|\s{2,}/).map(p => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      name = parts[0] || '';
      if (parts.length > 1) {
        coordinator = parts[parts.length - 1];
      }
    }
    const creditsMatch = rest.match(/\b(\d(\.\d)?)\b/);
    if (creditsMatch) {
      credits = parseFloat(creditsMatch[1]);
    } else if (/\bNC\b/i.test(rest)) {
      credits = 0;
    }
  }

  // If there's a title in the coordinator or rest, we can refine coordinator/name
  const coordMatch = rest.match(/\b(Dr|Prof|Mr|Mrs|Ms|brs|tbr|br|or)\b\.?\s+(.+)$/i);
  if (coordMatch) {
    coordinator = coordMatch[0].trim();
    name = rest.slice(0, coordMatch.index).trim();
  }

  // Clean trailing spaces and credit numbers from name
  name = name.replace(/\s+[\d\.\/\+]+$/, '').trim();
  // Remove leading/trailing non-alphanumeric chars from name and coordinator
  name = name.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9\s)]+$/, '').trim();
  coordinator = coordinator.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9\s\.]+$/, '').trim();
  coordinator = coordinator.replace(/^brs\./i, 'Dr.').replace(/^tewhwr/i, '').trim();

  // If coordinator is same as name or too short, ignore it
  const cleanCompare = (str: string) => str.replace(/[^A-Z]/ig, '').toLowerCase();
  if (cleanCompare(coordinator) === cleanCompare(name) || coordinator.length < 3) {
    coordinator = '';
  }

  const ltp = '3-0-0';
  const ltpParts = ltp.split('-').map(Number);
  const labHours = ltpParts[2] ?? 0;
  const type: CourseType = labHours >= 2 || /lab/i.test(name) ? CourseType.LAB : CourseType.LECTURE;

  return { code, name, credits, type, ltp, coordinator };
}

// ─── Dummy Faculty list parser ───────────────────────────────────────────────

function parseFacultyLine(line: string): ParsedFaculty | null {
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

  logger.info('Starting PDF parse', { filePath });
  onProgress?.(5, 'Initializing PDF parser...');

  let allText = '';
  let parser: PDFParse | null = null;

  try {
    const fileBuffer = fs.readFileSync(filePath);
    parser = new PDFParse({ data: new Uint8Array(fileBuffer), verbosity: 0 });
    const numPages = parser.progress.total || 13;

    onProgress?.(10, `PDF loaded. Checking for text layer...`);
    
    const textResult = await parser.getText();
    const cleanText = textResult.text.replace(/-- \d+ of \d+ --|\s/g, '');
    const hasText = cleanText.length > 100;

    if (!hasText) {
      logger.info('PDF appears scanned (no text layer found). Running OCR...');
      onProgress?.(15, 'PDF is scanned. Initializing OCR engine...');
      
      const worker = await createWorker('eng');
      try {
        for (let p = 1; p <= numPages; p++) {
          const percent = 15 + Math.floor((p / numPages) * 50);
          onProgress?.(percent, `OCR: Parsing page ${p}/${numPages}...`);
          
          const screenshotResult = await parser.getScreenshot({
            first: p,
            last: p,
            scale: 2.0
          });
          
          const pageScreenshot = screenshotResult.pages[0];
          if (pageScreenshot) {
            const { data: { text } } = await worker.recognize(Buffer.from(pageScreenshot.data));
            allText += `\n=== PAGE ${p} ===\n${text}`;
          }
        }
      } finally {
        await worker.terminate();
      }
    } else {
      onProgress?.(40, 'Text layer found. Extracting data directly...');
      for (let p = 1; p <= numPages; p++) {
        const pageTextResult = await parser.getText({ first: p, last: p });
        allText += `\n=== PAGE ${p} ===\n${pageTextResult.text}`;
      }
    }
  } catch (pdfError) {
    logger.error('PDF parsing/OCR failed', { error: pdfError });
    throw pdfError;
  } finally {
    if (parser) {
      await parser.destroy();
    }
  }

  result.rawText = allText;

  // ─── Parse the text ──────────────────────────────────────────────────────────
  onProgress?.(70, 'Parsing timetable structure...');

  const lines = allText.split('\n').map((l) => l.trim()).filter(Boolean);

  // Extract department name from header
  for (const line of lines.slice(0, 40)) {
    if (line.includes('HoD') || line.includes('Dean') || line.includes('Co-ordinator') || line.includes('wef:')) continue;

    const deptMatch = line.match(/^\s*\[?Department\s*[:\]\s]*\s*([A-Z]{2,6})/i);
    if (deptMatch) {
      let dept = deptMatch[1].trim();
      if (dept.startsWith('J') && dept.length > 3) {
        dept = dept.slice(1);
      }
      result.departmentName = dept;
      break;
    }

    const deptOfMatch = line.match(/^\s*Department\s+of\s+(.+)$/i);
    if (deptOfMatch) {
      result.departmentName = deptOfMatch[1].trim();
      break;
    }
  }
  if (!result.departmentName) {
    result.departmentName = 'CSE';
  }

  // Extract session info
  const sessionMatch = lines.join(' ').match(/(?:Spring|Autumn|Winter|Summer)\s+\d{4}/i);
  if (sessionMatch) result.session = sessionMatch[0];

  // ─── Pass 1: Extract Courses & Faculty ───
  let inCourseSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isCourseHeader(line)) {
      inCourseSection = true;
      continue;
    }
    if (inCourseSection && (/co-ordinator|dean|hod|bit\s+mesra|===\s+page/i.test(line))) {
      inCourseSection = false;
      continue;
    }

    if (inCourseSection) {
      const pc = parseCourseLine(line);
      if (pc) {
        if (!result.courses.some(c => c.code === pc.code)) {
          result.courses.push(pc);
        }
        const extractedFaculty = extractFacultyFromTeacherString(pc.coordinator);
        for (const f of extractedFaculty) {
          if (!result.faculty.some(fac => fac.initials === f.initials)) {
            result.faculty.push(f);
          }
        }
      }
    }
  }

  // Build abbreviation map for Pass 2 cell matching
  const courseAbbrMap = new Map<string, string>();
  const setAbbr = (key: string, val: string) => {
    const k = key.trim().toUpperCase();
    if (k.length >= 2) {
      courseAbbrMap.set(k, val);
    }
  };

  for (const course of result.courses) {
    const bracketMatch = course.name.match(/\(([^)]+)\)/);
    if (bracketMatch) {
      setAbbr(bracketMatch[1], course.code);
    }
    const cleanName = course.name.replace(/\([^\)]+\)/g, '').replace(/[^a-zA-Z0-9\s]/g, '').trim().toUpperCase();
    setAbbr(cleanName, course.code);

    const words = cleanName.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      const initials = words.map(w => w[0]).join('');
      setAbbr(initials, course.code);
    }
    setAbbr(course.code, course.code);
  }

  // Add standard fallback mappings
  // Add standard fallback mappings
  setAbbr('DBMS', 'CS24211');
  setAbbr('DBMS LAB', 'CS24212');
  setAbbr('FLAT', 'CS24219');
  setAbbr('NM', 'MA24201');
  setAbbr('NM LAB', 'MA24202');
  setAbbr('IKS', 'HS24211');
  setAbbr('COL', 'HS24211');
  setAbbr('DAA', 'CS24213');
  setAbbr('OS', 'CS2205');
  setAbbr('CS-11', 'MT133');
  setAbbr('CS11', 'MT133');
  setAbbr('CS - 11', 'MT133');
  setAbbr('OE', 'OE');
  setAbbr('ITT&T', 'ITT&T');
  setAbbr('ITTT', 'ITT&T');
  setAbbr('FMOB', 'FMOB');
  setAbbr('ACA', 'ACA');
  setAbbr('DCCN', 'DCCN');
  setAbbr('AI', 'AI24211');
  setAbbr('1AI', 'AI24211');
  setAbbr('1A1', 'AI24211');
  setAbbr('SE', 'SE');
  setAbbr('TOC', 'TOC');
  setAbbr('ToC', 'TOC');
  setAbbr('LUNCH', 'FREE');
  setAbbr('BREAK', 'FREE');
  setAbbr('FREE', 'FREE');
  setAbbr('LC]', 'FREE');
  setAbbr('LC', 'FREE');

  // Post-process: merge temp course codes with real ones if names match
  const realCourses = result.courses.filter(c => !c.code.startsWith('TEMP_'));
  const tempCourses = result.courses.filter(c => c.code.startsWith('TEMP_'));
  const finalCourses: ParsedCourse[] = [...realCourses];

  for (const tc of tempCourses) {
    const tcAbbr = tc.code.replace('TEMP_', '');
    const match = realCourses.find(rc => {
      const rcNameUpper = rc.name.toUpperCase();
      const tcNameUpper = tc.name.toUpperCase();
      return rcNameUpper.includes(tcAbbr) || rcNameUpper.includes(tcNameUpper) || tcNameUpper.includes(rcNameUpper);
    });

    if (match) {
      setAbbr(tc.code, match.code);
      setAbbr(tcAbbr, match.code);
      if (!match.coordinator && tc.coordinator) {
        match.coordinator = tc.coordinator;
      }
    } else {
      tc.code = 'CS_' + tcAbbr;
      finalCourses.push(tc);
      setAbbr(tcAbbr, tc.code);
    }
  }
  result.courses = finalCourses;

  const courseAbbreviations = Array.from(courseAbbrMap.keys());

  // ─── Pass 2: Parse Timetable Slots ───
  let currentSection: string | null = null;
  let currentDay: Day | null = null;
  let timetableRowIndex = 0;
  const periodHeaders: Period[] = [];
  let inTimetableSection = false;
  let seenTimeHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isCourseHeader(line) || /co-ordinator|dean|hod|bit\s+mesra|===\s+page|prakash|sarkhel|gautam|prem/i.test(line)) {
      inTimetableSection = false;
      seenTimeHeader = false;
      currentSection = null;
      currentDay = null;
      timetableRowIndex = 0;
      periodHeaders.length = 0;
      continue;
    }

    if (/\b(Days|Period|Subject|Room)\b/i.test(line) || /Period\/Time/i.test(line) || /\d{2}:\d{2}/.test(line)) {
      seenTimeHeader = true;
      inTimetableSection = true;
      continue;
    }

    if (/^(I{1,3}V?|IV|VI?I?I?|IX)\s+(I{1,3}V?|IV|VI?I?I?|IX)/.test(line) || /^Period\s+I/i.test(line)) {
      seenTimeHeader = true;
      inTimetableSection = true;
      periodHeaders.length = 0;
      const periodMatches = line.matchAll(/\b(I{1,3}V?|IV|VI?I?I?|IX)\b/g);
      for (const m of periodMatches) {
        const p = PERIOD_MAP[m[0]];
        if (p) periodHeaders.push(p);
      }
      continue;
    }

    if (inTimetableSection && periodHeaders.length === 0) {
      periodHeaders.push(Period.I, Period.II, Period.III, Period.IV, Period.V, Period.VI, Period.VII, Period.VIII, Period.IX);
    }

    const dayInfo = detectDayInLine(line);
    const sectionInfo = normalizeSectionName(line);

    if (!dayInfo && !sectionInfo && isHeaderOrTimingsLine(line)) {
      continue;
    }

    let cellLine = line;
    if (dayInfo) {
      currentDay = dayInfo.day;
      timetableRowIndex = ALL_DAYS.indexOf(dayInfo.day) + 1;
      cellLine = dayInfo.cleanLine;
      inTimetableSection = true;
      seenTimeHeader = true;
    }

    if (sectionInfo) {
      const romanMap: Record<number, string> = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII' };
      const semRoman = romanMap[sectionInfo.semester] || String(sectionInfo.semester);
      const cleanSectionName = `${sectionInfo.branch}-${semRoman}-${sectionInfo.section}`;

      currentSection = cleanSectionName;
      currentDay = null;
      timetableRowIndex = 0;
      seenTimeHeader = false;
      inTimetableSection = false;
      const existingRow = result.rows.find((r) => r.section === currentSection);
      if (!existingRow) {
        result.rows.push({
          section: currentSection,
          semester: sectionInfo.semester,
          branch: sectionInfo.branch,
          slots: new Map(),
        });
      }
      continue;
    }

    if (inTimetableSection && seenTimeHeader && currentSection && cellLine.trim().length > 3) {
      let dayToUse = currentDay;
      if (!dayToUse) {
        if (timetableRowIndex < ALL_DAYS.length) {
          dayToUse = ALL_DAYS[timetableRowIndex];
          timetableRowIndex++;
        }
      }

      if (dayToUse) {
        const rawBlocks = cellLine.split(/\||\t|\s{2,}/).map(b => b.trim()).filter(Boolean);
        
        const cells: string[] = [];
        for (const block of rawBlocks) {
          const splitSubBlocks = splitBlockByAbbreviations(block, courseAbbreviations);
          cells.push(...splitSubBlocks);
        }

        if (cells.length > 0) {
          const rowEntry = result.rows.find((r) => r.section === currentSection);
          if (rowEntry) {
            let hasCourse = false;
            cells.forEach((cellText, idx) => {
              const period = periodHeaders[idx];
              if (!period) return;

              const key = `${dayToUse}_${period}` as `${Day}_${Period}`;
              const parsedCell = parseCell(cellText, courseAbbrMap);

              if (parsedCell.courseCode) {
                hasCourse = true;
              }

              if (!parsedCell.isParsed && !parsedCell.isFree) {
                parseFailures.push({
                  location: `Page/Section ${currentSection}, Day ${dayToUse}, Period ${period}`,
                  reason: 'Could not parse cell format',
                  rawContent: cellText,
                });
              }

              const existingSlot = rowEntry.slots.get(key);
              if (!existingSlot || existingSlot.isFree) {
                rowEntry.slots.set(key, parsedCell);
              } else {
                if (parsedCell.courseCode && !existingSlot.courseCode) {
                  existingSlot.courseCode = parsedCell.courseCode;
                  existingSlot.isParsed = true;
                  existingSlot.isFree = false;
                }
                if (parsedCell.roomId && !existingSlot.roomId) {
                  existingSlot.roomId = parsedCell.roomId;
                }
                if (parsedCell.isLab) {
                  existingSlot.isLab = true;
                }
              }
            });

            if (hasCourse) {
              currentDay = null;
            }
          }
        }
      }
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
