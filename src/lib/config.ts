/**
 * SellerPlus OS — Centralized Configuration Layer
 * 
 * Single source of truth for app settings across AI, workers, notifications, 
 * and integrations. All parameters support optional override via environment variables.
 */

export const config = {
  ai: {
    geminiApiKey: process.env.GEMINI_API_KEY || "",
    defaultModel: process.env.AI_DEFAULT_MODEL || "gemini-1.5-flash",
    timeout: process.env.AI_TIMEOUT ? parseInt(process.env.AI_TIMEOUT, 10) : 15000,
    maxRetries: process.env.AI_MAX_RETRIES ? parseInt(process.env.AI_MAX_RETRIES, 10) : 3,
    cacheTtl: process.env.AI_CACHE_TTL ? parseInt(process.env.AI_CACHE_TTL, 10) : 86400, // 24 hours (86400s)
    cooldownMs: process.env.AI_CIRCUIT_COOLDOWN_MS ? parseInt(process.env.AI_CIRCUIT_COOLDOWN_MS, 10) : 300000, // 5 minutes
    failureThreshold: process.env.AI_CIRCUIT_FAILURE_THRESHOLD ? parseInt(process.env.AI_CIRCUIT_FAILURE_THRESHOLD, 10) : 3,
    negativeCacheTtl: process.env.AI_NEGATIVE_CACHE_TTL ? parseInt(process.env.AI_NEGATIVE_CACHE_TTL, 10) : 60, // 1 minute
  },
  
  workers: {
    inventoryAlertInterval: process.env.WORKER_INVENTORY_ALERT_INTERVAL || "0 0 * * *", // Daily
    lowStockThreshold: process.env.WORKER_LOW_STOCK_THRESHOLD ? parseInt(process.env.WORKER_LOW_STOCK_THRESHOLD, 10) : 10,
    profitLeakScanPeriod: process.env.WORKER_PROFIT_LEAK_SCAN_PERIOD || "0 * * * *", // Hourly
  },
  
  notifications: {
    discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || "",
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
    telegramChatId: process.env.TELEGRAM_CHAT_ID || "",
    resendApiKey: process.env.RESEND_API_KEY || "",
  },
  
  amazon: {
    region: process.env.AMAZON_SP_API_REGION || "IN",
    sandbox: process.env.AMAZON_SP_API_SANDBOX === "true",
    syncBatchSize: process.env.AMAZON_SYNC_BATCH_SIZE ? parseInt(process.env.AMAZON_SYNC_BATCH_SIZE, 10) : 100,
  }
};

export type AppConfig = typeof config;
