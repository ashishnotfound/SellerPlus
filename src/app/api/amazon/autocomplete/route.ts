import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, authErrorResponse, requirePermission } from "@/lib/auth-middleware";

const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  marketplace: z.enum(["IN", "US", "UK", "JP"]).default("IN"),
});

const marketplaceConfig = {
  IN: { host: "completion.amazon.in", marketplaceId: "A21TJRUUN4KGV", locale: "en_IN" },
  US: { host: "completion.amazon.com", marketplaceId: "ATVPDKIKX0DER", locale: "en_US" },
  UK: { host: "completion.amazon.co.uk", marketplaceId: "A1F83G8C2ARO7P", locale: "en_GB" },
  JP: { host: "completion.amazon.co.jp", marketplaceId: "A1VC38T7YXB528", locale: "ja_JP" },
} as const;

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    requirePermission(actor, "catalog.read");
    const url = new URL(request.url);
    const query = querySchema.parse({
      q: url.searchParams.get("q") ?? "",
      marketplace: url.searchParams.get("marketplace") ?? "IN",
    });
    const config = marketplaceConfig[query.marketplace];
    const upstream = new URL(`https://${config.host}/api/2017/suggestions`);
    upstream.search = new URLSearchParams({
      "page-type": "Search",
      lop: config.locale,
      "site-variant": "desktop",
      "client-info": "amazon-search-ui",
      mid: config.marketplaceId,
      alias: "aps",
      prefix: query.q,
      event: "onKeyPress",
      limit: "11",
      "suggestion-type": "KEYWORD",
    }).toString();

    const response = await fetch(upstream, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Amazon suggestions are temporarily unavailable.", code: "UPSTREAM_UNAVAILABLE" },
        { status: 502 },
      );
    }

    const data = await response.json();
    const parsed = z.object({
      suggestions: z.array(z.object({ value: z.string() })).default([]),
    }).safeParse(data);

    return NextResponse.json({
      suggestions: parsed.success
        ? parsed.data.suggestions.map((item) => item.value).slice(0, 11)
        : [],
      source: "amazon_autocomplete",
      marketplace: query.marketplace,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Enter a valid keyword and marketplace.", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }
    const response = authErrorResponse(error);
    if (response.status !== 500) {
      return NextResponse.json(response.body, { status: response.status });
    }
    return NextResponse.json(
      { error: "Amazon suggestions are temporarily unavailable.", code: "UPSTREAM_UNAVAILABLE" },
      { status: 502 },
    );
  }
}
