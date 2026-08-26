import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
  routeLLMRequest: vi.fn(),
  authErrorResponse: vi.fn(() => ({ body: { error: "auth error" }, status: 401 })),
}));

vi.mock("@/lib/auth-middleware", () => ({
  authenticate: mocks.authenticate,
  requirePermission: mocks.requirePermission,
  authErrorResponse: mocks.authErrorResponse,
}));
vi.mock("@/lib/ai/utils", () => ({ routeLLMRequest: mocks.routeLLMRequest }));

import { POST } from "@/app/api/ai/test-gateway/route";

const actor = {
  userId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000001",
  permissions: ["settings.manage"],
};

describe("AI provider connection test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue(actor);
    mocks.routeLLMRequest.mockResolvedValue({
      text: "CONNECTED.",
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
    });
  });

  it("uses the encrypted workspace provider through the budgeted gateway", async () => {
    const response = await POST(new Request("https://sellerplus.test/api/ai/test-gateway", {
      method: "POST",
      body: JSON.stringify({ provider: "openrouter", model_name: "openai/gpt-4o-mini" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.routeLLMRequest).toHaveBeenCalledWith(
      "Reply with exactly CONNECTED.",
      actor.userId,
      expect.objectContaining({
        workspaceId: actor.workspaceId,
        feature: "settings.provider_test",
        provider: "openrouter",
        model: "openai/gpt-4o-mini",
        bypassCache: true,
      }),
    );
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
    });
  });

  it("rejects raw API keys instead of accepting a direct-provider bypass", async () => {
    const response = await POST(new Request("https://sellerplus.test/api/ai/test-gateway", {
      method: "POST",
      body: JSON.stringify({ provider: "openrouter", api_key: "sk-test-secret", model_name: "model" }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.routeLLMRequest).not.toHaveBeenCalled();
  });
});
