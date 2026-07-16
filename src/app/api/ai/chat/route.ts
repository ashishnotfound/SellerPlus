import { NextResponse } from "next/server";
import { routeLLMRequest } from "@/lib/ai/utils";
import { ProviderCapability } from "@/lib/ai/types";
import { BIRepository } from "@/lib/repositories/bi-repository";
import { KPIService } from "@/lib/services/kpi-service";



import {
  authenticateWithDevFallback,
  authErrorResponse,
} from "@/lib/auth-middleware";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, context } = body;

    if (!message) {
      return NextResponse.json({ error: "No message provided" }, { status: 400 });
    }

    // Authenticate the request and get the validated userId and supabaseAdmin client
    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request, context?.userId);

    const [adsSummary, ordersSummary, inventorySummary, cogsSummary] = await Promise.all([
      BIRepository.getAdsSummary(userId),
      BIRepository.getOrdersSummary(userId),
      BIRepository.getInventorySummary(userId),
      BIRepository.getCogsSummary(userId),
    ]);

    const totalFees = ordersSummary.totalCommissionFees + ordersSummary.totalFbaFees + ordersSummary.totalShippingCost;
    const profit = KPIService.calculateProfit(
      ordersSummary.totalRevenue,
      cogsSummary.totalCogs,
      totalFees,
      adsSummary.totalSpend,
      0
    );

    const queryData = {
      revenue: ordersSummary.totalRevenue,
      orders: ordersSummary.totalOrders,
      adsSpend: adsSummary.totalSpend,
      adsSales: adsSummary.totalSales,
      profit: profit,
      cogs: cogsSummary.totalCogs,
      inventoryItems: inventorySummary.totalItems,
      lowStockItems: inventorySummary.lowStockItems,
    };

    // Step 2: Feed data back to synthesize final response
    const synthesisPrompt = `
      You are ARIA — the AI Business Intelligence Assistant built into SellerPlus.
      The user asked: "${message}"
      
      Verified Business Data context:
      ${JSON.stringify(queryData, null, 2)}
      
      Format the final reply based on the real database numbers.
      Format currency in Indian Rupees (₹). Keep responses professional, helpful, and concise.
      
      If an action is requested, return it in the "action" block.
      Available actions:
      - navigate: { "type": "navigate", "to": "/goals" | "/dashboard" | "/listings" | "/costs" | "/expenses" | "/settings" }
      - celebrate: { "type": "celebrate", "message": string }
      
      Return ONLY a JSON response in this exact format:
      {
        "reply": "Your natural language summary and answer here",
        "action": { ... } or null,
        "insights": ["insight 1", "insight 2"]
      }
    `;

    console.log("[AIAssistant] Requesting final response synthesis...");
    const { text: synthesisText } = await routeLLMRequest(
      synthesisPrompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    
    let cleanedSynthesisText = synthesisText.trim();
    if (cleanedSynthesisText.startsWith("```json")) {
      cleanedSynthesisText = cleanedSynthesisText.substring(7, cleanedSynthesisText.length - 3).trim();
    } else if (cleanedSynthesisText.startsWith("```")) {
      cleanedSynthesisText = cleanedSynthesisText.substring(3, cleanedSynthesisText.length - 3).trim();
    }

    let parsedReply;
    try {
      parsedReply = JSON.parse(cleanedSynthesisText);
    } catch (_) {
      parsedReply = {
        reply: cleanedSynthesisText,
        action: null,
        insights: []
      };
    }

    return NextResponse.json({
      reply: parsedReply.reply || cleanedSynthesisText,
      action: parsedReply.action || null,
      insights: parsedReply.insights || [],
      sqlQuery: sql,
      routedBy: {
        sqlQueryTranslation: "AIGateway Router",
        responseSynthesis: "AIGateway Router"
      }
    });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json({ reply: authErr.body.error, action: null }, { status: authErr.status });
    }
    console.error("[AI Chat] Fatal Error:", error);
    return NextResponse.json(
      { reply: "Sorry, I ran into an error processing your query.", action: null },
      { status: 500 }
    );
  }
}
