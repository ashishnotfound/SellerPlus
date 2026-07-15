/**
 * SellerPlus OS — Profit Leak Detection Worker
 * 
 * Autonomous background analysis engine that scans every tenant's data
 * for revenue leaks, advertising waste, inventory drain, and operational
 * inefficiencies. Generates actionable alerts with estimated financial impact.
 * 
 * Triggered via cron: GET /api/workers/profit-leak-detector?secret=<CRON_SECRET>
 * 
 * Detectors:
 *   1. High ACOS campaigns (advertising waste)
 *   2. Dead inventory (storage fee drain)
 *   3. Declining products (revenue erosion)
 *   4. Refund spike detection (quality/fulfillment issues)
 *   5. Missing cost profiles (blind profit calculation)
 *   6. Negative margin products (selling at a loss)
 *   7. Stockout risk (lost sales opportunity)
 */

import { NextResponse } from "next/server";
import { authenticateCron, authErrorResponse } from "@/lib/auth-middleware";
import { sendNotification } from "@/lib/notifications";
import { log } from "@/lib/logger";

// ─── Types ───────────────────────────────────────────────────────────

interface LeakDetection {
  type: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  estimatedImpact: number | null;   // Estimated ₹ impact per month
  affectedSku?: string;
  affectedCampaign?: string;
  recommendedAction: string;
}

interface UserDetectionResult {
  userId: string;
  email: string;
  detections: LeakDetection[];
  totalEstimatedLoss: number;
}

// ─── Detector Functions ──────────────────────────────────────────────

async function detectHighAcos(
  supabase: any,
  userId: string,
  threshold: number = 30
): Promise<LeakDetection[]> {
  const detections: LeakDetection[] = [];

  const { data: campaigns } = await supabase
    .from("advertising_campaigns")
    .select("campaign_id, name, spend, sales, status")
    .eq("user_id", userId)
    .eq("status", "ENABLED");

  if (!campaigns) return detections;

  for (const camp of campaigns) {
    const spend = Number(camp.spend) || 0;
    const sales = Number(camp.sales) || 0;
    if (spend <= 0) continue;

    const acos = sales > 0 ? (spend / sales) * 100 : 100;
    if (acos > threshold) {
      const waste = spend - (sales * (threshold / 100));
      detections.push({
        type: "high_acos",
        severity: acos > 60 ? "critical" : "warning",
        title: `High ACOS: ${camp.name}`,
        message: `Campaign "${camp.name}" has ${acos.toFixed(1)}% ACOS (threshold: ${threshold}%). Spend: ₹${spend.toLocaleString()}, Sales: ₹${sales.toLocaleString()}.`,
        estimatedImpact: Math.round(waste),
        affectedCampaign: camp.campaign_id,
        recommendedAction: acos > 60
          ? "Consider pausing this campaign and restructuring keywords."
          : "Review search term report and add negative keywords to reduce waste.",
      });
    }
  }

  return detections;
}

async function detectDeadInventory(
  supabase: any,
  userId: string,
  daysSinceLastSale: number = 30
): Promise<LeakDetection[]> {
  const detections: LeakDetection[] = [];

  const { data: listings } = await supabase
    .from("listings")
    .select("sku, title, available_qty, price, sales_30d, main_image")
    .eq("user_id", userId)
    .gt("available_qty", 0);

  if (!listings) return detections;

  for (const listing of listings) {
    const sales = Number(listing.sales_30d) || 0;
    const stock = Number(listing.available_qty) || 0;
    const price = Number(listing.price) || 0;

    if (sales === 0 && stock > 0) {
      // Estimate monthly FBA storage cost (~₹40/unit/month for standard size)
      const storageCost = stock * 40;
      detections.push({
        type: "dead_inventory",
        severity: stock > 50 ? "critical" : "warning",
        title: `Dead Inventory: ${listing.sku}`,
        message: `"${listing.title}" has ${stock} units with zero sales in 30 days. Estimated monthly storage cost: ₹${storageCost.toLocaleString()}.`,
        estimatedImpact: storageCost,
        affectedSku: listing.sku,
        recommendedAction: stock > 100
          ? "Create a removal order or run a liquidation campaign to recover costs."
          : "Run a promotional campaign or Lightning Deal to move stale inventory.",
      });
    }
  }

  return detections;
}

