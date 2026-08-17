import { supabase } from '../supabaseClient';

export type Promotion = {
  id: string;
  code: string;
  title: string;
  message: string;
  image_url: string;
  cta_label: string;
  cta_url: string;
  placement: 'banner' | 'card' | 'modal' | 'inline';
  priority: number;
  dismissible: boolean;
  frequency_cap: 'always' | 'once' | 'daily' | 'weekly';
};

async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

export async function fetchEligiblePromotions(appCode: string, role: string, segments: string[] = []) {
  const token = await getAccessToken();
  const qs = new URLSearchParams({
    app: appCode,
    role,
    segments: segments.join(','),
  });

  const res = await fetch(`/api/promotions/eligible?${qs.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch promotions: ${res.status}`);
  }

  const data = await res.json();
  return data.promotions as Promotion[];
}

export async function trackPromotionEvent(
  promotionId: string,
  appCode: string,
  eventType: 'impression' | 'click' | 'dismiss' | 'convert'
) {
  const token = await getAccessToken();

  await fetch('/api/promotions/event', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      promotion_id: promotionId,
      app_code: appCode,
      event_type: eventType,
    }),
  });
}