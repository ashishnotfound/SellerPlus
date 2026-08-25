"use client";

import { create } from "zustand";
import { useToastStore } from "@/hooks/use-toast-store";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";

export type ListingStatus = "active" | "inactive" | "draft" | "suppressed";
export type PerformanceBadge = "winner" | "trending" | "profitable" | "declining" | "dead" | "low_stock" | "out_of_stock" | "working" | "sleeping" | "best_seller" | "most_profitable" | "growing";

export interface ListingVersion {
  id: string;
  listingId: string;
  title: string;
  description: string;
  bulletPoints: string[];
  keywords: string[];
  versionNumber: number;
  changeSummary: string;
  userAction: string;
  createdAt: string;
  snapshotData: Record<string, any>;
}

export interface Listing {
  id: string;
  version?: number;
  master_sku_id?: string;
  channel: "amazon" | "flipkart" | "meesho" | "shopify";
  status: ListingStatus;
  publication_state?: "draft" | "approved" | "submitted" | "published" | "failed";
  data_source?: string;
  rating?: number;
  reviews_count?: number;
  created_at: string;
  asin?: string;
  sku: string;
  fnsku?: string;
  parent_asin?: string;
  brand?: string;
  manufacturer?: string;
  product_type?: string;
  title: string;
  description?: string;
  bullet_points: string[];
  aplus_content: Record<string, any>;
  backend_keywords: string[];
  search_terms: string[];
  subject_matter?: string;
  target_audience?: string;
  main_image?: string;
  gallery_images: string[];
  alt_images: string[];
  color?: string;
  size?: string;
  material?: string;
  dimensions?: string;
  weight?: string;
  package_info?: string;
  country_of_origin?: string;
  price: number;
  sale_price?: number;
  business_price?: number;
  available_qty: number;
  reserved_qty: number;
  incoming_qty: number;
  reorder_qty: number;
  fulfillment_channel: "FBA" | "FBM";
  shipping_settings: Record<string, any>;
  package_settings: Record<string, any>;
  performance_category: PerformanceBadge | null;
  performance_custom_thresholds: {
    minSalesWinner: number;
    minConvWinner: number;
    lowStockLimit: number;
    deadSalesLimit: number;
  };
  sales_30d: number | null;
  revenue_30d: number | null;
  orders_30d: number | null;
  units_sold_30d: number | null;
  conversion_rate_30d: number | null;
  seo_score: number | null;
  seo_keyword_analysis: Record<string, any>;
  price_history: Array<{ date: string; price: number }>;
}

interface ListingsStore {
  listings: Listing[];
  versions: Record<string, ListingVersion[]>;
  activeScopeKey: string | null;
  loading: boolean;
  total: number;
  counts: Record<string, number>;
  globalThresholds: {
    minSalesWinner: number;
    minConvWinner: number;
    lowStockLimit: number;
    deadSalesLimit: number;
  };
  manualOverrides: Record<string, PerformanceBadge>;
  loadListings: (userId: string, options?: { page?: number; pageSize?: number; search?: string; filter?: string }) => Promise<void>;
  createListing: (data: Partial<Listing>) => Promise<Listing | null>;
  updateListing: (id: string, fields: Partial<Listing>, changeSummary: string) => Promise<void>;
  deleteListing: (id: string) => Promise<void>;
  restoreVersion: (listingId: string, versionId: string) => Promise<void>;
  bulkPriceChange: (ids: string[], multiplier: number) => Promise<void>;
  bulkInventoryChange: (ids: string[], quantity: number) => Promise<void>;
  bulkKeywordUpdate: (ids: string[], keywords: string[]) => Promise<void>;
  bulkStatusChange: (ids: string[], status: ListingStatus) => Promise<void>;
  setGlobalThresholds: (thresholds: Partial<ListingsStore["globalThresholds"]>) => void;
  setManualOverride: (sku: string, badge: PerformanceBadge | null) => void;
  calculatePerformanceBadge: (listing: Listing) => PerformanceBadge | null;
}

const defaultThresholds = {
  minSalesWinner: 25,
  minConvWinner: 12,
  lowStockLimit: 15,
  deadSalesLimit: 30,
};

