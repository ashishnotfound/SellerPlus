import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseConfig } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getPublicSupabaseConfig();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>,
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot mutate cookies. src/middleware.ts refreshes them.
        }
      },
    },
  });
}
