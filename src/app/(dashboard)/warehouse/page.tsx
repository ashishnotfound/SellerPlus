"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToastStore } from "@/hooks/use-toast-store";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import {
  Package, PackageCheck, Truck, Printer, RefreshCw, ChevronRight,
  Clipboard, User, MapPin, StickyNote, Hash, AlertTriangle, X,
  CheckCircle2, Clock, Boxes, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buildPackingSlipData, formatShippingAddress } from "@/lib/warehouse/packing-slip";
import type { WarehouseOrder } from "@/lib/warehouse/types";

// ─── Status helpers ───────────────────────────────────────────────────────────

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Pending",
    Pending: "Pending",
    Unshipped: "Unshipped",
    PartiallyShipped: "Partially Shipped",
    packed: "Packed",
    Packed: "Packed",
    Shipped: "Shipped",
    shipped: "Shipped",
  };
  return map[status] ?? status;
}

function statusColor(status: string): string {
  if (["packed", "Packed"].includes(status)) return "text-emerald-400 bg-emerald-400/10 border-emerald-500/30";
  if (["shipped", "Shipped"].includes(status)) return "text-sky-400 bg-sky-400/10 border-sky-500/30";
  return "text-amber-400 bg-amber-400/10 border-amber-500/30";
}

function statusIcon(status: string) {
  if (["packed", "Packed"].includes(status)) return <PackageCheck className="w-3 h-3" />;
  if (["shipped", "Shipped"].includes(status)) return <Truck className="w-3 h-3" />;
  return <Clock className="w-3 h-3" />;
}

// ─── Packing Slip Print Layer ─────────────────────────────────────────────────
// Renders only inside a @media print context. Completely invisible in the UI.

