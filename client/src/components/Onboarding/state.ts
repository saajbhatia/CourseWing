const ONBOARDED_KEY_PREFIX = 'coursewing:onboarded';

/** Scoped per user so a second student on a shared computer still gets onboarded. */
function onboardedKey(userId?: string | null): string {
  return userId ? `${ONBOARDED_KEY_PREFIX}:${userId}` : ONBOARDED_KEY_PREFIX;
}

/** Treats unavailable storage as onboarded so the gate can never redirect-loop. */
export function hasOnboarded(userId?: string | null): boolean {
  try {
    return localStorage.getItem(onboardedKey(userId)) === 'true';
  } catch {
    return true;
  }
}

export function markOnboarded(userId?: string | null): void {
  try {
    localStorage.setItem(onboardedKey(userId), 'true');
  } catch {
    /* storage unavailable — the gate treats that as onboarded */
  }
}
