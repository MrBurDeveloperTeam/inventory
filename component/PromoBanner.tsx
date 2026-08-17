import React, { useState } from 'react';
import { trackPromotionEvent } from '@/services/promotions';

type PromoBannerProps = {
  appCode: string;
  promo: {
    id: string;
    title: string;
    message: string;
    image_url: string;
    cta_label: string;
    cta_url: string;
    dismissible: boolean;
  };
};

export default function PromoBanner({ appCode, promo }: PromoBannerProps) {
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const onClick = async () => {
    await trackPromotionEvent(promo.id, appCode, 'click');
    window.location.href = promo.cta_url;
  };

  const onDismiss = async () => {
    await trackPromotionEvent(promo.id, appCode, 'dismiss');
    setHidden(true);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex items-center gap-4">
      {promo.image_url ? (
        <img
          src={promo.image_url}
          alt={promo.title}
          className="w-20 h-20 object-cover rounded-xl"
        />
      ) : null}

      <div className="flex-1">
        <div className="font-bold text-slate-900">{promo.title}</div>
        <div className="text-sm text-slate-600 mt-1">{promo.message}</div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onClick}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white font-semibold"
        >
          {promo.cta_label || 'Open'}
        </button>

        {promo.dismissible ? (
          <button
            onClick={onDismiss}
            className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600"
          >
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}