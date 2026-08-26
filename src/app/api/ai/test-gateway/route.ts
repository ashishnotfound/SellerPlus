import { NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";
import { routeLLMRequest } from "@/lib/ai/utils";

const requestSchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "deepseek", "openrouter", "nvidia"]),
  model_name: z.string().trim().min(1).max(200).optional(),
}).strict();

const testPrompt = "Reply with exactly CONNECTED.";

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const input = requestSchema.parse(await request.json());
    const result = await routeLLMRequest(testPrompt, actor.userId, {
      workspaceId: actor.workspaceId,
      feature: "settings.provider_test",
      provider: input.provider,
      model: input.model_name,
      maxTokens: 10,
      bypassCache: true,
    });
    const reply = result.text.trim();

    return NextResponse.json({
      success: /^connected[.!\s]*$/i.test(reply.trim()),
      provider: result.provider ?? input.provider,
      model: result.model ?? input.model_name ?? null,
      response: reply.trim().slice(0, 100),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid AI provider configuration." },
        { status: 400 },
      );
    }
    const auth = authErrorResponse(error);
    if (auth.status !== 500) {
      return NextResponse.json({ success: false, ...auth.body }, { status: auth.status });
    }
    const message = error instanceof Error && error.message.includes("No eligible AI provider")
      ? "This provider is not configured or enabled for the active workspace."
      : error instanceof Error && error.name === "TimeoutError"
        ? "Provider connection timed out."
        : "Unable to verify the provider connection.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
