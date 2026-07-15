/**
 * Unit Tests — Cron Utilities
 *
 * Verifies the nextCronRunAfter() pure function and PRESET_SCHEDULES correctness.
 * No external dependencies.
 */

import { describe, it, expect } from "vitest";
import {
  nextCronRunAfter,
  resolveCronExpression,
  PRESET_SCHEDULES,
  type PresetScheduleKey,
} from "../lib/jobs/cron-utils";

describe("nextCronRunAfter", () => {
  it("returns a Date in the future relative to the reference", () => {
    const ref = new Date("2026-07-14T10:00:00Z");
    const next = nextCronRunAfter("0 * * * *", ref); // hourly
    expect(next.getTime()).toBeGreaterThan(ref.getTime());
  });

  it("correctly calculates the next hourly run", () => {
    const ref = new Date("2026-07-14T10:30:00Z");
    const next = nextCronRunAfter("0 * * * *", ref);
    // Next run should be at :00 of the next hour
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCHours()).toBe(11);
  });

  it("correctly calculates the next daily run at 9am", () => {
    const ref = new Date("2026-07-14T09:30:00Z"); // After 9am
    const next = nextCronRunAfter("0 9 * * *", ref);
    expect(next.getUTCHours()).toBe(9);
    expect(next.getUTCMinutes()).toBe(0);
    expect(next.getUTCDate()).toBe(15); // Next day
  });

  it("fires same day if next run is still in the future", () => {
    const ref = new Date("2026-07-14T08:59:00Z"); // Before 9am
    const next = nextCronRunAfter("0 9 * * *", ref);
    expect(next.getUTCHours()).toBe(9);
    expect(next.getUTCDate()).toBe(14); // Same day
  });

  it("handles */6 hour interval correctly", () => {
    const ref = new Date("2026-07-14T07:30:00Z");
    const next = nextCronRunAfter("0 */6 * * *", ref);
    // From 07:30, next */6 slot is 12:00
    expect(next.getUTCHours()).toBe(12);
    expect(next.getUTCMinutes()).toBe(0);
  });

  it("throws for invalid cron expression (wrong field count)", () => {
    expect(() => nextCronRunAfter("* * *")).toThrow();
    expect(() => nextCronRunAfter("")).toThrow();
    expect(() => nextCronRunAfter("0 9 * * * extra")).toThrow();
  });

  it("returns a Date exactly 1 minute after ref for '* * * * *' (every minute)", () => {
    const ref = new Date("2026-07-14T10:00:00Z");
    const next = nextCronRunAfter("* * * * *", ref);
    // Every minute — fires at :01
    expect(next.getTime() - ref.getTime()).toBeLessThanOrEqual(60 * 1000 + 5000);
    expect(next.getTime()).toBeGreaterThan(ref.getTime());
  });
});

describe("resolveCronExpression", () => {
  it("resolves preset keys to their cron strings", () => {
    expect(resolveCronExpression("every_6h")).toBe("0 */6 * * *");
    expect(resolveCronExpression("every_morning")).toBe("0 9 * * *");
    expect(resolveCronExpression("hourly")).toBe("0 * * * *");
    expect(resolveCronExpression("weekly_monday")).toBe("0 9 * * 1");
  });

  it("passes through valid raw cron strings unchanged", () => {
    expect(resolveCronExpression("30 14 * * *")).toBe("30 14 * * *");
  });

  it("throws for unknown presets that look like non-cron strings", () => {
    expect(() => resolveCronExpression("not_a_preset_not_a_cron")).toThrow();
  });
});

describe("PRESET_SCHEDULES completeness", () => {
  it("all presets have a label and cron", () => {
    for (const [key, val] of Object.entries(PRESET_SCHEDULES)) {
      expect(val.label.length, `Preset "${key}" has no label`).toBeGreaterThan(0);
      expect(val.cron.split(" ").length, `Preset "${key}" cron is not 5 fields`).toBe(5);
    }
  });

  it("all preset cron expressions produce a valid next run", () => {
    const ref = new Date("2026-07-14T12:00:00Z");
    for (const [key, val] of Object.entries(PRESET_SCHEDULES)) {
      const next = nextCronRunAfter(val.cron, ref);
      expect(next.getTime(), `Preset "${key}" cron failed to produce a next run`).toBeGreaterThan(ref.getTime());
    }
  });
});