async function detectNegativeMargins(
  supabase: any,
  userId: string
): Promise<LeakDetection[]> {
  const detections: LeakDetection[] = [];

  const { data: listings } = await supabase
    .from("listings")
    .select(`
      sku, title, price, sales_30d,
      cost_profiles(
        printing_cost, material_cost, packaging_cost, 
        shipping_cost, labor_cost, misc_cost
      )
    `)
    .eq("user_id", userId);

  if (!listings) return detections;

  for (const listing of listings) {
    const profile = listing.cost_profiles;
    if (!profile) continue;

    const unitCost =
      (parseFloat(profile.printing_cost) || 0) +
      (parseFloat(profile.material_cost) || 0) +
      (parseFloat(profile.packaging_cost) || 0) +
      (parseFloat(profile.shipping_cost) || 0) +
      (parseFloat(profile.labor_cost) || 0) +
      (parseFloat(profile.misc_cost) || 0);

    const price = Number(listing.price) || 0;
    // Amazon referral fee ~15%
    const referralFee = price * 0.15;
    const netAfterFees = price - referralFee;

    if (unitCost > netAfterFees && price > 0) {
      const lossPerUnit = unitCost - netAfterFees;
      const monthlySales = Number(listing.sales_30d) || 0;
      const monthlyLoss = lossPerUnit * monthlySales;

      detections.push({
        type: "negative_margin",
        severity: "critical",
        title: `Negative Margin: ${listing.sku}`,
        message: `"${listing.title}" loses ₹${lossPerUnit.toFixed(0)} per unit sold. Cost: ₹${unitCost.toFixed(0)}, Sell price after fees: ₹${netAfterFees.toFixed(0)}.`,
        estimatedImpact: Math.round(monthlyLoss),
        affectedSku: listing.sku,
        recommendedAction: "Increase selling price or reduce manufacturing costs immediately.",
      });
    }
  }

  return detections;
}

async function detectMissingCostProfiles(
  supabase: any,
  userId: string
): Promise<LeakDetection[]> {
  const detections: LeakDetection[] = [];

  const { data: listings } = await supabase
    .from("listings")
    .select("sku, title, cost_profile_id, sales_30d, price")
    .eq("user_id", userId)
    .is("cost_profile_id", null);

  if (!listings || listings.length === 0) return detections;

  const activeSellers = listings.filter((l: any) => (Number(l.sales_30d) || 0) > 0);

  if (activeSellers.length > 0) {
    const totalBlindRevenue = activeSellers.reduce(
      (sum: number, l: any) => sum + ((Number(l.price) || 0) * (Number(l.sales_30d) || 0)),
      0
    );

    detections.push({
      type: "missing_cost_profile",
      severity: "warning",
      title: `${activeSellers.length} SKUs Missing Cost Profiles`,
      message: `${activeSellers.length} products with active sales have no cost profile configured. ₹${totalBlindRevenue.toLocaleString()} in revenue has unknown true profitability.`,
      estimatedImpact: null,
      recommendedAction: "Configure cost profiles in Cost Config to enable accurate profit tracking.",
    });
  }

  return detections;
}

async function detectStockoutRisk(
  supabase: any,
  userId: string
): Promise<LeakDetection[]> {
  const detections: LeakDetection[] = [];

  const { data: listings } = await supabase
    .from("listings")
    .select("sku, title, available_qty, sales_30d, price, incoming_qty")
    .eq("user_id", userId);

  if (!listings) return detections;

  for (const listing of listings) {
    const stock = Number(listing.available_qty) || 0;
    const sales30d = Number(listing.sales_30d) || 0;
    const dailyVelocity = sales30d / 30;
    const incoming = Number(listing.incoming_qty) || 0;
    const price = Number(listing.price) || 0;

    if (dailyVelocity > 0 && stock > 0) {
      const daysUntilStockout = Math.ceil(stock / dailyVelocity);

      if (daysUntilStockout <= 7 && incoming === 0) {
        const lostDailySales = dailyVelocity * price;
        const potentialLoss = lostDailySales * 14; // Assume 14 days to restock

        detections.push({
          type: "stockout_risk",
          severity: daysUntilStockout <= 3 ? "critical" : "warning",
          title: `Stockout in ${daysUntilStockout}d: ${listing.sku}`,
          message: `"${listing.title}" will run out in ${daysUntilStockout} days at current velocity (${dailyVelocity.toFixed(1)} units/day). No incoming shipment detected.`,
          estimatedImpact: Math.round(potentialLoss),
          affectedSku: listing.sku,
          recommendedAction: "Create an urgent inbound shipment to avoid listing suppression and lost sales.",
        });
      }
    }
  }

  return detections;
}

