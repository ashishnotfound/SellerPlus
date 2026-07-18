"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSubscription } from "@/hooks/use-subscription";
import { useAuth } from "@/hooks/use-auth";
import { useMobileNav } from "@/hooks/use-mobile-nav";
import { NotificationBell } from "@/components/notification-bell";
import {
  BarChart2,
  Bot,
  Cpu,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  TrendingUp,
  Package,
  AlertTriangle,
  FileText,
  Compass,
  ShoppingCart,
  RotateCcw,
  ClipboardList,
  Star,
  Zap,
  Target,
  Trophy,
  Calculator,
  DollarSign,
  Sparkles,
  ShieldAlert,
  Menu,
  X,
  Warehouse,
  CalendarClock,
} from "lucide-react";

interface SidebarProps {
  userEmail?: string;
  userRole?: string;
  onLogout?: () => void;
  onOpenSearch?: () => void;
}

/**
 * Role-based visibility:
 * - `allowedRoles`: if defined, item is only shown to users with these roles.
 * - `restrictedRoles`: if defined, item is shown ONLY to these restricted roles.
 * Items with neither constraint are shown to everyone.
 */
const NAV_ITEMS = [
  { label: "Dashboard",       icon: <LayoutDashboard className="w-4 h-4" />, href: "/dashboard",                           restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst", "employee", "read-only"] },
  { label: "Goals",           icon: <Trophy          className="w-4 h-4" />, href: "/goals",                               restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst"] },
  { label: "Products",        icon: <Package         className="w-4 h-4" />, href: "/analytics/products",                   restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst"] },
  { label: "Inventory",       icon: <ClipboardList   className="w-4 h-4" />, href: "/analytics/inventory",                  restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst", "employee"] },
  { label: "Orders",          icon: <ShoppingCart    className="w-4 h-4" />, href: "/orders",                              restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst", "employee"] },
  { label: "Cost Config",     icon: <Calculator      className="w-4 h-4" />, href: "/costs",                               restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager"] },
  { label: "Expenses",        icon: <DollarSign      className="w-4 h-4" />, href: "/expenses",                            restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager"] },
  { label: "Advertising",     icon: <TrendingUp      className="w-4 h-4" />, href: "/analytics/ads",                        restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst"] },
  { label: "Refunds",         icon: <RotateCcw       className="w-4 h-4" />, href: "/analytics/refunds",                    restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst"] },
  { label: "Reports",         icon: <FileText        className="w-4 h-4" />, href: "/analytics/reports",                    restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager"] },
  { label: "Alerts",          icon: <AlertTriangle   className="w-4 h-4" />, href: "/analytics/alerts",                    restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst"] },
  { label: "Automation",      icon: <Cpu             className="w-4 h-4" />, href: "/analytics/automation",                 restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager"] },
  // Operations group — visible to all roles including warehouse
  { label: "Warehouse",       icon: <Warehouse       className="w-4 h-4" />, href: "/warehouse",                           restrictedRoles: undefined, allowedRoles: undefined, group: "Operations" },
  // AI Tools group — restricted from warehouse-only roles
  { label: "AI Workspace",    icon: <Sparkles        className="w-4 h-4" />, href: "/ai-chat",        group: "AI",           restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst"] },
  { label: "AI Tasks",        icon: <CalendarClock   className="w-4 h-4" />, href: "/tasks",          group: "AI",           restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager"] },
  { label: "AI Insights",     icon: <Star            className="w-4 h-4" />, href: "/listing-judge",  group: "AI",           restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager", "analyst"] },
  { label: "Amazon KW™",      icon: <Zap             className="w-4 h-4" />, href: "/amazon-kw",      group: "AI",           restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager"] },
  { label: "Keyword Engine™", icon: <Cpu             className="w-4 h-4" />, href: "/keyword-engine", group: "AI",           restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager"] },
  { label: "AI Copywriter",   icon: <Compass         className="w-4 h-4" />, href: "/copywriter",     group: "AI",           restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager"] },
  // Account group
  { label: "Billing",         icon: <CreditCard      className="w-4 h-4" />, href: "/billing",        group: "Account",      restrictedRoles: undefined, allowedRoles: ["owner", "admin"] },
  { label: "Settings",        icon: <Settings        className="w-4 h-4" />, href: "/settings",       group: "Account",      restrictedRoles: undefined, allowedRoles: ["owner", "admin", "manager"] },
];

// ─── Inner Sidebar content (shared between desktop and mobile drawer) ─────

function SidebarContent({
  userEmail,
  userRole,
  currentPlan,
  isSuperAdmin,
  onLogout,
  onClose,
}: {
  userEmail: string;
  userRole: string;
  currentPlan: string;
  isSuperAdmin?: boolean;
  onLogout?: () => void;
  onClose?: () => void;
}) {
  const pathname = usePathname();

  const allItems = isSuperAdmin
    ? [...NAV_ITEMS, { label: "Admin Panel", icon: <ShieldAlert className="w-4 h-4" />, href: "/admin", group: "System", allowedRoles: undefined, restrictedRoles: undefined }]
    : NAV_ITEMS;

  const RESTRICTED_ROLES = ["warehouse", "packer", "shipping"];
  const isRestrictedRole = RESTRICTED_ROLES.includes(userRole);

  // Filter nav items by role — warehouse/packer/shipping only see permitted pages
  const visibleItems = allItems.filter((item) => {
    if (!item.allowedRoles) return true; // No allowedRoles = visible to everyone
    return item.allowedRoles.includes(userRole);
  });

  const mainItems      = visibleItems.filter((i) => !i.group);
  const opsItems       = visibleItems.filter((i) => i.group === "Operations");
  const aiItems        = visibleItems.filter((i) => i.group === "AI");
  const accountItems   = visibleItems.filter((i) => i.group === "Account");
  const systemItems    = visibleItems.filter((i) => i.group === "System");

  const NavLink = ({ item }: { item: typeof allItems[0] }) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        href={item.href}
        onClick={onClose}
        title={item.label}
        className={cn(
          "flex items-center gap-3 px-3 py-[7px] text-[13px] font-medium rounded-md transition-all duration-150",
          isActive
            ? "text-[#00c48c] bg-[#00c48c]/[0.08] border-l-2 border-[#00c48c] pl-[10px]"
            : "text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] border-l-2 border-transparent pl-[10px]"
        )}
      >
        <span className={isActive ? "text-[#00c48c]" : "text-zinc-600 group-hover:text-zinc-400"}>
          {item.icon}
        </span>
        {item.label}
      </Link>
    );
  };

  const GroupLabel = ({ label }: { label: string }) => (
    <p className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-700">
      {label}
    </p>
  );

  return (
    <>
      {/* Logo */}
      <div className="h-14 flex items-center gap-2.5 px-4 border-b border-white/[0.06] shrink-0">
        <div className="flex items-center justify-center w-7 h-7">
          <BarChart2 className="w-6 h-6 text-[#00c48c]" />
        </div>
        <span className="text-[15px] font-bold tracking-tight text-white">SellerPlus</span>
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell />
          {/* Close button — only on mobile */}
          {onClose && (
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.06] transition-colors md:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2 px-1.5 flex flex-col overflow-y-auto scrollbar-thin">
        {mainItems.map((item) => <NavLink key={item.href} item={item} />)}
        {opsItems.length > 0 && (
          <>
            <GroupLabel label="Operations" />
            {opsItems.map((item) => <NavLink key={item.href} item={item} />)}
          </>
        )}
        {aiItems.length > 0 && (
          <>
            <GroupLabel label="AI Tools" />
            {aiItems.map((item) => <NavLink key={item.href} item={item} />)}
          </>
        )}
        {accountItems.length > 0 && (
          <>
            <GroupLabel label="Account" />
            {accountItems.map((item) => <NavLink key={item.href} item={item} />)}
          </>
        )}
        {systemItems.length > 0 && (
          <>
            <GroupLabel label="System Admin" />
            {systemItems.map((item) => <NavLink key={item.href} item={item} />)}
          </>
        )}
      </nav>

      {/* User footer */}
      <div className="border-t border-white/[0.06] px-3 py-3 flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-[#00c48c]/10 border border-[#00c48c]/20 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-black text-[#00c48c]">
              {(userEmail?.[0] ?? "S").toUpperCase()}
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-semibold text-zinc-300 truncate">{userEmail}</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-zinc-600 uppercase font-bold">{userRole}</span>
              <span className="text-[8px] font-extrabold uppercase px-1.5 py-[1px] rounded bg-[#00c48c]/10 text-[#00c48c] border border-[#00c48c]/20">
                {currentPlan}
              </span>
            </div>
          </div>
        </div>

        {onLogout && (
          <button
            onClick={onLogout}
            className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] font-semibold text-zinc-600 hover:text-rose-400 hover:bg-rose-500/5 rounded-md transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        )}
      </div>
    </>
  );
}

// ─── Exported Sidebar ─────────────────────────────────────────────────

export function Sidebar({ userEmail = "seller@sellerplus.in", userRole = "Owner", onLogout }: SidebarProps) {
  const currentPlan = useSubscription((s) => s.currentPlan);
  const user = useAuth((s) => s.user);
  const { isMobileDrawerOpen, setMobileDrawerOpen } = useMobileNav();

  const sharedProps = {
    userEmail,
    userRole,
    currentPlan,
    isSuperAdmin: user?.isSuperAdmin,
    onLogout,
  };

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <aside className="hidden md:flex w-[200px] bg-[#0d0e10] border-r border-white/[0.06] flex-col h-screen sticky top-0 shrink-0">
        <SidebarContent {...sharedProps} />
      </aside>

      {/* ── Mobile: hamburger trigger (always visible) ────────── */}
      <div className="md:hidden fixed top-3 left-3 z-50">
        <button
          onClick={() => setMobileDrawerOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#0d0e10] border border-white/[0.08] text-zinc-400 hover:text-white transition-colors shadow-lg"
          aria-label="Open navigation"
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {/* ── Mobile: slide-in drawer ───────────────────────────── */}
      {isMobileDrawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileDrawerOpen(false)}
          />
          {/* Drawer */}
          <aside className="md:hidden fixed top-0 left-0 z-50 w-[220px] h-screen bg-[#0d0e10] border-r border-white/[0.06] flex flex-col shadow-2xl animate-in slide-in-from-left duration-200">
            <SidebarContent {...sharedProps} onClose={() => setMobileDrawerOpen(false)} />
          </aside>
        </>
      )}
    </>
  );
}
