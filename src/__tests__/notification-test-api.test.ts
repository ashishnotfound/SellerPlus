import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
  authErrorResponse: vi.fn(() => ({ body: { error: "auth error" }, status: 401 })),
  readCredential: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("@/lib/auth-middleware", () => ({
  authenticate: mocks.authenticate,
  requirePermission: mocks.requirePermission,
  authErrorResponse: mocks.authErrorResponse,
}));
vi.mock("@/lib/integrations/credentials", () => ({ readCredential: mocks.readCredential }));
vi.mock("@/lib/notifications", () => ({ sendNotification: mocks.sendNotification }));

import { POST } from "@/app/api/notifications/test/route";

const actor = {
  userId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000001",
  permissions: ["settings.manage"],
  supabaseAdmin: { from: vi.fn() },
};

describe("notification connection test", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue(actor);
    mocks.sendNotification.mockResolvedValue({ discord: { success: true } });
  });

  it("uses the encrypted Discord webhook stored for the active workspace", async () => {
    mocks.readCredential.mockResolvedValue({ secret: "https://discord.com/api/webhooks/123/secret", metadata: {} });
    const response = await POST(new Request("https://sellerplus.test/api/notifications/test", {
      method: "POST",
      body: JSON.stringify({ provider: "discord" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.readCredential).toHaveBeenCalledWith(actor.supabaseAdmin, {
      workspaceId: actor.workspaceId,
      provider: "notification_discord",
      credentialKind: "webhook_url",
    });
    expect(mocks.sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      discordUrl: "https://discord.com/api/webhooks/123/secret",
    }));
  });

  it("rejects browser-supplied webhook secrets", async () => {
    const response = await POST(new Request("https://sellerplus.test/api/notifications/test", {
      method: "POST",
      body: JSON.stringify({ provider: "discord", webhookUrl: "https://discord.com/api/webhooks/123/secret" }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });
});
