import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  routeLLMRequest: vi.fn(),
}));

vi.mock("@/lib/ai/utils", () => ({
  routeLLMRequest: mocks.routeLLMRequest,
  cleanJsonResponse: (value: string) => value,
}));

vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn() },
}));

import { generateValidatedJson } from "@/lib/ai/schema-validator";

describe("validated AI output", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not multiply paid calls when the provider fails", async () => {
    const providerFailure = new Error("provider unavailable");
    mocks.routeLLMRequest.mockRejectedValue(providerFailure);

    await expect(generateValidatedJson("prompt", z.object({ ok: z.boolean() })))
      .rejects.toBe(providerFailure);
    expect(mocks.routeLLMRequest).toHaveBeenCalledTimes(1);
  });

  it("repairs only malformed structured output", async () => {
    mocks.routeLLMRequest
      .mockResolvedValueOnce({ text: "not-json" })
      .mockResolvedValueOnce({ text: '{"ok":true}' });

    await expect(generateValidatedJson("prompt", z.object({ ok: z.boolean() })))
      .resolves.toEqual({ ok: true });
    expect(mocks.routeLLMRequest).toHaveBeenCalledTimes(2);
  });
});
