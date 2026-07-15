/**
 * SellerPlus OS — Amazon Orders Sync API
 * 
 * Authenticated endpoint for syncing Amazon SP-API orders and FBA inventory.
 * Uses JWT-verified user identity — userId is never trusted from request body.
 */

import { NextResponse } from "next/server";
import {
  authenticateWithDevFallback,
  authErrorResponse,
} from "@/lib/auth-middleware";
import {
  syncOrders,
  syncFbaInventory,
  type AmazonCredentials,
} from "@/lib/amazon-sync-service";
import { log } from "@/lib/logger";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientId, clientSecret, refreshToken, region, sandbox, userId: bodyUserId, lastUpdatedAfter, fullRebuild = false } = body;

    // Authenticate: JWT in production, body userId in development
    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request, bodyUserId);

    if (!clientId || !clientSecret || !refreshToken) {
      return NextResponse.json(
        { error: "Missing required Amazon credentials." },
        { status: 400 }
      );
    }

    const credentials: AmazonCredentials = {
      clientId,
      clientSecret,
      refreshToken,
      region: region || "India (amazon.in)",
      sandbox: sandbox || false,
    };

    // Determine delta sync boundary:
    // If fullRebuild is true, sync historical orders from 365 days ago.
    // If lastUpdatedAfter is not provided, check the most recent order in the DB
    let syncAfter = lastUpdatedAfter;
    if (fullRebuild) {
      syncAfter = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      log.info(`[SyncOrdersRoute] Full account rebuild requested. Syncing from: ${syncAfter}`);
    } else if (!syncAfter) {
      const { data: latestOrder } = await supabaseAdmin
        .from("orders")
        .select("last_update_date")
        .eq("user_id", userId)
        .eq("channel", "amazon")
        .order("last_update_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestOrder?.last_update_date) {
        syncAfter = latestOrder.last_update_date;
        log.info(`[SyncOrdersRoute] Delta sync from: ${syncAfter}`);
      } else {
        // First sync: fetch last 90 days
        syncAfter = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        log.info(`[SyncOrdersRoute] Initial sync from: ${syncAfter}`);
      }
    }

    log.info("[SyncOrdersRoute] Starting orders sync...");
    const summary = await syncOrders(supabaseAdmin, userId, credentials, syncAfter);

    log.info("[SyncOrdersRoute] Starting FBA inventory sync...");
    const invResult = await syncFbaInventory(supabaseAdmin, userId, credentials);
    log.info("[SyncOrdersRoute] FBA inventory sync complete", undefined, { invResult });

    return NextResponse.json({ 
      success: true, 
      summary: {
        ...summary,
        inventorySynced: invResult.synced,
        inventoryError: invResult.error
      }
    });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error("[SyncOrdersRoute] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

