// utils/authStorage.ts
export interface AuthUser {
  username: string;
  name: string;
  company_id: number;
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem("odoo_session");
    if (!raw) return null;
    
    const parsed = JSON.parse(raw);

    return parsed;
  } catch {
    return null;
  }
}
