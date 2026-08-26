/**
 * Convert an internal durable-job failure into a safe browser-facing message.
 *
 * Job failures are retained server-side for operators. They can contain
 * provider responses, database details, or untrusted model text and must not
 * be copied into an authenticated browser response verbatim.
 */
export function publicJobError(status: string, lastError: string | null | undefined): string | null {
  if (!lastError) return null;
  if (status === "retrying") return "Background job is retrying after an error.";
  if (status === "failed") return "Background job failed. Retry the operation or contact an administrator.";
  return "Background job encountered an error.";
}
