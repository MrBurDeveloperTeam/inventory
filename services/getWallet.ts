export async function getWallet(partnerId: number) {
  const res = await fetch(`/api/snabbb/wallet?partner_id=${partnerId}`);

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to fetch wallet");
  }

  return data.data;
}