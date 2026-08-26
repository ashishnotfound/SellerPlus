/** Client-safe job identifiers and display metadata. No executable handlers. */
export type JobType =
  | "bi_analysis"
  | "executive_assistant"
  | "audit_ads"
  | "check_inventory"
  | "generate_report"
  | "create_listing_draft"
  | "find_keywords"
  | "detect_low_profit_asin"
  | "amazon_ads_sync"
  | "amazon_listings_sync"
  | "amazon_orders_sync"
  | "reyo_pack_amazon_sync"
  | "amazon_refunds_sync"
  | "apply_cost_change";

export const JOB_CATALOG: Record<JobType, { name: string }> = {
  bi_analysis: { name: "BI Analysis" },
  executive_assistant: { name: "AI Executive Assistant" },
  audit_ads: { name: "Ads Audit" },
  check_inventory: { name: "Inventory Check" },
  generate_report: { name: "Weekly Business Report" },
  create_listing_draft: { name: "Draft Listing Creator" },
  find_keywords: { name: "Keyword Research" },
  detect_low_profit_asin: { name: "Low-Profit ASIN Detector" },
  amazon_ads_sync: { name: "Amazon Ads Sync" },
  amazon_listings_sync: { name: "Amazon Listings Sync" },
  amazon_orders_sync: { name: "Amazon Orders & Inventory Sync" },
  reyo_pack_amazon_sync: { name: "Reyo Pack Amazon Fulfillment Sync" },
  amazon_refunds_sync: { name: "Amazon Refunds Sync" },
  apply_cost_change: { name: "Apply Approved Cost Change" },
};

export const ALL_JOB_TYPES = Object.keys(JOB_CATALOG) as JobType[];

export const SCHEDULABLE_JOB_TYPES = [
  "executive_assistant",
  "audit_ads",
  "check_inventory",
  "generate_report",
  "detect_low_profit_asin",
] as const satisfies readonly JobType[];

export function isSchedulableJobType(value: string): value is (typeof SCHEDULABLE_JOB_TYPES)[number] {
  return (SCHEDULABLE_JOB_TYPES as readonly string[]).includes(value);
}