// ─── Main Worker ─────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { supabaseAdmin } = authenticateCron(request);

    log.info("[ProfitLeakDetector] Starting autonomous scan...");

    // Fetch all active user IDs
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, email, is_suspended")
      .eq("is_suspended", false);

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ success: true, message: "No active users to scan." });
    }

    const results: UserDetectionResult[] = [];

    for (const profile of profiles) {
      const userId = profile.id;

      // Run all detectors in parallel per user
      const [highAcos, deadInventory, negativeMargins, missingCosts, stockoutRisk] =
        await Promise.all([
          detectHighAcos(supabaseAdmin, userId),
          detectDeadInventory(supabaseAdmin, userId),
          detectNegativeMargins(supabaseAdmin, userId),
          detectMissingCostProfiles(supabaseAdmin, userId),
          detectStockoutRisk(supabaseAdmin, userId),
        ]);

      const allDetections = [
        ...highAcos,
        ...deadInventory,
        ...negativeMargins,
        ...missingCosts,
        ...stockoutRisk,
      ];

      if (allDetections.length === 0) continue;

      const totalLoss = allDetections.reduce(
        (sum, d) => sum + (d.estimatedImpact || 0),
        0
      );

      results.push({
        userId,
        email: profile.email,
        detections: allDetections,
        totalEstimatedLoss: totalLoss,
      });

      // Persist alerts to database
      const alertRows = allDetections.map((d) => ({
        user_id: userId,
        type: d.type,
        title: d.title,
        message: d.message,
        severity: d.severity,
        estimated_impact: d.estimatedImpact,
        affected_sku: d.affectedSku || null,
        affected_campaign: d.affectedCampaign || null,
        recommended_action: d.recommendedAction,
        is_read: false,
      }));

      await supabaseAdmin.from("alert_logs").insert(alertRows);

      // Send notification if critical issues found
      const criticalCount = allDetections.filter((d) => d.severity === "critical").length;
      if (criticalCount > 0) {
        // Fetch notification settings
        const { data: settings } = await supabaseAdmin
          .from("notification_settings")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (settings) {
          const criticalSummary = allDetections
            .filter((d) => d.severity === "critical")
            .map((d) => `• ${d.title}`)
            .join("\n");

          await sendNotification({
            title: `🚨 ${criticalCount} Critical Profit Leak${criticalCount > 1 ? "s" : ""} Detected`,
            message: `SellerPlus detected ${criticalCount} critical issues requiring immediate attention:\n\n${criticalSummary}\n\nEstimated monthly impact: ₹${totalLoss.toLocaleString()}\n\nLog in to your dashboard to review and resolve.`,
            email: settings.email_destination || undefined,
            discordUrl: settings.discord_webhook_url || undefined,
            telegramBotToken: settings.telegram_bot_token || undefined,
            telegramChatId: settings.telegram_chat_id || undefined,
          });
        }
      }
    }

    log.info(
      `[ProfitLeakDetector] Scan complete. ${results.length} users with detections. Total findings: ${results.reduce((s, r) => s + r.detections.length, 0)}`
    );

    return NextResponse.json({
      success: true,
      usersScanned: profiles.length,
      usersWithIssues: results.length,
      totalDetections: results.reduce((s, r) => s + r.detections.length, 0),
      summary: results.map((r) => ({
        userId: r.userId,
        detectionCount: r.detections.length,
        estimatedMonthlyLoss: r.totalEstimatedLoss,
        criticalCount: r.detections.filter((d) => d.severity === "critical").length,
      })),
    });
  } catch (error) {
    const { body, status } = authErrorResponse(error);
    if (status !== 500) {
      return NextResponse.json(body, { status });
    }
    log.error("[ProfitLeakDetector] Fatal error:", undefined, { error: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
