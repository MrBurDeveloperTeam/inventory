
import React, { useState, useMemo } from 'react';
import { 
  AlertCircle, 
  Bell, 
  Check, 
  Trash2, 
  Search, 
  Filter, 
  Package, 
  ShieldAlert, 
  Info, 
  CheckCircle2, 
  Building2, 
  Clock,
  MoreVertical,
  CheckCheck
} from 'lucide-react';
import { MockNotification } from './types';

interface NotificationsListProps {
  notifications: MockNotification[];
}

const NotificationsList: React.FC<NotificationsListProps> = ({ notifications: initialNotifications }) => {
  const [notifications, setNotifications] = useState<MockNotification[]>(initialNotifications);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical' | 'system'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           n.message.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (filter === 'unread') return matchesSearch && !n.isRead;
      if (filter === 'critical') return matchesSearch && n.type === 'critical';
      if (filter === 'system') return matchesSearch && n.category === 'system';
      return matchesSearch;
    });
  }, [notifications, filter, searchQuery]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getTypeIcon = (type: MockNotification['type']) => {
    switch (type) {
      case 'critical': return <ShieldAlert className="w-5 h-5" />;
      case 'warning': return <AlertCircle className="w-5 h-5" />;
      case 'success': return <CheckCircle2 className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  const getTypeStyles = (type: MockNotification['type']) => {
    switch (type) {
      case 'critical': return 'bg-rose-50 text-rose-600 border-rose-100';
      case 'warning': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'success': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      default: return 'bg-blue-50 text-blue-600 border-blue-100';
    }
  };

  return (
    <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-500 max-w-5xl mx-auto w-full">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-800 tracking-tight">System Alerts & Notifications</h2>
          <p className="text-xs text-slate-400 font-medium">Manage important updates, inventory thresholds, and system logs.</p>
        </div>
        
        {unreadCount > 0 && (
          <button 
            onClick={markAllAsRead}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-100 transition-all border border-blue-100"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          {[
            { id: 'all', label: 'All Alerts', icon: <Bell className="w-3.5 h-3.5" /> },
            { id: 'unread', label: 'Unread', icon: <div className="w-2 h-2 rounded-full bg-blue-500" /> },
            { id: 'critical', label: 'Critical', icon: <ShieldAlert className="w-3.5 h-3.5" /> },
            { id: 'system', label: 'System', icon: <Package className="w-3.5 h-3.5" /> },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setFilter(btn.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${filter === btn.id ? 'bg-slate-900 text-white shadow-lg shadow-slate-200' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              {btn.icon}
              {btn.label}
              {btn.id === 'unread' && unreadCount > 0 && (
                <span className="ml-1 bg-blue-500 text-white px-1.5 py-0.5 rounded-full text-[9px]">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search notifications..." 
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-500/10 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Notification List */}
      <div className="flex flex-col gap-3">
        {filteredNotifications.length > 0 ? filteredNotifications.map((n) => (
          <div 
            key={n.id} 
            className={`group bg-white rounded-2xl border transition-all flex flex-col md:flex-row items-start md:items-center gap-6 p-6 hover:shadow-md ${n.isRead ? 'border-slate-100 opacity-75' : 'border-blue-100 bg-blue-50/5 shadow-sm ring-1 ring-blue-500/5'}`}
          >
            {/* Status Dot */}
            {!n.isRead && (
              <div className="absolute top-6 left-2 w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            )}

            {/* Icon Container */}
            <div className={`p-3 rounded-2xl shrink-0 ${getTypeStyles(n.type)}`}>
              {getTypeIcon(n.type)}
            </div>

            {/* Content Body */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h4 className={`font-bold text-lg leading-tight transition-colors ${n.isRead ? 'text-slate-600' : 'text-slate-800'}`}>
                  {n.title}
                </h4>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${getTypeStyles(n.type)}`}>
                  {n.category}
                </span>
              </div>
              <p className={`text-sm leading-relaxed ${n.isRead ? 'text-slate-400' : 'text-slate-600'}`}>
                {n.message}
              </p>
              
              {/* Metadata Footer */}
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                  <Clock className="w-3 h-3" />
                  {n.time}
                </div>
                {n.clinicName && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                    <Building2 className="w-3 h-3" />
                    {n.clinicName}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 self-end md:self-center opacity-0 group-hover:opacity-100 transition-opacity">
              {!n.isRead && (
                <button 
                  onClick={() => markAsRead(n.id)}
                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-all border border-transparent hover:border-blue-100"
                  title="Mark as read"
                >
                  <Check className="w-5 h-5" />
                </button>
              )}
              <button 
                onClick={() => deleteNotification(n.id)}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-100"
                title="Dismiss"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )) : (
          <div className="py-24 flex flex-col items-center justify-center text-center bg-white rounded-[2rem] border border-dashed border-slate-200">
            <div className="bg-slate-50 p-6 rounded-full mb-4">
              <Bell className="w-12 h-12 text-slate-200" />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Clear Skies!</h3>
            <p className="text-slate-400 text-sm max-w-xs mt-2">No notifications found for this filter. You're all caught up with your clinic operations.</p>
            {filter !== 'all' && (
              <button 
                onClick={() => setFilter('all')}
                className="mt-6 text-blue-600 font-black uppercase text-[10px] tracking-widest hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationsList;
