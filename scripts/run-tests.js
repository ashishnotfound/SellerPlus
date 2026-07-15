const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const fs = require("fs");

// Load local environment
try {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    content.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || "";
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

const supabaseAdmin = createClient(supabaseUrl, serviceKey);

async function runTests() {
  console.log("==========================================");
  console.log("RUNNING SELLERPLUS AUTOMATED TESTS");
  console.log("==========================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // Test 1: Validate database connection and profiles table accessibility
  try {
    const { data, error } = await supabaseAdmin.from("profiles").select("id").limit(1);
    assert(!error, "Should query profiles table without error.");
    assert(Array.isArray(data), "Profiles query should return an array.");
  } catch (err) {
    assert(false, `Test 1 failed with exception: ${err.message}`);
  }

  // Test 2: Validate database check constraint updates on alert_logs
  try {
    // Attempt inserting a new alert type (e.g. 'high_acos') to verify the CHECK constraint fix
    const { data: profile } = await supabaseAdmin.from("profiles").select("id").limit(1).maybeSingle();
    
    if (profile) {
      const testAlert = {
        user_id: profile.id,
        type: "high_acos",
        title: "Test Alert",
        message: "Test constraint mapping",
        is_read: false
      };

      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("alert_logs")
        .insert(testAlert)
        .select("id")
        .single();

      assert(!insertError, "Should insert a 'high_acos' alert successfully (Check constraint fix validated).");

      if (inserted) {
        // Clean up
        await supabaseAdmin.from("alert_logs").delete().eq("id", inserted.id);
      }
    } else {
      console.warn("⚠️ Skipping Test 2: No user profile exists in profiles table.");
    }
  } catch (err) {
    assert(false, `Test 2 failed with exception: ${err.message}`);
  }

  // Test 3: Validate LLM config fallback
  try {
    const defaultKey = process.env.GEMINI_API_KEY;
    assert(!!defaultKey, "GEMINI_API_KEY env key should be configured.");
  } catch (err) {
    assert(false, `Test 3 failed: ${err.message}`);
  }

  console.log("==========================================");
  console.log(`TEST RUN COMPLETED. Passed: ${passed}, Failed: ${failed}`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
