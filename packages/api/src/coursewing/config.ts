export function isCourseWingEnabled(): boolean {
  return process.env.COURSEWING_ENABLED === 'true';
}

export function getCanvasServiceUrl(): string {
  const url = process.env.COURSEWING_CANVAS_SERVICE_URL ?? 'http://localhost:3333';
  return url.replace(/\/+$/, '');
}

export function getCanvasServiceKey(): string {
  const key = process.env.COURSEWING_SERVICE_KEY?.trim();
  if (!key) {
    throw new Error('COURSEWING_SERVICE_KEY is required for Canvas service requests');
  }
  return key;
}

export function getCourseWingTimezone(): string {
  return process.env.COURSEWING_TIMEZONE ?? 'America/Los_Angeles';
}

/** Formats a date in the CourseWing timezone; `null` for missing/unparseable input. */
export function formatCourseWingDate(
  date: Date | string | null | undefined,
  options?: { withTime?: boolean; withYear?: boolean },
): string | null {
  if (date == null) {
    return null;
  }

  const timestamp = typeof date === 'string' ? Date.parse(date) : date.getTime();
  if (!Number.isFinite(timestamp)) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: getCourseWingTimezone(),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(options?.withYear ? { year: 'numeric' } : {}),
    ...(options?.withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(timestamp));
}

/** Demo/testing override: `COURSEWING_FAKE_NOW` makes the course card pretend "today" is that instant. */
export function getCourseWingNow(): Date {
  const raw = process.env.COURSEWING_FAKE_NOW?.trim();
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}
