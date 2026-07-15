import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";

export async function POST(request: Request) {
  try {
    // Authenticate user session
    await authenticateWithDevFallback(request);

    const keyFromHeader = request.headers.get("x-gemini-key") || "";
    if (!keyFromHeader) {
      return NextResponse.json(
        { error: "Gemini API key is not configured. Please paste your Gemini API Key in the Settings page." },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(keyFromHeader);
    const body = await request.json();
    const { message, chatHistory, listings, profiles } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Missing user message." },
        { status: 400 }
      );
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

    // Build context about current profiles and listings
    const profilesCtx = profiles?.map((p: any) => 
      `- Profile: "${p.name}" (ID: ${p.id}) -> printing: ${p.printing_cost}, material: ${p.material_cost}, packaging: ${p.packaging_cost}, shipping: ${p.shipping_cost}, labor: ${p.labor_cost}, misc: ${p.misc_cost}`
    ).join("\n") || "No cost profiles exist yet.";

    const listingsCtx = listings?.map((l: any) => 
      `- SKU: "${l.sku}" (ASIN: ${l.asin || 'N/A'}, Price: ₹${l.price}) -> Title: "${l.title}" | Profile: ${l.cost_profile_id ? 'Mapped' : 'Unassigned'}`
    ).join("\n") || "No listings in catalog.";

    const systemPrompt = `
You are ARIA, the modern AI Cost Assistant chatbot for SellerPlus.
You help sellers manage cost configurations, link listings, and calculate profits.

Style Guidelines:
- Write extremely short, concise responses. Do NOT repeat instructions, output introductory boilerplate, or list raw data that is already visible on the screen.
- Focus purely on the proposed action. Keep explanations under 2 sentences.
- Bad: "I have initialized your first profile and linked the items. It is now ready for your confirmation."
- Good: "Drafted cost profile 'A3 Poster'. Ready to apply."

Supported Actions:
- create_profile: User wants to create a new cost profile.
  Payload parameters:
    - name: string (e.g. "Sets of 2", "A3 Poster")
    - printing_cost: number (default 0)
    - material_cost: number (default 0)
    - packaging_cost: number (default 0)
    - shipping_cost: number (default 0)
    - labor_cost: number (default 0)
    - misc_cost: number (default 0)

- assign_sku: User wants to assign a SKU to a cost profile.
  Payload parameters:
    - sku: string (must match an existing SKU from the catalog)
    - profile_name: string (must match the name of one of the active cost profiles)

- update_cost: User wants to update a cost field on a profile.
  Payload parameters:
    - profile_name: string (must match the name of the profile to update, or if not specified, find the most relevant active profile)
    - cost_type: "printing_cost" | "material_cost" | "packaging_cost" | "shipping_cost" | "labor_cost" | "misc_cost"
    - value: number

- show_unassigned: User wants to isolate or show products without profiles.
  Payload parameters: none

- calculate_profit: User wants to calculate profitability stats.
  Payload parameters: none

Natural Language Parsing Rules:
- "Tube costs ₹7" -> Update cost action for "packaging_cost" = 7 on relevant profile.
- "A3 printing costs ₹7" -> Update cost action for "printing_cost" = 7 on "A3" or similar profile.
- "A4 printing costs ₹3.5" -> Update cost action for "printing_cost" = 3.5 on "A4" or similar profile.
- "Increase shipping by ₹10" -> If current shipping is 40, update shipping_cost to 50 on all profiles (or return update_cost payload).
- "Packaging for Frames ₹20" -> Update cost action for "packaging_cost" = 20 on "Frames" profile.
- "Create profile for Sets of 2" -> Create profile action with name = "Sets of 2".
- "Assign A3 profile to all A3 posters" -> Assign SKU action matching listings with A3 in SKU/title.

Here are the active cost profiles:
${profilesCtx}

Here are the catalog listings:
${listingsCtx}

Chat History:
${JSON.stringify(chatHistory || [])}

User message: "${message}"

Output ONLY a raw JSON object matching this schema. No markdown backticks, no wrapping:
{
  "message": "...",
  "action": {
    "type": "create_profile" | "assign_sku" | "update_cost" | "show_unassigned" | "calculate_profit",
    "payload": { ... }
  }
}
`;

    const result = await model.generateContent(systemPrompt);
    let responseText = result.response.text().trim();

    // Clean JSON output wrappers if generated
    if (responseText.startsWith("```json")) {
      responseText = responseText.substring(7, responseText.length - 3).trim();
    } else if (responseText.startsWith("```")) {
      responseText = responseText.substring(3, responseText.length - 3).trim();
    }

    try {
      const parsed = JSON.parse(responseText);
      return NextResponse.json({ success: true, data: parsed });
    } catch (e: any) {
      console.error("[CostChatbotAPI] JSON parse fail:", responseText, e);
      return NextResponse.json({ 
        success: true, 
        data: { 
          message: `I analyzed your request, but couldn't generate a structured response: ${responseText}`, 
          action: null 
        } 
      });
    }
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json({ error: authErr.body.error }, { status: authErr.status });
    }
    console.error("[CostChatbotAPI] Error:", error);
    return NextResponse.json({ error: error.message || "An unexpected error occurred." }, { status: 500 });
  }
}

