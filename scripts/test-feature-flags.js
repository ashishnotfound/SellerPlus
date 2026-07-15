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

// Inject standard process.env for imports
process.env.NODE_ENV = "development";

// Import feature flag checkers
const { isFeatureEnabled } = require("../src/lib/feature-flags");

async function runTests() {
  console.log("==========================================");
  console.log("RUNNING FEATURE FLAG INTEGRATION TESTS");
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

  const supabaseAdmin = createClient(supabaseUrl, serviceKey);

  // Get a test user profile
  const { data: profile } = await supabaseAdmin.from("profiles").select("id").limit(1).maybeSingle();
  if (!profile) {
    console.error("No profile found in database to run tests against.");
    process.exit(1);
  }
  const userId = profile.id;

  try {
    // Test 1: Verify global flag toggle
    // Ensure 'ai_gateway' is enabled globally
    await supabaseAdmin
      .from("feature_flags")
      .update({ is_enabled: true })
      .eq("key", "ai_gateway");

    const isGatewayEnabled = await isFeatureEnabled("ai_gateway", userId);
    assert(isGatewayEnabled === true, "Global feature flag is_enabled=true should resolve to true.");

    // Disable 'ai_gateway' globally
    await supabaseAdmin
      .from("feature_flags")
      .update({ is_enabled: false })
      .eq("key", "ai_gateway");

    const isGatewayDisabled = await isFeatureEnabled("ai_gateway", userId);
    assert(isGatewayDisabled === false, "Global feature flag is_enabled=false should resolve to false.");

    // Restore gateway flag
    await supabaseAdmin
      .from("feature_flags")
      .update({ is_enabled: true })
      .eq("key", "ai_gateway");

    // Test 2: Verify recursive dependency checks
    // 'ai_cache' depends on 'ai_gateway'. If we disable 'ai_gateway', then 'ai_cache' must also resolve to false!
    await supabaseAdmin
      .from("feature_flags")
      .update({ is_enabled: false })
      .eq("key", "ai_gateway");

    const isCacheEnabledWithDisabledDep = await isFeatureEnabled("ai_cache", userId);
    assert(isCacheEnabledWithDisabledDep === false, "Feature flag should resolve to false if its required parent dependency is disabled.");

    // Re-enable gateway
    await supabaseAdmin
      .from("feature_flags")
      .update({ is_enabled: true })
      .eq("key", "ai_gateway");

    const isCacheEnabledWithEnabledDep = await isFeatureEnabled("ai_cache", userId);
    assert(isCacheEnabledWithEnabledDep === true, "Feature flag should resolve to true if its required parent dependency is enabled.");

    // Test 3: Verify per-user overrides
    // Create an override to disable 'ai_cache' for our test user
    await supabaseAdmin
      .from("feature_flag_overrides")
      .upsert({ flag_key: "ai_cache", user_id: userId, is_enabled: false });

    const isCacheEnabledForUser = await isFeatureEnabled("ai_cache", userId);
    assert(isCacheEnabledForUser === false, "User-specific override (disabled) should override global enable.");

    // Re-enable override for user
    await supabaseAdmin
      .from("feature_flag_overrides")
      .upsert({ flag_key: "ai_cache", user_id: userId, is_enabled: true });

    const isCacheEnabledForUser2 = await isFeatureEnabled("ai_cache", userId);
    assert(isCacheEnabledForUser2 === true, "User-specific override (enabled) should override global state.");

    // Clean up user overrides
    await supabaseAdmin
      .from("feature_flag_overrides")
      .delete()
      .eq("flag_key", "ai_cache")
      .eq("user_id", userId);

    // Test 4: Rollout percentage rules
    // Update 'ai_cache' with a 0% rollout rules partition
    await supabaseAdmin
      .from("feature_flags")
      .update({ rules: { rollout_percentage: 0 } })
      .eq("key", "ai_cache");

    const isCacheEnabled0Percent = await isFeatureEnabled("ai_cache", userId);
    assert(isCacheEnabled0Percent === false, "0% rollout rule should exclude the user cohort.");

    // Update 'ai_cache' with a 100% rollout rules partition
    await supabaseAdmin
      .from("feature_flags")
      .update({ rules: { rollout_percentage: 100 } })
      .eq("key", "ai_cache");

    const isCacheEnabled100Percent = await isFeatureEnabled("ai_cache", userId);
    assert(isCacheEnabled100Percent === true, "100% rollout rule should include the user cohort.");

    // Reset rules
    await supabaseAdmin
      .from("feature_flags")
      .update({ rules: {} })
      .eq("key", "ai_cache");

  } catch (err) {
    console.error("Test execution crashed:", err);
    failed++;
  }

  console.log("==========================================");
  console.log(`TEST RUN COMPLETED. Passed: ${passed}, Failed: ${failed}`);
  console.log("==========================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
