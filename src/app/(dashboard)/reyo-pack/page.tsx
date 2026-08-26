"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  History,
  LoaderCircle,
  MapPin,
  PackageCheck,
  PackageOpen,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Smartphone,
  Timer,
  Truck,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { BarcodeScanner } from "@/components/reyo-pack/barcode-scanner";
import { useAuth } from "@/hooks/use-auth";
import { useToastStore } from "@/hooks/use-toast-store";
import { sellerplusApiFetch } from "@/lib/client/api-fetch";
import { readReyoPackSnapshot, writeReyoPackSnapshot } from "@/lib/reyo-pack/client-cache";
import { emitReyoPackFeedback, type ReyoPackFeedbackSettings } from "@/lib/reyo-pack/feedback";
import {
  packResultSchema,
  putawayConfirmResultSchema,
  putawayLookupResultSchema,
  scanResultSchema,
  sessionMutationResultSchema,
  type PackResult,
  type ScanResult,
} from "@/lib/reyo-pack/contracts";
import { useReyoPackRealtime } from "@/lib/reyo-pack/realtime";
import { cn } from "@/lib/utils";

type ReyoPackView = "PACK" | "QUEUE" | "CANCELLED" | "HISTORY" | "PUTAWAY" | "PUTAWAY_HISTORY" | "SESSIONS";
type SessionMode = "PACKING" | "PUTAWAY";

interface SessionState {
  sessionId: string;
  sessionNumber: number;
  mode: SessionMode;
  startedBy: string;
  packagesPacked: number;
  unitsPacked: number;
  cancelledScans: number;
  invalidScans: number;
  errors: number;
  putawayActions: number;
  putawayUnits: number;
  startedAt: string | null;
}

interface QueueItem {
  orderItemId?: string;
  sku?: string | null;
  asin?: string | null;
  title?: string | null;
  size?: string | null;
  quantity?: number;
  quantityRemaining?: number;
}

interface QueueRow {
  id?: string;
  shipmentId?: string;
  orderId?: string;
  amazonOrderId?: string;
  awb?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  shippingService?: string | null;
  packingStatus?: string;
  status?: string;
  shipByDate?: string | null;
  packedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  labelAvailable?: boolean;
  unitCount?: number;
  sessionNumber?: number | null;
  mode?: string;
  startedAt?: string | null;
  packages_packed?: number;
  units_packed?: number;
  putaway_units?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  items?: QueueItem[];
}

interface PutawayRow {
  id?: string;
  sku?: { sku?: string; asin?: string | null; product_title?: string | null; size_label?: string | null } | null;
  previous_location?: { code?: string; name?: string } | null;
  new_location?: { code?: string; name?: string } | null;
  event_type?: string;
  quantity?: number | null;
  reason?: string | null;
  created_at?: string;
}

interface SettingsState extends ReyoPackFeedbackSettings {
  scanDebounceMs: number;
  allowManualAwb: boolean;
}

const defaultSettings: SettingsState = {
  soundEnabled: true,
  vibrationEnabled: true,
  soundVolume: 1,
  scanDebounceMs: 1500,
  allowManualAwb: true,
};

const tabs: Array<{ id: ReyoPackView; label: string; icon: typeof PackageOpen }> = [
  { id: "PACK", label: "Pack", icon: QrCode },
  { id: "QUEUE", label: "Queue", icon: PackageOpen },
  { id: "CANCELLED", label: "Cancelled", icon: ShieldAlert },
  { id: "HISTORY", label: "History", icon: History },
  { id: "PUTAWAY", label: "Putaway", icon: MapPin },
  { id: "PUTAWAY_HISTORY", label: "Moves", icon: Archive },
  { id: "SESSIONS", label: "Sessions", icon: Timer },
];

function randomUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto !== "undefined") globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function idempotencyKey(prefix: string): string {
  return `${prefix}:${randomUuid()}`;
}

function displayDate(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status: string | undefined): string {
  return status === "UNPACKED" ? "Unpacked" : status === "PACKING" ? "Packing" : status === "PACKED" ? "Packed" : status === "CANCELLED" ? "Cancelled" : status ?? "Unknown";
}

function statusClasses(status: string | undefined): string {
  if (status === "PACKED") return "border-emerald-400/30 bg-emerald-400/10 text-emerald-300";
  if (status === "CANCELLED") return "border-rose-400/30 bg-rose-400/10 text-rose-300";
  if (status === "PACKING") return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  return "border-amber-400/30 bg-amber-400/10 text-amber-300";
}

function sessionFromRow(row: Record<string, unknown>, mode: SessionMode): SessionState {
  return {
    sessionId: String(row.id),
    sessionNumber: Number(row.session_number ?? 0),
    mode,
    startedBy: String(row.started_by ?? ""),
    packagesPacked: Number(row.packages_packed ?? 0),
    unitsPacked: Number(row.units_packed ?? 0),
    cancelledScans: Number(row.cancelled_scans ?? 0),
    invalidScans: Number(row.invalid_scans ?? 0),
    errors: Number(row.error_count ?? 0),
    putawayActions: Number(row.putaway_actions ?? 0),
    putawayUnits: Number(row.putaway_units ?? 0),
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
  };
}

