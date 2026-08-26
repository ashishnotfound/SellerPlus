import {
  abortableDelay,
  createRequestSignal,
  type ExecutionBoundary,
} from "@/lib/execution-deadline";

export class AmazonSpApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;

  constructor(message: string, status: number, requestId: string | null) {
    super(message);
    this.name = "AmazonSpApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

export interface AmazonSpApiResponse<T> {
  data: T;
  rateLimit: number | null;
  requestId: string | null;
}

export function amazonSpApiEndpoint(region: string): string {
  const normalized = region.trim().toLowerCase();
  if (normalized.includes("north america") || normalized === "na") {
    return "https://sellingpartnerapi-na.amazon.com";
  }
  if (normalized.includes("far east") || normalized === "fe") {
    return "https://sellingpartnerapi-fe.amazon.com";
  }
  return "https://sellingpartnerapi-eu.amazon.com";
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, 60_000);
    }
    const dateValue = Date.parse(retryAfter);
    if (Number.isFinite(dateValue)) {
      return Math.min(Math.max(0, dateValue - Date.now()), 60_000);
    }
  }
  return Math.min(750 * 2 ** attempt + Math.floor(Math.random() * 250), 15_000);
}

function safeAmazonError(status: number): string {
  if (status === 401 || status === 403) {
    return "Amazon rejected this account's authorization or required role.";
  }
  if (status === 404) return "Amazon could not find the requested resource.";
  if (status === 429) return "Amazon rate-limited the synchronization request.";
  if (status >= 500) return "Amazon SP-API is temporarily unavailable.";
  return `Amazon SP-API rejected the request (HTTP ${status}).`;
}

export async function amazonSpApiFetchJson<T>(input: {
  baseUrl: string;
  path: string;
  accessToken: string;
  query?: URLSearchParams;
  boundary?: ExecutionBoundary;
}): Promise<AmazonSpApiResponse<T>> {
  const url = new URL(input.path, input.baseUrl);
  if (input.query) url.search = input.query.toString();
  const boundary = input.boundary ?? {};

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "x-amz-access-token": input.accessToken,
      },
      cache: "no-store",
      signal: createRequestSignal(boundary, 20_000),
    });
    const requestId = response.headers.get("x-amzn-requestid");
    if (response.ok) {
      const rateLimitHeader = Number(response.headers.get("x-amzn-ratelimit-limit"));
      return {
        data: (await response.json()) as T,
        rateLimit: Number.isFinite(rateLimitHeader) && rateLimitHeader > 0
          ? rateLimitHeader
          : null,
        requestId,
      };
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 4) {
      throw new AmazonSpApiError(safeAmazonError(response.status), response.status, requestId);
    }
    await abortableDelay(retryDelayMs(response, attempt), boundary, 1_000);
  }

  throw new AmazonSpApiError("Amazon SP-API request exhausted its retry policy.", 503, null);
}

export function nextAmazonPageDelaySeconds(
  rateLimit: number | null,
  fallbackSeconds = 180,
): number {
  if (!rateLimit) return fallbackSeconds;
  return Math.min(300, Math.max(5, Math.ceil(1 / rateLimit)));
}
