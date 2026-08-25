import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import {
  authenticate,
  authErrorResponse,
  requirePermission,
} from "@/lib/auth-middleware";

const requestSchema = z.object({
  provider: z.enum(["gemini", "openai", "anthropic", "deepseek", "openrouter", "nvidia"]),
  api_key: z.string().min(8).max(4096),
  model_name: z.string().min(1).max(200),
}).strict();

const openAiCompatibleEndpoints = {
  openai: "https://api.openai.com/v1/chat/completions",
  deepseek: "https://api.deepseek.com/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
} as const;

const testPrompt = "Reply with exactly CONNECTED.";

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(12_000), cache: "no-store" });
}

export async function POST(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "settings.manage");
    const input = requestSchema.parse(await request.json());
    let reply = "";

    if (input.provider === "gemini") {
      const client = new GoogleGenerativeAI(input.api_key);
      const model = client.getGenerativeModel({ model: input.model_name });
      const result = await Promise.race([
        model.generateContent(testPrompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Provider connection timed out.")), 12_000),
        ),
      ]);
      reply = result.response.text();
    } else if (input.provider === "anthropic") {
      const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": input.api_key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: input.model_name,
          max_tokens: 10,
          messages: [{ role: "user", content: testPrompt }],
        }),
      });
      if (!response.ok) {
        return NextResponse.json(
          { success: false, error: `Provider rejected the connection (HTTP ${response.status}).` },
          { status: 422 },
        );
      }
      const data = await response.json();
      reply = data.content?.[0]?.text ?? "";
    } else {
      const endpoint = openAiCompatibleEndpoints[input.provider];
      const response = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${input.api_key}`,
          ...(input.provider === "openrouter"
            ? { "http-referer": new URL(request.url).origin, "x-title": "SellerPlus" }
            : {}),
        },
        body: JSON.stringify({
          model: input.model_name,
          messages: [{ role: "user", content: testPrompt }],
          max_tokens: 10,
        }),
      });
      if (!response.ok) {
        return NextResponse.json(
          { success: false, error: `Provider rejected the connection (HTTP ${response.status}).` },
          { status: 422 },
        );
      }
      const data = await response.json();
      reply = data.choices?.[0]?.message?.content ?? "";
    }

    return NextResponse.json({
      success: /^connected[.!\s]*$/i.test(reply.trim()),
      provider: input.provider,
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
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "Provider connection timed out."
      : "Unable to verify the provider connection.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
