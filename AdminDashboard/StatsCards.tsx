import React, { useMemo } from 'react';
import { TrendingUp, AlertCircle, Clock, ShoppingCart } from 'lucide-react';
import { GlobalInventoryItem, MockGlobalOrder } from './types';

interface StatsCardsProps {
  inventory: GlobalInventoryItem[];
  history: MockGlobalOrder[];
  expiring: GlobalInventoryItem[];
}

const StatsCards: React.FC<StatsCardsProps> = ({ inventory, history, expiring }) => {
  const stats = useMemo(() => {
    const totalValue = inventory.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const expiredCount = inventory.filter(i => i.expiryDate && new Date(i.expiryDate) < new Date()).length;
    const expiringSoonCount = expiring.length;
    const totalOrders = history.length;

    return { totalValue, expiredCount, expiringSoonCount, totalOrders };
  }, [inventory, history, expiring]);

  const cards = [
    { label: 'Inventory Value', value: `$${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, color: 'bg-blue-600', icon: <TrendingUp /> },
    { label: 'Expired Stock', value: stats.expiredCount.toString(), color: 'bg-rose-500', icon: <AlertCircle /> },
    { label: 'Expiring Soon', value: stats.expiringSoonCount.toString(), color: 'bg-orange-500', icon: <Clock /> },
    { label: 'Total Orders', value: stats.totalOrders.toString(), color: 'bg-emerald-500', icon: <ShoppingCart /> },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 animate-in fade-in duration-500">
      {cards.map((card, i) => (
        <div key={i} className="bg-white p-4 sm:p-6 rounded-[1.5rem] shadow-sm border border-slate-100 flex flex-col gap-4 group hover:shadow-md transition-all">
          <div className="flex items-center gap-3">
            <div className={`${card.color} p-2 rounded-lg text-white group-hover:scale-110 transition-transform shrink-0`}>
              {React.cloneElement(card.icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
            </div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">{card.label}</p>
          </div>
          <div>
            <p className="text-xl font-black sm:text-2xl sm:font-black text-slate-800 tracking-tight">
              {card.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;