function ErrorMessage({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
      <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
      <p className="flex-1 leading-5">{message}</p>
      <button type="button" onClick={onDismiss} className="rounded-lg p-1 text-rose-200 hover:bg-rose-300/10" aria-label="Dismiss error"><span aria-hidden>×</span></button>
    </div>
  );
}

function SessionGate({ mode, onStart, starting }: { mode: SessionMode; onStart: () => void; starting: boolean }) {
  const putaway = mode === "PUTAWAY";
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center rounded-2xl border border-white/10 bg-[#161719] px-6 py-12 text-center">
      <div className={cn("flex h-16 w-16 items-center justify-center rounded-2xl border", putaway ? "border-sky-400/30 bg-sky-400/10" : "border-emerald-400/30 bg-emerald-400/10")}>
        {putaway ? <MapPin className="h-8 w-8 text-sky-300" /> : <QrCode className="h-8 w-8 text-emerald-300" />}
      </div>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">{putaway ? "Putaway mode" : "Packing mode"}</p>
      <h2 className="mt-2 text-2xl font-semibold text-white">Start a {putaway ? "putaway" : "packing"} session</h2>
      <p className="mt-3 max-w-md text-sm leading-6 text-zinc-400">
        Every {putaway ? "location confirmation" : "successful package"} is recorded against a session. Keep the session open while working and end it when the station is clear.
      </p>
      <button type="button" onClick={onStart} disabled={starting} className="mt-7 inline-flex min-h-14 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 text-base font-bold text-black transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60">
        {starting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
        {starting ? "Starting…" : `START ${putaway ? "PUTAWAY" : "PACKING"} SESSION`}
      </button>
    </section>
  );
}

function ScanFeedback({ result, onClear, onPack, onViewLabel, busy }: { result: ScanResult; onClear: () => void; onPack: () => void; onViewLabel: (print: boolean) => void; busy: boolean }) {
  const cancelled = result.outcome === "ORDER_CANCELLED";
  const alreadyPacked = result.outcome === "ALREADY_PACKED";
  const found = result.outcome === "ORDER_FOUND";
  const title = cancelled ? "⚠ ORDER CANCELLED" : alreadyPacked ? "ALREADY PACKED" : found ? "ORDER FOUND" : result.outcome === "IN_USE" ? "ORDER IN USE" : "BARCODE NOT FOUND";
  return (
    <section className={cn("rounded-2xl border p-5", cancelled ? "border-rose-400/40 bg-rose-400/10" : alreadyPacked ? "border-amber-400/40 bg-amber-400/10" : found ? "border-emerald-400/40 bg-emerald-400/10" : "border-rose-400/30 bg-rose-400/10")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-300">{title}</p>
          <p className="mt-2 text-sm leading-5 text-zinc-300">{result.message ?? (cancelled ? "DO NOT PACK this shipment." : "Check the barcode and try again.")}</p>
        </div>
        <button type="button" onClick={onClear} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10" aria-label="Clear scan result"><XCircle className="h-5 w-5" /></button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <div><p className="text-[11px] uppercase tracking-wider text-zinc-500">Order ID</p><p className="mt-1 font-mono text-white">{result.amazonOrderId ?? "—"}</p></div>
        <div><p className="text-[11px] uppercase tracking-wider text-zinc-500">AWB</p><p className="mt-1 font-mono text-white">{result.awb ?? result.barcode ?? "—"}</p></div>
        <div><p className="text-[11px] uppercase tracking-wider text-zinc-500">Status</p><p className={cn("mt-1 inline-flex rounded-md border px-2 py-1 text-xs font-semibold", statusClasses(result.packingStatus))}>{statusLabel(result.packingStatus)}</p></div>
        <div><p className="text-[11px] uppercase tracking-wider text-zinc-500">Ship by</p><p className="mt-1 text-white">{displayDate(result.shipByDate)}</p></div>
        <div><p className="text-[11px] uppercase tracking-wider text-zinc-500">Shipping method</p><p className="mt-1 text-white">{result.shippingMethod ?? "—"}</p></div>
      </div>
      {result.items && result.items.length > 0 && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Product / quantity</p>
          <div className="mt-2 space-y-2">
            {result.items.map((item, index) => <div key={`${item.orderItemId ?? item.sku ?? "item"}-${index}`} className="flex items-start justify-between gap-4 rounded-lg bg-black/15 px-3 py-2"><div><p className="text-sm text-white">{item.title ?? item.sku ?? "Unidentified item"}</p><p className="mt-0.5 font-mono text-[11px] text-zinc-500">{item.sku ?? "—"} {item.size ? `· ${item.size}` : ""}</p></div><strong className="text-lg text-white">×{item.quantity}</strong></div>)}
          </div>
        </div>
      )}
      {found && (
        <div className="mt-5 flex flex-wrap gap-2">
          {result.labelAvailable && <><button type="button" onClick={() => onViewLabel(false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"><Download className="h-4 w-4" /> VIEW SLIP</button><button type="button" onClick={() => onViewLabel(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white hover:bg-white/10"><Printer className="h-4 w-4" /> PRINT</button></>}
          <button type="button" onClick={onPack} disabled={busy} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 text-sm font-bold text-black hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"><PackageCheck className="h-5 w-5" /> {busy ? "RECORDING…" : "PACKED"}</button>
        </div>
      )}
      {(cancelled || alreadyPacked || !found) && <button type="button" onClick={onClear} className="mt-5 min-h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-bold text-white hover:bg-white/10">SCAN NEXT</button>}
    </section>
  );
}

function QueueCard({ row, cancelled, onUseAwb }: { row: QueueRow; cancelled?: boolean; onUseAwb: (awb: string) => void }) {
  const status = String(row.packingStatus ?? row.status ?? (cancelled ? "CANCELLED" : "UNPACKED"));
  return (
    <article className="rounded-2xl border border-white/10 bg-[#161719] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate font-mono text-sm font-semibold text-white">{row.amazonOrderId ?? "Unknown order"}</p><p className="mt-1 truncate text-xs text-zinc-500">AWB {row.awb ?? "Not assigned"}</p></div>
        <span className={cn("shrink-0 rounded-md border px-2 py-1 text-[11px] font-bold uppercase", statusClasses(status))}>{statusLabel(status)}</span>
      </div>
      <div className="mt-4 space-y-2">
        {(row.items ?? []).slice(0, 3).map((item, index) => <div key={`${item.sku ?? "item"}-${index}`} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-zinc-300">{item.title ?? item.sku ?? "Unidentified item"}</span><span className="shrink-0 font-semibold text-white">×{item.quantity ?? 0}</span></div>)}
        {(row.items?.length ?? 0) > 3 && <p className="text-xs text-zinc-500">+{(row.items?.length ?? 0) - 3} more items</p>}
      </div>
      <div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-xs text-zinc-500">
        <div className="flex items-center justify-between gap-3"><span>Ship by {displayDate(row.shipByDate)}</span><span>{row.unitCount ?? 0} units</span></div>
        {(row.carrier || row.trackingNumber || row.shippingService) && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400">
          {row.carrier && <span>Carrier: <strong className="font-medium text-zinc-200">{row.carrier}</strong></span>}
          {row.trackingNumber && <span>Tracking: <strong className="font-mono font-medium text-zinc-200">{row.trackingNumber}</strong></span>}
          {row.shippingService && <span>Service: <strong className="font-medium text-zinc-200">{row.shippingService}</strong></span>}
        </div>}
      </div>
      {cancelled ? <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200">DO NOT PACK · {row.cancellationReason ?? "Cancelled by Amazon"}</p> : row.awb && <button type="button" onClick={() => onUseAwb(row.awb ?? "")} className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-white/5 text-sm font-semibold text-white hover:bg-white/10">Use AWB for scan</button>}
    </article>
  );
}

export default function ReyoPackPage() {
  const user = useAuth((state) => state.user);
  const { error: toastError, success: toastSuccess, warning: toastWarning } = useToastStore();
  const [view, setView] = useState<ReyoPackView>("PACK");
  const [packSession, setPackSession] = useState<SessionState | null>(null);
  const [putawaySession, setPutawaySession] = useState<SessionState | null>(null);
  const [startingMode, setStartingMode] = useState<SessionMode | null>(null);
  const [ending, setEnding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [putawayRows, setPutawayRows] = useState<PutawayRow[]>([]);
  const [sessionRows, setSessionRows] = useState<QueueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [scanInput, setScanInput] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [putawayResult, setPutawayResult] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [cameraRequested, setCameraRequested] = useState(true);
  const [online, setOnline] = useState(true);
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const searchTimer = useRef<number | null>(null);
  const lastScan = useRef<{ value: string; at: number } | null>(null);

  const activeSession = view === "PUTAWAY" ? putawaySession : packSession;

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    try {
      const response = await sellerplusApiFetch("/api/reyo-pack/sessions?status=ACTIVE&limit=100");
      if (!response.ok) throw new Error("Unable to load active sessions.");
      const json = await response.json() as { data?: Record<string, unknown>[] };
      const active = json.data ?? [];
      const ownPacking = active.find((row) => row.mode === "PACKING" && row.started_by === user.id);
      const ownPutaway = active.find((row) => row.mode === "PUTAWAY" && row.started_by === user.id);
      setPackSession(ownPacking ? sessionFromRow(ownPacking, "PACKING") : null);
      setPutawaySession(ownPutaway ? sessionFromRow(ownPutaway, "PUTAWAY") : null);
    } catch (error) {
      if (online) setErrorMessage(error instanceof Error ? error.message : "Unable to load sessions.");
    }
  }, [online, user]);

  const loadSettings = useCallback(async () => {
    try {
      const response = await sellerplusApiFetch("/api/reyo-pack/settings");
      if (!response.ok) return;
      const json = await response.json() as { data?: Record<string, unknown> };
      const data = json.data ?? {};
      setSettings({
        soundEnabled: data.sound_enabled !== false,
        vibrationEnabled: data.vibration_enabled !== false,
        soundVolume: Number(data.sound_volume ?? 1),
        scanDebounceMs: Number(data.scan_debounce_ms ?? 1500),
        allowManualAwb: data.allow_manual_awb !== false,
      });
    } catch { /* The defaults are safe and visible. */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    void Promise.all([loadSessions(), loadSettings()]).finally(() => setLoading(false));
  }, [loadSessions, loadSettings]);

  const loadOperationalRows = useCallback(async (silent = false) => {
    if (!user || !online) {
      const cached = await readReyoPackSnapshot<QueueRow[]>(user?.workspaceId ?? "", view === "CANCELLED" ? "cancelled" : view.toLowerCase());
      if (cached) { setRows(cached.value); setCachedAt(cached.savedAt); }
      return;
    }
    if (!silent) setLoading(true);
    try {
      if (view === "QUEUE" || view === "CANCELLED" || view === "HISTORY") {
        const endpoint = view === "HISTORY"
          ? `/api/reyo-pack/history?search=${encodeURIComponent(search)}&page=${page}&limit=50`
          : `/api/reyo-pack/queue?status=${view === "CANCELLED" ? "CANCELLED" : "UNPACKED"}&search=${encodeURIComponent(search)}&page=${page}&limit=50`;
        const response = await sellerplusApiFetch(endpoint);
        if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "Unable to load operational records.");
        const json = await response.json() as { data?: QueueRow[]; pagination?: { total?: number } };
        const nextRows = json.data ?? [];
        setRows(nextRows);
        setTotal(Number(json.pagination?.total ?? nextRows.length));
        await writeReyoPackSnapshot(user.workspaceId, view === "CANCELLED" ? "cancelled" : view.toLowerCase(), nextRows);
        setCachedAt(null);
      } else if (view === "PUTAWAY_HISTORY") {
        const response = await sellerplusApiFetch(`/api/reyo-pack/putaway/history?page=${page}&limit=50`);
        if (!response.ok) throw new Error("Unable to load putaway history.");
        const json = await response.json() as { data?: PutawayRow[]; pagination?: { total?: number } };
        setPutawayRows(json.data ?? []);
        setTotal(Number(json.pagination?.total ?? json.data?.length ?? 0));
      } else if (view === "SESSIONS") {
        const response = await sellerplusApiFetch(`/api/reyo-pack/sessions?page=${page}&limit=50`);
        if (!response.ok) throw new Error("Unable to load session history.");
        const json = await response.json() as { data?: Record<string, unknown>[]; pagination?: { total?: number } };
        setSessionRows((json.data ?? []).map((row) => ({ ...row, mode: String(row.mode ?? ""), status: String(row.status ?? ""), startedAt: typeof row.started_at === "string" ? row.started_at : null, sessionNumber: Number(row.session_number ?? 0) })));
        setTotal(Number(json.pagination?.total ?? json.data?.length ?? 0));
      }
    } catch (error) {
      if (!silent) setErrorMessage(error instanceof Error ? error.message : "Unable to load Reyo Pack records.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [online, page, search, user, view]);

  useEffect(() => {
    if (["QUEUE", "CANCELLED", "HISTORY", "PUTAWAY_HISTORY", "SESSIONS"].includes(view)) void loadOperationalRows();
  }, [loadOperationalRows, view]);

  const refreshFromRealtime = useCallback(() => {
    if (!online) return;
    void loadSessions();
    if (["QUEUE", "CANCELLED", "HISTORY"].includes(view)) void loadOperationalRows(true);
  }, [loadOperationalRows, loadSessions, online, view]);
  const realtimeConnected = useReyoPackRealtime(user?.workspaceId, refreshFromRealtime);

  const startSession = useCallback(async (mode: SessionMode) => {
    if (!online) { setErrorMessage("A server connection is required to start a session."); return; }
    setStartingMode(mode);
    setErrorMessage(null);
    try {
      const response = await sellerplusApiFetch("/api/reyo-pack/sessions", { method: "POST", body: JSON.stringify({ mode, clientSessionId: randomUuid(), deviceLabel: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 150) : null }) });
      const json = await response.json() as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Unable to start the session.");
      const result = sessionMutationResultSchema.parse(json.data);
      const next: SessionState = { sessionId: result.sessionId, sessionNumber: result.sessionNumber, mode, startedBy: user?.id ?? "", packagesPacked: result.packagesPacked ?? 0, unitsPacked: result.unitsPacked ?? 0, cancelledScans: result.cancelledScans ?? 0, invalidScans: result.invalidScans ?? 0, errors: result.errors ?? 0, putawayActions: 0, putawayUnits: 0, startedAt: result.startedAt ?? new Date().toISOString() };
      if (mode === "PACKING") setPackSession(next); else setPutawaySession(next);
      toastSuccess(`${mode === "PACKING" ? "Packing" : "Putaway"} session ready`, `Session #${result.sessionNumber} is active.`);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Unable to start the session."); }
    finally { setStartingMode(null); }
  }, [online, toastSuccess, user?.id]);

  const endActiveSession = useCallback(async () => {
    if (!activeSession || !online) return;
    setEnding(true);
    try {
      const response = await sellerplusApiFetch(`/api/reyo-pack/sessions/${activeSession.sessionId}/end`, { method: "POST", body: "{}" });
      const json = await response.json() as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Unable to end the session.");
      const result = sessionMutationResultSchema.parse(json.data);
      toastSuccess("Session complete", `${result.packagesPacked ?? result.unitsPacked ?? 0} recorded units are in history.`);
      if (activeSession.mode === "PACKING") setPackSession(null); else setPutawaySession(null);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Unable to end the session."); }
    finally { setEnding(false); }
  }, [activeSession, online, toastSuccess]);

  const handleScan = useCallback(async (rawBarcode: string, source: "CAMERA" | "MANUAL" = "CAMERA") => {
    const barcode = rawBarcode.trim();
    if (!barcode || !activeSession || busy) return;
    const now = Date.now();
    if (lastScan.current && lastScan.current.value === barcode && now - lastScan.current.at < settings.scanDebounceMs) return;
    lastScan.current = { value: barcode, at: now };
    setBusy(true);
    setScanInput(barcode);
    setErrorMessage(null);
    if (!online) {
      setBusy(false);
      setErrorMessage("OFFLINE — this scan was not claimed. Reconnect before packing or confirming putaway.");
      return;
    }
    try {
      const endpoint = activeSession.mode === "PACKING" ? "/api/reyo-pack/scan" : "/api/reyo-pack/putaway/lookup";
      const body = activeSession.mode === "PACKING"
        ? { sessionId: activeSession.sessionId, barcode, idempotencyKey: idempotencyKey("scan"), source }
        : { sessionId: activeSession.sessionId, barcode };
      const response = await sellerplusApiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
      const json = await response.json() as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(json.error ?? "The scan could not be processed.");
      if (activeSession.mode === "PACKING") {
        const result = scanResultSchema.parse(json.data);
        setScanResult(result);
        if (result.outcome === "ORDER_FOUND") emitReyoPackFeedback("scan", settings);
        else if (result.outcome === "ORDER_CANCELLED") emitReyoPackFeedback("cancelled", settings);
        else if (result.outcome === "ALREADY_PACKED") emitReyoPackFeedback("alreadyPacked", settings);
        else emitReyoPackFeedback("unknown", settings);
      } else {
        setPutawayResult(putawayLookupResultSchema.parse(json.data));
        emitReyoPackFeedback(json.data && typeof json.data === "object" && "outcome" in json.data && json.data.outcome === "PRODUCT_FOUND" ? "scan" : "unknown", settings);
      }
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "The scan could not be processed."); }
    finally { setBusy(false); }
  }, [activeSession, busy, online, settings]);

  const confirmPack = useCallback(async () => {
    if (!packSession || !scanResult?.shipmentId || busy || !online) return;
    setBusy(true);
    try {
      const response = await sellerplusApiFetch("/api/reyo-pack/pack", { method: "POST", body: JSON.stringify({ sessionId: packSession.sessionId, shipmentId: scanResult.shipmentId, idempotencyKey: idempotencyKey("pack") }) });
      const json = await response.json() as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Packing could not be confirmed.");
      const result: PackResult = packResultSchema.parse(json.data);
      if (result.outcome === "PACKED") {
        emitReyoPackFeedback("packed", settings);
        setPackSession((session) => session ? { ...session, packagesPacked: session.packagesPacked + 1, unitsPacked: session.unitsPacked + (result.unitsPacked ?? 0) } : session);
        toastSuccess("Package packed", "The central packing record is complete.");
        setScanResult(null);
        setScanInput("");
        setCameraRequested(true);
        void loadOperationalRows(true);
      } else {
        emitReyoPackFeedback(result.outcome === "ORDER_CANCELLED" ? "cancelled" : "alreadyPacked", settings);
        setErrorMessage(result.message ?? "The package could not be packed.");
      }
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Packing could not be confirmed."); }
    finally { setBusy(false); }
  }, [busy, loadOperationalRows, online, packSession, scanResult, settings, toastSuccess]);

  const confirmPutaway = useCallback(async () => {
    if (!putawaySession || !putawayResult || busy || !online) return;
    const result = putawayResult;
    if (result.outcome !== "PRODUCT_FOUND" || typeof result.skuId !== "string" || typeof result.locationId !== "string" || typeof result.assignmentVersion !== "number") return;
    setBusy(true);
    try {
      const response = await sellerplusApiFetch("/api/reyo-pack/putaway/confirm", { method: "POST", body: JSON.stringify({ sessionId: putawaySession.sessionId, skuId: result.skuId, expectedLocationId: result.locationId, expectedAssignmentVersion: result.assignmentVersion, quantity: 1, idempotencyKey: idempotencyKey("putaway") }) });
      const json = await response.json() as { data?: unknown; error?: string };
      if (!response.ok) throw new Error(json.error ?? "Putaway confirmation failed.");
      const confirmation = putawayConfirmResultSchema.parse(json.data);
      if (confirmation.outcome === "PUTAWAY_CONFIRMED") {
        emitReyoPackFeedback("packed", settings);
        setPutawaySession((session) => session ? { ...session, putawayActions: session.putawayActions + 1, putawayUnits: session.putawayUnits + (confirmation.quantity ?? 1) } : session);
        toastSuccess("Putaway recorded", `Place in ${confirmation.locationCode ?? "the assigned location"}.`);
        setPutawayResult(null);
        setScanInput("");
        setCameraRequested(true);
      } else {
        setPutawayResult({ ...result, ...confirmation });
        setErrorMessage(confirmation.message ?? "The location changed. Follow the updated location and confirm again.");
      }
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "Putaway confirmation failed."); }
    finally { setBusy(false); }
  }, [busy, online, putawayResult, putawaySession, settings, toastSuccess]);

  const openLabel = useCallback(async (shipmentId: string | undefined, print: boolean) => {
    if (!shipmentId || !online) return;
    try {
      const response = await sellerplusApiFetch(`/api/reyo-pack/labels/${shipmentId}${print ? "?download=0" : ""}`);
      if (!response.ok) throw new Error((await response.json().catch(() => ({})) as { error?: string }).error ?? "The shipping label is unavailable.");
      const url = URL.createObjectURL(await response.blob());
      const windowRef = window.open(url, "_blank");
      if (print && windowRef) window.setTimeout(() => windowRef.print(), 1_000);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : "The shipping label is unavailable."); }
  }, [online]);

  const useAwb = useCallback((awb: string) => { setView("PACK"); setScanInput(awb); setScanResult(null); setCameraRequested(false); }, []);
  const queuePageCount = Math.max(1, Math.ceil(total / 50));

  const renderScanPanel = useMemo(() => {
    const putaway = view === "PUTAWAY";
    const session = putaway ? putawaySession : packSession;
    if (!session) return <SessionGate mode={putaway ? "PUTAWAY" : "PACKING"} onStart={() => void startSession(putaway ? "PUTAWAY" : "PACKING")} starting={startingMode === (putaway ? "PUTAWAY" : "PACKING")} />;
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <section className="space-y-4">
          <BarcodeScanner active={cameraRequested && !scanResult && !putawayResult && !busy} disabled={!online} onDetected={(value) => void handleScan(value, "CAMERA")} onError={setErrorMessage} />
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#161719] px-3 py-2 text-xs text-zinc-400"><Smartphone className="h-4 w-4 text-emerald-300" /><span>Continuous camera scan is preferred. Keep manual AWB entry or a USB/Bluetooth scanner as fallback.</span></div>
          <div className="flex gap-2">
            <input value={scanInput} onChange={(event) => setScanInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleScan(scanInput, "MANUAL"); }} placeholder={putaway ? "Scan SKU / product barcode" : "Enter AWB only as fallback"} className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#161719] px-4 font-mono text-sm text-white placeholder:text-zinc-600 focus:border-emerald-400/60 focus:outline-none" disabled={!online || busy || (!putaway && !settings.allowManualAwb)} />
            <button type="button" onClick={() => void handleScan(scanInput, "MANUAL")} disabled={!scanInput.trim() || !online || busy || (!putaway && !settings.allowManualAwb)} className="min-h-12 rounded-xl bg-white px-4 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">SCAN</button>
          </div>
          {!putaway && !settings.allowManualAwb && <p className="text-xs text-amber-300">Manual AWB entry is disabled by the administrator.</p>}
        </section>
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#161719] p-4"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Session #{session.sessionNumber}</p><p className="mt-1 text-sm text-zinc-300">Started {displayDate(session.startedAt)}</p></div><button type="button" onClick={() => void endActiveSession()} disabled={ending || !online} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-40">{ending ? "Ending…" : "End session"}</button></div><div className="mt-4 grid grid-cols-2 gap-2">{(putaway ? [["Actions", session.putawayActions], ["Units", session.putawayUnits]] : [["Packages", session.packagesPacked], ["Units", session.unitsPacked], ["Cancelled", session.cancelledScans], ["Errors", session.errors]]).map(([label, value]) => <div key={String(label)} className="rounded-xl bg-black/15 px-3 py-3"><p className="text-xl font-bold text-white">{value}</p><p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p></div>)}</div></div>
          {putawayResult ? <PutawayFeedback result={putawayResult} onClear={() => { setPutawayResult(null); setScanInput(""); setCameraRequested(true); }} onConfirm={() => void confirmPutaway()} busy={busy} /> : scanResult ? <ScanFeedback result={scanResult} onClear={() => { setScanResult(null); setScanInput(""); setCameraRequested(true); }} onPack={() => void confirmPack()} onViewLabel={(print) => void openLabel(scanResult.shipmentId, print)} busy={busy} /> : <div className="rounded-2xl border border-dashed border-white/15 bg-[#161719] p-8 text-center"><QrCode className="mx-auto h-10 w-10 text-zinc-600" /><p className="mt-3 text-sm font-semibold text-zinc-300">Ready for the next scan</p><p className="mt-1 text-xs leading-5 text-zinc-500">{putaway ? "The location will be shown before anything is recorded." : "The server will identify the order, show its items, and claim it before packing."}</p></div>}
        </section>
      </div>
    );
  }, [busy, cameraRequested, confirmPack, confirmPutaway, endActiveSession, ending, handleScan, online, openLabel, packSession, putawayResult, putawaySession, scanInput, scanResult, settings, startSession, startingMode, view]);

  return (
    <main className="min-h-[calc(100vh-3.5rem)] pb-6 pt-3 text-zinc-100 md:pt-5">
      <header className="flex flex-wrap items-start justify-between gap-4 px-1">
        <div><div className="flex items-center gap-2"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">SellerPlus · Reyo Pack</p><span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase", online ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-rose-400/30 bg-rose-400/10 text-rose-300")}>{online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{online ? "Online" : "Offline"}</span><span className="hidden items-center gap-1 text-[10px] uppercase text-zinc-500 sm:inline-flex">{realtimeConnected ? <><Wifi className="h-3 w-3 text-emerald-400" /> live</> : "realtime reconnecting"}</span></div><h1 className="mt-2 text-2xl font-semibold tracking-tight text-white md:text-3xl">Scan · Know · Pack · Next</h1><p className="mt-1 max-w-2xl text-sm text-zinc-500">Fast, auditable fulfillment for every Reyo Store package.</p></div>
        <button type="button" onClick={() => { void loadSessions(); void loadOperationalRows(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </header>
      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-white/10 pb-1" aria-label="Reyo Pack sections">{tabs.map((tab) => { const Icon = tab.icon; return <button type="button" key={tab.id} onClick={() => { setView(tab.id); setPage(1); setErrorMessage(null); if (tab.id === "PACK" || tab.id === "PUTAWAY") { setScanResult(null); setPutawayResult(null); setCameraRequested(true); } }} className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-t-xl px-4 text-sm font-semibold transition", view === tab.id ? "border-b-2 border-emerald-300 bg-emerald-300/10 text-emerald-200" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200")}><Icon className="h-4 w-4" />{tab.label}</button>; })}</nav>
      {!online && <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100"><WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" /><p><strong>OFFLINE.</strong> Safe queue snapshots may remain visible, but the server must be reachable before an AWB can be claimed or a package/location can be confirmed.</p></div>}
      {cachedAt && <p className="mt-3 text-xs text-amber-300">Showing the last safe snapshot from {displayDate(cachedAt)}. Reconnect to refresh.</p>}
      {errorMessage && <div className="mt-4"><ErrorMessage message={errorMessage} onDismiss={() => setErrorMessage(null)} /></div>}
      <div className="mt-5">{loading && view !== "PACK" && view !== "PUTAWAY" ? <div className="flex min-h-60 items-center justify-center text-sm text-zinc-500"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading operational records…</div> : (view === "PACK" || view === "PUTAWAY") ? renderScanPanel : view === "QUEUE" || view === "CANCELLED" || view === "HISTORY" ? <OperationalList view={view} rows={rows} total={total} page={page} pageCount={queuePageCount} search={search} onSearch={(value) => { setSearch(value); if (searchTimer.current) window.clearTimeout(searchTimer.current); searchTimer.current = window.setTimeout(() => setPage(1), 250); }} onPage={setPage} onUseAwb={useAwb} /> : view === "PUTAWAY_HISTORY" ? <PutawayHistory rows={putawayRows} total={total} page={page} pageCount={queuePageCount} onPage={setPage} /> : <SessionHistory rows={sessionRows} total={total} page={page} pageCount={queuePageCount} onPage={setPage} />}</div>
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-[11px] text-zinc-600"><span className="inline-flex items-center gap-1.5"><Settings2 className="h-3.5 w-3.5" /> Sound {settings.soundEnabled ? "on" : "off"} · Vibration {settings.vibrationEnabled ? "on" : "off"}</span><span>Workspace-bound · server authoritative · no unsafe offline packing</span></footer>
    </main>
  );
}

function PutawayFeedback({ result, onClear, onConfirm, busy }: { result: Record<string, unknown>; onClear: () => void; onConfirm: () => void; busy: boolean }) {
  const found = result.outcome === "PRODUCT_FOUND";
  const changed = result.outcome === "LOCATION_CHANGED";
  return <section className={cn("rounded-2xl border p-5", found ? "border-sky-400/35 bg-sky-400/10" : "border-amber-400/35 bg-amber-400/10")}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-300">{changed ? "LOCATION UPDATED" : found ? "PRODUCT FOUND" : String(result.outcome ?? "SCAN RESULT")}</p><p className="mt-2 text-sm text-zinc-300">{String(result.message ?? (found ? "Put this product in the displayed location." : "The SKU needs an administrator assignment."))}</p></div><button type="button" onClick={onClear} className="rounded-lg p-2 text-zinc-300 hover:bg-white/10" aria-label="Clear putaway result"><XCircle className="h-5 w-5" /></button></div>{Boolean(result.sku || result.productTitle) && <div className="mt-5"><p className="text-lg font-semibold text-white">{String(result.productTitle ?? result.sku)}</p><p className="mt-1 font-mono text-xs text-zinc-400">{String(result.sku ?? "—")}{result.size ? ` · ${String(result.size)}` : ""}</p></div>}{Boolean(result.locationCode) && <div className="mt-5 rounded-xl border border-sky-300/30 bg-sky-300/10 p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-sky-200">PUT THIS IN</p><p className="mt-1 text-3xl font-black tracking-wide text-white">{String(result.locationCode)}</p><p className="mt-1 text-sm text-sky-100">{String(result.locationName ?? "Assigned warehouse location")}</p></div>}{found && <button type="button" onClick={onConfirm} disabled={busy} className="mt-5 min-h-12 w-full rounded-xl bg-emerald-400 px-5 text-sm font-bold text-black hover:bg-emerald-300 disabled:opacity-60">{busy ? "RECORDING…" : "DONE — RECORD PUTAWAY"}</button>}{!found && <button type="button" onClick={onClear} className="mt-5 min-h-12 w-full rounded-xl border border-white/15 bg-white/5 text-sm font-bold text-white">SCAN NEXT</button>}</section>;
}

function OperationalList({ view, rows, total, page, pageCount, search, onSearch, onPage, onUseAwb }: { view: "QUEUE" | "CANCELLED" | "HISTORY"; rows: QueueRow[]; total: number; page: number; pageCount: number; search: string; onSearch: (value: string) => void; onPage: (page: number) => void; onUseAwb: (awb: string) => void }) {
  return <section><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{view === "QUEUE" ? "UNPACKED QUEUE" : view === "CANCELLED" ? "CANCELLED · DO NOT PACK" : "PACKING HISTORY"}</p><p className="mt-1 text-sm text-zinc-400">{total} records · page {page} of {pageCount}</p></div><div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Order ID, AWB, SKU, product" className="min-h-11 w-full rounded-xl border border-white/10 bg-[#161719] pl-10 pr-3 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-400/60 focus:outline-none" /></div></div>{rows.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-[#161719] px-5 py-16 text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-300/60" /><p className="mt-3 text-sm font-semibold text-zinc-300">No records on this page</p><p className="mt-1 text-xs text-zinc-500">The central database has no matching Reyo Pack records.</p></div> : <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row, index) => <QueueCard key={String(row.shipmentId ?? row.orderId ?? index)} row={row} cancelled={view === "CANCELLED"} onUseAwb={onUseAwb} />)}</div>}<Pager page={page} pageCount={pageCount} onPage={onPage} /></section>;
}

function PutawayHistory({ rows, total, page, pageCount, onPage }: { rows: PutawayRow[]; total: number; page: number; pageCount: number; onPage: (page: number) => void }) {
  return <section><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">PUTAWAY HISTORY</p><p className="mt-1 text-sm text-zinc-400">{total} immutable movement records</p><div className="mt-5 overflow-x-auto rounded-2xl border border-white/10 bg-[#161719]"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-white/10 text-[11px] uppercase tracking-wider text-zinc-500"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Previous</th><th className="px-4 py-3">New location</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">When</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id ?? index} className="border-b border-white/5 last:border-0"><td className="px-4 py-3 text-white">{row.sku?.sku ?? "—"}<p className="text-xs text-zinc-500">{row.sku?.product_title ?? ""}</p></td><td className="px-4 py-3 text-zinc-400">{row.previous_location?.code ?? "—"}</td><td className="px-4 py-3 font-semibold text-sky-200">{row.new_location?.code ?? "—"}</td><td className="px-4 py-3 text-zinc-300">{row.quantity ?? "—"}</td><td className="px-4 py-3 text-zinc-500">{displayDate(row.created_at)}</td></tr>)}</tbody></table></div><Pager page={page} pageCount={pageCount} onPage={onPage} /></section>;
}

function SessionHistory({ rows, total, page, pageCount, onPage }: { rows: QueueRow[]; total: number; page: number; pageCount: number; onPage: (page: number) => void }) {
  return <section><p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">SESSION HISTORY</p><p className="mt-1 text-sm text-zinc-400">{total} sessions · every operational result remains traceable</p><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row, index) => <article key={String(row.id ?? index)} className="rounded-2xl border border-white/10 bg-[#161719] p-4"><div className="flex items-center justify-between"><p className="font-semibold text-white">Session #{String(row.sessionNumber ?? "—")}</p><span className={cn("rounded-md border px-2 py-1 text-[11px] font-bold uppercase", row.status === "COMPLETED" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : row.status === "ABANDONED" ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : "border-sky-400/30 bg-sky-400/10 text-sky-300")}>{String(row.status ?? "—")}</span></div><p className="mt-2 text-xs uppercase tracking-wider text-zinc-500">{String(row.mode ?? "—")} · started {displayDate(row.startedAt)}</p><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><div className="rounded-lg bg-black/15 p-3"><p className="font-bold text-white">{String(row.packages_packed ?? 0)}</p><p className="text-[11px] text-zinc-500">packages</p></div><div className="rounded-lg bg-black/15 p-3"><p className="font-bold text-white">{String(row.units_packed ?? row.putaway_units ?? 0)}</p><p className="text-[11px] text-zinc-500">units</p></div></div></article>)}</div><Pager page={page} pageCount={pageCount} onPage={onPage} /></section>;
}

function Pager({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  return <div className="mt-5 flex items-center justify-between"><button type="button" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-300 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="text-xs text-zinc-500">Page {page} / {pageCount}</span><button type="button" onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-300 disabled:opacity-30">Next <ChevronRight className="h-4 w-4" /></button></div>;
}
