import React, { useState, useRef, useEffect } from 'react';
import { UserProfile } from './types';
import { LogOut, Building2, ChevronRight, Camera, ChevronDown, Download } from 'lucide-react';
import { getWallet } from './services/getWallet';
import { api } from './services/api';

interface HeaderProps {
  onProfileClick?: () => void;
  onDashboardClick?: () => void;
  onLogout?: () => void;
  onAddCollaborator?: () => void;
  user?: UserProfile | null;
  userInitials?: string;
  userAvatarUrl?: string;
  availableInventories?: { id: string; name: string; role: string }[];
  currentInventoryId?: string | null;
  onSwitchInventory?: (id: string) => void;
}

const Header: React.FC<HeaderProps> = ({
  onProfileClick,
  onDashboardClick,
  onLogout,
  onAddCollaborator,
  user,
  userInitials = 'U',
  userAvatarUrl,
  availableInventories = [],
  currentInventoryId,
  onSwitchInventory
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inventoryRef = useRef<HTMLDivElement>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const checkStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    setIsStandalone(checkStandalone);

    // Detect iOS
    const checkIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(checkIOS);

    const handleBeforeInstallPrompt = (e: any) => {
      console.log('beforeinstallprompt event caught in Header');
      e.preventDefault();
      if (!checkStandalone) {
        setDeferredPrompt(e);
        setShowInstallBtn(true);
      }
    };

    const handleCustomPromptEvent = () => {
      console.log('Custom PWA prompt event received');
      if ((window as any).deferredInstallPrompt && !isStandalone) {
        setDeferredPrompt((window as any).deferredInstallPrompt);
        setShowInstallBtn(true);
      }
    };

    // Check if it already fired before mount
    if ((window as any).deferredInstallPrompt && !isStandalone) {
      handleCustomPromptEvent();
    }

    const handleAppInstalled = () => {
      console.log('App was installed');
      setShowInstallBtn(false);
      setDeferredPrompt(null);
      (window as any).deferredInstallPrompt = null;
    };

    console.log('Registering PWA listeners. Standalone:', isStandalone);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('pwa-prompt-available', handleCustomPromptEvent);

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (inventoryRef.current && !inventoryRef.current.contains(event.target as Node)) {
        setIsInventoryOpen(false);
      }
    };

    async function loadWallet() {
      try {
        console.log('Loading wallet for user:', user);
        const { data } = await api.get(`/api/snabbb/wallet?partner_id=${user.id}`);
        setBalance(data.snabbb_balance);
      } catch (err) {
        console.error(err);
      }
    }

    loadWallet();

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-prompt-available', handleCustomPromptEvent);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
    setShowInstallBtn(false);
  };

  const handleProfileClick = () => {
    setIsOpen(false);
    onProfileClick?.();
  };

  const handleAddCollaborator = () => {
    setIsOpen(false);
    onAddCollaborator?.();
  }

  const currentInventoryName = availableInventories.find(i => i.id === currentInventoryId)?.name || 'My Inventory';

  return (
    <header className="bg-white shadow-sm px-6 md:px-16 py-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 w-full z-50">
      {/* Logo and Inventory Switcher */}
      <div className="flex items-center gap-6">
        <div
          className="flex items-center cursor-pointer group"
          onClick={onDashboardClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onDashboardClick?.()}
        >
          <img
            src="/images/Snabbb-Teal.png"
            alt="SNABBB logo."
            className="h-10 w-auto transition-transform group-hover:scale-105"
          />
        </div>

      </div>


      <div className="flex items-center gap-4 relative" ref={dropdownRef}>
        {onProfileClick && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 group p-1 rounded-full outline-none"
            title="Account Profile"
          >
            {userAvatarUrl ? (
              <img
                src={userAvatarUrl}
                alt="Profile avatar"
                className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-100"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#004aad] flex items-center justify-center text-white font-black text-sm shadow-sm">
                {userInitials}
              </div>
            )}
          </button>
        )}

        {isOpen && (
          <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-100 font-sans">
            <div className="p-4">
              <h3 className="text-xs font-bold text-slate-700 tracking-wide mb-2">Accounts</h3>

              <button
                onClick={handleProfileClick}
                className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-colors group text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    {userAvatarUrl ? (
                      <img
                        src={userAvatarUrl}
                        alt="Profile"
                        className="w-12 h-12 rounded-full object-cover border border-slate-100"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#004aad] flex items-center justify-center text-white font-bold text-lg">
                        {userInitials}
                      </div>
                    )}
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 text-slate-400 group-hover:text-[#004aad] transition-colors">
                      <Camera size={10} strokeWidth={2.5} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-800 text-[15px] truncate">{user?.name || 'User'}</p>
                    <p className="text-[12px] text-slate-500 font-medium truncate">{user?.email}</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-500 transition-colors shrink-0" />
              </button>

              <div className="border-t border-slate-100 flex items-center h-10">
                <h3 className="text-xs font-bold text-slate-700 tracking-normal">Snabbb Credits: {balance ?? balance}</h3>
              </div>

              {availableInventories.length > 1 && (
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-700 tracking-wide mb-3">Switch Inventory</h3>
                  <div className="space-y-1">
                    {availableInventories.map((inv) => (
                      <button
                        key={inv.id}
                        onClick={() => {
                          onSwitchInventory?.(inv.id);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-sm font-medium border
                          ${currentInventoryId === inv.id
                            ? 'bg-blue-50 text-blue-600 border-blue-100'
                            : 'text-slate-600 hover:bg-slate-50 border-transparent hover:border-slate-100'
                          }
                        `}
                      >
                        <span className="truncate">{inv.name}</span>
                        {inv.role === 'owner' ? (
                          <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded ml-2 font-bold">OWNER</span>
                        ) : (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-2 font-bold uppercase">{inv.role}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-700 tracking-normal mb-3">Collaborator</h3>
                <button
                  onClick={handleAddCollaborator}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all font-semibold text-sm text-slate-700 shadow-sm"
                >
                  <Building2 size={16} />
                  <span>Add Collaborator</span>
                </button>
              </div>

              {showInstallBtn && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-700 tracking-normal mb-3">Add to Home Screen</h3>
                  <button
                    onClick={handleInstallClick}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#4d9678] hover:bg-[#3d8b6c] text-white rounded-xl transition-all font-bold text-sm shadow-sm"
                  >
                    <Download size={16} />
                    <span>Install App</span>
                  </button>
                </div>
              )}

              {isIOS && !isStandalone && (
                <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <h3 className="text-xs font-bold text-slate-700 tracking-normal mb-3">Install on iOS</h3>
                  <div className="bg-emerald-50 border border-emerald-100/50 rounded-xl p-3">
                    <div className="flex items-start gap-2 text-emerald-800">
                      <div className="mt-0.5 shrink-0">
                        <Download size={14} className="text-emerald-500" />
                      </div>
                      <p className="text-[11px] font-bold leading-relaxed">
                        Tap the <span className="bg-white px-1 py-0.5 rounded shadow-sm text-blue-600">Share</span> icon below and select <span className="underline decoration-emerald-200 decoration-2 underline-offset-2">"Add to Home Screen"</span> to install MR.BUR on your iPhone.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-slate-100">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-3 px-2 py-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-bold text-sm"
                >
                  <LogOut size={18} />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header >
  );
};

export default Header;
