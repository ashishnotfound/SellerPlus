"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Edit3,
  Lock,
  MapPin,
  PackageSearch,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

type AdminTab = "overview" | "amazon" | "locations" | "skus" | "settings";
type LocationType = "WAREHOUSE" | "RACK" | "SHELF" | "BIN";

interface Overview {
  generatedAt: string;
  windowStart: string;
  todayOrders: number;
  unpackedOrders: number;
  packedOrders: number;
  cancelledOrders: number;
  currentSessions: number;
  currentPackingSessions: number;
  currentPutawaySessions: number;
  packagesPacked: number;
  unitsPacked: number;
  putawayActions: number;
}

interface AmazonState {
  connection: {
    marketplaceAccountId: string;
    displayName: string;
    marketplaceId: string;
    connected: boolean;
    accountStatus: string;
    apiHealth: "AVAILABLE" | "SYNCING" | "DEGRADED" | "DISCONNECTED";
  };
  checkpoint: {
    last_attempted_at?: string | null;
    last_succeeded_at?: string | null;
    freshness_state?: string | null;
    last_error_code?: string | null;
    last_error_message?: string | null;
  } | null;
  latestRun: AmazonRun | null;
  runs: AmazonRun[];
  limitations: { ordersApiVersion: string; labelDocuments: string; cancellationTime: string; easyShip: string };
}

