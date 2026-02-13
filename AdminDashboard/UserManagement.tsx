
import React, { useState, useRef, useEffect } from 'react';
import {
  Users, UserPlus, UserCheck, UserX, Building2, User as UserIcon,
  MoreVertical, Edit2, Trash2, RotateCcw, Mail, Phone, Briefcase, Clock, X, FilterX, Lock
} from 'lucide-react';
import StatCard from './StatCard';
import { User } from './types';
import { supabase } from '../supabaseClient';

interface UserManagementProps {
  users: User[];
  setUsers?: React.Dispatch<React.SetStateAction<User[]>>;
  userInventoryStats?: Record<string, { count: number; value: number }>;
  onSelectUser?: (id: string | null) => void;
}

type UserFilterType = 'all' | 'active' | 'suspended' | 'individual' | 'company';

const JOB_POSITIONS = [
  'Dentist',
  'Dental Assistant',
  'Hygienist',
  'Receptionist',
  'Clinic Manager',
  'Lab Technician',
  'Supply Officer',
  'Administrator'
];

const UserManagement: React.FC<UserManagementProps> = ({
  users,
  /* Provide default functions that accept the correct arguments to avoid TS errors */
  setUsers = (_action: React.SetStateAction<User[]>) => { },
  userInventoryStats = {},
  onSelectUser = (_id: string | null) => { }
}) => {
  const [userFilter, setUserFilter] = useState<UserFilterType>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  const [newUser, setNewUser] = useState({
    name: '',
    contactName: '',
    email: '',
    phone: '',
    type: 'Individual' as 'Individual' | 'Company',
    jobPosition: 'Dentist',
    password: '',
    confirmPassword: ''
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchAvatars = async () => {
      const ids = users.map(u => u.id).filter(Boolean);
      if (!ids.length) return;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, avatar_url')
        .in('user_id', ids);
      if (error || !data) return;
      const next: Record<string, string> = {};
      data.forEach(row => {
        if (row.avatar_url) next[row.user_id] = row.avatar_url;
      });
      setAvatarMap(next);
    };
    fetchAvatars();
  }, [users]);

  const activeCount = users.filter(u => u.lastActive !== 'Suspended').length;
  const suspendedCount = users.filter(u => u.lastActive === 'Suspended').length;
  const individualCount = users.filter(u => u.type === 'Individual').length;
  const companyCount = users.filter(u => u.type === 'Company').length;

  const filteredUsers = users.filter(u => {
    if (userFilter === 'all') return true;
    if (userFilter === 'active') return u.lastActive !== 'Suspended';
    if (userFilter === 'suspended') return u.lastActive === 'Suspended';
    if (userFilter === 'individual') return u.type === 'Individual';
    if (userFilter === 'company') return u.type === 'Company';
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const handleToggleSuspend = (id: string) => {
    setUsers(prev => prev.map(u => {
      if (u.id === id) {
        const isSuspended = u.lastActive === 'Suspended';
        return {
          ...u,
          lastActive: isSuspended ? new Date().toLocaleDateString('en-GB') : 'Suspended'
        };
      }
      return u;
    }));
    setActiveMenuId(null);
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) return;
    if (newUser.type === 'Company' && !newUser.contactName) return;
    if (newUser.password !== newUser.confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    const userToAdd: User = {
      id: `u${users.length + 1}`,
      name: newUser.name,
      contactName: newUser.type === 'Company' ? newUser.contactName : undefined,
      email: newUser.email,
      phone: newUser.phone,
      type: newUser.type,
      jobPosition: newUser.jobPosition,
      clinicName: newUser.type === 'Company' ? newUser.name : 'Independent Clinic',
      role: newUser.jobPosition === 'Administrator' ? 'Admin' :
        newUser.jobPosition === 'Dentist' ? 'Dentist' : 'Assistant',
      lastActive: new Date().toLocaleDateString('en-GB')
    };

    setUsers(prev => [...prev, userToAdd]);
    setNewUser({
      name: '',
      contactName: '',
      email: '',
      phone: '',
      type: 'Individual',
      jobPosition: 'Dentist',
      password: '',
      confirmPassword: ''
    });
    setIsAddModalOpen(false);
  };

  const handleUpdateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setUsers(prev => prev.map(u => u.id === editingUser.id ? editingUser : u));
    setIsEditModalOpen(false);
    setEditingUser(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <button
          onClick={() => onSelectUser(null)}
          className="text-sm font-bold text-slate-500 hover:text-blue-600 transition-colors"
        >
          View Global Data
        </button>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm shadow-blue-200"
        >
          <UserPlus size={18} />
          Add New User
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6">
        <StatCard
          title="All Users"
          value={users.length}
          icon={<Users size={20} />}
          onClick={() => setUserFilter('all')}
          isActive={userFilter === 'all'}
        />
        <StatCard
          title="Active"
          value={activeCount}
          icon={<UserCheck size={20} />}
          onClick={() => setUserFilter('active')}
          isActive={userFilter === 'active'}
        />
        <StatCard
          title="Suspended"
          value={suspendedCount}
          icon={<UserX size={20} />}
          onClick={() => setUserFilter('suspended')}
          isActive={userFilter === 'suspended'}
        />
        <StatCard
          title="Individual"
          value={individualCount}
          icon={<UserIcon size={20} />}
          onClick={() => setUserFilter('individual')}
          isActive={userFilter === 'individual'}
        />
        <StatCard
          title="Companies"
          value={companyCount}
          icon={<Building2 size={20} />}
          onClick={() => setUserFilter('company')}
          isActive={userFilter === 'company'}
        />
      </div>

      <div className="flex items-center justify-between pt-4">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
          Displaying {filteredUsers.length} {userFilter === 'all' ? 'total' : userFilter} users
        </h4>
        {userFilter !== 'all' && (
          <button
            onClick={() => setUserFilter('all')}
            className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:underline"
          >
            <FilterX size={14} /> Clear Filter
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
        {filteredUsers.map((u) => {
          const initials = u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
          const isSuspended = u.lastActive === 'Suspended';
          const isMenuOpen = activeMenuId === u.id;
          const userStats = userInventoryStats[u.id] || { count: 0, value: 0 };
          const avatarUrl = avatarMap[u.id] || u.avatarUrl || null;

          return (
            <div
              key={u.id}
              onClick={() => onSelectUser(u.id)}
              className={`bg-white rounded-3xl border transition-all p-6 relative flex flex-col cursor-pointer group ${isSuspended ? 'border-rose-100 shadow-sm opacity-80' : 'border-slate-100 shadow-sm hover:shadow-lg hover:border-blue-200'}`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={u.name}
                      className="w-12 h-12 rounded-full object-cover border border-slate-100 shadow-sm"
                    />
                  ) : (
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-lg transition-colors ${isSuspended ? 'bg-slate-300' :
                      u.role === 'Admin' ? 'bg-indigo-500' :
                        u.role === 'Dentist' ? 'bg-emerald-500' : 'bg-slate-400'
                      }`}>
                      {initials}
                    </div>
                  )}
                  <div>
                    <h4 className={`font-bold leading-tight ${isSuspended ? 'text-slate-500' : 'text-slate-800'}`}>{u.name}</h4>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide transition-colors ${isSuspended ? 'text-slate-400 bg-slate-50 border-slate-200' : 'text-slate-500 bg-slate-100 border-slate-200'
                        }`}>
                        {u.type}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveMenuId(isMenuOpen ? null : u.id)}
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <MoreVertical size={18} />
                  </button>

                  {isMenuOpen && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-[60] overflow-hidden transform origin-top-right transition-all animate-in fade-in zoom-in duration-100"
                    >
                      <button
                        onClick={() => {
                          setEditingUser(u);
                          setIsEditModalOpen(true);
                          setActiveMenuId(null);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <Edit2 size={16} className="text-slate-400" />
                        Edit Profile
                      </button>
                      <button
                        onClick={() => handleToggleSuspend(u.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium border-t border-slate-50 transition-colors ${isSuspended ? 'text-emerald-600 hover:bg-emerald-50' : 'text-rose-600 hover:bg-rose-50'
                          }`}
                      >
                        {isSuspended ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                        {isSuspended ? 'Reactivate User' : 'Suspend User'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-slate-50 flex-grow">
                {u.contactName && (
                  <div className="flex items-center gap-3 text-sm text-slate-600">
                    <UserIcon size={14} className="text-slate-400" />
                    <span className="truncate font-medium">Contact: {u.contactName}</span>
                  </div>
                )}
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Mail size={14} className="text-slate-400" />
                  <span className="truncate">{u.email}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Phone size={14} className="text-slate-400" />
                  <span>{u.phone || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <Briefcase size={14} className="text-slate-400" />
                  <span>{u.jobPosition}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock size={14} className="text-slate-400" />
                  <span className={`font-medium ${isSuspended ? 'text-rose-600' : 'text-slate-600'}`}>
                    {isSuspended ? 'Status: Suspended' : `Last active: ${u.lastActive}`}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50 mt-4">
                <div>
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Stock Items</p>
                  <p className="text-xl font-black text-slate-800">{userStats.count}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1">Total Value</p>
                  <p className="text-xl font-black text-slate-800">${userStats.value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            onClick={() => setIsAddModalOpen(false)}
          />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden transform transition-all border border-white/20">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-bold text-slate-800">Add New User</h3>
                <p className="text-slate-500 text-sm mt-1">Configure profile and access credentials.</p>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-8 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="p-1 bg-slate-100 rounded-2xl flex">
                <button
                  type="button"
                  onClick={() => setNewUser({ ...newUser, type: 'Individual' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${newUser.type === 'Individual' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <UserIcon size={14} />
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setNewUser({ ...newUser, type: 'Company' })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black transition-all ${newUser.type === 'Company' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Building2 size={14} />
                  Company
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <UserIcon size={12} className="text-slate-400" />
                    {newUser.type === 'Company' ? 'Company Name' : 'Full Name'}
                  </label>
                  <input
                    autoFocus
                    required
                    type="text"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                    placeholder={newUser.type === 'Company' ? "e.g. Apex Dental Supplies" : "e.g. Dr. Jane Smith"}
                    value={newUser.name}
                    onChange={e => setNewUser({ ...newUser, name: e.target.value })}
                  />
                </div>

                {newUser.type === 'Company' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <UserIcon size={12} className="text-slate-400" />
                      Contact Name
                    </label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                      placeholder="e.g. Michael Scott"
                      value={newUser.contactName}
                      onChange={e => setNewUser({ ...newUser, contactName: e.target.value })}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <Mail size={12} className="text-slate-400" />
                      Email Address
                    </label>
                    <input
                      required
                      type="email"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                      placeholder="jane@clinic.com"
                      value={newUser.email}
                      onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <Phone size={12} className="text-slate-400" />
                      Phone
                    </label>
                    <input
                      required
                      type="tel"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                      placeholder="+1 234 567 890"
                      value={newUser.phone}
                      onChange={e => setNewUser({ ...newUser, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <Briefcase size={12} className="text-slate-400" />
                    Job Position
                  </label>
                  <select
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-slate-50/50"
                    value={newUser.jobPosition}
                    onChange={e => setNewUser({ ...newUser, jobPosition: e.target.value })}
                  >
                    {JOB_POSITIONS.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <Lock size={12} className="text-slate-400" />
                      Password
                    </label>
                    <input
                      required
                      type="password"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                      placeholder="••••••••"
                      value={newUser.password}
                      onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <Lock size={12} className="text-slate-400" />
                      Confirm
                    </label>
                    <input
                      required
                      type="password"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                      placeholder="••••••••"
                      value={newUser.confirmPassword}
                      onChange={e => setNewUser({ ...newUser, confirmPassword: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 px-4 py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3.5 rounded-2xl bg-blue-600 text-white font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 active:scale-95"
                >
                  Register User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            onClick={() => { setIsEditModalOpen(false); setEditingUser(null); }}
          />
          <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden transform transition-all border border-white/20">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-bold text-slate-800">Edit Profile</h3>
                <p className="text-slate-500 text-sm mt-1">Modify user information and clinic details.</p>
              </div>
              <button
                onClick={() => { setIsEditModalOpen(false); setEditingUser(null); }}
                className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-8 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <UserIcon size={12} className="text-slate-400" />
                    {editingUser.type === 'Company' ? 'Company Name' : 'Full Name'}
                  </label>
                  <input
                    required
                    type="text"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                    value={editingUser.name}
                    onChange={e => setEditingUser({ ...editingUser, name: e.target.value })}
                  />
                </div>

                {editingUser.type === 'Company' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <UserIcon size={12} className="text-slate-400" />
                      Contact Name
                    </label>
                    <input
                      required
                      type="text"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                      value={editingUser.contactName || ''}
                      onChange={e => setEditingUser({ ...editingUser, contactName: e.target.value })}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <Mail size={12} className="text-slate-400" />
                      Email Address
                    </label>
                    <input
                      required
                      type="email"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                      value={editingUser.email}
                      onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      <Phone size={12} className="text-slate-400" />
                      Phone
                    </label>
                    <input
                      required
                      type="tel"
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm bg-slate-50/50"
                      value={editingUser.phone}
                      onChange={e => setEditingUser({ ...editingUser, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-2">
                    <Briefcase size={12} className="text-slate-400" />
                    Job Position
                  </label>
                  <select
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all text-sm appearance-none bg-slate-50/50"
                    value={editingUser.jobPosition}
                    onChange={e => {
                      const pos = e.target.value;
                      setEditingUser({
                        ...editingUser,
                        jobPosition: pos,
                        role: pos === 'Administrator' ? 'Admin' :
                          pos === 'Dentist' ? 'Dentist' : 'Assistant'
                      });
                    }}
                  >
                    {JOB_POSITIONS.map(pos => (
                      <option key={pos} value={pos}>{pos}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-6 flex gap-4">
                <button
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setEditingUser(null); }}
                  className="flex-1 px-4 py-3.5 rounded-2xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3.5 rounded-2xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95"
                >
                  Update Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
