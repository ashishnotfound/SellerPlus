/**
 * SellerPlus OS — Operational Alert Manager
 * 
 * Generates system-level or tenant-level alert events when operational thresholds
 * are breached (excessive latency, high failures, budget warnings).
 */

import { getAdminClient } from "@/lib/auth-middleware";
import { config } from "@/lib/config";
import { log } from "./logger";

export class AlertManager {
  /**
   * Triggers an alert log in both the user's dashboard and the system database log sinks.
   * If a notification integration is configured, dispatches webhook alerts.
   */
  async triggerAlert(
    type: "inventory" | "profit-leak" | "warning" | "error" | "billing",
    title: string,
    message: string,
    userId?: string,
    correlationId?: string
  ): Promise<void> {
    log.error(`[ALERT] [${type.toUpperCase()}] ${title}: ${message}`, correlationId);

    const adminClient = getAdminClient();

    // 1. Write user-facing dashboard notification if userId context is present
    if (userId) {
      try {
        await adminClient
          .from("alert_logs")
          .insert({
            user_id: userId,
            type,
            title,
            message,
            resolved: false,
            created_at: new Date().toISOString()
          });
      } catch (err) {
        log.warn(`Failed to insert user dashboard alert log: ${err}`);
      }
    }

    // 2. Dispatch external webhooks (Discord / Telegram) if configured in config
    if (config.notifications.discordWebhookUrl) {
      try {
        await fetch(config.notifications.discordWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: "SellerPlus Alerts Bot",
            content: `🚨 **[${type.toUpperCase()}] Alert Triggered!**\n**${title}**\n${message}\n_CorrelationID: ${correlationId || "N/A"}_`
          })
        });
      } catch (err) {
        log.warn("Discord webhook alert delivery failed:", undefined, err);
      }
    }
  }
}

export const alertManager = new AlertManager();