interface AmazonRun {
  id: string;
  job_id: string | null;
  sync_type: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  orders_scanned: number;
  orders_new: number;
  orders_updated: number;
  orders_cancelled: number;
  shipments_updated: number;
  error_count: number;
  progress_message: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Location {
  id: string;
  warehouse_id: string | null;
  parent_id: string | null;
  location_type: LocationType;
  code: string;
  name: string;
  sort_order: number;
  active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

interface SkuBarcode { barcode: string; barcodeType: string }
interface Sku {
  skuId: string;
  marketplaceAccountId: string | null;
  sku: string;
  asin: string | null;
  productTitle: string | null;
  size: string | null;
  source: string;
  active: boolean;
  version: number;
  barcodes: SkuBarcode[];
  locationId: string | null;
  locationCode: string | null;
  locationName: string | null;
  expectedQuantity: number | null;
  assignmentVersion: number | null;
  updatedAt: string;
}

interface Settings {
  sound_enabled: boolean;
  vibration_enabled: boolean;
  sound_volume: number;
  scan_debounce_ms: number;
  claim_ttl_seconds: number;
  sync_interval_minutes: number;
  allow_manual_awb: boolean;
  version: number;
  updated_at?: string;
}

const tabs: Array<{ id: AdminTab; label: string; icon: typeof Cloud }> = [
  { id: "overview", label: "Overview", icon: ShieldCheck },
  { id: "amazon", label: "Amazon", icon: Cloud },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "skus", label: "Products / SKUs", icon: PackageSearch },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const defaultSettings: Settings = {
  sound_enabled: true,
  vibration_enabled: true,
  sound_volume: 1,
  scan_debounce_ms: 1500,
  claim_ttl_seconds: 120,
  sync_interval_minutes: 15,
  allow_manual_awb: true,
  version: 0,
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatNumber(value: number): string { return new Intl.NumberFormat().format(value); }

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : `Request failed (${response.status}).`);
  return payload as T;
}

function Section({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-[#15171c] p-5 shadow-xl shadow-black/10">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-white">{title}</h2>
          {description ? <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, tone = "emerald" }: { label: string; value: number; tone?: "emerald" | "amber" | "rose" | "sky" }) {
  const toneClass = tone === "rose" ? "text-rose-300 bg-rose-400/10 border-rose-400/20" : tone === "amber" ? "text-amber-300 bg-amber-400/10 border-amber-400/20" : tone === "sky" ? "text-sky-300 bg-sky-400/10 border-sky-400/20" : "text-emerald-300 bg-emerald-400/10 border-emerald-400/20";
  return <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className={cn("mt-2 inline-flex rounded-lg border px-2.5 py-1 text-2xl font-semibold", toneClass)}>{formatNumber(value)}</p></div>;
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const classes = normalized === "AVAILABLE" || normalized === "SUCCEEDED" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : normalized === "SYNCING" || normalized === "RUNNING" || normalized === "QUEUED" ? "border-sky-400/25 bg-sky-400/10 text-sky-300" : normalized === "DEGRADED" || normalized === "FAILED" ? "border-rose-400/25 bg-rose-400/10 text-rose-300" : "border-zinc-500/25 bg-zinc-500/10 text-zinc-300";
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider", classes)}>{normalized}</span>;
}

function AdminOverview({ overview, onRefresh }: { overview: Overview | null; onRefresh: () => void }) {
  if (!overview) return <Section title="Overview"><Loading /></Section>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight text-white">Reyo Pack control room</h1><p className="mt-1 text-sm text-zinc-500">Operational totals are calculated server-side for this workspace. Window starts {formatDate(overview.windowStart)}.</p></div><button type="button" onClick={onRefresh} className="button-secondary"><RefreshCw className="h-4 w-4" /> Refresh</button></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric label="Today's orders" value={overview.todayOrders} tone="sky" /><Metric label="Unpacked orders" value={overview.unpackedOrders} tone="amber" /><Metric label="Packed orders" value={overview.packedOrders} /><Metric label="Cancelled orders" value={overview.cancelledOrders} tone="rose" /></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="Packages packed" value={overview.packagesPacked} /><Metric label="Units packed" value={overview.unitsPacked} /><Metric label="Putaway actions" value={overview.putawayActions} tone="sky" /><Metric label="Active sessions" value={overview.currentSessions} tone="amber" /><Metric label="Packing / putaway" value={overview.currentPackingSessions + overview.currentPutawaySessions} tone="sky" /></div>
    <Section title="Current operations" description={`Last calculated ${formatDate(overview.generatedAt)}. Use the mobile Reyo Pack screen for scan and confirm workflows.`}>
      <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex items-center gap-2 text-sm text-white"><Truck className="h-4 w-4 text-emerald-300" /> Packing sessions <span className="ml-auto font-mono text-emerald-300">{overview.currentPackingSessions}</span></div><p className="mt-2 text-xs text-zinc-500">Workers currently packing. Claims remain server-authoritative.</p></div><div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex items-center gap-2 text-sm text-white"><MapPin className="h-4 w-4 text-sky-300" /> Putaway sessions <span className="ml-auto font-mono text-sky-300">{overview.currentPutawaySessions}</span></div><p className="mt-2 text-xs text-zinc-500">Workers currently organizing products by location.</p></div></div>
    </Section>
  </div>;
}

function Loading() { return <div className="flex min-h-32 items-center justify-center text-sm text-zinc-500"><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading workspace data…</div>; }

function AmazonPanel({ amazon, onRefresh }: { amazon: AmazonState | null; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const runAction = async (action: "SYNC_NOW" | "FULL_SYNC" | "REFRESH_ORDERS" | "SYNC_SHIPPING_DATA") => {
    setBusy(action); setMessage(null);
    try { const response = await sellerplusApiFetch("/api/reyo-pack/admin/amazon/sync", { method: "POST", body: JSON.stringify({ action, marketplaceAccountId: amazon?.connection.marketplaceAccountId }) }); const result = await readJson<{ data: { status: string } }>(response); setMessage(result.data.status === "QUEUED" ? "Sync queued in the durable worker. This page will update as it runs." : "Sync is already running; showing the existing run."); await onRefresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Unable to start Amazon synchronization."); }
    finally { setBusy(null); }
  };
  if (!amazon) return <Section title="Amazon connection"><Loading /></Section>;
  const run = amazon.latestRun;
  return <div className="space-y-5">
    <Section title="Amazon connection" description="Credentials stay server-side. Buttons enqueue durable synchronization jobs; this browser never holds an SP-API request open." action={<button type="button" onClick={() => void onRefresh()} className="button-secondary"><RefreshCw className="h-4 w-4" /> Refresh</button>}>
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]"><div className="rounded-xl border border-white/10 bg-black/10 p-4"><div className="flex flex-wrap items-center gap-3"><span className="text-base font-semibold text-white">{amazon.connection.displayName}</span><StatusPill status={amazon.connection.apiHealth} /></div><dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3"><div><dt className="text-zinc-500">Marketplace</dt><dd className="mt-1 font-mono text-zinc-200">{amazon.connection.marketplaceId}</dd></div><div><dt className="text-zinc-500">Account</dt><dd className="mt-1 text-zinc-200">{amazon.connection.accountStatus}</dd></div><div><dt className="text-zinc-500">Last successful sync</dt><dd className="mt-1 text-zinc-200">{formatDate(amazon.checkpoint?.last_succeeded_at)}</dd></div></dl>{amazon.checkpoint?.last_error_message ? <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{amazon.checkpoint.last_error_message}</div> : null}</div><div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] p-5">{amazon.connection.connected ? <Wifi className="h-8 w-8 text-emerald-300" /> : <WifiOff className="h-8 w-8 text-rose-300" />}</div></div>
      <div className="mt-5 flex flex-wrap gap-2">{(["SYNC_NOW", "FULL_SYNC", "REFRESH_ORDERS", "SYNC_SHIPPING_DATA"] as const).map((action) => <button key={action} type="button" disabled={!amazon.connection.connected || Boolean(busy)} onClick={() => void runAction(action)} className="button-secondary disabled:cursor-not-allowed disabled:opacity-50">{busy === action ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}{action === "SYNC_NOW" ? "Sync now" : action === "FULL_SYNC" ? "Full sync" : action === "REFRESH_ORDERS" ? "Refresh orders" : "Sync shipping data"}</button>)}</div>
      {message ? <p className="mt-3 text-xs text-zinc-400">{message}</p> : null}
    </Section>
    <Section title="Latest synchronization" description="Progress is read from the central sync-run record; reconnecting or closing this page does not cancel the job.">
      {run ? <><div className="flex flex-wrap items-center gap-3"><StatusPill status={run.status} /><span className="text-sm text-white">{run.progress_message || `${run.sync_type} synchronization`}</span><span className="ml-auto text-xs text-zinc-500">Started {formatDate(run.started_at || run.created_at)}</span></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5"><Metric label="Scanned" value={run.orders_scanned} tone="sky" /><Metric label="New" value={run.orders_new} /><Metric label="Updated" value={run.orders_updated} /><Metric label="Cancelled" value={run.orders_cancelled} tone="rose" /><Metric label="Errors" value={run.error_count} tone={run.error_count ? "rose" : "emerald"} /></div>{run.last_error_message ? <p className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-xs text-rose-200">{run.last_error_code ? `${run.last_error_code}: ` : ""}{run.last_error_message}</p> : null}</> : <p className="text-sm text-zinc-500">No synchronization has run for this marketplace account yet.</p>}
    </Section>
    <Section title="Supported-data notes"><ul className="space-y-2 text-xs leading-5 text-zinc-400"><li>Orders use Amazon Orders API {amazon.limitations.ordersApiVersion}; cancellation time is represented by Amazon's source update time.</li><li>Labels and shipping slips are shown only when an authorized Amazon workflow supplies a document. Reyo Pack never fabricates label URLs.</li><li>{amazon.limitations.cancellationTime}</li><li>{amazon.limitations.easyShip}</li></ul></Section>
  </div>;
}

function LocationPanel({ locations, onRefresh }: { locations: Location[]; onRefresh: () => Promise<void> }) {
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState({ type: "WAREHOUSE" as LocationType, code: "", name: "", parentId: "", active: true, sortOrder: 0 });
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const startEdit = (location: Location | null) => { setEditing(location); setForm({ type: location?.location_type ?? "WAREHOUSE", code: location?.code ?? "", name: location?.name ?? "", parentId: location?.parent_id ?? "", active: location?.active ?? true, sortOrder: location?.sort_order ?? 0 }); setMessage(null); };
  const save = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setMessage(null); try { const response = await sellerplusApiFetch("/api/reyo-pack/admin/locations", { method: "POST", body: JSON.stringify({ locationId: editing?.id ?? null, expectedVersion: editing?.version ?? 0, parentId: form.parentId || null, warehouseId: editing?.warehouse_id ?? null, type: form.type, code: form.code, name: form.name, sortOrder: Number(form.sortOrder), active: form.active }) }); await readJson(response); setMessage("Location saved. All devices will use the new hierarchy after their next read."); startEdit(null); await onRefresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save location."); } finally { setBusy(false); } };
  const parents = locations.filter((location) => location.active && (form.type === "RACK" ? location.location_type === "WAREHOUSE" : form.type === "SHELF" ? location.location_type === "RACK" : form.type === "BIN" ? location.location_type === "SHELF" : false));
  const parentMap = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);
  const pathFor = (location: Location): string => { const parts = [location.code]; let parent = location.parent_id ? parentMap.get(location.parent_id) : undefined; while (parent) { parts.unshift(parent.code); parent = parent.parent_id ? parentMap.get(parent.parent_id) : undefined; } return parts.join(" / "); };
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><Section title="Warehouse hierarchy" description="Locations are versioned and audited. A location with active children or SKU assignments cannot be deactivated until it is safely reassigned." action={<button type="button" onClick={() => startEdit(null)} className="button-primary"><MapPin className="h-4 w-4" /> New location</button>}><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="pb-3">Location</th><th className="pb-3">Type</th><th className="pb-3">Status</th><th className="pb-3">Version</th><th className="pb-3 text-right">Edit</th></tr></thead><tbody className="divide-y divide-white/5">{locations.map((location) => <tr key={location.id}><td className="py-3"><div className="flex items-center gap-2" style={{ paddingLeft: `${Math.min(pathFor(location).split(" / ").length - 1, 4) * 14}px` }}>{location.parent_id ? <ChevronRight className="h-3.5 w-3.5 text-zinc-600" /> : <MapPin className="h-3.5 w-3.5 text-emerald-300" />}<div><p className="font-mono text-zinc-200">{location.code}</p><p className="mt-0.5 text-zinc-500">{location.name}</p></div></div></td><td className="py-3 text-zinc-400">{location.location_type}</td><td className="py-3"><span className={cn("rounded-full border px-2 py-1 text-[10px]", location.active ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border-zinc-500/20 bg-zinc-500/10 text-zinc-500")}>{location.active ? "Active" : "Inactive"}</span></td><td className="py-3 font-mono text-zinc-500">v{location.version}</td><td className="py-3 text-right"><button type="button" onClick={() => startEdit(location)} className="icon-button" aria-label={`Edit ${location.code}`}><Edit3 className="h-4 w-4" /></button></td></tr>)}</tbody></table>{locations.length === 0 ? <p className="py-10 text-center text-sm text-zinc-500">No locations yet. Create a warehouse root first.</p> : null}</div></Section><Section title={editing ? `Edit ${editing.code}` : "Create location"} description="Hierarchy rules are enforced by the database."><form onSubmit={save} className="space-y-4"><Field label="Type"><select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value as LocationType, parentId: "" }))} className="admin-input">{["WAREHOUSE", "RACK", "SHELF", "BIN"].map((type) => <option key={type}>{type}</option>)}</select></Field><Field label="Parent"><select value={form.parentId} onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))} disabled={form.type === "WAREHOUSE"} className="admin-input"><option value="">No parent</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.code} — {parent.name}</option>)}</select></Field><Field label="Code"><input required maxLength={80} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} className="admin-input" placeholder="B-04-12" /></Field><Field label="Name"><input required maxLength={200} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="admin-input" placeholder="Bin 12" /></Field><Field label="Sort order"><input type="number" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: Number(event.target.value) }))} className="admin-input" /></Field>{editing ? <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Active</label> : null}<div className="flex gap-2"><button disabled={busy} className="button-primary" type="submit">{busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>{editing ? <button type="button" onClick={() => startEdit(null)} className="button-secondary">Cancel</button> : null}</div>{message ? <p className="text-xs text-zinc-400">{message}</p> : null}</form></Section></div>;
}

function SkuPanel({ skus, locations, onRefresh }: { skus: Sku[]; locations: Location[]; onRefresh: () => Promise<void> }) {
  const [search, setSearch] = useState(""); const [selected, setSelected] = useState<Sku | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ sku: "", asin: "", productTitle: "", size: "", active: true, locationId: "", expectedQuantity: "", barcodes: "" });
  const visible = skus.filter((row) => `${row.sku} ${row.asin ?? ""} ${row.productTitle ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const startNew = () => { setSelected(null); setForm({ sku: "", asin: "", productTitle: "", size: "", active: true, locationId: "", expectedQuantity: "", barcodes: "" }); setMessage(null); };
  const select = (sku: Sku) => { setSelected(sku); setForm({ sku: sku.sku, asin: sku.asin ?? "", productTitle: sku.productTitle ?? "", size: sku.size ?? "", active: sku.active, locationId: sku.locationId ?? "", expectedQuantity: sku.expectedQuantity?.toString() ?? "", barcodes: sku.barcodes.map((barcode) => `${barcode.barcode}|${barcode.barcodeType}`).join("\n") }); setMessage(null); };
  const saveSku = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setMessage(null); try { const response = await sellerplusApiFetch("/api/reyo-pack/admin/skus", { method: "POST", body: JSON.stringify({ skuId: selected?.skuId ?? null, expectedVersion: selected?.version ?? 0, marketplaceAccountId: selected?.marketplaceAccountId ?? null, sku: form.sku, asin: form.asin || null, productTitle: form.productTitle || null, size: form.size || null, active: form.active }) }); const result = await readJson<{ data: { skuId: string; version: number } }>(response); const rows = form.barcodes.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => { const [barcode, barcodeType = "OTHER"] = line.split("|"); return { barcode, barcodeType }; }); const barcodeResponse = await sellerplusApiFetch(`/api/reyo-pack/admin/skus/${result.data.skuId}/barcodes`, { method: "PUT", body: JSON.stringify({ barcodes: rows }) }); await readJson(barcodeResponse); setMessage("SKU and product barcode mappings saved."); await onRefresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save SKU."); } finally { setBusy(false); } };
  const assignLocation = async () => { if (!selected || !form.locationId) return; setBusy(true); setMessage(null); try { const response = await sellerplusApiFetch(`/api/reyo-pack/admin/skus/${selected.skuId}/location`, { method: "PUT", body: JSON.stringify({ locationId: form.locationId, expectedVersion: selected.assignmentVersion ?? 0, expectedQuantity: form.expectedQuantity === "" ? null : Number(form.expectedQuantity), reason: "Admin assignment", idempotencyKey: `sku-location:${randomId()}` }) }); await readJson(response); setMessage("Location assignment saved and audited."); await onRefresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to assign location."); } finally { setBusy(false); } };
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]"><Section title="Product and SKU mappings" description="Search is bounded server-side to 50 rows. Product barcodes are immutable in history; replacing them deactivates the previous mapping." action={<div className="flex items-center gap-2"><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="admin-input pl-9" placeholder="Filter loaded SKUs" /></div><button type="button" onClick={startNew} className="button-primary"><PackageSearch className="h-4 w-4" /> New SKU</button></div>}><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-zinc-500"><tr><th className="pb-3">SKU / product</th><th className="pb-3">Barcodes</th><th className="pb-3">Location</th><th className="pb-3">State</th><th className="pb-3 text-right">Edit</th></tr></thead><tbody className="divide-y divide-white/5">{visible.map((row) => <tr key={row.skuId} className={cn("cursor-pointer", selected?.skuId === row.skuId ? "bg-emerald-400/5" : "hover:bg-white/[0.02]")} onClick={() => select(row)}><td className="py-3"><p className="font-mono text-zinc-200">{row.sku}</p><p className="mt-1 max-w-[260px] truncate text-zinc-500">{row.productTitle || "Untitled product"}</p></td><td className="py-3 font-mono text-zinc-400">{row.barcodes.length || "—"}</td><td className="py-3 text-zinc-400">{row.locationCode || "Unassigned"}</td><td className="py-3"><span className={cn("rounded-full border px-2 py-1 text-[10px]", row.active ? "border-emerald-400/20 text-emerald-300" : "border-zinc-500/20 text-zinc-500")}>{row.active ? "Active" : "Inactive"}</span></td><td className="py-3 text-right"><Edit3 className="ml-auto h-4 w-4 text-zinc-500" /></td></tr>)}</tbody></table>{visible.length === 0 ? <p className="py-10 text-center text-sm text-zinc-500">No matching SKUs in the current page.</p> : null}</div></Section><Section title={selected ? `Edit ${selected.sku}` : "New SKU"} description="Use a barcode type suffix such as CODE_128: 371317811994|CODE_128."><form onSubmit={saveSku} className="space-y-4"><Field label="SKU"><input required disabled={Boolean(selected) && !form.sku} value={form.sku} onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))} className="admin-input" /></Field><div className="grid grid-cols-2 gap-3"><Field label="ASIN"><input value={form.asin} onChange={(event) => setForm((current) => ({ ...current, asin: event.target.value }))} className="admin-input" /></Field><Field label="Size"><input value={form.size} onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))} className="admin-input" /></Field></div><Field label="Product title"><input value={form.productTitle} onChange={(event) => setForm((current) => ({ ...current, productTitle: event.target.value }))} className="admin-input" /></Field><Field label="Product barcodes"><textarea rows={4} value={form.barcodes} onChange={(event) => setForm((current) => ({ ...current, barcodes: event.target.value }))} className="admin-input font-mono" /></Field><label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} /> Active for putaway lookup</label><button disabled={busy || !form.sku.trim()} type="submit" className="button-primary"><Save className="h-4 w-4" /> Save product</button></form>{selected ? <div className="mt-6 border-t border-white/10 pt-5"><h3 className="text-xs font-bold uppercase tracking-wider text-white">Putaway assignment</h3><div className="mt-3 space-y-3"><Field label="Location"><select value={form.locationId} onChange={(event) => setForm((current) => ({ ...current, locationId: event.target.value }))} className="admin-input"><option value="">Choose a location</option>{locations.filter((location) => location.active).map((location) => <option key={location.id} value={location.id}>{location.code} — {location.name}</option>)}</select></Field><Field label="Expected quantity"><input type="number" min={0} value={form.expectedQuantity} onChange={(event) => setForm((current) => ({ ...current, expectedQuantity: event.target.value }))} className="admin-input" /></Field><button disabled={busy || !form.locationId} type="button" onClick={() => void assignLocation()} className="button-secondary"><MapPin className="h-4 w-4" /> Assign location</button></div></div> : null}{message ? <p className="mt-4 text-xs text-zinc-400">{message}</p> : null}</Section></div>;
}

function SettingsPanel({ settings, onSaved }: { settings: Settings | null; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Settings>(settings ?? defaultSettings); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (settings) setForm(settings); }, [settings]);
  const save = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setMessage(null); try { const response = await sellerplusApiFetch("/api/reyo-pack/admin/settings", { method: "PUT", body: JSON.stringify({ expectedVersion: form.version, soundEnabled: form.sound_enabled, vibrationEnabled: form.vibration_enabled, soundVolume: Number(form.sound_volume), scanDebounceMs: Number(form.scan_debounce_ms), claimTtlSeconds: Number(form.claim_ttl_seconds), syncIntervalMinutes: Number(form.sync_interval_minutes), allowManualAwb: form.allow_manual_awb }) }); await readJson(response); setMessage("Settings saved. Connected packing clients will use them on their next refresh."); await onSaved(); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save settings."); } finally { setBusy(false); } };
  if (!settings) return <Section title="Operational settings"><Loading /></Section>;
  return <Section title="Operational settings" description="These settings affect scanner feedback and the durable synchronization cadence. Server-side validation and optimistic version checks protect concurrent edits."><form onSubmit={save} className="grid gap-5 lg:grid-cols-2"><div className="space-y-4"><Toggle label="Sound feedback" checked={form.sound_enabled} onChange={(checked) => setForm((current) => ({ ...current, sound_enabled: checked }))} /><Toggle label="Vibration feedback" checked={form.vibration_enabled} onChange={(checked) => setForm((current) => ({ ...current, vibration_enabled: checked }))} /><Toggle label="Allow manual AWB fallback" checked={form.allow_manual_awb} onChange={(checked) => setForm((current) => ({ ...current, allow_manual_awb: checked }))} /><Field label={`Sound volume (${Math.round(form.sound_volume * 100)}%)`}><input type="range" min={0} max={1} step={0.05} value={form.sound_volume} onChange={(event) => setForm((current) => ({ ...current, sound_volume: Number(event.target.value) }))} className="w-full accent-emerald-400" /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Scan duplicate debounce (ms)"><input type="number" min={250} max={10000} value={form.scan_debounce_ms} onChange={(event) => setForm((current) => ({ ...current, scan_debounce_ms: Number(event.target.value) }))} className="admin-input" /></Field><Field label="Claim lease TTL (seconds)"><input type="number" min={30} max={600} value={form.claim_ttl_seconds} onChange={(event) => setForm((current) => ({ ...current, claim_ttl_seconds: Number(event.target.value) }))} className="admin-input" /></Field><Field label="Automatic sync interval (minutes)"><input type="number" min={5} max={1440} value={form.sync_interval_minutes} onChange={(event) => setForm((current) => ({ ...current, sync_interval_minutes: Number(event.target.value) }))} className="admin-input" /></Field><div className="flex items-end"><button disabled={busy} type="submit" className="button-primary w-full justify-center"><Save className="h-4 w-4" /> Save settings</button></div></div></form>{message ? <p className="mt-4 text-xs text-zinc-400">{message}</p> : null}<p className="mt-5 text-[11px] text-zinc-600">Settings version v{form.version} · last updated {formatDate(form.updated_at)}</p></Section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs text-zinc-400"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>{children}</label>; }
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-zinc-300"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-emerald-400" /></label>; }

export default function ReyoPackAdminPage() {
  const user = useAuth((state) => state.user);
  const [tab, setTab] = useState<AdminTab>("overview"); const [overview, setOverview] = useState<Overview | null>(null); const [amazon, setAmazon] = useState<AmazonState | null>(null); const [locations, setLocations] = useState<Location[]>([]); const [skus, setSkus] = useState<Sku[]>([]); const [settings, setSettings] = useState<Settings | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const loadOverview = useCallback(async () => { const response = await sellerplusApiFetch("/api/reyo-pack/admin/overview"); const result = await readJson<{ data: Overview }>(response); setOverview(result.data); }, []);
  const loadAmazon = useCallback(async () => { const response = await sellerplusApiFetch("/api/reyo-pack/admin/amazon"); const result = await readJson<{ data: AmazonState }>(response); setAmazon(result.data); }, []);
  const loadLocations = useCallback(async () => { const response = await sellerplusApiFetch("/api/reyo-pack/admin/locations?page=1&limit=500"); const result = await readJson<{ data: Location[] }>(response); setLocations(result.data); }, []);
  const loadSkus = useCallback(async () => { const response = await sellerplusApiFetch("/api/reyo-pack/admin/skus?page=1&limit=100"); const result = await readJson<{ data: Sku[] }>(response); setSkus(result.data); }, []);
  const loadSettings = useCallback(async () => { const response = await sellerplusApiFetch("/api/reyo-pack/settings"); const result = await readJson<{ data: Settings }>(response); setSettings(result.data); }, []);
  const refresh = useCallback(async () => { setError(null); try { await Promise.all([loadOverview(), loadAmazon(), loadLocations(), loadSkus(), loadSettings()]); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load Reyo Pack administration."); } finally { setLoading(false); } }, [loadAmazon, loadLocations, loadOverview, loadSettings, loadSkus]);
  useEffect(() => { if (user?.workspaceId) void refresh(); }, [user?.workspaceId, refresh]);
  useEffect(() => { if (!amazon?.latestRun || !["QUEUED", "RUNNING"].includes(amazon.latestRun.status)) return; const timer = window.setInterval(() => { void Promise.all([loadAmazon(), loadOverview()]); }, 5000); return () => window.clearInterval(timer); }, [amazon?.latestRun, loadAmazon, loadOverview]);
  const content = loading ? <Section title="Loading administration"><Loading /></Section> : tab === "overview" ? <AdminOverview overview={overview} onRefresh={() => void refresh()} /> : tab === "amazon" ? <AmazonPanel amazon={amazon} onRefresh={async () => { await Promise.all([loadAmazon(), loadOverview()]); }} /> : tab === "locations" ? <LocationPanel locations={locations} onRefresh={async () => { await loadLocations(); }} /> : tab === "skus" ? <SkuPanel skus={skus} locations={locations} onRefresh={async () => { await loadSkus(); }} /> : <SettingsPanel settings={settings} onSaved={async () => { await loadSettings(); }} />;
  if (user && user.workspaceRole !== "owner" && user.workspaceRole !== "admin") return <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center"><div className="rounded-2xl border border-rose-400/20 bg-[#15171c] p-7 text-center shadow-xl"><Lock className="mx-auto h-8 w-8 text-rose-300" /><h1 className="mt-4 text-lg font-semibold text-white">Administrator permission required</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Reyo Pack administration is protected server-side. Ask a workspace owner or administrator to manage Amazon synchronization, locations, SKUs, and settings.</p></div></div>;
  return <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-300"><PackageSearch className="h-4 w-4" /> Reyo Pack Admin</div><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Fulfillment operations</h1><p className="mt-1 max-w-2xl text-sm text-zinc-500">Manage the single source of truth used by packing and putaway devices. Every mutation is authenticated, version-checked, and audited.</p></div><a href="/reyo-pack" className="button-secondary"><Truck className="h-4 w-4" /> Open packing app</a></div><div className="flex gap-1 overflow-x-auto border-b border-white/10">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={cn("inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors", tab === id ? "border-emerald-400 text-emerald-300" : "border-transparent text-zinc-500 hover:text-zinc-200")}><Icon className="h-4 w-4" /> {label}</button>)}</div>{error ? <div className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div className="flex-1">{error}</div><button type="button" onClick={() => void refresh()} className="rounded-lg px-2 py-1 text-xs text-rose-100 hover:bg-rose-400/10">Retry</button></div> : null}{content}<style jsx global>{`.button-primary,.button-secondary,.icon-button{display:inline-flex;align-items:center;gap:.5rem;border-radius:.65rem;font-size:.75rem;font-weight:600;transition:all .15s}.button-primary{background:#10b981;color:#03140f;padding:.6rem .85rem}.button-primary:hover{background:#34d399}.button-primary:disabled,.button-secondary:disabled{opacity:.5}.button-secondary{border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.03);color:#d4d4d8;padding:.6rem .85rem}.button-secondary:hover{background:rgba(255,255,255,.08);color:#fff}.icon-button{border:1px solid rgba(255,255,255,.1);padding:.4rem;color:#a1a1aa}.icon-button:hover{color:#fff;background:rgba(255,255,255,.08)}.admin-input{width:100%;border:1px solid rgba(255,255,255,.12);border-radius:.6rem;background:#101216;color:#f4f4f5;padding:.6rem .7rem;font-size:.75rem;outline:none}.admin-input:focus{border-color:rgba(52,211,153,.65);box-shadow:0 0 0 2px rgba(52,211,153,.1)}.admin-input:disabled{cursor:not-allowed;opacity:.5}`}</style></div>;
}
