import type { LLMSetting } from "./types";

export function configuredCostUsd(
  setting: Pick<LLMSetting, "input_cost_per_million" | "output_cost_per_million">,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (setting.input_cost_per_million === undefined || setting.output_cost_per_million === undefined) {
    return null;
  }
  return (
    (Math.max(0, inputTokens) / 1_000_000) * setting.input_cost_per_million +
    (Math.max(0, outputTokens) / 1_000_000) * setting.output_cost_per_million
  );
}

export function maximumRequestCostMicros(
  setting: Pick<LLMSetting, "input_cost_per_million" | "output_cost_per_million">,
  prompt: string,
  maxOutputTokens: number,
): number | null {
  if (
    setting.input_cost_per_million === undefined ||
    setting.output_cost_per_million === undefined
  ) {
    return null;
  }

  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = Math.max(0, Math.ceil(maxOutputTokens));

  // A price expressed as USD / 1M tokens is numerically identical to
  // micro-USD / token. Calculate in micro-units directly so the intermediate
  // USD division/multiplication cannot turn an exact integer (8004) into
  // 8004.000000000001 and reserve one extra micro-dollar.
  return Math.ceil(
    inputTokens * setting.input_cost_per_million +
    outputTokens * setting.output_cost_per_million,
  );
}
