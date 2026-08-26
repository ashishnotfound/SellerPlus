import { describe, expect, it } from "vitest";
import { publicJobError } from "@/lib/jobs/public-error";

describe("public job error projection", () => {
  it("does not expose internal failure text", () => {
    expect(publicJobError("failed", "postgres://user:secret@example.test:5432/app")).toBe(
      "Background job failed. Retry the operation or contact an administrator.",
    );
  });

  it("distinguishes retrying jobs", () => {
    expect(publicJobError("retrying", "provider response details")).toBe(
      "Background job is retrying after an error.",
    );
  });

  it("returns no error when the job has no failure", () => {
    expect(publicJobError("completed", null)).toBeNull();
  });
});
