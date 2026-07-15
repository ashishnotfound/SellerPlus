import { NextResponse } from "next/server";
import { routeLLMRequest } from "@/lib/ai/utils";
import { ProviderCapability } from "@/lib/ai/types";

const SCHEMA_DESCRIPTION = `
PostgreSQL Database Schema (strictly read-only access for analytical queries):

1. public.orders:
- id: UUID (Primary Key)
- user_id: UUID
- channel: TEXT ('amazon', etc.)
- channel_order_id: TEXT
- status: TEXT ('Pending', 'Shipped', 'Canceled', etc.)
- total_amount: NUMERIC (INR currency)
- purchase_date: TIMESTAMPTZ
- commission_fees: NUMERIC
- fba_fees: NUMERIC
- shipping_cost: NUMERIC
- advertising_cost: NUMERIC
- gross_profit: NUMERIC
- net_profit: NUMERIC

2. public.order_items:
- id: UUID
- order_id: UUID (references public.orders.id)
- sku: TEXT
- title: TEXT
- quantity: INTEGER
- item_price: NUMERIC

3. public.listings:
- id: UUID
- user_id: UUID
- sku: TEXT (unique per user)
- asin: TEXT
- title: TEXT
- price: NUMERIC
- available_qty: INTEGER
- sales_30d: INTEGER
- cost_profile_id: UUID (references public.cost_profiles.id)

4. public.cost_profiles:
- id: UUID
- user_id: UUID
- name: TEXT
- material_cost: NUMERIC
- printing_cost: NUMERIC
- packaging_cost: NUMERIC
- shipping_cost: NUMERIC
- labor_cost: NUMERIC
- misc_cost: NUMERIC

5. public.expenses:
- id: UUID
- user_id: UUID
- title: TEXT
- amount: NUMERIC
- category: TEXT
- expense_date: DATE

6. public.goals:
- id: UUID
- user_id: UUID
- title: TEXT
- target_metric: TEXT ('revenue', 'profit', 'acos', etc.)
- target_value: NUMERIC
- current_value: NUMERIC
- start_date: DATE
- end_date: DATE
- status: TEXT ('active', 'completed', 'failed')
`;

function isSafeSQL(sql: string): boolean {
  const norm = sql.toLowerCase().trim();
  
  // Rule 1: Must start with SELECT (read-only queries)
  if (!norm.startsWith("select")) {
    return false;
  }
  
  // Rule 2: Block updates, inserts, deletes, drops, alters, truncate
  const forbidden = [
    "insert", "update", "delete", "drop", "alter", "truncate", "create", 
    "grant", "revoke", "replace", "schema", "pg_sleep", "copy", "import"
  ];
  
  for (const word of forbidden) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(norm)) {
      return false;
    }
  }
  
  return true;
}

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

    // Step 1: Generate SQL query to answer user's question
    const queryPrompt = `
      You are an expert PostgreSQL developer assisting a business owner.
      Translate the user's natural language question into a single safe PostgreSQL SELECT query to fetch analytics from the database.
      
      User Question: "${message}"
      Active User UUID: '${userId}'
      
      ${SCHEMA_DESCRIPTION}
      
      CRITICAL INSTRUCTIONS:
      - ONLY query rows where user_id = '${userId}'. For joins, ensure you check user_id.
      - Return ONLY a JSON object containing the SELECT query in a property named "sqlQuery". Do not include formatting markup, tags, or markdown blocks.
      
      Example response format:
      {
        "sqlQuery": "SELECT sum(net_profit) FROM public.orders WHERE user_id = '${userId}' AND status != 'Canceled'"
      }
    `;

    console.log("[AIAssistant] Requesting SQL query translation...");
    const { text: queryText } = await routeLLMRequest(
      queryPrompt, 
      userId, 
      { capabilities: [ProviderCapability.JsonMode] }
    );
    
    let cleanedQueryText = queryText.trim();
    if (cleanedQueryText.startsWith("```json")) {
      cleanedQueryText = cleanedQueryText.substring(7, cleanedQueryText.length - 3).trim();
    } else if (cleanedQueryText.startsWith("```")) {
      cleanedQueryText = cleanedQueryText.substring(3, cleanedQueryText.length - 3).trim();
    }

    let parsedQuery;
    let sql = "";
    try {
      parsedQuery = JSON.parse(cleanedQueryText);
      sql = parsedQuery.sqlQuery || "";
    } catch (_) {}

    let queryData: any[] = [];
    let queryError = "";

    // Execute query if safe
    if (sql && isSafeSQL(sql)) {
      console.log("[AIAssistant] Executing SQL via exec_sql:", sql);
      const { data, error } = await supabaseAdmin.rpc("exec_sql", { sql });
      if (error) {
        queryError = error.message;
        console.error("[AIAssistant] DB Execution failed:", error.message);
      } else {
        queryData = data || [];
        console.log("[AIAssistant] DB Results count:", queryData.length);
      }
    } else if (sql) {
      queryError = "Blocked: unsafe query detected.";
      console.warn("[AIAssistant] Unsafe query blocked:", sql);
    }

    // Step 2: Feed data back to synthesize final response
    const synthesisPrompt = `
      You are ARIA — the AI Business Intelligence Assistant built into SellerPlus.
      The user asked: "${message}"
      
      Database query executed:
      ${sql || "None"}
      
      Query Results Data:
      ${JSON.stringify(queryData)}
      
      Database Query Error (if any):
      ${queryError || "None"}
      
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
