import { NextResponse } from "next/server";
import { sendNotification } from "@/lib/notifications";
import { authenticateCron, authErrorResponse } from "@/lib/auth-middleware";
import { log } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = authenticateCron(request);

    log.info("[InventoryAlertWorker] Scanning for low stock items...");
    
    // 1. Fetch all items in the planner that have stock <= 30
    const { data: lowStockItems, error: fetchErr } = await supabaseAdmin
      .from("inventory_planner")
      .select("user_id, sku, name, current_stock, daily_velocity, days_until_stockout")
      .lte("current_stock", 30);

    if (fetchErr) {
      throw new Error(`Failed to query planner: ${fetchErr.message}`);
    }

    if (!lowStockItems || lowStockItems.length === 0) {
      return NextResponse.json({ success: true, message: "No low-stock items found." });
    }

    // 2. Group items by user_id
    const userAlertsMap = new Map<string, typeof lowStockItems>();
    lowStockItems.forEach((item) => {
      const list = userAlertsMap.get(item.user_id) || [];
      list.push(item);
      userAlertsMap.set(item.user_id, list);
    });

    const summary: any[] = [];

    // 3. Process alerts per tenant
    for (const [userId, items] of userAlertsMap.entries()) {
      // Fetch user notification settings
      const { data: settings } = await supabaseAdmin
        .from("notification_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!settings || !settings.enable_low_stock_alerts) {
        log.info(`[InventoryAlertWorker] Alerts disabled or missing for user ${userId}. Skipping.`);
        continue;
      }

      // Format alert message
      const title = "⚠️ Low Stock Alert - SellerPlus OS";
      let message = "The following products are running low in your Amazon FBA inventory:\n\n";
      
      items.forEach((item) => {
        const daysText = item.days_until_stockout !== null && item.days_until_stockout !== undefined
          ? `${item.days_until_stockout} days`
          : "N/A (No sales)";
        message += `• *SKU*: ${item.sku}\n  *Product*: ${item.name}\n  *Fulfillable Stock*: ${item.current_stock} units\n  *Daily Velocity*: ${item.daily_velocity || 0} units/day\n  *Days remaining*: ${daysText}\n\n`;
      });
      
      message += "Please restock soon to avoid inventory stockouts.";

      // Dispatch notifications
      const dispatch = await sendNotification({
        title,
        message,
        email: settings.email_destination || undefined,
        discordUrl: settings.discord_webhook_url || undefined,
        telegramBotToken: settings.telegram_bot_token || undefined,
        telegramChatId: settings.telegram_chat_id || undefined
      });

      summary.push({
        userId,
        itemsCount: items.length,
        dispatch
      });
    }

    return NextResponse.json({
      success: true,
      processedAlerts: summary.length,
      details: summary
    });

  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    log.error("[InventoryAlertWorker] Fatal error:", undefined, { error: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