function PackingSlipPrint({ order }: { order: WarehouseOrder }) {
  const slip = buildPackingSlipData(order);
  return (
    <div id={`slip-${order.id}`} className="hidden print:block print-only font-sans text-black">
      <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PACKING SLIP</h1>
          <p className="text-xs text-gray-600 mt-0.5">SellerPlus Warehouse Operations</p>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p className="font-mono">Order: {slip.channelOrderId}</p>
          <p>Printed: {new Date(slip.printedAt).toLocaleString()}</p>
          <p>Method: {slip.shippingMethod}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-6">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest mb-1.5 text-gray-500">Ship To</h2>
          <p className="font-semibold">{slip.recipientName}</p>
          <p className="text-sm leading-snug text-gray-700">{formatShippingAddress(slip.shippingAddress)}</p>
        </div>
        {slip.packingNotes && (
          <div>
            <h2 className="text-xs font-bold uppercase tracking-widest mb-1.5 text-gray-500">Packing Notes</h2>
            <p className="text-sm text-red-700 font-medium">{slip.packingNotes}</p>
          </div>
        )}
      </div>

      <table className="w-full text-sm border-collapse mb-6">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="text-left py-2 font-bold">Product</th>
            <th className="text-left py-2 font-bold">SKU</th>
            <th className="text-right py-2 font-bold">Qty</th>
          </tr>
        </thead>
        <tbody>
          {slip.items.map((item, i) => (
            <tr key={i} className="border-b border-gray-200">
              <td className="py-2">{item.title}</td>
              <td className="py-2 font-mono text-xs">{item.sku}</td>
              <td className="py-2 text-right font-bold">{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-center text-xs text-gray-400 border-t pt-3">
        <p>Thank you for your order. For returns or issues, contact support@sellerplus.in</p>
      </div>
    </div>
  );
}

// ─── Order Card ───────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: WarehouseOrder;
  selected: boolean;
  onSelect: () => void;
  onStatusUpdate: (orderId: string, newStatus: "packed" | "shipped", note?: string) => Promise<void>;
  updating: boolean;
}

function OrderCard({ order, selected, onSelect, onStatusUpdate, updating }: OrderCardProps) {
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");

  const isPacked = ["packed", "Packed"].includes(order.status);
  const isPending = !isPacked;

  const handlePrint = () => {
    const el = document.getElementById(`slip-${order.id}`);
    if (!el) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Packing Slip — ${order.channel_order_id}</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#000}table{width:100%;border-collapse:collapse}</style>
      </head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.print();
    win.close();
  };

  return (
    <div
      className={cn(
        "relative rounded-2xl border transition-all duration-200 overflow-hidden",
        selected
          ? "border-emerald-500/60 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.12)]"
          : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]"
      )}
    >
      {/* Hidden print layer */}
      <PackingSlipPrint order={order} />

      {/* Card Header */}
      <div
        className="flex items-start justify-between p-4 pb-3 cursor-pointer"
        onClick={onSelect}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4 text-white/60" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate">{order.channel_order_id}</p>
            <p className="text-white/50 text-xs truncate mt-0.5">
              {order.customer_name ?? "Unknown customer"}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border shrink-0",
            statusColor(order.status)
          )}
        >
          {statusIcon(order.status)} {statusLabel(order.status)}
        </span>
      </div>

      {/* Shipping Address */}
      {order.shipping_address && (
        <div className="px-4 pb-2 flex items-start gap-2">
          <MapPin className="w-3.5 h-3.5 text-white/30 mt-0.5 shrink-0" />
          <p className="text-white/45 text-xs leading-snug">
            {formatShippingAddress(order.shipping_address)}
          </p>
        </div>
      )}

      {/* Items Summary */}
      <div className="px-4 pb-3">
        {order.items.slice(0, 2).map((item) => (
          <div key={item.id} className="flex items-center gap-2 py-1">
            {item.main_image ? (
              <img
                src={item.main_image}
                alt={item.title ?? ""}
                className="w-8 h-8 rounded-lg object-cover bg-white/10 shrink-0"
                loading="lazy"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center shrink-0">
                <Boxes className="w-4 h-4 text-white/30" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-white/75 text-xs truncate">{item.title ?? "Unnamed product"}</p>
              <p className="text-white/35 text-[10px] font-mono">{item.seller_sku ?? "—"} × {item.quantity_ordered}</p>
            </div>
          </div>
        ))}
        {order.items.length > 2 && (
          <p className="text-white/35 text-xs pt-1">+{order.items.length - 2} more items</p>
        )}
      </div>

      {/* Packing Notes Banner */}
      {order.packing_notes && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <StickyNote className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300/90 text-xs leading-snug">{order.packing_notes}</p>
        </div>
      )}

      {/* Optional note field */}
      {showNote && (
        <div className="px-4 pb-3">
          <textarea
            className="w-full rounded-xl bg-white/5 border border-white/10 text-white/80 text-xs px-3 py-2 placeholder-white/30 resize-none focus:outline-none focus:border-emerald-500/50 transition-colors"
            rows={2}
            placeholder="Optional note (e.g. damaged packaging)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 pb-4">
        <button
          onClick={handlePrint}
          className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
        >
          <Printer className="w-3.5 h-3.5" />
          Print Slip
        </button>

        <div className="flex-1" />

        <button
          onClick={() => setShowNote((v) => !v)}
          className="text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1.5 rounded-lg"
        >
          {showNote ? "Hide note" : "Add note"}
        </button>

        {isPending && (
          <button
            disabled={updating}
            onClick={() => onStatusUpdate(order.id, "packed", note || undefined).then(() => setNote(""))}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PackageCheck className="w-3.5 h-3.5" />
            {updating ? "Saving…" : "Mark Packed"}
          </button>
        )}

        {isPacked && (
          <button
            disabled={updating}
            onClick={() => onStatusUpdate(order.id, "shipped", note || undefined).then(() => setNote(""))}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Truck className="w-3.5 h-3.5" />
            {updating ? "Saving…" : "Mark Shipped"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WarehousePage() {
  const user = useAuth((s) => s.user);
  const { success, error: showError, info } = useToastStore();

  const [orders, setOrders] = useState<WarehouseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"pending" | "packed" | "all">("pending");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  
  const { isOffline, queueCount, enqueueAction } = useOfflineQueue();

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (!user) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch(`/api/warehouse/orders?status=${statusFilter}&limit=100`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({ error: "Unknown error" }));
        showError("Failed to load orders", e.error ?? "");
        return;
      }
      const json = await res.json();
      setOrders(json.orders ?? []);
    } catch (err) {
      showError("Network error", "Could not reach the warehouse API.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStatusUpdate = async (
    orderId: string,
    newStatus: "packed" | "shipped",
    note?: string
  ) => {
    if (isOffline) {
      enqueueAction("pack_order", { orderId, status: newStatus, note });
      // Optimistically update
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
      return;
    }

    setUpdatingIds((prev) => new Set(prev).add(orderId));
    try {
      const res = await fetch(`/api/warehouse/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStatus, note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError("Update failed", json.error ?? `HTTP ${res.status}`);
        return;
      }
      success(
        newStatus === "packed" ? "Marked as Packed ✓" : "Marked as Shipped ✓",
        `Order updated successfully.`
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.channel_order_id.toLowerCase().includes(q) ||
      (o.customer_name ?? "").toLowerCase().includes(q)
    );
  });

  const pendingCount = orders.filter((o) =>
    ["pending", "Pending", "Unshipped", "PartiallyShipped"].includes(o.status)
  ).length;
  const packedCount = orders.filter((o) => ["packed", "Packed"].includes(o.status)).length;

  return (
    <div className="flex flex-col gap-6 p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Warehouse Portal
            {isOffline && (
              <span className="text-[10px] uppercase font-bold tracking-widest bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                Offline Mode
              </span>
            )}
          </h1>
          <p className="text-white/50 text-sm mt-1">
            Pack and ship orders efficiently.
            {queueCount > 0 && <span className="text-amber-400 ml-1">({queueCount} offline actions pending sync)</span>}
          </p>
        </div>
        <button
          onClick={() => fetchOrders(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors px-4 py-2 rounded-xl border border-white/10 hover:border-white/20 bg-white/[0.04]"
        >
          <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Pending", value: pendingCount, icon: <Clock className="w-4 h-4 text-amber-400" />, color: "text-amber-400" },
          { label: "Packed", value: packedCount, icon: <PackageCheck className="w-4 h-4 text-emerald-400" />, color: "text-emerald-400" },
          { label: "Total Loaded", value: orders.length, icon: <Package className="w-4 h-4 text-white/40" />, color: "text-white/70" },
          { label: "Filtered", value: filteredOrders.length, icon: <Search className="w-4 h-4 text-sky-400" />, color: "text-sky-400" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-white/8 bg-white/[0.04] p-4 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
              {stat.icon}
            </div>
            <div>
              <p className={cn("text-xl font-bold", stat.color)}>{stat.value}</p>
              <p className="text-white/40 text-xs">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden shrink-0">
          {(["pending", "packed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "px-4 py-2 text-sm transition-all capitalize",
                statusFilter === f
                  ? "bg-emerald-500 text-black font-semibold"
                  : "text-white/50 hover:text-white/80"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order ID or customer…"
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-white/80 text-sm placeholder-white/30 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>
      </div>

      {/* Order Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-60 rounded-2xl border border-white/8 bg-white/[0.04] animate-pulse"
            />
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400/50" />
          </div>
          <div>
            <p className="text-white/60 font-semibold">All caught up!</p>
            <p className="text-white/35 text-sm mt-1">No orders match the current filter.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              selected={selectedId === order.id}
              onSelect={() => setSelectedId((id) => (id === order.id ? null : order.id))}
              onStatusUpdate={handleStatusUpdate}
              updating={updatingIds.has(order.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
