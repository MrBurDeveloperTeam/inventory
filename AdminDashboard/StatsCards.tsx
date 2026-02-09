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
    { label: 'Total Expired Stock', value: stats.expiredCount.toString(), color: 'bg-rose-500', icon: <AlertCircle /> },
    { label: 'Expiring Soon', value: stats.expiringSoonCount.toString(), color: 'bg-orange-500', icon: <Clock /> },
    { label: 'Total Orders', value: stats.totalOrders.toString(), color: 'bg-emerald-500', icon: <ShoppingCart /> },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-500">
      {cards.map((card, i) => (
        <div key={i} className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100 flex flex-col gap-4 group hover:shadow-md transition-all">
          <div className="flex items-center justify-between">
             <div className={`${card.color} p-2 rounded-lg text-white group-hover:scale-110 transition-transform`}>
               {React.cloneElement(card.icon as React.ReactElement<any>, { className: 'w-5 h-5' })}
             </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 mb-1">{card.label}</p>
            <p className="text-2xl font-black text-slate-800 tracking-tight">{card.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default StatsCards;