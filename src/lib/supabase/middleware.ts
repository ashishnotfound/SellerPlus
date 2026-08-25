import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicSupabaseConfig } from "@/lib/env";

const protectedPrefixes = [
  "/dashboard",
  "/listings",
  "/orders",
  "/analytics",
  "/settings",
  "/automations",
  "/warehouse",
  "/admin",
  "/ai-chat",
  "/billing",
  "/costs",
  "/expenses",
  "/goals",
  "/tasks",
];

function isProtectedPath(pathname: string): boolean {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  let config;
  try {
    config = getPublicSupabaseConfig();
  } catch {
    // Build/local setup can render public routes without credentials. Protected
    // routes still redirect to login, which presents the configuration error.
    if (isProtectedPath(request.nextUrl.pathname)) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/auth/login";
      loginUrl.searchParams.set("reason", "configuration");
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(
        cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
      ) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);

  if (!isAuthenticated && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && request.nextUrl.pathname.startsWith("/auth/")) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
