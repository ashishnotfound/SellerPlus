const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

// Manually parse .env.local if it exists
try {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
        // Remove surrounding quotes if present
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value.trim();
      }
    });
  }
} catch (e) {
  console.warn("Could not load .env.local file manually:", e.message);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing Supabase configuration in .env.local");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  try {
    const migrationsDir = path.join(__dirname, "..", "supabase", "migrations");
    console.log("Scanning migrations:", migrationsDir);

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith(".sql"))
      .sort();

    console.log("Found migration files:", files);

    for (const file of files) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      const { data, error } = await supabaseAdmin.rpc("exec_sql", { sql });

      if (error && !error.message.includes("already exists")) {
        console.error(`Migration ${file} failed:`, error.message);
      } else {
        console.log(`Migration ${file} executed successfully.`);
      }
    }
    console.log("All migrations successfully processed!");
  } catch (err) {
    console.error("Migration execution failed:", err);
    process.exit(1);
  }
}

run();
