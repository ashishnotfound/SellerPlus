/**
 * SellerPlus OS — AI Provider Adapters & Capability Registry
 * 
 * Implements concrete LLM provider adapters (Gemini, OpenAI, Anthropic, Ollama)
 * conforming to the ProviderAdapter contract. Defines capability lists.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  ProviderAdapter, 
  ProviderCapability, 
  GenerationOptions, 
  GenerationResult, 
  LLMSetting 
} from "./types";
import { configuredCostUsd } from "./pricing";

// ─── Capability Registry Mapping ─────────────────────────────────────

export const PROVIDER_CAPABILITIES: Record<string, ProviderCapability[]> = {
  gemini: [
    ProviderCapability.JsonMode,
    ProviderCapability.StructuredJson,
    ProviderCapability.FunctionCalling,
    ProviderCapability.ToolUse,
    ProviderCapability.CodeGeneration,
    ProviderCapability.Reasoning,
    ProviderCapability.FastResponse,
    ProviderCapability.LongContext,
    ProviderCapability.LowCost
  ],
  openai: [
    ProviderCapability.JsonMode,
    ProviderCapability.StructuredJson,
    ProviderCapability.FunctionCalling,
    ProviderCapability.ToolUse,
    ProviderCapability.Vision,
    ProviderCapability.Ocr,
    ProviderCapability.Streaming,
    ProviderCapability.Reasoning,
    ProviderCapability.FastResponse
  ],
  anthropic: [
    ProviderCapability.ToolUse,
    ProviderCapability.Vision,
    ProviderCapability.Streaming,
    ProviderCapability.Reasoning,
    ProviderCapability.LongContext,
    ProviderCapability.StructuredJson
  ],
  deepseek: [
    ProviderCapability.JsonMode,
    ProviderCapability.StructuredJson,
    ProviderCapability.CodeGeneration,
    ProviderCapability.Reasoning,
    ProviderCapability.LowCost
  ],
  openrouter: [
    ProviderCapability.JsonMode,
    ProviderCapability.StructuredJson,
    ProviderCapability.FunctionCalling,
    ProviderCapability.ToolUse,
    ProviderCapability.Vision,
    ProviderCapability.Reasoning
  ],
  nvidia: [
    ProviderCapability.JsonMode,
    ProviderCapability.StructuredJson,
    ProviderCapability.Reasoning,
    ProviderCapability.FastResponse,
    ProviderCapability.LowCost
  ],
  grok: [
    ProviderCapability.JsonMode,
    ProviderCapability.StructuredJson,
    ProviderCapability.FunctionCalling,
    ProviderCapability.ToolUse,
    ProviderCapability.Reasoning,
    ProviderCapability.FastResponse
  ],
  xai: [
    ProviderCapability.JsonMode,
    ProviderCapability.StructuredJson,
    ProviderCapability.FunctionCalling,
    ProviderCapability.ToolUse,
    ProviderCapability.Reasoning,
    ProviderCapability.FastResponse
  ]
};

// ─── Concrete Adapters ────────────────────────────────────────────────

export class GeminiAdapter implements ProviderAdapter {
  private setting: LLMSetting;

  constructor(setting: LLMSetting) {
    this.setting = setting;
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    if (!this.setting.api_key) {
      throw new Error("Gemini API key is unconfigured.");
    }
    const genAI = new GoogleGenerativeAI(this.setting.api_key);
    const generationConfig: any = {
      temperature: options?.temperature !== undefined ? options.temperature : 0.1,
    };
    
    if (options?.capabilities?.includes(ProviderCapability.JsonMode) || options?.capabilities?.includes(ProviderCapability.StructuredJson)) {
      generationConfig.responseMimeType = "application/json";
    }

    const model = genAI.getGenerativeModel({ 
      model: this.setting.model_name,
      generationConfig
    });

    const start = Date.now();
    const result = await model.generateContent(prompt);
    const latency = Date.now() - start;
    const text = result.response.text();

    const usage = result.response.usageMetadata;
    const inputTokens = usage?.promptTokenCount ?? Math.ceil(prompt.length / 4);
    const outputTokens = usage?.candidatesTokenCount ?? Math.ceil(text.length / 4);
    const estimatedCost = configuredCostUsd(this.setting, inputTokens, outputTokens);

    return {
      text,
      tokensUsed: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      estimatedCost: estimatedCost ?? undefined,
      costStatus: estimatedCost === null ? "unknown" : "configured_estimate",
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      return !!this.setting.api_key && this.setting.api_key.trim().length > 0;
    } catch {
      return false;
    }
  }
}

export class OpenAICompatibleAdapter implements ProviderAdapter {
  private setting: LLMSetting;
  private endpoint: string;

  constructor(setting: LLMSetting) {
    this.setting = setting;
    
    // Auto-resolve endpoint based on provider type
    if (setting.provider === "openai") {
      this.endpoint = "https://api.openai.com/v1/chat/completions";
    } else if (setting.provider === "deepseek") {
      this.endpoint = "https://api.deepseek.com/chat/completions";
    } else if (setting.provider === "openrouter") {
      this.endpoint = "https://openrouter.ai/api/v1/chat/completions";
    } else if (setting.provider === "nvidia") {
      this.endpoint = "https://integrate.api.nvidia.com/v1/chat/completions";
    } else if (setting.provider === "grok" || setting.provider === "xai") {
      this.endpoint = "https://api.x.ai/v1/chat/completions";
    } else {
      throw new Error(`Unsupported OpenAI-compatible provider: ${setting.provider}`);
    }
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    if (this.setting.api_key) {
      headers["Authorization"] = `Bearer ${this.setting.api_key}`;
    }
    
    const payload: any = {
      model: this.setting.model_name,
      messages: [{ role: "user", content: prompt }],
      temperature: options?.temperature !== undefined ? options.temperature : 0.1,
      max_tokens: options?.maxTokens ?? 2048,
    };

    if (options?.capabilities?.includes(ProviderCapability.JsonMode) || options?.capabilities?.includes(ProviderCapability.StructuredJson)) {
      payload.response_format = { type: "json_object" };
    }
    
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    
    if (!res.ok) {
      throw new Error(`AI provider request failed with HTTP ${res.status}.`);
    }
    
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const promptTokens = Number(data.usage?.prompt_tokens ?? 0);
    const completionTokens = Number(data.usage?.completion_tokens ?? 0);
    const totalTokens = promptTokens + completionTokens;
    const providerReportedCost = this.setting.provider === "openrouter" && Number.isFinite(Number(data.usage?.cost))
      ? Math.max(0, Number(data.usage.cost))
      : null;
    const configuredCost = configuredCostUsd(this.setting, promptTokens, completionTokens);
    const estimatedCost = providerReportedCost ?? configuredCost;

    return {
      text,
      tokensUsed: totalTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      estimatedCost: estimatedCost ?? undefined,
      costStatus: providerReportedCost !== null
        ? "provider_reported"
        : configuredCost !== null ? "configured_estimate" : "unknown",
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      return !!this.setting.api_key && this.setting.api_key.trim().length > 0;
    } catch {
      return false;
    }
  }
}

export class AnthropicAdapter implements ProviderAdapter {
  private setting: LLMSetting;

  constructor(setting: LLMSetting) {
    this.setting = setting;
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
    const endpoint = "https://api.anthropic.com/v1/messages";
    const headers = {
      "x-api-key": this.setting.api_key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
    
    const payload = {
      model: this.setting.model_name,
      max_tokens: options?.maxTokens || 2048,
      messages: [{ role: "user", content: prompt }],
      temperature: options?.temperature !== undefined ? options.temperature : 0.1,
    };
    
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    
    if (!res.ok) {
      throw new Error(`Anthropic provider request failed with HTTP ${res.status}.`);
    }
    
    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const promptTokens = data.usage?.input_tokens || 0;
    const completionTokens = data.usage?.output_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    const cost = configuredCostUsd(this.setting, promptTokens, completionTokens);

    return {
      text,
      tokensUsed: totalTokens,
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      estimatedCost: cost ?? undefined,
      costStatus: cost === null ? "unknown" : "configured_estimate",
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      return !!this.setting.api_key && this.setting.api_key.trim().length > 0;
    } catch {
      return false;
    }
  }
}

// ─── Adapter Factory ─────────────────────────────────────────────────

export function getAdapterForSetting(setting: LLMSetting): ProviderAdapter {
  switch (setting.provider) {
    case "gemini":
      return new GeminiAdapter(setting);
    case "anthropic":
      return new AnthropicAdapter(setting);
    case "openai":
    case "deepseek":
    case "openrouter":
    case "nvidia":
    case "grok":
    case "xai":
      return new OpenAICompatibleAdapter(setting);
    default:
      throw new Error(`No adapter mapped for AI provider: ${setting.provider}`);
  }
}
