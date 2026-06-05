import { parsePdfTimetable } from './services/pdfParser';
import * as fs from 'fs';

// Let's copy parseCourseLine from pdfParser.ts so we can debug it
import { Day, Period, CourseType, RoomType, ParsedCourse } from '@samayak/types';

function normalizeCourseCode(raw: string): string {
  let cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9€$]/g, '');
  cleaned = cleaned.replace(/^€S/, 'CS');
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
  if (/^\d{6}$/.test(cleaned) && cleaned.startsWith('524')) {
    cleaned = 'CS' + cleaned.slice(1);
  }
  if (/^\d{5,6}$/.test(cleaned)) {
    cleaned = 'CS' + cleaned;
  }
  return cleaned;
}

function parseCourseLineDebug(line: string): ParsedCourse | null {
  const cleanedLine = line.trim().replace(/^\[|\]$/g, '').trim();
  if (cleanedLine.length < 5) return null;
  
  const firstWord = cleanedLine.split(/\s+/)[0] || '';
  let code = '';
  let rest = cleanedLine;

  const isCodeCandidate = 
    /^[A-Z€$]{1,4}\d{3,5}/i.test(firstWord) || 
    /^\d{5,6}$/.test(firstWord) ||
    /^(COSAS|COSA|CWAEOR|ESAS|C5333|C8335|T1349|11353|824219|524213|C2205|C5|C8|T1|11|J5|JS|CO)$/i.test(firstWord);

  console.log(`Debug line: "${line}"`);
  console.log(`  firstWord: "${firstWord}"`);
  console.log(`  isCodeCandidate: ${isCodeCandidate}`);

  if (isCodeCandidate) {
    code = normalizeCourseCode(firstWord);
    rest = cleanedLine.slice(firstWord.length).trim();
  } else {
    const abbrMatch = cleanedLine.match(/\((CNS|AIML|BCT|Col|DCCN|DMT|ToC|SE|FMOB|DL|MOT|DAI|RL|EC|MAT|DBMS|OS|FLAT|NM|IKS|AP|SK)\)/i);
    if (abbrMatch) {
      code = 'TEMP_' + abbrMatch[1].toUpperCase();
    } else {
      code = 'TEMP_' + firstWord.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    }
  }

  const parts = rest.split(/\||\t|\s{2,}/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let name = parts[0] || '';
  name = name.replace(/\s+[\d\.\/\+]+$/, '').trim();

  let credits = 3;
  let ltp = '3-0-0';
  let coordinator = '';

  const creditsMatch = rest.match(/\b(\d(\.\d)?)\b/);
  if (creditsMatch) {
    credits = parseFloat(creditsMatch[1]);
  }

  const coordMatch = rest.match(/\b(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.|Dr|Prof)\b.+$/i);
  if (coordMatch) {
    coordinator = coordMatch[0].trim();
    name = rest.slice(0, coordMatch.index).trim();
  } else {
    const lastPipeIdx = rest.lastIndexOf('|');
    if (lastPipeIdx !== -1) {
      coordinator = rest.slice(lastPipeIdx + 1).trim();
    } else {
      coordinator = parts[parts.length - 1] || '';
    }
  }

  return { code, name, credits, type: CourseType.LECTURE, ltp, coordinator };
}

const testLine = "Antiticial Intelligence and Machine Learning (AIML) Dr. Sunchita Paul";
const res = parseCourseLineDebug(testLine);
console.log("Result:", res);
