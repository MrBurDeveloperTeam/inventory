import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, User as UserIcon, Globe, Check } from 'lucide-react';
import { User } from './types';

interface HeaderProps {
  title: string;
  users: User[];
  selectedUserId: string | null;
  onUserSelect: (userId: string | null) => void;
}

const Header: React.FC<HeaderProps> = ({ title, users, selectedUserId, onUserSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedUser = users.find(u => u.id === selectedUserId);
  const selectedName = selectedUser 
    ? `${selectedUser.name} - ${selectedUser.clinicName}` 
    : "Global (All Users)";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.clinicName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <header className="h-24 bg-white/80 backdrop-blur-md sticky top-0 z-[60] border-b border-slate-100 px-8 flex items-center justify-between shrink-0">
      <h1 className="text-2xl font-bold text-slate-800 capitalize">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Selected User Selector */}
        <div className="relative" ref={dropdownRef}>
          {/* Floating badge label */}
          <div className="absolute -top-2 left-4 px-1.5 bg-white z-10">
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest leading-none">
              Selected User
            </span>
          </div>
          
          {/* Main selection box */}
          <button 
            onClick={() => setIsOpen(!isOpen)}
            className={`flex items-center gap-8 px-5 py-3 bg-white border rounded-xl transition-all shadow-sm group min-w-[340px] text-left ${isOpen ? 'border-blue-500 ring-4 ring-blue-500/10' : 'border-slate-200 hover:border-slate-300'}`}
          >
            <span className="text-sm font-bold text-slate-700 truncate max-w-[280px]">
              {selectedName}
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-transform duration-200 ml-auto ${isOpen ? 'rotate-180 text-blue-500' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isOpen && (
            <div className="absolute top-full right-0 mt-3 w-[400px] bg-white rounded-[1.5rem] shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 z-[70]">
              <div className="p-4 border-b border-slate-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    autoFocus
                    type="text" 
                    placeholder="Search users or clinics..." 
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-2">
                {/* Global Option */}
                <button 
                  onClick={() => {
                    onUserSelect(null);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all mb-1 ${selectedUserId === null ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-50 text-slate-600'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${selectedUserId === null ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold">Global Dashboard</p>
                      <p className="text-[10px] font-medium opacity-70 uppercase tracking-widest">Aggregated system data</p>
                    </div>
                  </div>
                  {selectedUserId === null && <Check className="w-4 h-4" />}
                </button>

                <div className="h-px bg-slate-50 my-2 mx-2" />
                <p className="px-3 pb-2 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Individual Users & Clinics</p>

                {filteredUsers.length > 0 ? filteredUsers.map(u => (
                  <button 
                    key={u.id}
                    onClick={() => {
                      onUserSelect(u.id);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition-all mb-1 ${selectedUserId === u.id ? 'bg-blue-50 text-blue-600' : 'hover:bg-slate-50 text-slate-600'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${selectedUserId === u.id ? 'bg-white shadow-sm' : 'bg-slate-100'}`}>
                        <UserIcon className="w-4 h-4" />
                      </div>
                      <div className="text-left overflow-hidden">
                        <p className="text-sm font-bold truncate max-w-[240px]">{u.name}</p>
                        <p className="text-[10px] font-medium opacity-70 truncate max-w-[240px]">{u.clinicName}</p>
                      </div>
                    </div>
                    {selectedUserId === u.id && <Check className="w-4 h-4" />}
                  </button>
                )) : (
                  <div className="p-8 text-center text-slate-400">
                    <p className="text-xs font-bold">No matches found</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};

export default Header;