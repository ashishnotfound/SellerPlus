import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse } from "@/lib/auth-middleware";

interface DatabaseErrorLike {
  code?: unknown;
  message?: unknown;
}

export function reyoPackErrorResponse(error: unknown, validationMessage: string): NextResponse {
  if (error instanceof z.ZodError || error instanceof SyntaxError) {
    return NextResponse.json({ error: validationMessage, code: "VALIDATION_ERROR" }, { status: 400 });
  }
  const databaseError = error && typeof error === "object"
    ? error as DatabaseErrorLike
    : null;
  const code = typeof databaseError?.code === "string" ? databaseError.code : null;
  const message = typeof databaseError?.message === "string" ? databaseError.message : null;
  if (code === "P0002") {
    return NextResponse.json({ error: message ?? "Reyo Pack record not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  if (code === "40001" || code === "23505") {
    return NextResponse.json({ error: message ?? "The operational state changed. Refresh and retry.", code: "CONFLICT" }, { status: 409 });
  }
  if (code === "22023" || code === "23514") {
    return NextResponse.json({ error: message ?? validationMessage, code: "INVALID_OPERATION" }, { status: 400 });
  }
  if (code === "42501") {
    return NextResponse.json({ error: "You are not allowed to perform this operation.", code: "FORBIDDEN" }, { status: 403 });
  }
  const response = authErrorResponse(error);
  return NextResponse.json(response.body, { status: response.status });
}

export function noStoreJson(body: unknown, init?: ResponseInit): NextResponse {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "private, no-store");
  return NextResponse.json(body, { ...init, headers });
}
