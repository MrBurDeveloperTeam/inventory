import { env } from "process";

export async function callSnabbbApi<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, any>
): Promise<T> {
  const baseUrl = env.VITE_ODOO_BASE_URL;
  // const baseUrl = 'https://semistiffly-largando-alane.ngrok-free.dev';
  const apiKey = env.VITE_SNABBB_API_KEY;
  // const apiKey = 'UiFKcg6lJvSHZUuQFJxg0oDjjIm8QCON';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Snabbb-Api-Key': apiKey,
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });

  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || 'Snabbb API error');
  }
  return data as T;
}