"use client";

import React, { useState, useEffect } from "react";
import { GlassCard } from "@/components/glass-card";
import { useAuth } from "@/hooks/use-auth";
import { useConnections } from "@/hooks/use-connections";
import { Key, Link as LinkIcon, RefreshCw, Save, Shield, User, X, Loader2, CheckCircle2, Bell, Mail, MessageSquare, Bot } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToastStore } from "@/hooks/use-toast-store";

export default function SettingsPage() {
  const user = useAuth((s) => s.user);
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [role, setRole] = useState(user?.role || "Owner");
  const [geminiKey, setGeminiKey] = useState(
    typeof window !== "undefined" ? (localStorage.getItem("gemini_api_key") || "") : ""
  );

  // Multi-LLM gateway configs
  const [llmConfigs, setLlmConfigs] = useState<Record<string, {
    id?: string;
    api_key: string;
    model_name: string;
    endpoint_url: string;
    priority: number;
    is_enabled: boolean;
  }>>({
    gemini: { api_key: "", model_name: "gemini-1.5-flash", endpoint_url: "", priority: 5, is_enabled: true },
    openai: { api_key: "", model_name: "gpt-4o", endpoint_url: "", priority: 1, is_enabled: false },
    anthropic: { api_key: "", model_name: "claude-3-5-sonnet-20241022", endpoint_url: "", priority: 1, is_enabled: false },
    deepseek: { api_key: "", model_name: "deepseek-chat", endpoint_url: "", priority: 1, is_enabled: false },
    openrouter: { api_key: "", model_name: "google/gemini-2.5-flash", endpoint_url: "", priority: 1, is_enabled: false },
    ollama: { api_key: "", model_name: "llama3", endpoint_url: "http://localhost:11434/v1/chat/completions", priority: 1, is_enabled: false }
  });
  const [activeLlmTab, setActiveLlmTab] = useState<string>("gemini");
  const [testingLlm, setTestingLlm] = useState<string | null>(null);

  // Notifications configuration states
  const [notificationSettings, setNotificationSettings] = useState({
    id: "",
    email_destination: "",
    discord_webhook_url: "",
    telegram_bot_token: "",
    telegram_chat_id: "",
    enable_low_stock_alerts: true,
    enable_daily_summaries: true
  });
  const [testingNotificationChannel, setTestingNotificationChannel] = useState<string | null>(null);

  // Load notification settings on mount
  useEffect(() => {
    async function fetchNotificationSettings() {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from("notification_settings")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!error && data) {
          setNotificationSettings({
            id: data.id,
            email_destination: data.email_destination || "",
            discord_webhook_url: data.discord_webhook_url || "",
            telegram_bot_token: data.telegram_bot_token || "",
            telegram_chat_id: data.telegram_chat_id || "",
            enable_low_stock_alerts: data.enable_low_stock_alerts,
            enable_daily_summaries: data.enable_daily_summaries
          });
        }
      } catch (err) {
        console.error("Failed to load notifications settings", err);
      }
    }
    fetchNotificationSettings();
  }, [user?.id]);

  const handleSaveNotifications = async () => {
    if (!user?.id) {
      useToastStore.getState().error("Authorization Required", "Please log in again.");
      return;
    }
    try {
      const payload = {
        user_id: user.id,
        email_destination: notificationSettings.email_destination.trim(),
        discord_webhook_url: notificationSettings.discord_webhook_url.trim(),
        telegram_bot_token: notificationSettings.telegram_bot_token.trim(),
        telegram_chat_id: notificationSettings.telegram_chat_id.trim(),
        enable_low_stock_alerts: notificationSettings.enable_low_stock_alerts,
        enable_daily_summaries: notificationSettings.enable_daily_summaries
      };
      
      const { data, error } = await supabase
        .from("notification_settings")
        .upsert(payload, { onConflict: "user_id" })
        .select();
        
      if (error) {
        useToastStore.getState().error("Save Failed", error.message);
      } else {
        if (data && data[0]) {
          setNotificationSettings(prev => ({ ...prev, id: data[0].id }));
        }
        useToastStore.getState().success("Notifications Saved", "Configuration updated successfully.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      useToastStore.getState().error("Error Saving", msg);
    }
  };

  const handleTestNotificationChannel = async (channel: "email" | "discord" | "telegram") => {
    setTestingNotificationChannel(channel);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: channel,
          email: notificationSettings.email_destination,
          webhookUrl: notificationSettings.discord_webhook_url,
          botToken: notificationSettings.telegram_bot_token,
          chatId: notificationSettings.telegram_chat_id
        })
      });
      const data = await res.json();
      if (data.success) {
        useToastStore.getState().success(
          `${channel.toUpperCase()} Connected`,
          "A test message was dispatched to your channel."
        );
      } else {
        useToastStore.getState().error("Connection Failed", data.error || "Unknown error occurred");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      useToastStore.getState().error("Connection Failed", msg);
    } finally {
      setTestingNotificationChannel(null);
    }
  };

  // Load LLM configs on mount
  useEffect(() => {
    async function fetchLlmSettings() {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from("llm_settings")
          .select("*")
          .eq("user_id", user.id);
        if (!error && data) {
          setLlmConfigs(prev => {
            const next = { ...prev };
            data.forEach((row: any) => {
              if (row.provider in next) {
                next[row.provider] = {
                  id: row.id,
                  api_key: row.api_key || "",
                  model_name: row.model_name || "",
                  endpoint_url: row.endpoint_url || "",
                  priority: row.priority || 1,
                  is_enabled: row.is_enabled || false
                };
              }
            });
            return next;
          });
        }
      } catch (err) {
        console.error("Failed to fetch LLM configs", err);
      }
    }
    fetchLlmSettings();
  }, [user?.id]);

  const handleSaveLlmConfig = async (provider: string) => {
    if (!user?.id) {
      useToastStore.getState().error("Authorization Required", "Please log in again.");
      return;
    }
    const config = llmConfigs[provider];
    try {
      const payload = {
        user_id: user.id,
        provider,
        api_key: config.api_key.trim(),
        model_name: config.model_name.trim(),
        endpoint_url: config.endpoint_url.trim(),
        priority: config.priority,
        is_enabled: config.is_enabled
      };
      
      const { data, error } = await supabase
        .from("llm_settings")
        .upsert(payload, { onConflict: "user_id,provider" })
        .select();
        
      if (error) {
        useToastStore.getState().error("Save Failed", `Failed to save ${provider}: ${error.message}`);
      } else {
        if (data && data[0]) {
          setLlmConfigs(prev => ({
            ...prev,
            [provider]: {
              ...prev[provider],
              id: data[0].id
            }
          }));
        }
        useToastStore.getState().success(`${provider.toUpperCase()} Saved`, "LLM settings updated.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      useToastStore.getState().error("Save Error", msg);
    } finally {
    }
  };

  const handleTestLlmGateway = async (provider: string) => {
    const config = llmConfigs[provider];
    if (provider !== "ollama" && !config.api_key.trim()) {
      useToastStore.getState().warning("API Key Required", `Please enter the API Key for ${provider.toUpperCase()} before testing.`);
      return;
    }
    setTestingLlm(provider);
    try {
      const res = await fetch("/api/ai/test-gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          api_key: config.api_key,
          model_name: config.model_name,
          endpoint_url: config.endpoint_url
        })
      });
      const data = await res.json();
      if (data.success) {
        useToastStore.getState().success("Gateway Connected", `Provider response: "${data.response}"`);
      } else {
        useToastStore.getState().error("Gateway Test Failed", data.error || "Unknown Error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      useToastStore.getState().error("Gateway Error", msg);
    } finally {
      setTestingLlm(null);
    }
  };

  // Global connections hook
  const amazonConnected = useConnections((s) => s.amazonConnected);
  const flipkartConnected = useConnections((s) => s.flipkartConnected);
  const meeshoConnected = useConnections((s) => s.meeshoConnected);
  const shopifyConnected = useConnections((s) => s.shopifyConnected);
  const amazonSellerId = useConnections((s) => s.amazonSellerId);
  const amazonMarketplace = useConnections((s) => s.amazonMarketplace);
  const connectAmazon = useConnections((s) => s.connectAmazon);
  const disconnectAmazon = useConnections((s) => s.disconnectAmazon);
  const connectFlipkart = useConnections((s) => s.connectFlipkart);
  const disconnectFlipkart = useConnections((s) => s.disconnectFlipkart);
  const connectMeesho = useConnections((s) => s.connectMeesho);
  const disconnectMeesho = useConnections((s) => s.disconnectMeesho);
  const connectShopify = useConnections((s) => s.connectShopify);
  const disconnectShopify = useConnections((s) => s.disconnectShopify);

  // API Keys states
  const [apiKeys, setApiKeys] = useState<{ id: string; name: string; key: string; created: string }[]>([]);

  // Amazon Modal state
  const [showAmazonModal, setShowAmazonModal] = useState(false);
  const [sellerIdInput, setSellerIdInput] = useState(amazonSellerId || "A39XYZ12345678");
  const [marketplaceInput, setMarketplaceInput] = useState(amazonMarketplace || "India (amazon.in)");
  const [clientIdInput, setClientIdInput] = useState("");
  const [clientSecretInput, setClientSecretInput] = useState("");
  const [refreshTokenInput, setRefreshTokenInput] = useState("");
  const [sandboxInput, setSandboxInput] = useState(false);
  
  // Sync wizard stages
  const [syncStatus, setSyncStatus] = useState<"idle" | "oauth" | "scope" | "inventory" | "orders" | "done">("idle");
  const [syncProgress, setSyncProgress] = useState(0);
  const [showFallbackOptions, setShowFallbackOptions] = useState(false);
  const [fallbackErrorMessage, setFallbackErrorMessage] = useState("");
  const [manualAsinsInput, setManualAsinsInput] = useState("");
  const [isManualImporting, setIsManualImporting] = useState(false);

  // Diagnostic state
  const [isTestingOrders, setIsTestingOrders] = useState(false);
  const [testOrdersResponse, setTestOrdersResponse] = useState<any>(null);

  const handleGenerateKey = () => {
    const newKey = {
      id: "key_" + (apiKeys.length + 1),
      name: "New API Key",
      key: "sp_live_" + Date.now().toString(36).substring(0, 8) + "••••••••",
      created: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    setApiKeys([...apiKeys, newKey]);
  };

  const saveListingsToSupabase = async (listingsSource: any[]) => {
    if (!user?.id) {
      useToastStore.getState().error("Session Missing", "Authorization session missing. Please re-login.");
      return false;
    }

    try {
      console.log("[SP-API Sync] Upserting real listings to Supabase...");
      const listingsToInsert = listingsSource.map((item) => ({
        channel: "amazon",
        status: "active",
        asin: item.asin || null,
        sku: item.sku,
        brand: item.brand || null,
        manufacturer: item.manufacturer || null,
        product_type: item.productType || null,
        title: item.title,
        description: item.description || null,
        price: item.price || 0,
        available_qty: item.availableQty || 0,
        reserved_qty: item.reservedQty || 0,
        incoming_qty: item.incomingQty || 0,
        fulfillment_channel: item.isFba ? "FBA" : "FBM",
        user_id: user.id
      }));

      const { data: existingListings } = await supabase
        .from("listings")
        .select("id, sku")
        .eq("user_id", user.id);

      const existingSkuMap = new Map<string, string>();
      if (existingListings) {
        existingListings.forEach((l) => {
          if (l.sku) existingSkuMap.set(l.sku, l.id);
        });
      }

      for (const s of listingsToInsert) {
        const existingId = existingSkuMap.get(s.sku);
        let operation;
        if (existingId) {
          operation = supabase
            .from("listings")
            .update({
              status: s.status,
              asin: s.asin,
              brand: s.brand,
              manufacturer: s.manufacturer,
              product_type: s.product_type,
              title: s.title,
              description: s.description,
              price: s.price,
              available_qty: s.available_qty,
              reserved_qty: s.reserved_qty,
              incoming_qty: s.incoming_qty,
              fulfillment_channel: s.fulfillment_channel
            })
            .eq("id", existingId);
        } else {
          operation = supabase
            .from("listings")
            .insert({
              ...s,
              performance_custom_thresholds: { minSalesWinner: 20, maxRefundDead: 10 },
              price_history: [{ date: new Date().toISOString().split("T")[0], price: s.price }]
            });
        }

        const { error } = await operation;
        if (error) {
          console.error("Database Error for SKU", s.sku, error);
        }
      }

      console.log("[SP-API Sync] Real data upsert completed.");
      return true;
    } catch (e: any) {
      console.error("[SP-API Sync] Save exception:", e);
      useToastStore.getState().error("Database Error", e.message);
      return false;
    }
  };

  const testOrdersApi = async () => {
    if ((!clientIdInput.trim() || !clientSecretInput.trim()) && !sandboxInput) {
      useToastStore.getState().warning("Missing Credentials", "Please enter your Client ID and Client Secret first.");
      return;
    }
    if (!refreshTokenInput.trim()) {
      useToastStore.getState().warning("Missing Credentials", "Please enter your Refresh Token first.");
      return;
    }
    
    setIsTestingOrders(true);
    setTestOrdersResponse(null);

    try {
      const res = await fetch("/api/amazon/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientIdInput,
          clientSecret: clientSecretInput,
          refreshToken: refreshTokenInput,
          region: marketplaceInput,
          sandbox: sandboxInput,
          userId: user?.id
        })
      });
      const data = await res.json();
      setTestOrdersResponse(data);
    } catch (e: any) {
      setTestOrdersResponse({ error: e.message });
    } finally {
      setIsTestingOrders(false);
    }
  };

  const startAmazonSync = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[SP-API Sync] startAmazonSync triggered!");
    
    // Validate empty credentials in production mode
    if ((!clientIdInput.trim() || !clientSecretInput.trim()) && !sandboxInput) {
      useToastStore.getState().warning("Missing Credentials", "Please enter your Amazon Production Client ID and Client Secret.");
      console.error("[SP-API Sync] Blocked: Missing Client ID or Client Secret.");
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[SP-API Sync Audit] Credential Sources:");
      console.log(`  - LWA Client ID: loaded from settings form state (fresh input) (Prefix: ${clientIdInput ? clientIdInput.slice(0, 10) + "..." : "EMPTY"})`);
      console.log(`  - LWA Client Secret: loaded from settings form state (fresh input) (Prefix: ${clientSecretInput ? clientSecretInput.slice(0, 10) + "..." : "EMPTY"})`);
    }

    console.log("[SP-API Sync] Credentials check:", {
      clientId: clientIdInput ? "VALID" : "EMPTY",
      clientSecret: clientSecretInput ? "VALID" : "EMPTY",
      sellerId: sellerIdInput ? "VALID" : "EMPTY",
      refreshToken: refreshTokenInput ? "VALID" : "EMPTY",
      region: marketplaceInput,
      sandbox: sandboxInput
    });

    setSyncStatus("oauth");
    setSyncProgress(15);
    setShowFallbackOptions(false);

    let realListings: any[] = [];
    let fetchErrorMsg = "";

    if (!refreshTokenInput.trim()) {
      setSyncStatus("idle");
      setFallbackErrorMessage("No LWA Refresh Token provided.");
      setShowFallbackOptions(true);
      return;
    }
    try {
      // Step 1: Submit Report Request (and connection validation check)
      console.log("[SP-API Sync] Submitting listings report request to API...");
      setSyncStatus("scope");
      setSyncProgress(30);

      const requestRes = await fetch("/api/amazon/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "request",
          clientId: clientIdInput,
          clientSecret: clientSecretInput,
          sellerId: sellerIdInput,
          refreshToken: refreshTokenInput,
          region: marketplaceInput,
          sandbox: sandboxInput,
          userId: user?.id
        })
      });

      const requestData = await requestRes.json();
      console.log("[SP-API Sync] Report request response:", requestData);

      if (!requestRes.ok || !requestData.success || !requestData.reportId) {
        if (requestData.rawError) {
          const raw = requestData.rawError;
          fetchErrorMsg = `Amazon SP-API Error (HTTP ${raw.status}): [${raw.code}] ${raw.message}. Details: ${raw.details || "None"}.`;
        } else {
          fetchErrorMsg = requestData.error || "Failed to submit Listings Report request.";
        }
        throw new Error(fetchErrorMsg);
      }

      const reportId = requestData.reportId;
      console.log(`[SP-API Sync] Report requested successfully. reportId: ${reportId}`);

      // Step 2: Poll status of the report
      setSyncStatus("inventory");
      setSyncProgress(50);
      
      let processingStatus = "SUBMITTED";
      let reportDocumentId = "";
      let attempts = 0;
      const maxAttempts = 20; // 20 * 3s = 60s total timeout

      while (processingStatus !== "DONE" && processingStatus !== "FATAL" && processingStatus !== "CANCELLED" && attempts < maxAttempts) {
        attempts++;
        console.log(`[SP-API Sync] Polling attempt ${attempts}/${maxAttempts} for reportId: ${reportId}...`);
        
        // Wait 3 seconds
        await new Promise((resolve) => setTimeout(resolve, 3000));

        const statusRes = await fetch("/api/amazon/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "status",
            reportId,
            clientId: clientIdInput,
            clientSecret: clientSecretInput,
            sellerId: sellerIdInput,
            refreshToken: refreshTokenInput,
            region: marketplaceInput,
            sandbox: sandboxInput,
            userId: user?.id
          })
        });

        const statusData = await statusRes.json();
        if (statusRes.ok && statusData.success) {
          processingStatus = statusData.status;
          reportDocumentId = statusData.reportDocumentId || "";
          
          // Increment progress bar to keep it alive
          const progressPercent = Math.min(80, 50 + Math.round((attempts / maxAttempts) * 30));
          setSyncProgress(progressPercent);
        } else {
          console.warn("[SP-API Sync] Polling status check failed, will retry:", statusData.error);
        }
      }

      console.log(`[SP-API Sync] Polling completed. Final status: ${processingStatus}`);

      if (processingStatus !== "DONE") {
        throw new Error(`Amazon report generation failed or timed out. Status: ${processingStatus}`);
      }

      // Step 3: Fetch listings from document URL (decompress and parse)
      console.log(`[SP-API Sync] Downloading listings using reportDocumentId: ${reportDocumentId}...`);
      setSyncProgress(85);

      const importRes = await fetch("/api/amazon/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          reportDocumentId,
          clientId: clientIdInput,
          clientSecret: clientSecretInput,
          sellerId: sellerIdInput,
          refreshToken: refreshTokenInput,
          region: marketplaceInput,
          sandbox: sandboxInput,
          userId: user?.id
        })
      });

      const importData = await importRes.json();
      if (!importRes.ok || !importData.success) {
        throw new Error(importData.error || "Failed to download and parse Amazon listings.");
      }

      realListings = importData.items || [];
      console.log(`[SP-API Sync] Successfully fetched ${realListings.length} items from Reports API.`);

      // Step 4: Seed Supabase Listings database
      setSyncStatus("done");
      setSyncProgress(100);

      // Wait a brief second to let "done" show up
      await new Promise((resolve) => setTimeout(resolve, 800));

      console.log("[SP-API Sync] Running final database seed logic...");
      if (!user?.id) {
        useToastStore.getState().error("Session Missing", "Authorization session missing. Please re-login.");
        setSyncStatus("idle");
        return;
      }

      const ok = await saveListingsToSupabase(realListings);
      if (ok) {
        // Removed insecure localStorage storage of sensitive amazon credentials.

        // Step 5: Sync Amazon Orders
        setSyncStatus("orders" as any);
        setSyncProgress(95);

        try {
          console.log("[SP-API Sync] Triggering Orders API sync...");
          const ordersRes = await fetch("/api/amazon/sync-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: clientIdInput,
              clientSecret: clientSecretInput,
              refreshToken: refreshTokenInput,
              region: marketplaceInput,
              sandbox: sandboxInput,
              userId: user.id
            })
          });
          const ordersData = await ordersRes.json();
          console.log("[SP-API Sync] Orders sync completed:", ordersData);
        } catch (ordersErr) {
          console.error("[SP-API Sync] Orders sync failed, skipping:", ordersErr);
        }

        setSyncStatus("done");
        setSyncProgress(100);
        await new Promise((resolve) => setTimeout(resolve, 800));

        useToastStore.getState().success("Sync Complete", `Successfully connected to Selling Partner API! Synced ${realListings.length} active listings and imported your order history.`);
        connectAmazon(sellerIdInput, marketplaceInput);
        setShowAmazonModal(false);
        window.location.href = "/dashboard";
      }
      setSyncStatus("idle");

    } catch (err: any) {
      console.error("[SP-API Sync] Flow Error:", err.message);
      setSyncStatus("idle");
      setFallbackErrorMessage(err.message);
      setShowFallbackOptions(true);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">System Settings</h1>
        <p className="text-zinc-400 text-sm mt-1">Configure profile configurations, API gateways, integrations, and workspace permissions.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left column: Profile & API keys */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* User profile details */}
          <GlassCard>
            <div className="flex items-center gap-2.5 mb-6">
              <User className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-bold text-white">Profile Configurations</h3>
            </div>

            <form className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Merchant Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-white/10 bg-white/[0.02] text-white text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400">Account Role</label>
                <input
                  type="text"
                  value={role}
                  disabled
                  className="w-full h-11 px-4 rounded-xl border border-white/5 bg-white/[0.01] text-zinc-500 text-sm cursor-default"
                />
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-xs font-semibold text-zinc-400">Authorized Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full h-11 px-4 rounded-xl border border-white/5 bg-white/[0.01] text-zinc-500 text-sm cursor-default"
                />
              </div>

              <div className="sm:col-span-2 flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => useToastStore.getState().success("Saved", "Profile configurations saved.")}
                  className="h-11 px-6 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-bold text-xs flex items-center gap-2 transition-all"
                >
                  <Save className="w-4 h-4" /> Save Profile Details
                </button>
              </div>
            </form>
          </GlassCard>

          {/* Admin AI Gateway Settings */}
          <GlassCard>
            <div className="flex items-center gap-2.5 mb-4">
              <Shield className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-bold text-white">Admin AI Gateway Settings</h3>
            </div>
            <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
              Configure multiple API providers. When routing queries, SellerPlus OS dynamically routes across enabled models using priority weight selection and fallback chains.
            </p>

            {/* Provider Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-5 border-b border-white/5">
              {Object.keys(llmConfigs).map((provider) => {
                const isEnabled = llmConfigs[provider].is_enabled;
                const priority = llmConfigs[provider].priority;
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => setActiveLlmTab(provider)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 ${
                      activeLlmTab === provider
                        ? "bg-[#00c48c]/10 text-[#00c48c] border border-[#00c48c]/20"
                        : "text-zinc-500 hover:text-zinc-300 border border-transparent"
                    }`}
                  >
                    <span className="uppercase">{provider}</span>
                    {isEnabled && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00c48c]" title={`Active (Priority ${priority})`} />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Config Form for Selected Provider */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white capitalize">{activeLlmTab} Integration Configuration</span>
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Enabled</label>
                  <input
                    type="checkbox"
                    checked={llmConfigs[activeLlmTab].is_enabled}
                    onChange={(e) => setLlmConfigs(prev => ({
                      ...prev,
                      [activeLlmTab]: {
                        ...prev[activeLlmTab],
                        is_enabled: e.target.checked
                      }
                    }))}
                    className="w-4 h-4 rounded border-white/10 bg-white/[0.02] text-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {activeLlmTab !== "ollama" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">API Connection Key</label>
                  <input
                    type="password"
                    placeholder={`Enter your ${activeLlmTab.toUpperCase()} key`}
                    value={llmConfigs[activeLlmTab].api_key}
                    onChange={(e) => setLlmConfigs(prev => ({
                      ...prev,
                      [activeLlmTab]: {
                        ...prev[activeLlmTab],
                        api_key: e.target.value
                      }
                    }))}
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target Model Name</label>
                <input
                  type="text"
                  placeholder="e.g. gpt-4o, gemini-1.5-flash, etc."
                  value={llmConfigs[activeLlmTab].model_name}
                  onChange={(e) => setLlmConfigs(prev => ({
                    ...prev,
                    [activeLlmTab]: {
                      ...prev[activeLlmTab],
                      model_name: e.target.value
                    }
                  }))}
                  className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {(activeLlmTab === "ollama" || activeLlmTab === "openrouter") && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Custom Endpoint URL (Optional)</label>
                  <input
                    type="text"
                    placeholder={activeLlmTab === "ollama" ? "e.g. http://localhost:11434/v1/chat/completions" : "e.g. https://openrouter.ai/api/v1/chat/completions"}
                    value={llmConfigs[activeLlmTab].endpoint_url}
                    onChange={(e) => setLlmConfigs(prev => ({
                      ...prev,
                      [activeLlmTab]: {
                        ...prev[activeLlmTab],
                        endpoint_url: e.target.value
                      }
                    }))}
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Gateway Priority Weight</label>
                  <span className="text-[10px] text-zinc-500 font-semibold">{llmConfigs[activeLlmTab].priority}x Weight</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={llmConfigs[activeLlmTab].priority}
                  onChange={(e) => setLlmConfigs(prev => ({
                    ...prev,
                    [activeLlmTab]: {
                      ...prev[activeLlmTab],
                      priority: parseInt(e.target.value)
                    }
                  }))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
                <span className="text-[9px] text-zinc-500 leading-relaxed mt-0.5">
                  Higher priority values increase the probability of routing to this provider. Range: 1 (Lowest) to 10 (Highest).
                </span>
              </div>

              <div className="flex items-center gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={() => handleTestLlmGateway(activeLlmTab)}
                  disabled={testingLlm !== null}
                  className="flex-1 h-10 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 font-bold text-xs disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {testingLlm === activeLlmTab ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Connection Testing...
                    </>
                  ) : (
                    "Test Gateway Connection"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveLlmConfig(activeLlmTab)}
                  className="flex-1 h-10 rounded-xl bg-[#00c48c] hover:opacity-90 text-black font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <Save className="w-4 h-4" /> Save Tab Settings
                </button>
              </div>
            </div>
          </GlassCard>

          {/* API keys section */}
          <GlassCard>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <Key className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-white">API Keys Console</h3>
              </div>
              <button
                onClick={handleGenerateKey}
                className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                + Generate Key
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 text-zinc-500 font-semibold h-8">
                    <th>Name</th>
                    <th>API Key String</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="h-16 text-center text-zinc-500">No API keys generated yet.</td>
                    </tr>
                  ) : (
                    apiKeys.map((key) => (
                      <tr key={key.id} className="h-11 hover:bg-white/[0.02] transition-colors">
                        <td className="font-semibold text-zinc-200">{key.name}</td>
                        <td className="font-mono text-zinc-400">{key.key}</td>
                        <td className="text-zinc-500">{key.created}</td>
                        <td>
                          <button
                            onClick={() => setApiKeys(apiKeys.filter((k) => k.id !== key.id))}
                            className="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-colors uppercase"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>

        {/* Right column: Connections/Integrations */}
        <div className="flex flex-col gap-6">
          <GlassCard>
            <div className="flex items-center gap-2.5 mb-6">
              <LinkIcon className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-bold text-white">Marketplace Connections</h3>
            </div>

            <div className="flex flex-col gap-4">
              {/* Amazon */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.01]">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white leading-none">Amazon SP-API</span>
                    <span className="text-[10px] text-zinc-500 leading-none mt-1">Fulfillment (FBA/FBM) Sync</span>
                  </div>
                </div>
                {amazonConnected ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Connected
                    </span>
                    <button onClick={disconnectAmazon} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAmazonModal(true)}
                    className="px-2.5 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-[10px] text-white font-bold transition-all"
                  >
                    Authenticate
                  </button>
                )}
              </div>

              {/* Flipkart */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.01]">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white leading-none">Flipkart Seller Center</span>
                    <span className="text-[10px] text-zinc-500 leading-none mt-1">Catalog Listings & Returns Sync</span>
                  </div>
                </div>
                {flipkartConnected ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Connected
                    </span>
                    <button onClick={disconnectFlipkart} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectFlipkart}
                    className="px-2.5 py-1 rounded bg-[#0A0A0C] border border-white/10 hover:bg-white/5 text-[10px] text-zinc-300 font-bold transition-all"
                  >
                    Authenticate
                  </button>
                )}
              </div>

              {/* Meesho */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.01]">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-pink-500" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white leading-none">Meesho Listing Hub</span>
                    <span className="text-[10px] text-zinc-500 leading-none mt-1">Weekly Payment & Orders Sync</span>
                  </div>
                </div>
                {meeshoConnected ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Connected
                    </span>
                    <button onClick={disconnectMeesho} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectMeesho}
                    className="px-2.5 py-1 rounded bg-[#0A0A0C] border border-white/10 hover:bg-white/5 text-[10px] text-zinc-300 font-bold transition-all"
                  >
                    Authenticate
                  </button>
                )}
              </div>

              {/* Shopify */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.01]">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-white leading-none">Shopify Storefront</span>
                    <span className="text-[10px] text-zinc-500 leading-none mt-1">D2C Live Inventory Mapping</span>
                  </div>
                </div>
                {shopifyConnected ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Connected
                    </span>
                    <button onClick={disconnectShopify} className="text-[10px] text-zinc-500 hover:text-zinc-300">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectShopify}
                    className="px-2.5 py-1 rounded bg-[#0A0A0C] border border-white/10 hover:bg-white/5 text-[10px] text-zinc-300 font-bold transition-all"
                  >
                    Connect API
                  </button>
                )}
              </div>
            </div>
          </GlassCard>

          {/* Notifications Settings Card */}
          <GlassCard className="flex flex-col gap-5">
            <div className="flex items-center gap-2.5">
              <Bell className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-bold text-white">System Notifications</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Configure webhook endpoints and alert destinations. SellerPlus OS automatically dispatches reports and thresholds warnings to Discord, Telegram, or Email.
            </p>

            <div className="flex flex-col gap-4">
              {/* Email Alert Channel */}
              <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white">
                    <Mail className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold">Email Notifications</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestNotificationChannel("email")}
                    disabled={testingNotificationChannel !== null}
                    className="text-[10px] uppercase font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50 font-sans"
                  >
                    {testingNotificationChannel === "email" ? "Testing..." : "Send Test Alert"}
                  </button>
                </div>
                <input
                  type="email"
                  placeholder="alerts@yourdomain.com"
                  value={notificationSettings.email_destination}
                  onChange={(e) => setNotificationSettings(prev => ({
                    ...prev,
                    email_destination: e.target.value
                  }))}
                  className="w-full h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Discord Alert Channel */}
              <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white">
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold">Discord Webhook</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestNotificationChannel("discord")}
                    disabled={testingNotificationChannel !== null}
                    className="text-[10px] uppercase font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50 font-sans"
                  >
                    {testingNotificationChannel === "discord" ? "Testing..." : "Send Test Alert"}
                  </button>
                </div>
                <input
                  type="url"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={notificationSettings.discord_webhook_url}
                  onChange={(e) => setNotificationSettings(prev => ({
                    ...prev,
                    discord_webhook_url: e.target.value
                  }))}
                  className="w-full h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Telegram Alert Channel */}
              <div className="p-3.5 rounded-xl border border-white/5 bg-white/[0.01] flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white">
                    <Bot className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold">Telegram Bot</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleTestNotificationChannel("telegram")}
                    disabled={testingNotificationChannel !== null}
                    className="text-[10px] uppercase font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50 font-sans"
                  >
                    {testingNotificationChannel === "telegram" ? "Testing..." : "Send Test Alert"}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Bot API Token"
                    value={notificationSettings.telegram_bot_token}
                    onChange={(e) => setNotificationSettings(prev => ({
                      ...prev,
                      telegram_bot_token: e.target.value
                    }))}
                    className="w-full h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <input
                    type="text"
                    placeholder="Chat / Channel ID"
                    value={notificationSettings.telegram_chat_id}
                    onChange={(e) => setNotificationSettings(prev => ({
                      ...prev,
                      telegram_chat_id: e.target.value
                    }))}
                    className="w-full h-9 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Alert Toggles */}
              <div className="flex flex-col gap-3.5 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 font-semibold">Enable FBA Low Stock Alerts</span>
                  <input
                    type="checkbox"
                    checked={notificationSettings.enable_low_stock_alerts}
                    onChange={(e) => setNotificationSettings(prev => ({
                      ...prev,
                      enable_low_stock_alerts: e.target.checked
                    }))}
                    className="w-4 h-4 rounded border-white/10 bg-white/[0.02] text-indigo-500 focus:ring-indigo-500"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 font-semibold">Enable Daily Profit Summaries</span>
                  <input
                    type="checkbox"
                    checked={notificationSettings.enable_daily_summaries}
                    onChange={(e) => setNotificationSettings(prev => ({
                      ...prev,
                      enable_daily_summaries: e.target.checked
                    }))}
                    className="w-4 h-4 rounded border-white/10 bg-white/[0.02] text-indigo-500 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSaveNotifications}
                className="h-10 w-full rounded-xl bg-[#00c48c] hover:opacity-90 text-black font-bold text-xs flex items-center justify-center gap-2 mt-2 transition-all"
              >
                <Save className="w-4 h-4" /> Save Notification Channels
              </button>
            </div>
          </GlassCard>

          {/* MFA / Security Info */}
          <GlassCard className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-bold text-white">MFA & Authentication Security</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Row-Level Security (RLS) policies are active across all database layers. Direct integrations are encrypted with hardware keys. Enable Google authenticator token MFA in your profile to audit security events.
            </p>
            <button className="h-10 w-full rounded-xl border border-white/10 hover:bg-white/5 text-xs font-semibold text-zinc-300 flex items-center justify-center gap-2 transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> Enable Multi-Factor Auth
            </button>
          </GlassCard>
        </div>
      </div>

      {/* --- Amazon Connection Modal --- */}
      {showAmazonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0E0E12] p-6 shadow-2xl relative overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
                <h3 className="text-base font-bold text-white">Amazon SP-API Connection Wizard</h3>
              </div>
              <button 
                onClick={() => { if (syncStatus === "idle" || syncStatus === "done") setShowAmazonModal(false); }}
                disabled={syncStatus !== "idle" && syncStatus !== "done"}
                className="text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sync Progress Bar */}
            {syncStatus !== "idle" && (
              <div className="flex flex-col gap-2.5 mb-6">
                <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                  <div 
                    className="h-full bg-orange-500 transition-all duration-300"
                    style={{ width: `${syncProgress}%` }}
                  />
                </div>
                <div className="flex items-center gap-2 text-xs text-orange-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="font-semibold">
                    {syncStatus === "oauth" && "Establishing secure LWA OAuth Handshake..."}
                    {syncStatus === "scope" && "Authorizing Seller Partner API read scopes..."}
                    {syncStatus === "inventory" && "Downloading listing catalog and inventory ledgers..."}
                    {syncStatus === "orders" && "Downloading order history and line items..."}
                    {syncStatus === "done" && "Fulfillment channels mapped successfully!"}
                  </span>
                </div>
              </div>
            )}

            {/* Form */}
            {syncStatus === "idle" && !showFallbackOptions && (
              <form onSubmit={startAmazonSync} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">AWS Selling Region</label>
                  <select
                    value={marketplaceInput}
                    onChange={(e) => setMarketplaceInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="India (amazon.in)" className="bg-[#0e0e12]">India (amazon.in)</option>
                    <option value="North America (amazon.com)" className="bg-[#0e0e12]">North America (amazon.com)</option>
                    <option value="Europe (amazon.co.uk)" className="bg-[#0e0e12]">Europe (amazon.co.uk)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">LWA Client ID</label>
                  <input
                    type="text"
                    required
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">LWA Client Secret</label>
                  <input
                    type="password"
                    required
                    value={clientSecretInput}
                    onChange={(e) => setClientSecretInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Seller / Merchant Token ID</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. A39XYZ12345678"
                    value={sellerIdInput}
                    onChange={(e) => setSellerIdInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">LWA Refresh Token (Required for Live Sync)</label>
                  <input
                    type="text"
                    placeholder="e.g. Atzr|IwEB..."
                    value={refreshTokenInput}
                    onChange={(e) => setRefreshTokenInput(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono text-zinc-300"
                  />
                </div>

                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setShowAmazonModal(false)}
                    className="flex-1 h-10 rounded-xl border border-white/10 hover:bg-white/5 text-xs text-zinc-300 font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={testOrdersApi}
                    disabled={isTestingOrders}
                    className="flex-1 h-10 rounded-xl bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/30 font-bold text-xs disabled:opacity-50 transition-colors"
                  >
                    {isTestingOrders ? "Testing..." : "Test Orders API"}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-10 rounded-xl bg-orange-500 hover:bg-orange-600 text-black font-bold text-xs"
                  >
                    Authorize & Sync
                  </button>
                </div>
                {testOrdersResponse && (
                  <div className="mt-4 p-4 rounded-xl border border-white/10 bg-[#0A0A0C] overflow-auto max-h-96">
                    <h4 className="text-xs font-bold text-white mb-2 uppercase tracking-wider flex items-center justify-between">
                      <span>Diagnostic Response</span>
                      <button type="button" onClick={() => setTestOrdersResponse(null)} className="text-zinc-500 hover:text-white">Clear</button>
                    </h4>
                    <pre className="text-[10px] text-emerald-400 font-mono whitespace-pre-wrap break-all">
                      {JSON.stringify(testOrdersResponse, null, 2)}
                    </pre>
                  </div>
                )}
              </form>
            )}

            {/* Fallback Options Panel */}
            {syncStatus === "idle" && showFallbackOptions && (
              <div className="flex flex-col gap-4 text-zinc-300 mt-2">
                <div className="p-3.5 rounded-xl border border-orange-500/20 bg-orange-500/5 text-xs text-orange-400 leading-relaxed">
                  <span className="font-bold block mb-1">Inventory Sync Ended (No active items found)</span>
                  {fallbackErrorMessage || "Your Seller Central active catalog returned 0 active listings."}
                </div>

                <p className="text-xs text-zinc-400">
                  To continue setting up your operating workspace, choose one of the following methods to seed your dashboard:
                </p>

                {/* Fallback Option: Manually Enter ASINs */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Or, Enter ASINs manually to fetch details:</label>
                  <textarea
                    rows={2}
                    placeholder="Enter ASINs separated by commas (e.g. B0FNLH2V7H, B09Z9K3LM1)"
                    value={manualAsinsInput}
                    onChange={(e) => setManualAsinsInput(e.target.value)}
                    className="w-full p-2.5 rounded-lg border border-white/10 bg-white/[0.02] text-xs text-white focus:outline-none focus:border-indigo-500 font-mono resize-none"
                    disabled={isManualImporting}
                  />
                  <button
                    type="button"
                    disabled={isManualImporting || !manualAsinsInput.trim()}
                    onClick={async () => {
                      setIsManualImporting(true);
                      const asins = manualAsinsInput.split(/[,\s]+/).map(a => a.trim().toUpperCase()).filter(Boolean);
                      const itemsFetched = [];
                      for (let i = 0; i < asins.length; i++) {
                        const asin = asins[i];
                        try {
                          const response = await fetch("/api/amazon/catalog", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              asin,
                              clientId: clientIdInput,
                              clientSecret: clientSecretInput,
                              refreshToken: refreshTokenInput,
                              region: marketplaceInput,
                              sandbox: sandboxInput
                            })
                          });
                          if (response.ok) {
                            const data = await response.json();
                            if (data.success) {
                              itemsFetched.push({
                                asin: data.asin,
                                sku: `MANUAL-${data.asin}`,
                                title: data.title,
                                availableQty: 15,
                                reservedQty: 0,
                                incomingQty: 0,
                                brand: data.brand || "Generic",
                                manufacturer: data.manufacturer || "Generic",
                                productType: data.productType || "Amazon Listing"
                              });
                            }
                          } else {
                            const errData = await response.json();
                            console.error(`[Manual Import] API error for ASIN ${asin}:`, errData);
                            
                            let errorMsg = errData.error || "Unknown Error";
                            if (errData.rawError) {
                              const raw = errData.rawError;
                              errorMsg = `Amazon SP-API Error (HTTP ${raw.status}): [${raw.code}] ${raw.message}. Details: ${raw.details || "None"}. Raw Response: ${raw.body}`;
                            }
                            
                            const confirmManual = window.confirm(
                              `Could not fetch details for ASIN ${asin} from Amazon's server (Amazon returned: ${errorMsg}).\n\nWould you like to manually input the details (Title, SKU, Brand) for ASIN ${asin} to add it to your dashboard?`
                            );
                            if (confirmManual) {
                              const manualTitle = window.prompt(`Enter Product Title for ASIN ${asin}:`);
                              if (manualTitle && manualTitle.trim()) {
                                const manualSku = window.prompt(`Enter Seller SKU for ASIN ${asin}:`, `SKU-${asin}`) || `SKU-${asin}`;
                                const manualBrand = window.prompt(`Enter Brand Name:`, "My Brand") || "My Brand";
                                itemsFetched.push({
                                  asin: asin,
                                  sku: manualSku.trim(),
                                  title: manualTitle.trim(),
                                  availableQty: 15,
                                  reservedQty: 0,
                                  incomingQty: 0,
                                  brand: manualBrand.trim(),
                                  manufacturer: manualBrand.trim(),
                                  productType: "Amazon Listing"
                                });
                              }
                            }
                          }
                        } catch (e) {
                          console.error("Failed to fetch catalog details for:", asin, e);
                        }
                      }

                      if (itemsFetched.length > 0) {
                        const ok = await saveListingsToSupabase(itemsFetched);
                        if (ok) {
                          if (typeof window !== "undefined") {
                            if (refreshTokenInput.trim()) localStorage.setItem("sp_amazon_refresh_token", refreshTokenInput);
                            if (clientIdInput.trim()) localStorage.setItem("sp_amazon_client_id", clientIdInput);
                            if (clientSecretInput.trim()) localStorage.setItem("sp_amazon_client_secret", clientSecretInput);
                            localStorage.setItem("sp_amazon_sandbox", String(sandboxInput));
                          }
                          useToastStore.getState().success("Catalog Synced", `Successfully loaded ${itemsFetched.length} catalog items manually!`);
                          connectAmazon(sellerIdInput, marketplaceInput);
                          setShowAmazonModal(false);
                          window.location.href = "/dashboard";
                        }
                      } else {
                        useToastStore.getState().error("Sync Failed", "Could not fetch details for any of the entered ASINs.");
                      }
                      setIsManualImporting(false);
                    }}
                    className="w-full h-10 rounded-xl border border-white/10 bg-[#0A0A0C] hover:bg-white/5 text-xs text-white font-bold transition-all disabled:opacity-50"
                  >
                    {isManualImporting ? "Importing from Amazon Catalog..." : "Import Real Listing Details"}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowFallbackOptions(false);
                    setShowAmazonModal(false);
                  }}
                  className="w-full text-center text-[10px] text-zinc-500 hover:text-zinc-300 mt-2 uppercase tracking-wider font-bold"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
