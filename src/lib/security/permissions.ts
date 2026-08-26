export const permissions = [
  "catalog.read",
  "catalog.write",
  "listing.publish",
  "order.read",
  "order.manage",
  "inventory.read",
  "inventory.manage",
  "advertising.read",
  "advertising.manage",
  "finance.read",
  "finance.manage",
  "automation.read",
  "automation.manage",
  "approval.decide",
  "team.manage",
  "settings.manage",
  "reyo_pack.read",
  "reyo_pack.pack",
  "reyo_pack.putaway",
  "reyo_pack.admin",
] as const;

export type Permission = (typeof permissions)[number];
export type WorkspaceRole =
  | "owner"
  | "admin"
  | "member"
  | "viewer"
  | "ppc_manager"
  | "catalog_manager"
  | "operations"
  | "finance";

const viewer: readonly Permission[] = [
  "catalog.read",
  "order.read",
  "inventory.read",
  "advertising.read",
  "finance.read",
  "automation.read",
  "reyo_pack.read",
];

const member: readonly Permission[] = [
  ...viewer,
  "catalog.write",
  "order.manage",
  "inventory.manage",
  "reyo_pack.pack",
  "reyo_pack.putaway",
];

const admin: readonly Permission[] = [
  ...member,
  "listing.publish",
  "advertising.manage",
  "finance.manage",
  "automation.manage",
  "approval.decide",
  "team.manage",
  "settings.manage",
  "reyo_pack.admin",
];

export const rolePermissions: Record<WorkspaceRole, readonly Permission[]> = {
  owner: permissions,
  admin,
  member,
  viewer,
  ppc_manager: ["advertising.read", "advertising.manage", "automation.read"],
  catalog_manager: [
    "catalog.read",
    "catalog.write",
    "listing.publish",
    "inventory.read",
    "reyo_pack.read",
  ],
  operations: [
    "catalog.read",
    "order.read",
    "order.manage",
    "inventory.read",
    "inventory.manage",
    "automation.read",
    "reyo_pack.read",
    "reyo_pack.pack",
    "reyo_pack.putaway",
  ],
  finance: ["order.read", "advertising.read", "finance.read", "finance.manage", "automation.read", "approval.decide"],
};

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === "string" && value in rolePermissions;
}
