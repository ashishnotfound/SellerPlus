import { NextResponse } from "next/server";
import {
  authenticateWithDevFallback,
  authErrorResponse,
} from "@/lib/auth-middleware";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId: bodyUserId } = body;

    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request, bodyUserId);

    // 1. Clear existing alerts for this user
    await supabaseAdmin
      .from("listing_alerts")
      .delete()
      .eq("user_id", userId);

    // 2. Fetch Listings & Cost Profiles to calculate alerts
    const { data: listings } = await supabaseAdmin
      .from("listings")
      .select(`
        id,
        sku,
        asin,
        title,
        price,
        available_qty,
        cost_profile_id
      `)
      .eq("user_id", userId);

    const { data: profiles } = await supabaseAdmin
      .from("cost_profiles")
      .select("*")
      .eq("user_id", userId);

    const alertsToInsert: any[] = [];

    if (listings) {
      for (const item of listings) {
        // A. Check Low/Out of stock
        const stock = item.available_qty || 0;
        if (stock === 0) {
          alertsToInsert.push({
            user_id: userId,
            sku: item.sku,
            asin: item.asin || "N/A",
            alert_type: "OUT_OF_STOCK",
            severity: "CRITICAL",
            reason: `Out of Stock: SKU (${item.sku}) has 0 fulfillable units left on Amazon.`,
            recommended_action: "Inbound fresh inventory shipment to FBA center immediately.",
            resolved: false
          });
        } else if (stock <= 10) {
          alertsToInsert.push({
            user_id: userId,
            sku: item.sku,
            asin: item.asin || "N/A",
            alert_type: "LOW_STOCK",
            severity: "WARNING",
            reason: `Low Stock: SKU (${item.sku}) has only ${stock} units remaining.`,
            recommended_action: "Initiate restock order to prevent listing suppression.",
            resolved: false
          });
        }

        // B. Check Negative Profit Margin
        if (item.cost_profile_id && profiles) {
          const profile = profiles.find(p => p.id === item.cost_profile_id);
          if (profile) {
            const unitCost = 
              parseFloat(profile.printing_cost || 0) +
              parseFloat(profile.material_cost || 0) +
              parseFloat(profile.packaging_cost || 0) +
              parseFloat(profile.shipping_cost || 0) +
              parseFloat(profile.labor_cost || 0) +
              parseFloat(profile.misc_cost || 0);

            const price = parseFloat(item.price || 0);
            if (unitCost > price) {
              alertsToInsert.push({
                user_id: userId,
                sku: item.sku,
                asin: item.asin || "N/A",
                alert_type: "NEGATIVE_PROFIT",
                severity: "CRITICAL",
                reason: `Negative Profit: SKU (${item.sku}) has unit cost of ₹${unitCost} but sells for ₹${price} (Loss: -₹${(unitCost - price).toFixed(2)} per sale).`,
                recommended_action: "Increase price or optimize raw material manufacturing costs.",
                resolved: false
              });
            }
          }
        }
      }
    }

    // Insert new alerts
    if (alertsToInsert.length > 0) {
      await supabaseAdmin
        .from("listing_alerts")
        .insert(alertsToInsert);
    }

    return NextResponse.json({ success: true, count: alertsToInsert.length });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
