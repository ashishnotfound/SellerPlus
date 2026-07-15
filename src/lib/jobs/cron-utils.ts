/**
 * SellerPlus OS — Cron Schedule Utilities
 *
 * Lightweight cron schedule parser for the AI Task Scheduler.
 * Supports the 5-field POSIX cron format: minute hour dom month dow
 *
 * This is intentionally minimal — no external cron library dependency.
 * We only need to calculate the next execution timestamp from a cron string.
 *
 * Preset human-readable schedules are converted to their cron equivalents.
 */

export const PRESET_SCHEDULES: Record<string, { label: string; cron: string }> = {
  every_6h:      { label: "Every 6 hours",      cron: "0 */6 * * *"  },
  every_morning: { label: "Every morning (9am)", cron: "0 9 * * *"    },
  every_noon:    { label: "Every day at noon",   cron: "0 12 * * *"   },
  weekly_monday: { label: "Weekly (Monday 9am)", cron: "0 9 * * 1"    },
  hourly:        { label: "Hourly",              cron: "0 * * * *"    },
  every_12h:     { label: "Every 12 hours",      cron: "0 */12 * * *" },
};

export type PresetScheduleKey = keyof typeof PRESET_SCHEDULES;

/**
 * Parse a 5-field cron string and return the next Date it will fire
 * after the reference time (default: now).
 *
 * Supports:
 *  - '*' (any)
 *  - '* /n' (every n, no space)
 *  - Specific integer values
 *
 * Limitations: does not support ranges (1-5), lists (1,3,5), or L/W/# modifiers.
 * These can be added if required without breaking existing callers.
 */
export function nextCronRunAfter(cronExpression: string, after: Date = new Date()): Date {
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression "${cronExpression}": expected 5 fields.`);
  }

  const [minuteExpr, hourExpr, domExpr, monthExpr, dowExpr] = parts;

  // Start from the next minute
  const candidate = new Date(after);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  // Scan forward up to 1 year (525,960 minutes) to find the next match
  for (let i = 0; i < 525_960; i++) {
    if (
      matchesCronField(minuteExpr, candidate.getUTCMinutes(), 0, 59) &&
      matchesCronField(hourExpr, candidate.getUTCHours(), 0, 23) &&
      matchesCronField(domExpr, candidate.getUTCDate(), 1, 31) &&
      matchesCronField(monthExpr, candidate.getUTCMonth() + 1, 1, 12) &&
      matchesCronField(dowExpr, candidate.getUTCDay(), 0, 6)
    ) {
      return candidate;
    }
    candidate.setUTCMinutes(candidate.getUTCMinutes() + 1);
  }

  throw new Error(`Could not find next run time for cron expression "${cronExpression}" within 1 year.`);
}

function matchesCronField(expr: string, value: number, min: number, max: number): boolean {
  if (expr === "*") return true;

  if (expr.startsWith("*/")) {
    const step = parseInt(expr.slice(2), 10);
    if (isNaN(step) || step <= 0) return false;
    return (value - min) % step === 0;
  }

  const n = parseInt(expr, 10);
  if (isNaN(n)) return false;
  return value === n;
}

/** Resolve a preset key or raw cron string to a cron expression. */
export function resolveCronExpression(scheduleOrPreset: string): string {
  if (scheduleOrPreset in PRESET_SCHEDULES) {
    return PRESET_SCHEDULES[scheduleOrPreset as PresetScheduleKey].cron;
  }
  // Validate it looks like a cron expression
  if (scheduleOrPreset.trim().split(/\s+/).length === 5) {
    return scheduleOrPreset;
  }
  throw new Error(`"${scheduleOrPreset}" is neither a known preset nor a valid 5-field cron expression.`);
}
