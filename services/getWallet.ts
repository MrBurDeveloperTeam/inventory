export async function getWallet(partnerId: string) {
  const res = await fetch(`https://semistiffly-largando-alane.ngrok-free.dev/api/snabbb/wallet?partner_id=${partnerId}`);

  const data = await res.json();

  if (!res.ok || !data.ok) {
    throw new Error(data.error || "Failed to fetch wallet");
  }

  return data.data;
}