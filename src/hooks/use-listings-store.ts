"use client";

import { create } from "zustand";
import { supabase } from "@/lib/supabase";

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
  master_sku_id?: string;
  channel: "amazon" | "flipkart" | "meesho" | "shopify";
  status: ListingStatus;
  rating?: number;
  reviews_count?: number;
  created_at: string;
  
  // Identification
  asin?: string;
  sku: string;
  fnsku?: string;
  parent_asin?: string;
  brand?: string;
  manufacturer?: string;
  product_type?: string;

  // Content
  title: string;
  description?: string;
  bullet_points: string[];
  aplus_content: Record<string, any>;
  backend_keywords: string[];
  search_terms: string[];
  subject_matter?: string;
  target_audience?: string;

  // Images
  main_image?: string;
  gallery_images: string[];
  alt_images: string[];

  // Physical specs
  color?: string;
  size?: string;
  material?: string;
  dimensions?: string;
  weight?: string;
  package_info?: string;
  country_of_origin?: string;

  // Pricing
  price: number;
  sale_price?: number;
  business_price?: number;

  // Inventory
  available_qty: number;
  reserved_qty: number;
  incoming_qty: number;
  reorder_qty: number;

  // Fulfillment
  fulfillment_channel: "FBA" | "FBM";
  shipping_settings: Record<string, any>;
  package_settings: Record<string, any>;

  // Performance category calculation parameters
  performance_category: PerformanceBadge | null;
  performance_custom_thresholds: {
    minSalesWinner: number;
    minConvWinner: number;
    lowStockLimit: number;
    deadSalesLimit: number;
  };
  
  // Analytics
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
  versions: Record<string, ListingVersion[]>; // map from listingId to version list
  activeUserId: string | null;
  loading: boolean;
  
  // Custom global threshold overrides
  globalThresholds: {
    minSalesWinner: number;
    minConvWinner: number;
    lowStockLimit: number;
    deadSalesLimit: number;
  };
  manualOverrides: Record<string, PerformanceBadge>; // mapping SKU -> Badge override

  loadListings: (userId: string) => Promise<void>;
  createListing: (data: Partial<Listing>) => Promise<Listing | null>;
  updateListing: (id: string, fields: Partial<Listing>, changeSummary: string) => Promise<void>;
  deleteListing: (id: string) => Promise<void>;
  restoreVersion: (listingId: string, versionId: string) => Promise<void>;
  
  // Bulk Actions
  bulkPriceChange: (ids: string[], multiplier: number) => Promise<void>;
  bulkInventoryChange: (ids: string[], quantity: number) => Promise<void>;
  bulkKeywordUpdate: (ids: string[], keywords: string[]) => Promise<void>;
  bulkStatusChange: (ids: string[], status: ListingStatus) => Promise<void>;
  
  setGlobalThresholds: (thresholds: Partial<ListingsStore["globalThresholds"]>) => void;
  setManualOverride: (sku: string, badge: PerformanceBadge | null) => void;
  calculatePerformanceBadge: (l: Listing) => PerformanceBadge | null;
}

const checkSupabaseStatus = () => {
  if (typeof window === "undefined") return true;
  const isPlaceholder = !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "placeholder-anon-key";
  return isPlaceholder;
};

