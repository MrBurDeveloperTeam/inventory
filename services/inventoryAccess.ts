import { supabase } from "../lib/supabaseClient";

export const INVENTORY_PERMISSIONS = {
  ACCESS: "inventory.access",
  CLINIC: "inventory.clinic.manage",
  ITEMS: "inventory.items.manage",
  STOCK: "inventory.stock.manage",
  INSIGHTS: "inventory.insights.view",
  EXPORT: "inventory.export",
} as const;

export type InventoryAccess = {
  ok: boolean;
  app: "inventory";
  actorType: "owner" | "member" | "individual";
  actorUserId?: string;
  workspaceUserId?: string;
  role: string | null;
  permissions: Record<string, boolean>;
};

function getAccessContextUrl() {
  const apiBase = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");
  return apiBase
    ? `${apiBase}/company/access-context?app=inventory`
    : "/api/company/access-context?app=inventory";
}

export async function getInventoryAccess(): Promise<InventoryAccess> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) throw new Error("Unable to read your login session.");
  if (!session?.access_token) {
    throw new Error("Your login session is unavailable. Please log in again.");
  }

  const response = await fetch(getAccessContextUrl(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
  });
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || `Unable to load Inventory access (${response.status})`);
  }

  return result;
}

export function hasInventoryPermission(
  access: InventoryAccess | null,
  permission: string,
) {
  return access?.permissions?.[permission] === true;
}
