import api from "./odooApi";

export async function getWallet(partnerId: number) {
  const res = await api.get(`/snabbb/wallet?partner_id=${partnerId}`);

  const data = await res.data;

  if (!res || !data.ok) {
    throw new Error(data.error || "Failed to fetch wallet");
  }
 
  return data;
}