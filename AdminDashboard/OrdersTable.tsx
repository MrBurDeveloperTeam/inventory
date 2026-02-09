
import React from 'react';
import { Building2 } from 'lucide-react';
import { MockGlobalOrder } from './types';

interface OrdersTableProps {
  orders: MockGlobalOrder[];
}

const OrdersTable: React.FC<OrdersTableProps> = ({ orders }) => {
  const formatFullDateWithTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', { 
      month: 'short', day: '2-digit', year: 'numeric', 
      hour: '2-digit', minute: '2-digit', hour12: true 
    });
  };

  return (
    <div className="w-full animate-in slide-in-from-right-4 duration-500">
       <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-left">
             <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order ID</th>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Clinic</th>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</th>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Date</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-50">
                {orders.map(order => (
                   <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6 font-mono text-xs font-bold text-slate-500">{order.id}</td>
                      <td className="px-8 py-6 font-bold text-slate-800 text-sm">{order.clinic}</td>
                      <td className="px-8 py-6">
                         <div className="flex items-center gap-2">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm font-semibold text-slate-600">{order.vendor}</span>
                         </div>
                      </td>
                      <td className="px-8 py-6 font-black text-slate-800">${order.amount.toFixed(2)}</td>
                      <td className="px-8 py-6 text-slate-500 text-xs font-medium">{formatFullDateWithTime(order.timestamp)}</td>
                   </tr>
                ))}
             </tbody>
          </table>
       </div>
    </div>
  );
};

export default OrdersTable;
