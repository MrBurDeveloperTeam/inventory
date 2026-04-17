import { api } from "./api";

export const getCreditBalance = async (partnerId: number) => {
  try {
    const res = await api.get(`/snabbb/wallet?partner_id=${partnerId}`);
    const data = await res.data;

    if (!data.ok) {
      return Promise.reject(new Error(data.error || "Failed to fetch wallet"));
    }

    return data.data.snabbb_balance;
  } catch (err) {
    return Promise.reject(new Error(err.message || "Failed to fetch credit balance"));
  }
}