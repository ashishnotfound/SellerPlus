import { describe, expect, it, vi } from "vitest";
import {
  abortableDelay,
  boundedTimeoutMs,
  ExecutionDeadlineError,
  runBeforeDeadline,
} from "@/lib/execution-deadline";

describe("execution deadline", () => {
  it("bounds provider timeouts to the enclosing worker budget", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-08-25T10:00:00Z"));
      expect(boundedTimeoutMs({ deadlineAt: Date.now() + 5_000 }, 60_000, 500)).toBe(4_500);
      expect(boundedTimeoutMs({}, 20_000)).toBe(20_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses a retry delay that would consume the persistence reserve", async () => {
    await expect(abortableDelay(2_000, { deadlineAt: Date.now() + 2_500 }, 1_000))
      .rejects.toBeInstanceOf(ExecutionDeadlineError);
  });

  it("aborts unfinished work at the execution deadline", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = runBeforeDeadline(
        () => new Promise<never>(() => undefined),
        Date.now() + 1_000,
        controller,
      );
      const assertion = expect(pending).rejects.toBeInstanceOf(ExecutionDeadlineError);
      await vi.advanceTimersByTimeAsync(1_001);
      await assertion;
      expect(controller.signal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
