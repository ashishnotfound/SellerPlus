import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authenticateWithDevFallback, authErrorResponse } from "@/lib/auth-middleware";

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export async function POST(request: Request) {
  try {
    if (!genAI) {
      return NextResponse.json(
        { error: "Gemini API key is not configured." },
        { status: 500 }
      );
    }

    const { input, userId: bodyUserId } = await request.json();

    if (!input) {
      return NextResponse.json(
        { error: "Missing required input text." },
        { status: 400 }
      );
    }

    const { userId, supabaseAdmin } = await authenticateWithDevFallback(request, bodyUserId);

    // 1. Get all active listing SKUs for this user to help Gemini match
    const { data: listings } = await supabaseAdmin
      .from("listings")
      .select("sku, title")
      .eq("user_id", userId);

    const skuList = listings?.map(l => `${l.sku} (${l.title})`).join("\n") || "No SKUs available.";

    // 2. Query Gemini to parse the natural language input
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    const prompt = `
      You are an expert ERP cost accounting parser.
      Analyze this user request and extract specific SKU pricing or cost updates.
      
      User Input: "${input}"
      
      Available Catalog SKUs for reference matching:
      ${skuList}
      
      Extract values for these cost categories:
      - printingCost
      - materialCost
      - packagingCost
      - shippingCost
      - laborCost
      - miscCost
      
      Return ONLY a JSON array of updates. Do not include markdown tags, comments, or prefix text. If a cost category is not mentioned, do not output it.
      
      JSON output format:
      [
        {
          "sku": "matching_sku_from_catalog",
          "costs": {
            "printingCost": number,
            "materialCost": number,
            "packagingCost": number,
            "shippingCost": number,
            "laborCost": number,
            "miscCost": number
          }
        }
      ]
    `;

    const result = await model.generateContent(prompt);
    let text = result.response.text().trim();
    
    // Clean markdown code blocks if Gemini returns them
    if (text.startsWith("```json")) {
      text = text.substring(7, text.length - 3).trim();
    } else if (text.startsWith("```")) {
      text = text.substring(3, text.length - 3).trim();
    }

    console.log("[ParseCosts] Gemini output:", text);

    const updates = JSON.parse(text);
    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ success: false, error: "Could not extract any cost updates from your input." });
    }

    const applied = [];

    for (const update of updates) {
      const { sku, costs } = update;
      if (!sku) continue;

      // Find the listing row in Supabase
      const { data: listing } = await supabaseAdmin
        .from("listings")
        .select("id, cost_profile_id, title")
        .eq("user_id", userId)
        .eq("sku", sku)
        .maybeSingle();

      if (!listing) {
        console.warn(`[ParseCosts] SKU ${sku} not found for user ${userId}`);
        continue;
      }

      let profileId = listing.cost_profile_id;

      if (profileId) {
        // Update existing cost profile
        const patch: Record<string, number> = {};
        if (costs.printingCost !== undefined) patch.printing_cost = costs.printingCost;
        if (costs.materialCost !== undefined) patch.material_cost = costs.materialCost;
        if (costs.packagingCost !== undefined) patch.packaging_cost = costs.packagingCost;
        if (costs.shippingCost !== undefined) patch.shipping_cost = costs.shippingCost;
        if (costs.laborCost !== undefined) patch.labor_cost = costs.laborCost;
        if (costs.miscCost !== undefined) patch.misc_cost = costs.miscCost;

        await supabaseAdmin
          .from("cost_profiles")
          .update(patch)
          .eq("id", profileId);
      } else {
        // Create new cost profile for this SKU
        const newProfile = {
          user_id: userId,
          name: `NLP Profile: ${sku}`,
          printing_cost: costs.printingCost || 0,
          material_cost: costs.materialCost || 0,
          packaging_cost: costs.packagingCost || 0,
          shipping_cost: costs.shippingCost || 0,
          labor_cost: costs.laborCost || 0,
          misc_cost: costs.miscCost || 0
        };

        const { data: inserted, error } = await supabaseAdmin
          .from("cost_profiles")
          .insert(newProfile)
          .select("id")
          .single();

        if (error) {
          console.error("[ParseCosts] Failed to insert profile:", error.message);
          continue;
        }

        profileId = inserted.id;

        // Assign profile to listing
        await supabaseAdmin
          .from("listings")
          .update({ cost_profile_id: profileId })
          .eq("id", listing.id);
      }

      applied.push({ sku, title: listing.title, costs });
    }

    return NextResponse.json({ success: true, applied });
  } catch (error: any) {
    const authErr = authErrorResponse(error);
    if (error?.name === "AuthError") {
      return NextResponse.json(authErr.body, { status: authErr.status });
    }
    console.error("[ParseCosts] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
