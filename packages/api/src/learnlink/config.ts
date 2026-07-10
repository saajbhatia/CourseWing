export function isLearnLinkEnabled(): boolean {
  return process.env.LEARNLINK_ENABLED === 'true';
}

export function getCanvasServiceUrl(): string {
  const url = process.env.LEARNLINK_CANVAS_SERVICE_URL ?? 'http://localhost:3333';
  return url.replace(/\/+$/, '');
}

export function getLearnLinkTimezone(): string {
  return process.env.LEARNLINK_TIMEZONE ?? 'America/Los_Angeles';
}

/** Demo/testing override: `LEARNLINK_FAKE_NOW` makes the course card pretend "today" is that instant. */
export function getLearnLinkNow(): Date {
  const raw = process.env.LEARNLINK_FAKE_NOW?.trim();
  if (raw) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
}
