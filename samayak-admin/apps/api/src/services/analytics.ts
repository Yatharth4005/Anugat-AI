import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import {
  AnalyticsDashboard, Day, Period, PERIOD_TIMES,
  RoomUtilisation, SlotAvailability, UnderRunningCourse
} from '@samayak/types';

const CACHE_KEY = 'analytics:dashboard';
const CACHE_TTL_SECONDS = 60; // 1 minute

const ALL_DAYS = Object.values(Day);
const ALL_PERIODS = Object.values(Period);
const TOTAL_SLOTS_PER_ROOM = ALL_DAYS.length * ALL_PERIODS.length; // 5 × 9 = 45
const SLOT_DURATION_HOURS = 50 / 60; // 50 minutes in hours

export async function invalidateAnalyticsCache(): Promise<void> {
  await redis.del(CACHE_KEY);
  logger.info('Analytics cache invalidated');
}

export async function computeAnalytics(): Promise<AnalyticsDashboard> {
  logger.info('Computing analytics from database...');

  // ─── Room Utilisation ────────────────────────────────────────────────────────
  const rooms = await prisma.room.findMany({
    where: { status: 'ACTIVE' },
    include: {
      timetableSlots: {
        select: { day: true, period: true },
      },
    },
  });

  const roomUtilisations: RoomUtilisation[] = rooms.map((room) => {
    const occupiedSlots = room.timetableSlots.length;
    const utilisationPct = TOTAL_SLOTS_PER_ROOM > 0
      ? (occupiedSlots / TOTAL_SLOTS_PER_ROOM) * 100
      : 0;
    return {
      roomId: room.id,
      roomNumber: room.number,
      roomType: room.type,
      occupiedSlots,
      totalSlots: TOTAL_SLOTS_PER_ROOM,
      utilisationPct: Math.round(utilisationPct * 100) / 100,
    };
  });

  const totalRooms = rooms.length;
  const overallUtilisationPct = totalRooms > 0
    ? roomUtilisations.reduce((sum, r) => sum + r.utilisationPct, 0) / totalRooms
    : 0;

  // ─── P(Empty Room | Slot) ─────────────────────────────────────────────────
  const slotAvailabilities: SlotAvailability[] = [];

  for (const day of ALL_DAYS) {
    for (const period of ALL_PERIODS) {
      const occupiedRoomIds = await prisma.timetableSlot.findMany({
        where: { day, period, roomId: { not: null } },
        select: { roomId: true },
      });

      const uniqueOccupied = new Set(occupiedRoomIds.map((s) => s.roomId)).size;
      const freeRooms = totalRooms - uniqueOccupied;
      const probability = totalRooms > 0 ? freeRooms / totalRooms : 0;

      slotAvailabilities.push({
        period,
        day,
        freeRooms,
        totalRooms,
        probability: Math.round(probability * 1000) / 1000,
      });
    }
  }

  // ─── Under-Running Courses ────────────────────────────────────────────────
  const courses = await prisma.course.findMany({
    where: { status: 'ACTIVE' },
    include: {
      branch: { select: { name: true, semester: true } },
      timetableSlots: { select: { id: true } },
    },
  });

  const underRunningCourses: UnderRunningCourse[] = [];

  for (const course of courses) {
    // Required slots per week = credits for lectures/tutorials
    // For labs: credit hours are usually 2 per lab session, labs counted differently
    const requiredSlots = course.type === 'LAB'
      ? Math.ceil(course.credits / 2) * 3 // labs span 3 periods
      : Math.ceil(course.credits); // 1 slot per credit hour per week

    const scheduledSlots = course.timetableSlots.length;
    const gap = requiredSlots - scheduledSlots;

    if (gap > 0 && course.credits > 0) {
      underRunningCourses.push({
        courseId: course.id,
        courseCode: course.code,
        courseName: course.name,
        credits: course.credits,
        scheduledSlots,
        requiredSlots,
        gap,
        branchName: course.branch.name,
        semester: course.branch.semester,
      });
    }
  }

  underRunningCourses.sort((a, b) => b.gap - a.gap);

  // ─── Avg Empty Room-Hours per Day ─────────────────────────────────────────
  let totalEmptyRoomHours = 0;

  if (totalRooms > 0) {
    for (const room of rooms) {
      const occupiedPerDay = new Map<Day, number>();
      for (const day of ALL_DAYS) occupiedPerDay.set(day, 0);

      for (const slot of room.timetableSlots) {
        occupiedPerDay.set(slot.day, (occupiedPerDay.get(slot.day) ?? 0) + 1);
      }

      let roomEmptyHours = 0;
      for (const [, occupied] of occupiedPerDay) {
        const emptySlots = ALL_PERIODS.length - occupied;
        roomEmptyHours += emptySlots * SLOT_DURATION_HOURS;
      }
      totalEmptyRoomHours += roomEmptyHours / ALL_DAYS.length; // avg per day for this room
    }
  }

  const avgEmptyRoomHoursPerDay = totalRooms > 0 ? totalEmptyRoomHours / totalRooms : 0;

  const dashboard: AnalyticsDashboard = {
    overallUtilisationPct: Math.round(overallUtilisationPct * 100) / 100,
    roomUtilisations,
    slotAvailabilities,
    underRunningCourses,
    avgEmptyRoomHoursPerDay: Math.round(avgEmptyRoomHoursPerDay * 100) / 100,
    computedAt: new Date().toISOString(),
  };

  // Cache the result
  await redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(dashboard));

  return dashboard;
}

export async function getDashboardAnalytics(): Promise<AnalyticsDashboard> {
  // Try cache first
  const cached = await redis.get(CACHE_KEY);
  if (cached) {
    logger.info('Analytics served from cache');
    return JSON.parse(cached) as AnalyticsDashboard;
  }

  return computeAnalytics();
}
