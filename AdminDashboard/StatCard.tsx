
import React from 'react';

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  onClick: () => void;
  isActive: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, onClick, isActive }) => {
  return (
    <button 
      onClick={onClick}
      className={`p-6 rounded-[1.5rem] border transition-all text-left group flex flex-col gap-4 ${
        isActive 
          ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100' 
          : 'bg-white text-slate-800 border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100'
      }`}
    >
      <div className={`p-2 rounded-lg w-fit transition-colors ${
        isActive ? 'bg-white/20 text-white' : 'bg-slate-50 text-blue-600 group-hover:bg-blue-50'
      }`}>
        {icon}
      </div>
      <div>
        <p className={`text-[10px] font-black uppercase tracking-widest leading-none mb-1.5 ${isActive ? 'text-white/70' : 'text-slate-400'}`}>
          {title}
        </p>
        <p className="text-2xl font-black tracking-tight leading-none">{value}</p>
      </div>
    </button>
  );
};

export default StatCard;
