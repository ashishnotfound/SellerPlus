import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

interface LLMTestPayload {
  provider: "gemini" | "openai" | "anthropic" | "deepseek" | "openrouter" | "ollama";
  api_key: string;
  model_name: string;
  endpoint_url?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as LLMTestPayload;
    const { provider, api_key, model_name, endpoint_url } = body;

    if (!provider || !model_name) {
      return NextResponse.json({ success: false, error: "Missing provider or model name" }, { status: 400 });
    }

    if (provider !== "ollama" && !api_key) {
      return NextResponse.json({ success: false, error: "Missing API Key for this provider" }, { status: 400 });
    }

    const testPrompt = "Hello. Respond with exactly the word 'CONNECTED' to confirm connection.";
    let reply = "";

    switch (provider) {
      case "gemini": {
        const genAI = new GoogleGenerativeAI(api_key);
        const model = genAI.getGenerativeModel({ model: model_name });
        const result = await model.generateContent(testPrompt);
        reply = result.response.text();
        break;
      }
      
      case "openai":
      case "deepseek":
      case "openrouter":
      case "ollama": {
        let endpoint = "";
        if (provider === "openai") endpoint = "https://api.openai.com/v1/chat/completions";
        else if (provider === "deepseek") endpoint = "https://api.deepseek.com/chat/completions";
        else if (provider === "openrouter") endpoint = "https://openrouter.ai/api/v1/chat/completions";
        else if (provider === "ollama") endpoint = endpoint_url || "http://localhost:11434/v1/chat/completions";
        
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        
        if (api_key) {
          headers["Authorization"] = `Bearer ${api_key}`;
        }
        
        const payload = {
          model: model_name,
          messages: [{ role: "user", content: testPrompt }],
          max_tokens: 10
        };
        
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        
        if (!res.ok) {
          const errText = await res.text();
          return NextResponse.json({ success: false, error: `HTTP ${res.status}: ${errText}` });
        }
        
        const data = await res.json();
        reply = data.choices?.[0]?.message?.content || "";
        break;
      }
      
      case "anthropic": {
        const endpoint = "https://api.anthropic.com/v1/messages";
        const headers = {
          "x-api-key": api_key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        };
        
        const payload = {
          model: model_name,
          max_tokens: 10,
          messages: [{ role: "user", content: testPrompt }],
        };
        
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
        
        if (!res.ok) {
          const errText = await res.text();
          return NextResponse.json({ success: false, error: `HTTP ${res.status}: ${errText}` });
        }
        
        const data = await res.json();
        reply = data.content?.[0]?.text || "";
        break;
      }
      
      default:
        return NextResponse.json({ success: false, error: "Unsupported provider" });
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully connected to ${provider.toUpperCase()}`,
      response: reply.trim()
    });

  } catch (error: any) {
    console.error("[TestGateway] Connection failed:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to reach the provider." });
  }
}
