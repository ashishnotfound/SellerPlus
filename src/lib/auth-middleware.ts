/**
 * SellerPlus request authentication and tenant authorization.
 *
 * Authentication establishes identity. Workspace membership establishes the
 * tenant boundary. The service-role client is returned only after both checks
 * pass; callers must include `workspaceId` in every tenant-scoped query.
 */
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "@/lib/env";
import { getAdminClient as createAdminClient } from "@/lib/supabase/admin";
import {
  isWorkspaceRole,
  rolePermissions,
  type Permission,
  type WorkspaceRole,
} from "@/lib/security/permissions";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  profileRole: string;
  isSuperAdmin: boolean;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  permissions: readonly Permission[];
  supabaseAdmin: SupabaseClient;
}

export interface CronContext {
  supabaseAdmin: SupabaseClient;
}

export class AuthError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = "AuthError";
    this.statusCode = statusCode;
  }
}

export function getAdminClient(): SupabaseClient {
  return createAdminClient();
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const value = header.slice(7).trim();
  return value.length > 0 ? value : null;
}

/**
 * Cookie-authenticated browser mutations must originate from this application.
 * Bearer-authenticated clients (the mobile/PWA shell and trusted integrations)
 * are not vulnerable to ambient-cookie CSRF and are intentionally allowed.
 * Requests without Origin/Referer are retained for non-browser workers and
 * command-line clients; authentication and permission checks still apply.
 */
export function requireSameOriginMutation(request: Request): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) return;
  if (bearerToken(request)) return;

  const hostCandidates = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
  ].filter((value): value is string => Boolean(value));
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const source = origin ?? referer;
  if (!source) return;

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source);
  } catch {
    throw new AuthError("Cross-site mutation rejected.", 403);
  }
  if (!hostCandidates.includes(sourceUrl.host)) {
    throw new AuthError("Cross-site mutation rejected.", 403);
  }
}

function requestCookies(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  return header
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const separator = item.indexOf("=");
      if (separator < 1) return null;
      return {
        name: item.slice(0, separator),
        value: item.slice(separator + 1),
      };
    })
    .filter((item): item is { name: string; value: string } => item !== null);
}

async function resolveUserId(request: Request, admin: SupabaseClient): Promise<string> {
  const token = bearerToken(request);
  if (token) {
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) {
      throw new AuthError("Authentication failed. Sign in again.");
    }
    return data.user.id;
  }

  const config = getPublicSupabaseConfig();
  const requestClient = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => requestCookies(request),
      setAll: () => {
        // Middleware owns session refresh and response cookie writes.
      },
    },
  });
  const { data, error } = await requestClient.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error || typeof subject !== "string" || subject.length === 0) {
    throw new AuthError("Missing or expired authentication session.");
  }
  return subject;
}

async function resolveWorkspace(
  request: Request,
  userId: string,
  admin: SupabaseClient,
): Promise<{ workspaceId: string; workspaceRole: WorkspaceRole }> {
  const requestedWorkspace = request.headers.get("x-sellerplus-workspace-id");
  let query = admin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);

  if (requestedWorkspace) {
    query = query.eq("workspace_id", requestedWorkspace);
  }

  const { data, error } = await query
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AuthError("Unable to verify workspace membership.", 503);
  }
  if (!data?.workspace_id || !isWorkspaceRole(data.role)) {
    throw new AuthError("You do not have access to this workspace.", 403);
  }

  const { data: workspace, error: workspaceError } = await admin
    .from("workspaces")
    .select("status")
    .eq("id", data.workspace_id)
    .maybeSingle();
  if (workspaceError) {
    throw new AuthError("Unable to verify workspace status.", 503);
  }
  if (workspace?.status !== "active") {
    throw new AuthError("This workspace is not available.", 403);
  }

  return { workspaceId: data.workspace_id, workspaceRole: data.role };
}

export async function authenticate(request: Request): Promise<AuthenticatedUser> {
  requireSameOriginMutation(request);
  const admin = getAdminClient();
  const userId = await resolveUserId(request, admin);

  const [{ data: authUser, error: authError }, { data: profile, error: profileError }] =
    await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin
        .from("profiles")
        .select("role, is_super_admin, is_suspended")
        .eq("id", userId)
        .maybeSingle(),
    ]);

  if (authError || !authUser.user) {
    throw new AuthError("Authentication failed. Sign in again.");
  }
  if (profileError) {
    throw new AuthError("Unable to load the authenticated profile.", 503);
  }
  if (profile?.is_suspended) {
    throw new AuthError("Account suspended. Contact support.", 403);
  }

  const { workspaceId, workspaceRole } = await resolveWorkspace(request, userId, admin);

  return {
    userId,
    email: authUser.user.email ?? "",
    profileRole: profile?.role ?? "owner",
    isSuperAdmin: profile?.is_super_admin === true,
    workspaceId,
    workspaceRole,
    permissions: rolePermissions[workspaceRole],
    supabaseAdmin: admin,
  };
}

/**
 * Compatibility alias for existing routes. The former body-user-id fallback was
 * an IDOR and has intentionally been removed; all environments now authenticate.
 */
export async function authenticateWithDevFallback(
  request: Request,
  _bodyUserId?: string,
): Promise<AuthenticatedUser> {
  return authenticate(request);
}

async function secretsEqual(expected: string, provided: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [expectedHash, providedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
  ]);
  const left = new Uint8Array(expectedHash);
  const right = new Uint8Array(providedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function authenticateCron(request: Request): Promise<CronContext> {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < 24) {
    throw new AuthError("Worker authentication is not configured.", 503);
  }

  const authorization = request.headers.get("authorization");
  const provided =
    (authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null) ??
    request.headers.get("x-sellerplus-worker-secret") ??
    "";

  if (!(await secretsEqual(expected, provided))) {
    throw new AuthError("Unauthorized worker request.");
  }

  return { supabaseAdmin: getAdminClient() };
}

export function requireRole(user: AuthenticatedUser, allowedRoles: string[]): void {
  if (user.isSuperAdmin) return;
  if (!allowedRoles.includes(user.workspaceRole) && !allowedRoles.includes(user.profileRole)) {
    throw new AuthError("Insufficient permissions for this operation.", 403);
  }
}

export function requirePermission(user: AuthenticatedUser, permission: Permission): void {
  if (user.isSuperAdmin || user.permissions.includes(permission)) return;
  throw new AuthError(`Permission required: ${permission}.`, 403);
}

export function requireSuperAdmin(user: AuthenticatedUser): void {
  if (!user.isSuperAdmin) {
    throw new AuthError("This action requires super administrator privileges.", 403);
  }
}

export function authErrorResponse(error: unknown): {
  body: { error: string; code: string };
  status: number;
} {
  if (error instanceof AuthError) {
    return {
      body: {
        error: error.message,
        code: error.statusCode === 403 ? "FORBIDDEN" : "UNAUTHORIZED",
      },
      status: error.statusCode,
    };
  }
  return {
    body: { error: "The request could not be completed.", code: "INTERNAL_ERROR" },
    status: 500,
  };
}
