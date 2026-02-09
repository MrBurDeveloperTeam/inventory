import React from 'react';
import { 
  LayoutDashboard, 
  Users as UsersIcon, 
  Globe, 
  LogOut 
} from 'lucide-react';

interface SidebarProps {
  activeItem: string;
  onItemSelect: (id: string) => void;
  onLogout: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeItem, onItemSelect, onLogout }) => {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'users', label: 'Users', icon: <UsersIcon className="w-5 h-5" /> },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0">
      <div className="p-6 flex items-center gap-3">
        <div className="bg-[#2563eb] p-1.5 rounded-lg text-white">
          <Globe className="w-6 h-6" />
        </div>
        <span className="font-bold text-xl text-slate-800 tracking-tight">DentInventory</span>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => onItemSelect(item.id)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all ${activeItem === item.id ? 'bg-[#2563eb] text-white shadow-lg shadow-blue-100' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-3">
              {item.icon}
              <span className="font-semibold text-sm">{item.label}</span>
            </div>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-100 flex flex-col gap-2">
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
           <LogOut className="w-5 h-5" />
           <span className="font-semibold text-sm">Logout</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;