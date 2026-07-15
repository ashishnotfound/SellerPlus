import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { authenticateCron, authErrorResponse } from "@/lib/auth-middleware";

export async function POST(request: Request) {
  try {
    const { supabaseAdmin } = authenticateCron(request);
    const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
    console.log("[DB Migrate API] Scanning migrations directory:", migrationsDir);
    
    if (!fs.existsSync(migrationsDir)) {
      throw new Error(`Migrations directory not found at: ${migrationsDir}`);
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith(".sql"))
      .sort(); // Sort alphabetically to run migrations in order

    console.log("[DB Migrate API] Found files:", files);
    const results = [];

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, "utf8");
      
      console.log(`[DB Migrate API] Executing migration file: ${file}`);
      const { error } = await supabaseAdmin.rpc("exec_sql", { sql }).maybeSingle();

      if (error && !error.message?.includes("already exists")) {
        console.error(`[DB Migrate API] File ${file} failed:`, error.message);
        results.push({ file, ok: false, msg: error.message });
      } else {
        console.log(`[DB Migrate API] File ${file} success.`);
        results.push({ file, ok: true });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error("[DB Migrate API] Exception:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

