import { afterEach, describe, expect, it, vi } from "vitest";
import {
  amazonSpApiEndpoint,
  amazonSpApiFetchJson,
  nextAmazonPageDelaySeconds,
} from "@/lib/amazon/sp-api-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Amazon SP-API client", () => {
  it("routes Seller Central regions to the correct SP-API endpoint", () => {
    expect(amazonSpApiEndpoint("North America")).toContain("-na.amazon.com");
    expect(amazonSpApiEndpoint("Far East")).toContain("-fe.amazon.com");
    expect(amazonSpApiEndpoint("Europe")).toContain("-eu.amazon.com");
  });

  it("retries rate limits and captures Amazon rate/request headers", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", {
        status: 429,
        headers: { "retry-after": "0", "x-amzn-requestid": "request-one" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ orders: [] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-amzn-ratelimit-limit": "0.5",
          "x-amzn-requestid": "request-two",
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await amazonSpApiFetchJson<{ orders: unknown[] }>({
      baseUrl: "https://sellingpartnerapi-eu.amazon.com",
      path: "/orders/2026-01-01/orders",
      accessToken: "test-access-token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      data: { orders: [] },
      rateLimit: 0.5,
      requestId: "request-two",
    });
  });

  it("returns a safe authorization error without exposing Amazon's response body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ errors: [{ message: "sensitive upstream detail" }] }),
      { status: 403, headers: { "x-amzn-requestid": "request-three" } },
    )));

    const request = amazonSpApiFetchJson({
      baseUrl: "https://sellingpartnerapi-eu.amazon.com",
      path: "/orders/2026-01-01/orders",
      accessToken: "test-access-token",
    });
    await expect(request).rejects.toMatchObject({
      status: 403,
      requestId: "request-three",
      message: "Amazon rejected this account's authorization or required role.",
    });
  });

  it("honors operation rate limits and explicit fallback intervals", () => {
    expect(nextAmazonPageDelaySeconds(0.5, 2)).toBe(5);
    expect(nextAmazonPageDelaySeconds(0.0056)).toBe(179);
    expect(nextAmazonPageDelaySeconds(null, 2)).toBe(2);
  });
});
