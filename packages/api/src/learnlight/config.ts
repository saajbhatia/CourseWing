export function isLearnLightEnabled(): boolean {
  return process.env.LEARNLIGHT_ENABLED === 'true';
}

export function getCanvasServiceUrl(): string {
  const url = process.env.LEARNLIGHT_CANVAS_SERVICE_URL ?? 'http://localhost:3333';
  return url.replace(/\/+$/, '');
}

export function getLearnLightTimezone(): string {
  return process.env.LEARNLIGHT_TIMEZONE ?? 'America/Los_Angeles';
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
