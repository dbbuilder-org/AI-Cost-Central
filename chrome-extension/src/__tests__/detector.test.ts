import { describe, it, expect } from "vitest";
import {
  detectNewKeys,
  detectNewAlerts,
  isKeyNearRenewal,
  getDaysUntilRenewal,
} from "../lib/detector";

function todayPlus(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0] as string;
}

describe("detectNewKeys", () => {
  it("1. Empty current, empty last → []", () => {
    expect(detectNewKeys([], [])).toEqual([]);
  });

  it("2. Same keys → []", () => {
    expect(detectNewKeys(["a", "b", "c"], ["a", "b", "c"])).toEqual([]);
  });

  it("3. New key in current → returns it", () => {
    expect(detectNewKeys(["a", "b"], ["a"])).toEqual(["b"]);
  });

  it("4. Multiple new → returns all", () => {
    const result = detectNewKeys(["a", "b", "c"], ["a"]);
    expect(result).toHaveLength(2);
    expect(result).toContain("b");
    expect(result).toContain("c");
  });

  it("5. Key removed (in last, not current) → not returned", () => {
    // Only new keys (in current but not in last) are returned
    const result = detectNewKeys(["a"], ["a", "b"]);
    expect(result).toEqual([]);
  });

  it("5b. Empty current, keys in last → []", () => {
    expect(detectNewKeys([], ["a", "b"])).toEqual([]);
  });

  it("5c. Many new keys from empty baseline", () => {
    const result = detectNewKeys(["x", "y", "z"], []);
    expect(result).toHaveLength(3);
  });

  it("5d. Order of result matches current order", () => {
    const result = detectNewKeys(["c", "a", "b"], ["a"]);
    expect(result).toEqual(["c", "b"]);
  });
});

describe("isKeyNearRenewal", () => {
  it("6. Date exactly warnDays days from now → true", () => {
    const date = todayPlus(30);
    expect(isKeyNearRenewal(date, 30)).toBe(true);
  });

  it("7. Date warnDays+1 days from now → false", () => {
    const date = todayPlus(31);
    expect(isKeyNearRenewal(date, 30)).toBe(false);
  });

  it("8. Date yesterday → true (overdue counts)", () => {
    const date = todayPlus(-1);
    expect(isKeyNearRenewal(date, 30)).toBe(true);
  });

  it("9. Date 1 day from now → true (within warnDays=30)", () => {
    const date = todayPlus(1);
    expect(isKeyNearRenewal(date, 30)).toBe(true);
  });

  it("10. Invalid date string → false", () => {
    expect(isKeyNearRenewal("not-a-date", 30)).toBe(false);
  });

  it("10b. Empty string → false", () => {
    expect(isKeyNearRenewal("", 30)).toBe(false);
  });

  it("10c. Today itself → true", () => {
    const date = todayPlus(0);
    expect(isKeyNearRenewal(date, 30)).toBe(true);
  });

  it("10d. Far future → false", () => {
    const date = todayPlus(365);
    expect(isKeyNearRenewal(date, 30)).toBe(false);
  });
});

describe("getDaysUntilRenewal", () => {
  it("11. Tomorrow → 1", () => {
    const date = todayPlus(1);
    expect(getDaysUntilRenewal(date)).toBe(1);
  });

  it("12. Yesterday → -1", () => {
    const date = todayPlus(-1);
    expect(getDaysUntilRenewal(date)).toBe(-1);
  });

  it("13. Today → 0", () => {
    const date = todayPlus(0);
    expect(getDaysUntilRenewal(date)).toBe(0);
  });

  it("14. 30 days from now → 30", () => {
    const date = todayPlus(30);
    expect(getDaysUntilRenewal(date)).toBe(30);
  });

  it("14b. 7 days from now → 7", () => {
    const date = todayPlus(7);
    expect(getDaysUntilRenewal(date)).toBe(7);
  });

  it("14c. 90 days from now → 90", () => {
    const date = todayPlus(90);
    expect(getDaysUntilRenewal(date)).toBe(90);
  });
});

describe("detectNewAlerts", () => {
  it("15. Empty current, empty last → []", () => {
    expect(detectNewAlerts([], [])).toEqual([]);
  });

  it("16. Same alerts → []", () => {
    expect(detectNewAlerts(["a1", "a2"], ["a1", "a2"])).toEqual([]);
  });

  it("17. One new alert → returns it", () => {
    expect(detectNewAlerts(["a1", "a2"], ["a1"])).toEqual(["a2"]);
  });

  it("18. Multiple new alerts → returns all", () => {
    const result = detectNewAlerts(["a1", "a2", "a3"], []);
    expect(result).toHaveLength(3);
    expect(result).toContain("a1");
    expect(result).toContain("a2");
    expect(result).toContain("a3");
  });

  it("19. Alert removed from current → not in result", () => {
    const result = detectNewAlerts(["a1"], ["a1", "a2"]);
    expect(result).toEqual([]);
  });

  it("20. Partial overlap → only genuinely new ones returned", () => {
    const result = detectNewAlerts(["a1", "a2", "a3"], ["a1", "a3"]);
    expect(result).toEqual(["a2"]);
  });

  it("20b. All new from large baseline with no overlap", () => {
    const current = ["x1", "x2", "x3", "x4", "x5"];
    const last = ["y1", "y2"];
    const result = detectNewAlerts(current, last);
    expect(result).toHaveLength(5);
  });
});
