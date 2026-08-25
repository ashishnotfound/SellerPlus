import { describe, expect, it } from "vitest";
import {
  PRESET_SCHEDULES,
  nextCronRunAfter,
  resolveCronExpression,
  validateCronExpression,
} from "@/lib/jobs/cron-utils";

describe("cron schedule utilities", () => {
  it("calculates preset schedules in UTC", () => {
    expect(
      nextCronRunAfter(PRESET_SCHEDULES.every_morning.cron, new Date("2026-08-20T08:59:30Z")).toISOString(),
    ).toBe("2026-08-20T09:00:00.000Z");
    expect(
      nextCronRunAfter(PRESET_SCHEDULES.weekly_monday.cron, new Date("2026-08-20T10:00:00Z")).toISOString(),
    ).toBe("2026-08-24T09:00:00.000Z");
  });

  it("rejects malformed or out-of-range fields instead of silently delaying them", () => {
    for (const expression of ["0 25 * * *", "60 * * * *", "0 */0 * * *", "0 9x * * *", "0 9 * *"]) {
      expect(() => validateCronExpression(expression)).toThrow(/Invalid cron/);
    }
  });

  it("resolves known presets and validates supported raw expressions", () => {
    expect(resolveCronExpression("every_6h")).toBe("0 */6 * * *");
    expect(resolveCronExpression("15 10 * * 2")).toBe("15 10 * * 2");
  });

  it("rejects invalid reference dates", () => {
    expect(() => nextCronRunAfter("0 * * * *", new Date("invalid"))).toThrow(/invalid reference date/i);
  });
});
