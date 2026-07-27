const ONBOARDED_KEY = 'coursewing:onboarded';

/** Treats unavailable storage as onboarded so the gate can never redirect-loop. */
export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === 'true';
  } catch {
    return true;
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, 'true');
  } catch {
    /* storage unavailable — the gate treats that as onboarded */
  }
}
