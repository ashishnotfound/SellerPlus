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
  workspaceId?: string;
  feature?: string;
  /** Absolute epoch deadline inherited from a durable worker invocation. */
  deadlineAt?: number;
  /** Cancels provider work when the enclosing job loses its execution lease. */
  signal?: AbortSignal;
  /** Restrict routing to a configured provider when an operator tests a connection. */
  provider?: string;
  /** Restrict routing to a configured model when an operator tests a connection. */
  model?: string;
}

export interface GenerationResult {
  text: string;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCost?: number;
  costStatus?: "provider_reported" | "configured_estimate" | "not_applicable" | "unknown";
  provider?: string;
  model?: string;
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
  input_cost_per_million?: number;
  output_cost_per_million?: number;
  priority: number;
  is_enabled: boolean;
}
