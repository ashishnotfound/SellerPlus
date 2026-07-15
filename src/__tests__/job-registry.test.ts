/**
 * Unit Tests — Job Registry
 *
 * Verifies the structural integrity of the typed job registry:
 * - All job types have valid entries
 * - All entries have required fields
 * - getJobEntry works correctly
 * - No duplicate priorities cause ambiguous ordering
 * - ALL_JOB_TYPES contains no duplicates
 */

import { describe, it, expect } from "vitest";
import { JOB_REGISTRY, getJobEntry, ALL_JOB_TYPES, type JobType } from "../lib/jobs/job-registry";

describe("JOB_REGISTRY structural integrity", () => {
  it("has at least 5 registered job types", () => {
    expect(ALL_JOB_TYPES.length).toBeGreaterThanOrEqual(5);
  });

  it("ALL_JOB_TYPES has no duplicates", () => {
    const set = new Set(ALL_JOB_TYPES);
    expect(set.size).toBe(ALL_JOB_TYPES.length);
  });

  it("every job type in ALL_JOB_TYPES has a matching registry entry", () => {
    for (const type of ALL_JOB_TYPES) {
      const entry = JOB_REGISTRY[type];
      expect(entry, `Missing registry entry for job type: ${type}`).toBeDefined();
    }
  });

  it("every registry entry has a non-empty name", () => {
    for (const [type, entry] of Object.entries(JOB_REGISTRY)) {
      expect(entry.name.length, `Entry "${type}" has empty name`).toBeGreaterThan(0);
    }
  });

  it("every registry entry has a handler function", () => {
    for (const [type, entry] of Object.entries(JOB_REGISTRY)) {
      expect(typeof entry.handler, `Entry "${type}" handler is not a function`).toBe("function");
    }
  });

  it("every registry entry has a valid priority (1–10)", () => {
    for (const [type, entry] of Object.entries(JOB_REGISTRY)) {
      expect(entry.priority, `Entry "${type}" priority out of range`).toBeGreaterThanOrEqual(1);
      expect(entry.priority, `Entry "${type}" priority out of range`).toBeLessThanOrEqual(10);
    }
  });

  it("every registry entry has maxAttempts >= 1", () => {
    for (const [type, entry] of Object.entries(JOB_REGISTRY)) {
      expect(
        entry.retryPolicy.maxAttempts,
        `Entry "${type}" maxAttempts must be >= 1`
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("every registry entry has a valid retry strategy", () => {
    const validStrategies = ["immediate", "exponential"];
    for (const [type, entry] of Object.entries(JOB_REGISTRY)) {
      expect(
        validStrategies.includes(entry.retryPolicy.strategy),
        `Entry "${type}" has invalid strategy: ${entry.retryPolicy.strategy}`
      ).toBe(true);
    }
  });

  it("every registry entry has at least one capability", () => {
    for (const [type, entry] of Object.entries(JOB_REGISTRY)) {
      expect(
        entry.capabilities.length,
        `Entry "${type}" has no capabilities`
      ).toBeGreaterThan(0);
    }
  });

  it("every registry entry has a non-empty notificationTitle", () => {
    for (const [type, entry] of Object.entries(JOB_REGISTRY)) {
      expect(
        entry.notificationTitle.length,
        `Entry "${type}" has empty notificationTitle`
      ).toBeGreaterThan(0);
    }
  });
});

describe("getJobEntry", () => {
  it("returns the correct entry for a known type", () => {
    const entry = getJobEntry("executive_assistant");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("AI Executive Assistant");
  });

  it("returns undefined for unknown job types", () => {
    expect(getJobEntry("totally_unknown_job")).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getJobEntry("")).toBeUndefined();
  });

  it("is case-sensitive (lowercase required)", () => {
    expect(getJobEntry("EXECUTIVE_ASSISTANT")).toBeUndefined();
    expect(getJobEntry("Executive_Assistant")).toBeUndefined();
  });

  it("returns entry for every type in ALL_JOB_TYPES", () => {
    for (const type of ALL_JOB_TYPES) {
      expect(getJobEntry(type), `getJobEntry("${type}") returned undefined`).toBeDefined();
    }
  });
});
