
import React from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import { MockClinic } from './types';

interface ClinicsTableProps {
  clinics: MockClinic[];
}

const ClinicsTable: React.FC<ClinicsTableProps> = ({ clinics }) => {
  const renderStatusBadge = (status: string) => {
    const colors = {
      active: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      warning: 'bg-amber-50 text-amber-600 border-amber-100',
      inactive: 'bg-slate-50 text-slate-500 border-slate-100',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${colors[status as keyof typeof colors]}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="w-full animate-in slide-in-from-right-4 duration-500">
       <div className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
          <table className="w-full text-left">
             <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Clinic / Owner</th>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Location</th>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Inventory Val.</th>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Last Activity</th>
                   <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Action</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-50">
                {clinics.map(clinic => (
                   <tr key={clinic.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-8 py-6">
                         <div>
                            <p className="font-bold text-slate-800">{clinic.name}</p>
                            <p className="text-xs text-slate-400 font-medium">{clinic.owner}</p>
                         </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className="flex items-center gap-2 text-slate-500">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="text-xs font-semibold">{clinic.location}</span>
                         </div>
                      </td>
                      <td className="px-8 py-6">{renderStatusBadge(clinic.status)}</td>
                      <td className="px-8 py-6 text-right font-black text-slate-700">${clinic.inventoryValue.toLocaleString()}</td>
                      <td className="px-8 py-6 text-center text-slate-400 text-xs font-bold">{clinic.lastSync}</td>
                      <td className="px-8 py-6 text-center">
                         <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all">
                            <ExternalLink className="w-4 h-4" />
                         </button>
                      </td>
                   </tr>
                ))}
             </tbody>
          </table>
       </div>
    </div>
  );
};

export default ClinicsTable;
