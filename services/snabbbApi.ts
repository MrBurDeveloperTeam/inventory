import api from "./odooApi";

export async function callSnabbbApi<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, any>
): Promise<T> {
  const baseUrl = import.meta.env.VITE_ODOO_BASE_URL;
  const apiKey = import.meta.env.VITE_SNABBB_API_KEY;

  const res = await api.post(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Snabbb-Api-Key': apiKey,
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });

  const data = await res.data;
  if (!data.ok || data.ok === false) {
    throw new Error(data.error || 'Snabbb API error');
  }
  return data as T;
}