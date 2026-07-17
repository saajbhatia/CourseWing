export function isLearnLightEnabled(): boolean {
  return process.env.LEARNLIGHT_ENABLED === 'true';
}

export function getCanvasServiceUrl(): string {
  const url = process.env.LEARNLIGHT_CANVAS_SERVICE_URL ?? 'http://localhost:3333';
  return url.replace(/\/+$/, '');
}

export function getCanvasServiceKey(): string {
  const key = process.env.LEARNLIGHT_SERVICE_KEY?.trim();
  if (!key) {
    throw new Error('LEARNLIGHT_SERVICE_KEY is required for Canvas service requests');
  }
  return key;
}

export function getLearnLightTimezone(): string {
  return process.env.LEARNLIGHT_TIMEZONE ?? 'America/Los_Angeles';
}

/** Formats a date in the LearnLight timezone; `null` for missing/unparseable input. */
export function formatLearnLightDate(
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
    timeZone: getLearnLightTimezone(),
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(options?.withYear ? { year: 'numeric' } : {}),
    ...(options?.withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(timestamp));
}

/** Demo/testing override: `LEARNLIGHT_FAKE_NOW` makes the course card pretend "today" is that instant. */
export function getLearnLightNow(): Date {
  const raw = process.env.LEARNLIGHT_FAKE_NOW?.trim();
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}
