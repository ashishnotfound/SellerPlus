import { z } from "zod";
import { routeLLMRequest, cleanJsonResponse } from "./utils";
import { GenerationOptions, ProviderCapability } from "./types";
import { log } from "@/lib/logger";
import { ExecutionDeadlineError } from "@/lib/execution-deadline";
import { AIBudgetError } from "@/lib/ai/budget";

class StructuredOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

/**
 * Executes an LLM request, expects JSON output, validates it against a Zod schema,
 * and automatically attempts to repair it if validation fails.
 */
export async function generateValidatedJson<T>(
  prompt: string,
  schema: z.ZodSchema<T>,
  options?: GenerationOptions,
  userId?: string,
  maxRepairs = 2
): Promise<T> {
  const finalOptions: GenerationOptions = {
    ...options,
    capabilities: [
      ...(options?.capabilities || []),
      ProviderCapability.StructuredJson // Request structured JSON from providers
    ]
  };

  let attempt = 0;
  let currentPrompt = prompt;

  while (attempt <= maxRepairs) {
    try {
      // 1. Generate text using the centralized gateway
      const result = await routeLLMRequest(currentPrompt, userId, finalOptions);
      
      // 2. Clean the markdown fences if any
      const cleanedText = cleanJsonResponse(result.text);

      // 3. Parse JSON
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(cleanedText);
      } catch (parseError) {
        throw new StructuredOutputError(
          `JSON parsing failed: ${parseError instanceof Error ? parseError.message : "invalid JSON"}`,
        );
      }

      // 4. Validate with Zod
      const validationResult = schema.safeParse(parsedJson);
      if (validationResult.success) {
        return validationResult.data;
      } else {
        // Zod validation failed
        throw new StructuredOutputError(`Schema validation failed: ${validationResult.error.message}`);
      }

    } catch (error) {
      if (
        !(error instanceof StructuredOutputError) ||
        error instanceof ExecutionDeadlineError ||
        error instanceof AIBudgetError
      ) {
        throw error;
      }
      attempt++;
      log.warn(`[SchemaValidator] Attempt ${attempt} failed: ${error.message}`, finalOptions.correlationId);

      if (attempt > maxRepairs) {
        log.error(`[SchemaValidator] Exhausted max repairs (${maxRepairs}). Final error: ${error.message}`, finalOptions.correlationId, { repairs: attempt, failed: true });
        throw new Error(`Failed to generate valid JSON after ${maxRepairs} repair attempts: ${error.message}`);
      }

      log.warn(`[SchemaValidator] Auto-repair attempt ${attempt}/${maxRepairs} initiated due to validation failure.`, finalOptions.correlationId, { repairs: attempt });

      // Construct a repair prompt
      currentPrompt = `
You previously returned an invalid JSON response.
Error details: ${error.message}

Please repair your previous response and return ONLY valid JSON matching the required schema. Do not include markdown fences or any conversational text.

Original Request:
${prompt}
      `.trim();
      
      // We explicitly bypass cache on repair attempts to ensure a fresh generation
      finalOptions.bypassCache = true;
    }
  }

  throw new Error("Unexpected failure in generateValidatedJson loop.");
}