export const useListingsStore = create<ListingsStore>((set, get) => {
  return {
    listings: [],
    versions: {},
    activeUserId: null,
    loading: false,
    globalThresholds: {
      minSalesWinner: 25,
      minConvWinner: 12,
      lowStockLimit: 15,
      deadSalesLimit: 30
    },
    manualOverrides: {},

    loadListings: async (userId) => {
      if (get().listings.length > 0 && get().activeUserId === userId) {
        return;
      }
      set({ activeUserId: userId, loading: true });
      const offline = checkSupabaseStatus();

      if (offline) {
        set({ loading: false });
        return;
      }

      try {
        // --- 1. Load Listings ---
        const { data: listDb, error } = await supabase.from("listings").select("*").eq("user_id", userId);
        if (listDb && listDb.length > 0) {
          const mapped: Listing[] = listDb.map(l => ({
            id: l.id,
            master_sku_id: l.master_sku_id,
            channel: l.channel,
            status: l.status,
            rating: l.rating ? Number(l.rating) : undefined,
            reviews_count: l.reviews_count,
            created_at: l.created_at,
            asin: l.asin,
            sku: l.sku,
            fnsku: l.fnsku,
            parent_asin: l.parent_asin,
            brand: l.brand,
            manufacturer: l.manufacturer,
            product_type: l.product_type,
            title: l.title,
            bullet_points: l.bullet_points || [],
            aplus_content: l.aplus_content || {},
            backend_keywords: l.backend_keywords || [],
            search_terms: l.search_terms || [],
            subject_matter: l.subject_matter,
            target_audience: l.target_audience,
            main_image: l.main_image,
            gallery_images: l.gallery_images || [],
            alt_images: l.alt_images || [],
            color: l.color,
            size: l.size,
            material: l.material,
            dimensions: l.dimensions,
            weight: l.weight,
            package_info: l.package_info,
            country_of_origin: l.country_of_origin,
            price: Number(l.price),
            sale_price: l.sale_price ? Number(l.sale_price) : undefined,
            business_price: l.business_price ? Number(l.business_price) : undefined,
            available_qty: l.available_qty || 0,
            reserved_qty: l.reserved_qty || 0,
            incoming_qty: l.incoming_qty || 0,
            reorder_qty: l.reorder_qty || 0,
            fulfillment_channel: l.fulfillment_channel || "FBA",
            shipping_settings: l.shipping_settings || {},
            package_settings: l.package_settings || {},
            performance_category: l.performance_category || "working",
            performance_custom_thresholds: l.performance_custom_thresholds || { minSalesWinner: 25, minConvWinner: 12, lowStockLimit: 15, deadSalesLimit: 30 },
            sales_30d: l.sales_30d !== null && l.sales_30d !== undefined ? l.sales_30d : null,
            revenue_30d: l.revenue_30d !== null && l.revenue_30d !== undefined ? Number(l.revenue_30d) : null,
            orders_30d: l.orders_30d !== null && l.orders_30d !== undefined ? l.orders_30d : null,
            units_sold_30d: l.units_sold_30d !== null && l.units_sold_30d !== undefined ? l.units_sold_30d : null,
            conversion_rate_30d: l.conversion_rate_30d !== null && l.conversion_rate_30d !== undefined ? Number(l.conversion_rate_30d) : null,
            seo_score: l.seo_score !== null && l.seo_score !== undefined ? l.seo_score : null,
            seo_keyword_analysis: l.seo_keyword_analysis || {},
            price_history: l.price_history || []
          }));
          set({ listings: mapped });

          // Load versions for mapped listings
          const versionMap: Record<string, ListingVersion[]> = {};
          for (const list of mapped) {
            const { data: verDb } = await supabase.from("listing_versions").select("*").eq("listing_id", list.id).order("version_number", { ascending: false });
            if (verDb) {
              versionMap[list.id] = verDb.map(v => ({
                id: v.id,
                listingId: v.listing_id,
                title: v.title,
                description: v.description,
                bulletPoints: v.bullet_points || [],
                keywords: v.keywords || [],
                versionNumber: v.version_number,
                changeSummary: v.change_summary || "",
                userAction: v.user_action || "",
                createdAt: v.created_at,
                snapshotData: v.snapshot_data || {}
              }));
            }
          }
          set({ versions: versionMap });
        } else {
          set({ listings: [], versions: {} });
        }
      } catch (err) {
        console.error("Listing database fetch failed", err);
      } finally {
        set({ loading: false });
      }
    },

    createListing: async (data) => {
      const { activeUserId, listings, calculatePerformanceBadge } = get();
      const offline = checkSupabaseStatus();

      const uniqueId = Date.now().toString(36);
      const newListingId = `sp-internal-${uniqueId}`;
      
      const newListing: Listing = {
        id: newListingId,
        channel: data.channel || "amazon",
        status: data.status || "draft",
        title: data.title || "New Unnamed Listing",
        sku: data.sku || `INTERNAL-SKU-${uniqueId.toUpperCase()}`,
        asin: data.asin || undefined,
        bullet_points: data.bullet_points || [],
        aplus_content: data.aplus_content || {},
        backend_keywords: data.backend_keywords || [],
        search_terms: data.search_terms || [],
        gallery_images: data.gallery_images || [],
        alt_images: data.alt_images || [],
        price: data.price || 0,
        available_qty: data.available_qty || 0,
        reserved_qty: data.reserved_qty || 0,
        incoming_qty: data.incoming_qty || 0,
        reorder_qty: data.reorder_qty || 0,
        fulfillment_channel: data.fulfillment_channel || "FBA",
        shipping_settings: data.shipping_settings || {},
        package_settings: data.package_settings || {},
        performance_category: "working",
        performance_custom_thresholds: data.performance_custom_thresholds || { minSalesWinner: 25, minConvWinner: 12, lowStockLimit: 15, deadSalesLimit: 30 },
        sales_30d: null,
        revenue_30d: null,
        orders_30d: null,
        units_sold_30d: null,
        conversion_rate_30d: null,
        seo_score: null,
        seo_keyword_analysis: {},
        price_history: [{ date: new Date().toISOString().split("T")[0], price: data.price || 0 }],
        created_at: new Date().toISOString(),
        ...data
      };

      // Set performance badge
      newListing.performance_category = calculatePerformanceBadge(newListing);

      if (offline || !activeUserId) {
        set({ listings: [newListing, ...listings] });
        // setup basic version history
        const ver: ListingVersion = {
          id: `v-snap-1-${newListing.id}`,
          listingId: newListing.id,
          title: "Created Draft profile",
          description: newListing.description || "",
          bulletPoints: newListing.bullet_points,
          keywords: newListing.backend_keywords,
          versionNumber: 1,
          changeSummary: "Initial Setup Draft",
          userAction: "Merchant Creation",
          createdAt: new Date().toISOString(),
          snapshotData: { ...newListing }
        };
        set(state => ({
          versions: {
            ...state.versions,
            [newListing.id]: [ver]
          }
        }));
        return newListing;
      }

      try {
        const { data: row, error } = await supabase.from("listings").insert({
          user_id: activeUserId,
          channel: newListing.channel,
          status: newListing.status,
          title: newListing.title,
          sku: newListing.sku,
          asin: newListing.asin,
          fnsku: newListing.fnsku,
          parent_asin: newListing.parent_asin,
          brand: newListing.brand,
          manufacturer: newListing.manufacturer,
          product_type: newListing.product_type,
          bullet_points: newListing.bullet_points,
          aplus_content: newListing.aplus_content,
          backend_keywords: newListing.backend_keywords,
          search_terms: newListing.search_terms,
          subject_matter: newListing.subject_matter,
          target_audience: newListing.target_audience,
          main_image: newListing.main_image,
          gallery_images: newListing.gallery_images,
          alt_images: newListing.alt_images,
          color: newListing.color,
          size: newListing.size,
          material: newListing.material,
          dimensions: newListing.dimensions,
          weight: newListing.weight,
          package_info: newListing.package_info,
          country_of_origin: newListing.country_of_origin,
          price: newListing.price,
          sale_price: newListing.sale_price,
          business_price: newListing.business_price,
          available_qty: newListing.available_qty,
          reserved_qty: newListing.reserved_qty,
          incoming_qty: newListing.incoming_qty,
          reorder_qty: newListing.reorder_qty,
          fulfillment_channel: newListing.fulfillment_channel,
          shipping_settings: newListing.shipping_settings,
          package_settings: newListing.package_settings,
          performance_category: newListing.performance_category,
          performance_custom_thresholds: newListing.performance_custom_thresholds,
          sales_30d: newListing.sales_30d,
          revenue_30d: newListing.revenue_30d,
          orders_30d: newListing.orders_30d,
          units_sold_30d: newListing.units_sold_30d,
          conversion_rate_30d: newListing.conversion_rate_30d,
          seo_score: newListing.seo_score,
          seo_keyword_analysis: newListing.seo_keyword_analysis,
          price_history: newListing.price_history
        }).select();

        if (row && row[0]) {
          const inserted: Listing = {
            ...newListing,
            id: row[0].id
          };
          set({ listings: [inserted, ...listings] });

          // Seed version
          await supabase.from("listing_versions").insert({
            listing_id: row[0].id,
            title: "Created Draft Profile",
            description: inserted.description || "",
            bullet_points: inserted.bullet_points,
            keywords: inserted.backend_keywords,
            version_number: 1,
            change_summary: "Initial Setup Draft",
            user_action: "Merchant Creation",
            snapshot_data: { ...inserted }
          });

          // Reload version list
          const { data: verDb } = await supabase.from("listing_versions").select("*").eq("listing_id", row[0].id).order("version_number", { ascending: false });
          if (verDb) {
            set(state => ({
              versions: {
                ...state.versions,
                [row[0].id]: verDb.map(v => ({
                  id: v.id,
                  listingId: v.listing_id,
                  title: v.title,
                  description: v.description,
                  bulletPoints: v.bullet_points || [],
                  keywords: v.keywords || [],
                  versionNumber: v.version_number,
                  changeSummary: v.change_summary || "",
                  userAction: v.user_action || "",
                  createdAt: v.created_at,
                  snapshotData: v.snapshot_data || {}
                }))
              }
            }));
          }
          return inserted;
        }
      } catch (err) {
        console.error("Listing insert failed", err);
      }
      return null;
    },

    updateListing: async (id, fields, changeSummary) => {
      const { listings, activeUserId, versions, calculatePerformanceBadge } = get();
      const offline = checkSupabaseStatus();

      const orig = listings.find(l => l.id === id);
      if (!orig) return;

      const updated = {
        ...orig,
        ...fields
      } as Listing;

      // Recalculate performance category
      updated.performance_category = get().calculatePerformanceBadge(updated);

      // Track price history revisions
      if (fields.price !== undefined && fields.price !== orig.price) {
        const history = [...(orig.price_history || [])];
        history.push({ date: new Date().toISOString().split("T")[0], price: fields.price });
        updated.price_history = history;
      }

      if (offline || !activeUserId) {
        // Local state update
        set({
          listings: listings.map(l => l.id === id ? updated : l)
        });

        // Add version snapshot
        const verNum = (versions[id]?.length || 0) + 1;
        const newVer: ListingVersion = {
          id: `v-snap-${verNum}-${id}`,
          listingId: id,
          title: updated.title,
          description: updated.description || "",
          bulletPoints: updated.bullet_points,
          keywords: updated.backend_keywords,
          versionNumber: verNum,
          changeSummary,
          userAction: "Merchant Edit",
          createdAt: new Date().toISOString(),
          snapshotData: { ...updated }
        };
        
        set(state => ({
          versions: {
            ...state.versions,
            [id]: [newVer, ...(state.versions[id] || [])]
          }
        }));
        return;
      }

      try {
        await supabase.from("listings").update({
          channel: updated.channel,
          status: updated.status,
          title: updated.title,
          sku: updated.sku,
          asin: updated.asin,
          fnsku: updated.fnsku,
          parent_asin: updated.parent_asin,
          brand: updated.brand,
          manufacturer: updated.manufacturer,
          product_type: updated.product_type,
          bullet_points: updated.bullet_points,
          aplus_content: updated.aplus_content,
          backend_keywords: updated.backend_keywords,
          search_terms: updated.search_terms,
          subject_matter: updated.subject_matter,
          target_audience: updated.target_audience,
          main_image: updated.main_image,
          gallery_images: updated.gallery_images,
          alt_images: updated.alt_images,
          color: updated.color,
          size: updated.size,
          material: updated.material,
          dimensions: updated.dimensions,
          weight: updated.weight,
          package_info: updated.package_info,
          country_of_origin: updated.country_of_origin,
          price: updated.price,
          sale_price: updated.sale_price,
          business_price: updated.business_price,
          available_qty: updated.available_qty,
          reserved_qty: updated.reserved_qty,
          incoming_qty: updated.incoming_qty,
          reorder_qty: updated.reorder_qty,
          fulfillment_channel: updated.fulfillment_channel,
          shipping_settings: updated.shipping_settings,
          package_settings: updated.package_settings,
          performance_category: updated.performance_category,
          performance_custom_thresholds: updated.performance_custom_thresholds,
          price_history: updated.price_history
        }).eq("id", id);

        set({
          listings: listings.map(l => l.id === id ? updated : l)
        });

        // Fetch current version counts to compute next number
        const { count } = await supabase.from("listing_versions").select("*", { count: "exact", head: true }).eq("listing_id", id);
        const nextVerNum = (count || 0) + 1;

        await supabase.from("listing_versions").insert({
          listing_id: id,
          title: updated.title,
          description: updated.description || "",
          bullet_points: updated.bullet_points,
          keywords: updated.backend_keywords,
          version_number: nextVerNum,
          change_summary: changeSummary,
          user_action: "Merchant Edit",
          snapshot_data: { ...updated }
        });

        // Reload versions
        const { data: verDb } = await supabase.from("listing_versions").select("*").eq("listing_id", id).order("version_number", { ascending: false });
        if (verDb) {
          set(state => ({
            versions: {
              ...state.versions,
              [id]: verDb.map(v => ({
                id: v.id,
                listingId: v.listing_id,
                title: v.title,
                description: v.description,
                bulletPoints: v.bullet_points || [],
                keywords: v.keywords || [],
                versionNumber: v.version_number,
                changeSummary: v.change_summary || "",
                userAction: v.user_action || "",
                createdAt: v.created_at,
                snapshotData: v.snapshot_data || {}
              }))
            }
          }));
        }
      } catch (err) {
        console.error("Listing database update failed", err);
      }
    },

    deleteListing: async (id) => {
      const { listings, activeUserId } = get();
      const offline = checkSupabaseStatus();

      if (offline || !activeUserId) {
        set({
          listings: listings.filter(l => l.id !== id)
        });
        return;
      }

      try {
        await supabase.from("listings").delete().eq("id", id);
        set({
          listings: listings.filter(l => l.id !== id)
        });
      } catch (e) {
        console.error("Failed to delete listing", e);
      }
    },

    restoreVersion: async (listingId, versionId) => {
      const { versions, updateListing } = get();
      const listingVers = versions[listingId] || [];
      const targetVer = listingVers.find(v => v.id === versionId);
      if (!targetVer || !targetVer.snapshotData) return;

      // Extract raw properties to restore
      const snapshot = targetVer.snapshotData;
      const restoreFields: Partial<Listing> = {
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
        country_of_origin: snapshot.country_of_origin
      };

      await updateListing(listingId, restoreFields, `Restored to version #${targetVer.versionNumber} ("${targetVer.changeSummary}")`);
    },

    // Bulk price multiplier
    bulkPriceChange: async (ids, multiplier) => {
      const { listings, updateListing } = get();
      for (const id of ids) {
        const item = listings.find(l => l.id === id);
        if (item) {
          const newPrice = Math.round(item.price * multiplier);
          await updateListing(id, { price: newPrice }, `Bulk price change: set to ₹${newPrice} (multiplier ${multiplier}x)`);
        }
      }
    },

    // Bulk inventory override
    bulkInventoryChange: async (ids, quantity) => {
      const { listings, updateListing } = get();
      for (const id of ids) {
        const item = listings.find(l => l.id === id);
        if (item) {
          await updateListing(id, { available_qty: quantity }, `Bulk inventory override: set available qty to ${quantity}`);
        }
      }
    },

    // Bulk keyword sets append
    bulkKeywordUpdate: async (ids, keywords) => {
      const { listings, updateListing } = get();
      for (const id of ids) {
        const item = listings.find(l => l.id === id);
        if (item) {
          const joined = Array.from(new Set([...(item.backend_keywords || []), ...keywords]));
          await updateListing(id, { backend_keywords: joined }, `Bulk keywords update: added [${keywords.join(", ")}]`);
        }
      }
    },

    // Bulk status changes
    bulkStatusChange: async (ids, status) => {
      const { listings, updateListing } = get();
      for (const id of ids) {
        const item = listings.find(l => l.id === id);
        if (item) {
          await updateListing(id, { status }, `Bulk status transition: set status to ${status.toUpperCase()}`);
        }
      }
    },

    setGlobalThresholds: (thresholds) => set((state) => {
      const next = { ...state.globalThresholds, ...thresholds };
      // Recalculate all listing badges based on new thresholds
      const recalced = state.listings.map(l => ({
        ...l,
        performance_category: get().calculatePerformanceBadge({
          ...l,
          performance_custom_thresholds: {
            minSalesWinner: next.minSalesWinner,
            minConvWinner: next.minConvWinner,
            lowStockLimit: next.lowStockLimit,
            deadSalesLimit: next.deadSalesLimit
          }
        })
      }));
      return { globalThresholds: next, listings: recalced };
    }),

    setManualOverride: (sku, badge) => set((state) => {
      const overrides = { ...state.manualOverrides };
      if (badge === null) {
        delete overrides[sku];
      } else {
        overrides[sku] = badge;
      }

      // Recalculate listing metrics
      const recalced = state.listings.map(l => {
        if (l.sku === sku) {
          return {
            ...l,
            performance_category: badge !== null ? badge : get().calculatePerformanceBadge(l)
          };
        }
        return l;
      });

      return { manualOverrides: overrides, listings: recalced };
    }),

    calculatePerformanceBadge: (l) => {
      const { manualOverrides } = get();
      
      // 1. Check manual override
      if (manualOverrides[l.sku]) {
        return manualOverrides[l.sku];
      }

      if (l.available_qty === 0) {
        return "out_of_stock";
      }

      const thresholds = l.performance_custom_thresholds || {
        minSalesWinner: 25,
        minConvWinner: 12,
        lowStockLimit: 15,
        deadSalesLimit: 30
      };
      
      if (l.available_qty < thresholds.lowStockLimit) {
        return "low_stock";
      }

      // If there is no sales metrics data, do not estimate or default to working
      if (l.sales_30d === null) {
        return null;
      }

      if (l.sales_30d === 0) {
        return "dead";
      }
      
      // Winner: High sales volume, high conversion rate
      if (l.conversion_rate_30d !== null && l.sales_30d >= thresholds.minSalesWinner && l.conversion_rate_30d >= thresholds.minConvWinner) {
        return "winner";
      }

      // Trending: Increasing sales, high velocity
      if (l.sales_30d > 100) {
        return "trending";
      }

      // Declining: lower conversion rates or downward trajectory
      if (l.conversion_rate_30d !== null && l.conversion_rate_30d > 0 && l.conversion_rate_30d < 4.0) {
        return "declining";
      }

      if (l.sales_30d > 0 && l.sales_30d < 10) {
        return "sleeping";
      } 

      return "working";
    }
  };
});
