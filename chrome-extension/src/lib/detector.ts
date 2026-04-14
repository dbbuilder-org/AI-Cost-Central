/**
 * Returns IDs of keys in currentIds that are NOT in lastSeenIds.
 */
export function detectNewKeys(
  currentIds: string[],
  lastSeenIds: string[]
): string[] {
  const seen = new Set(lastSeenIds);
  return currentIds.filter((id) => !seen.has(id));
}

/**
 * Returns alert IDs in currentIds that are NOT in lastSeenIds.
 */
export function detectNewAlerts(
  currentIds: string[],
  lastSeenIds: string[]
): string[] {
  const seen = new Set(lastSeenIds);
  return currentIds.filter((id) => !seen.has(id));
}

/**
 * Returns days until renewal (negative = past due, 0 = today).
 * Uses UTC date strings to avoid local timezone offset issues.
 */
export function getDaysUntilRenewal(renewalDate: string): number {
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD in UTC
  const todayTime = new Date(todayStr + "T00:00:00Z").getTime();
  const renewalTime = new Date(renewalDate + "T00:00:00Z").getTime();
  return Math.round((renewalTime - todayTime) / (1000 * 60 * 60 * 24));
}

/**
 * Returns true if renewalDate (YYYY-MM-DD) is within warnDays days from today
 * (including past-due dates).
 */
export function isKeyNearRenewal(renewalDate: string, warnDays: number): boolean {
  if (!renewalDate || renewalDate.trim().length === 0) return false;

  try {
    const days = getDaysUntilRenewal(renewalDate);
    if (isNaN(days)) return false;
    // Within warnDays (includes overdue: days < 0) and within window
    return days <= warnDays;
  } catch {
    return false;
  }
}
