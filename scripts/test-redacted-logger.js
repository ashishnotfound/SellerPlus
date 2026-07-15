process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "dummy_key";
const { log, registerRedactionRule, redactSensitiveData } = require("../src/lib/logger");

async function runTests() {
  console.log("==========================================");
  console.log("RUNNING ISOMORPHIC REDACTED LOGGER TESTS");
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

  try {
    // 1. Verify standard redactions (API keys, URLs, tokens)
    const rawGoogleKey = "AIzaSyFakeKeyWithExactly33CharactersHere";
    const rawOpenAIKey = "sk-fakeopenai32characterkeylengthlong";
    const rawPostgresUrl = "postgres://postgres:password123@localhost:5432/mydb";

    const scrubbedGoogle = redactSensitiveData(rawGoogleKey);
    const scrubbedOpenAI = redactSensitiveData(rawOpenAIKey);
    const scrubbedDb = redactSensitiveData(rawPostgresUrl);

    assert(scrubbedGoogle === "[REDACTED_GOOGLE_KEY]", "Should scrub Google Generative AI API keys.");
    assert(scrubbedOpenAI === "[REDACTED_OPENAI_KEY]", "Should scrub OpenAI secret keys.");
    assert(scrubbedDb === "postgres://[REDACTED_CREDENTIALS]@[REDACTED_HOST]", "Should scrub Database credentials and hostname.");

    // 2. Verify pluggable custom redaction rule
    // We register a custom pattern for credit cards or Amazon seller tokens
    console.log("[Test] Registering pluggable Amazon Token redactor...");
    registerRedactionRule(
      "Amazon Seller Token",
      /amzn\.seller\.[0-9a-fA-F]{16}/g,
      "[REDACTED_AMZN_TOKEN]"
    );

    const sensitiveAmazonInput = "My token is amzn.seller.ab12cd34ef567890.";
    const scrubbedAmazon = redactSensitiveData(sensitiveAmazonInput);
    assert(scrubbedAmazon === "My token is [REDACTED_AMZN_TOKEN].", "Should scrub dynamically registered pluggable redactor rules.");

    // 3. Verify logging doesn't fail
    console.log("[Test] Running basic log statement outputs...");
    log.info("Test logging message info", "correlation-id-xyz", { test: "meta" });
    log.warn("Test warning logger output", "correlation-id-xyz");

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
