/**
 * SellerPlus OS — AI Core Type Definitions
 * 
 * Defines standard capability enums, configuration records, 
 * generation options, and LLM provider interfaces.
 */

export enum ProviderCapability {
  Streaming = "streaming",
  FunctionCalling = "function_calling",
  ToolUse = "tool_use",
  Vision = "vision",
  Ocr = "ocr",
  CodeGeneration = "code_generation",
  JsonMode = "json_mode",
  BatchInference = "batch_inference",
  Reasoning = "reasoning",
  StructuredJson = "structured_json",
  FastResponse = "fast_response",
  LongContext = "long_context",
  LowCost = "low_cost"
}

export interface GenerationOptions {
  temperature?: number;
  maxTokens?: number;
  bypassCache?: boolean;
  cacheTtl?: number;
  systemPromptVersion?: string;
  capabilities?: ProviderCapability[];
  correlationId?: string;
}

export interface GenerationResult {
  text: string;
  tokensUsed?: number;
  estimatedCost?: number;
}

export interface ProviderAdapter {
  generateText(prompt: string, options?: GenerationOptions): Promise<GenerationResult>;
  healthCheck(): Promise<boolean>;
}

export interface LLMSetting {
  provider: string;
  api_key: string;
  model_name: string;
  endpoint_url?: string;
  priority: number;
  is_enabled: boolean;
}
