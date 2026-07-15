import { alertManager } from "../src/lib/alert-manager";
import { config } from "../src/lib/config";
import { getAdminClient } from "../src/lib/auth-middleware";

// Mock env vars before anything tries to instantiate a real client
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy_key";

// We'll replace the fetch global to capture Discord webhook dispatch
let fetchedData: any = null;
global.fetch = async (url: RequestInfo | URL, options?: RequestInit) => {
  console.log(`[Mock Fetch] Intercepted POST to ${url}`);
  if (options && options.body) {
    fetchedData = JSON.parse(options.body as string);
  }
  return { ok: true } as Response;
};

async function runTests() {
  console.log("==========================================");
  console.log("RUNNING ALERT MANAGER TESTS");
  console.log("==========================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Setup mock config for notifications
  config.notifications = {
    discordWebhookUrl: "https://discord.webhook.fake/url",
    telegramBotToken: "",
    telegramChatId: "",
    resendApiKey: ""
  };

  try {
    console.log("[Test] Triggering system level alert (No User ID)...");
    
    // We catch and mock supabase insert in getAdminClient?
    // Actually, getAdminClient returns a SupabaseClient. If we don't mock it, it will try to hit localhost:54321.
    // The insert will fail and log.warn, which is fine, we just want to verify the logic.
    // Let's see if fetch is called correctly.
    
    await alertManager.triggerAlert(
      "warning",
      "High Latency Detected",
      "API calls to OpenAI took over 5 seconds",
      undefined,
      "corr-system-123"
    );

    assert(fetchedData !== null, "Discord webhook should be triggered");
    assert(fetchedData?.content?.includes("High Latency Detected"), "Webhook payload should contain title");
    assert(fetchedData?.content?.includes("corr-system-123"), "Webhook payload should contain correlation ID");

    // Clear state
    fetchedData = null;

    console.log("[Test] Triggering tenant level alert (With User ID)...");
    
    // Test with userId
    await alertManager.triggerAlert(
      "billing",
      "Credit Exhausted",
      "User has run out of credits",
      "user-456",
      "corr-user-456"
    );

    assert(fetchedData !== null, "Discord webhook should be triggered for tenant alert");
    assert(fetchedData?.content?.includes("Credit Exhausted"), "Webhook payload should contain title");

    console.log("==========================================");
    console.log(`TEST RUN COMPLETED. Passed: ${passed}, Failed: ${failed}`);
    console.log("==========================================");
  } catch (err) {
    console.error("Test suite crashed:", err);
  }
}

runTests();
