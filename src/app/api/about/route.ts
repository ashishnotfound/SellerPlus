import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";
import { authenticate, authErrorResponse } from "@/lib/auth-middleware";

function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const actor = await authenticate(request);
    const { data: worker } = await actor.supabaseAdmin
      .from("worker_devices")
      .select("version, platform, status, last_seen_at")
      .eq("workspace_id", actor.workspaceId)
      .neq("status", "revoked")
      .order("last_seen_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const rawBuild =
      process.env.SELLERPLUS_BUILD_ID ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GITHUB_SHA ??
      "development";

    return NextResponse.json({
      data: {
        product: "SellerPlus",
        developer: "ReyoStudio",
        version: packageJson.version,
        build: rawBuild === "development" ? rawBuild : rawBuild.slice(0, 12),
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        updateChannel: process.env.SELLERPLUS_UPDATE_CHANNEL ?? "stable",
        worker: worker ?? null,
        links: {
          privacy: safeExternalUrl(process.env.NEXT_PUBLIC_PRIVACY_URL),
          terms: safeExternalUrl(process.env.NEXT_PUBLIC_TERMS_URL),
          support: safeExternalUrl(process.env.NEXT_PUBLIC_SUPPORT_URL),
        },
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
