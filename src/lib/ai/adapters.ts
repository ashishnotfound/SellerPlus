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
  ollama: [
    ProviderCapability.JsonMode,
    ProviderCapability.StructuredJson,
    ProviderCapability.CodeGeneration,
    ProviderCapability.ToolUse,
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

    // Estimate tokens: ~4 chars per token average fallback
    const tokens = Math.round((prompt.length + text.length) / 4);

    return {
      text,
      tokensUsed: tokens,
      estimatedCost: 0 // Free tier default / low cost
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
    } else if (setting.provider === "grok" || setting.provider === "xai") {
      this.endpoint = "https://api.x.ai/v1/chat/completions";
    } else {
      this.endpoint = setting.endpoint_url || "http://localhost:11434/v1/chat/completions";
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
    };

    if (options?.capabilities?.includes(ProviderCapability.JsonMode) || options?.capabilities?.includes(ProviderCapability.StructuredJson)) {
      payload.response_format = { type: "json_object" };
    }
    
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI-compatible provider error (${res.status}): ${errText}`);
    }
    
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    // Estimate cost per million tokens (approx defaults)
    let ratePerMillion = 0.15; // default low cost
    if (this.setting.model_name.includes("gpt-4")) ratePerMillion = 5.00;
    const estimatedCost = (totalTokens / 1000000) * ratePerMillion;

    return {
      text,
      tokensUsed: totalTokens,
      estimatedCost
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (this.setting.provider === "ollama") {
        // Ollama might run locally without key
        return true;
      }
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
    });
    
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic provider error (${res.status}): ${errText}`);
    }
    
    const data = await res.json();
    const text = data.content?.[0]?.text || "";
    const promptTokens = data.usage?.input_tokens || 0;
    const completionTokens = data.usage?.output_tokens || 0;
    const totalTokens = promptTokens + completionTokens;

    // Estimate cost: Sonnet averages $3/input million, $15/output million
    const cost = (promptTokens / 1000000) * 3.00 + (completionTokens / 1000000) * 15.00;

    return {
      text,
      tokensUsed: totalTokens,
      estimatedCost: cost
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
    case "ollama":
    case "grok":
    case "xai":
      return new OpenAICompatibleAdapter(setting);
    default:
      throw new Error(`No adapter mapped for AI provider: ${setting.provider}`);
  }
}
