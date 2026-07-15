import { z } from "zod";
import { routeLLMRequest, cleanJsonResponse } from "./utils";
import { GenerationOptions, ProviderCapability } from "./types";
import { log } from "@/lib/logger";

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
      } catch (parseErr: any) {
        throw new Error(`JSON Parsing failed: ${parseErr.message}`);
      }

      // 4. Validate with Zod
      const validationResult = schema.safeParse(parsedJson);
      if (validationResult.success) {
        return validationResult.data;
      } else {
        // Zod validation failed
        throw new Error(`Schema validation failed: ${validationResult.error.message}`);
      }

    } catch (err: any) {
      attempt++;
      log.warn(`[SchemaValidator] Attempt ${attempt} failed: ${err.message}`, finalOptions.correlationId);

      if (attempt > maxRepairs) {
        log.error(`[SchemaValidator] Exhausted max repairs (${maxRepairs}). Final error: ${err.message}`, finalOptions.correlationId, { repairs: attempt, failed: true });
        throw new Error(`Failed to generate valid JSON after ${maxRepairs} repair attempts: ${err.message}`);
      }

      log.warn(`[SchemaValidator] Auto-repair attempt ${attempt}/${maxRepairs} initiated due to validation failure.`, finalOptions.correlationId, { repairs: attempt });

      // Construct a repair prompt
      currentPrompt = `
You previously returned an invalid JSON response.
Error details: ${err.message}

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
