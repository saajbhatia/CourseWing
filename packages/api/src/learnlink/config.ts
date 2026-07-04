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
