import { useEffect, useState } from 'react';
import { fetchEligiblePromotions, trackPromotionEvent, type Promotion } from '@/services/promotions';

export function usePromotions(appCode: string, role: string, segments: string[] = []) {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    async function run() {
      try {
        setLoading(true);
        const promos = await fetchEligiblePromotions(appCode, role, segments);
        if (!alive) return;

        setPromotions(promos);

        for (const promo of promos) {
          void trackPromotionEvent(promo.id, appCode, 'impression');
        }
      } catch (e) {
        if (alive) setPromotions([]);
      } finally {
        if (alive) setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [appCode, role, JSON.stringify(segments)]);

  return { promotions, loading };
}