async function apiRequest(path: string, init?: RequestInit) {
  const response = await sellerplusApiFetch(path, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Listing request failed.");
  return payload;
}

function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function mapListing(row: Record<string, any>): Listing {
  return {
    ...row,
    id: row.id,
    version: Number(row.version ?? 1),
    channel: row.channel,
    status: row.status,
    publication_state: row.publication_state ?? "draft",
    data_source: row.data_source ?? "seller_entered",
    rating: optionalNumber(row.rating),
    reviews_count: optionalNumber(row.reviews_count),
    created_at: row.created_at,
    asin: row.asin ?? undefined,
    sku: row.sku,
    title: row.title,
    description: row.description ?? undefined,
    bullet_points: row.bullet_points ?? [],
    aplus_content: row.aplus_content ?? {},
    backend_keywords: row.backend_keywords ?? [],
    search_terms: row.search_terms ?? [],
    gallery_images: row.gallery_images ?? [],
    alt_images: row.alt_images ?? [],
    price: Number(row.price ?? 0),
    sale_price: optionalNumber(row.sale_price),
    business_price: optionalNumber(row.business_price),
    available_qty: Number(row.available_qty ?? 0),
    reserved_qty: Number(row.reserved_qty ?? 0),
    incoming_qty: Number(row.incoming_qty ?? 0),
    reorder_qty: Number(row.reorder_qty ?? 0),
    fulfillment_channel: row.fulfillment_channel ?? "FBA",
    shipping_settings: row.shipping_settings ?? {},
    package_settings: row.package_settings ?? {},
    performance_category: row.performance_category ?? null,
    performance_custom_thresholds: {
      ...defaultThresholds,
      ...(row.performance_custom_thresholds ?? {}),
    },
    sales_30d: nullableNumber(row.sales_30d),
    revenue_30d: nullableNumber(row.revenue_30d),
    orders_30d: nullableNumber(row.orders_30d),
    units_sold_30d: nullableNumber(row.units_sold_30d),
    conversion_rate_30d: nullableNumber(row.conversion_rate_30d),
    seo_score: nullableNumber(row.seo_score),
    seo_keyword_analysis: row.seo_keyword_analysis ?? {},
    price_history: Array.isArray(row.price_history) ? row.price_history : [],
  };
}

function mapVersions(rows: Array<Record<string, any>>) {
  const result: Record<string, ListingVersion[]> = {};
  for (const row of rows) {
    const mapped: ListingVersion = {
      id: row.id,
      listingId: row.listing_id,
      title: row.title,
      description: row.description ?? "",
      bulletPoints: row.bullet_points ?? [],
      keywords: row.keywords ?? [],
      versionNumber: Number(row.version_number),
      changeSummary: row.change_summary ?? "",
      userAction: row.user_action ?? "",
      createdAt: row.created_at,
      snapshotData: row.snapshot_data ?? {},
    };
    result[mapped.listingId] = [...(result[mapped.listingId] ?? []), mapped];
  }
  return result;
}

function editableSnapshot(listing: Listing): Record<string, unknown> {
  const immutable = new Set(["id", "version", "created_at", "publication_state", "data_source", "master_sku_id", "rating", "reviews_count", "sales_30d", "revenue_30d", "orders_30d", "units_sold_30d", "conversion_rate_30d", "seo_score", "seo_keyword_analysis"]);
  return Object.fromEntries(Object.entries(listing).filter(([key]) => !immutable.has(key)));
}

export const useListingsStore = create<ListingsStore>((set, get) => ({
  listings: [],
  versions: {},
  activeScopeKey: null,
  loading: false,
  total: 0,
  counts: {},
  globalThresholds: defaultThresholds,
  manualOverrides: {},

  loadListings: async (userId, options = {}) => {
    const workspaceId = useAuth.getState().user?.workspaceId;
    if (!workspaceId) return;
    set({ activeScopeKey: `${userId}:${workspaceId}`, loading: true });
    try {
      const params = new URLSearchParams({
        page: String(options.page ?? 1),
        pageSize: String(options.pageSize ?? 50),
      });
      if (options.search?.trim()) params.set("search", options.search.trim());
      if (["active", "inactive", "draft", "suppressed"].includes(options.filter ?? "")) {
        params.set("status", options.filter!);
      } else if (["winners", "trending", "profitable", "declining", "dead", "low_stock", "out_of_stock"].includes(options.filter ?? "")) {
        params.set("performance", options.filter === "winners" ? "winner" : options.filter!);
      }
      const payload = await apiRequest(`/api/listings?${params.toString()}`);
      set({
        listings: (payload.data ?? []).map(mapListing),
        versions: mapVersions(payload.versions ?? []),
        total: Number(payload.pagination?.total ?? 0),
        counts: Object.fromEntries(Object.entries(payload.counts ?? {}).map(([key, value]) => [key, Number(value)])),
      });
    } catch (error) {
      set({ listings: [], versions: {}, total: 0, counts: {} });
      useToastStore.getState().error("Listings unavailable", error instanceof Error ? error.message : "Try again later.");
    } finally {
      set({ loading: false });
    }
  },

  createListing: async (data) => {
    try {
      const payload = await apiRequest("/api/listings", {
        method: "POST",
        body: JSON.stringify({
          channel: data.channel ?? "amazon",
          status: "draft",
          title: data.title,
          sku: data.sku,
          price: Number(data.price ?? 0),
        }),
      });
      const listing = mapListing(payload.data);
      const createdVersions = payload.version ? mapVersions([payload.version]) : {};
      set((state) => ({
        listings: [listing, ...state.listings],
        versions: { ...state.versions, ...createdVersions },
        total: state.total + 1,
      }));
      return listing;
    } catch (error) {
      useToastStore.getState().error("Listing not created", error instanceof Error ? error.message : "Try again later.");
      return null;
    }
  },

  updateListing: async (id, fields, changeSummary) => {
    const current = get().listings.find((listing) => listing.id === id);
    if (!current) return;
    const next = { ...current, ...fields } as Listing;
    next.performance_category = get().calculatePerformanceBadge(next);
    if (fields.price !== undefined && fields.price !== current.price) {
      next.price_history = [...current.price_history, { date: new Date().toISOString().slice(0, 10), price: fields.price }];
    }
    try {
      const payload = await apiRequest("/api/listings", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          expectedVersion: current.version ?? 1,
          fields: editableSnapshot(next),
          changeSummary,
        }),
      });
      const updated = mapListing(payload.data);
      const createdVersion = payload.version ? mapVersions([payload.version])[id]?.[0] : null;
      set((state) => ({
        listings: state.listings.map((listing) => listing.id === id ? updated : listing),
        versions: createdVersion
          ? { ...state.versions, [id]: [createdVersion, ...(state.versions[id] ?? [])].slice(0, 10) }
          : state.versions,
      }));
    } catch (error) {
      useToastStore.getState().error("Listing not saved", error instanceof Error ? error.message : "Refresh and try again.");
    }
  },

  deleteListing: async (id) => {
    const current = get().listings.find((listing) => listing.id === id);
    if (!current) return;
    try {
      const payload = await apiRequest("/api/listings", {
        method: "DELETE",
        body: JSON.stringify({ id, expectedVersion: current.version ?? 1 }),
      });
      useToastStore.getState().warning(
        "Approval required",
        `Deletion proposal ${payload.data.proposalId} was created. No listing was deleted.`,
      );
    } catch (error) {
      useToastStore.getState().error("Delete request failed", error instanceof Error ? error.message : "Try again later.");
    }
  },

  restoreVersion: async (listingId, versionId) => {
    const target = (get().versions[listingId] ?? []).find((version) => version.id === versionId);
    if (!target) return;
    const snapshot = target.snapshotData as Partial<Listing>;
    await get().updateListing(listingId, {
      title: snapshot.title,
      description: snapshot.description,
      bullet_points: snapshot.bullet_points,
      backend_keywords: snapshot.backend_keywords,
      search_terms: snapshot.search_terms,
      main_image: snapshot.main_image,
      gallery_images: snapshot.gallery_images,
      price: snapshot.price,
      sale_price: snapshot.sale_price,
      business_price: snapshot.business_price,
      color: snapshot.color,
      size: snapshot.size,
      material: snapshot.material,
      dimensions: snapshot.dimensions,
      weight: snapshot.weight,
      package_info: snapshot.package_info,
      country_of_origin: snapshot.country_of_origin,
    }, `Restored to version ${target.versionNumber}: ${target.changeSummary}`);
  },

  bulkPriceChange: async (ids, multiplier) => {
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10) {
      useToastStore.getState().error("Invalid multiplier", "Enter a multiplier greater than 0 and no more than 10.");
      return;
    }
    for (const id of ids.slice(0, 100)) {
      const item = get().listings.find((listing) => listing.id === id);
      if (item) await get().updateListing(id, { price: Math.round(item.price * multiplier * 100) / 100 }, `Bulk price multiplier ${multiplier}`);
    }
  },
  bulkInventoryChange: async (ids, quantity) => {
    if (!Number.isInteger(quantity) || quantity < 0) return;
    for (const id of ids.slice(0, 100)) await get().updateListing(id, { available_qty: quantity }, `Bulk inventory set to ${quantity}`);
  },
  bulkKeywordUpdate: async (ids, keywords) => {
    const clean = Array.from(new Set(keywords.map((value) => value.trim()).filter(Boolean))).slice(0, 100);
    for (const id of ids.slice(0, 100)) {
      const item = get().listings.find((listing) => listing.id === id);
      if (item) await get().updateListing(id, { backend_keywords: Array.from(new Set([...item.backend_keywords, ...clean])) }, "Bulk keyword update");
    }
  },
  bulkStatusChange: async (ids, status) => {
    for (const id of ids.slice(0, 100)) await get().updateListing(id, { status }, `Bulk local status set to ${status}`);
  },

  setGlobalThresholds: (thresholds) => set((state) => ({ globalThresholds: { ...state.globalThresholds, ...thresholds } })),
  setManualOverride: (sku, badge) => set((state) => {
    const overrides = { ...state.manualOverrides };
    if (badge === null) delete overrides[sku]; else overrides[sku] = badge;
    return { manualOverrides: overrides };
  }),
  calculatePerformanceBadge: (listing) => {
    const manual = get().manualOverrides[listing.sku];
    if (manual) return manual;
    if (listing.available_qty === 0) return "out_of_stock";
    const thresholds = listing.performance_custom_thresholds ?? get().globalThresholds;
    if (listing.available_qty < thresholds.lowStockLimit) return "low_stock";
    if (listing.sales_30d === null) return null;
    if (listing.sales_30d === 0) return "dead";
    if (listing.conversion_rate_30d !== null && listing.sales_30d >= thresholds.minSalesWinner && listing.conversion_rate_30d >= thresholds.minConvWinner) return "winner";
    if (listing.sales_30d > 100) return "trending";
    if (listing.conversion_rate_30d !== null && listing.conversion_rate_30d > 0 && listing.conversion_rate_30d < 4) return "declining";
    if (listing.sales_30d < 10) return "sleeping";
    return "working";
  },
}));
