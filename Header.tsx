import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UserProfile } from './types';
import { LogOut, Building2, ChevronRight, Camera, Download, Sun, Moon, PlayCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import { PET_OPTIONS, getPetOption, normalizePetId, PetId } from './VirtualPet/petOptions';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthFormData } from './types/AuthFormData';
import { useGetUserId } from './mutation/useGetUserId';
import { syncThemeFromOdoo } from './src/utils/themeSync';

interface HeaderProps {
  onProfileClick?: () => void;
  onDashboardClick?: () => void;
  onLogout?: () => void;
  onAddCollaborator?: () => void;
  onWatchTutorial?: () => void;
  user?: UserProfile | null;
  userInitials?: string;
  userAvatarUrl?: string|null;
  availableInventories?: { id: string; name: string; role: string }[];
  currentInventoryId?: string | null;
  onSwitchInventory?: (id: string) => void;
  theme?: string;
  onSetTheme?: (theme: string) => void;
}

const initialFormData: AuthFormData = {
  fullName: '',
  jobPosition: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
  agreedToTerms: false,
  country: '',
  partner_id: 0,
};

const Header: React.FC<HeaderProps> = ({
  onProfileClick,
  onDashboardClick,
  onLogout,
  onAddCollaborator,
  onWatchTutorial,
  user,
  userInitials = 'U',
  userAvatarUrl = null,
  availableInventories = [],
  currentInventoryId,
  onSwitchInventory,
  theme = 'light',
  onSetTheme,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<PetId>(() => normalizePetId(localStorage.getItem('pet_name')));
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inventoryRef = useRef<HTMLDivElement>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const selectedPet = getPetOption(selectedPetId);
  const [path, setPath] = useState(window.location.pathname);
  const [authFormData, setAuthFormData] = useState<AuthFormData>(initialFormData);
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isOpeningSupportTickets, setIsOpeningSupportTickets] = useState(false);
  const { mutateAsync: createAppLink, isPending } = useGetUserId();

  const openSupportTickets = useCallback(async () => {
    if (isOpeningSupportTickets) return;

    setIsOpen(false);
    setIsOpeningSupportTickets(true);

    try {
      const response = await fetch('/ticketing/sso', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.url) {
        throw new Error(data?.error || 'Unable to open the support portal.');
      }

      window.location.assign(data.url);
    } catch (error) {
      console.error('Ticketing SSO failed:', error);
      setIsOpeningSupportTickets(false);
    }
  }, [isOpeningSupportTickets]);

  useEffect(() => {
    console.log('userAvatarUrl: ',userAvatarUrl)
    setAvatarFailed(false);
  }, [userAvatarUrl]);

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

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('pwa-prompt-available', handleCustomPromptEvent);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const email = user?.email?.trim();

    if (!email) {
      setCreditBalance(null);
      setCreditError(null);
      setCreditLoading(false);
      return;
    }

    let cancelled = false;

    async function loadCreditBalance() {
      setCreditLoading(true);
      setCreditError(null);

      try {
        const response = await fetch(
          `/api/wallet?email=${encodeURIComponent(email)}`,
          {
            method: 'GET',
            credentials: 'include',
            headers: {
              Accept: 'application/json',
            },
          }
        );

        const data = await response.json().catch(() => null);

        if (!response.ok || !data?.ok) {
          throw new Error(
            data?.error ||
            'Unable to retrieve credit balance'
          );
        }

        const rawBalance =
          data?.data?.snabbb_balance ??
          data?.data?.balance ??
          data?.result?.snabbb_balance ??
          data?.result?.balance ??
          data?.snabbb_balance ??
          data?.balance;

        const parsedBalance = Number(rawBalance);

        if (!Number.isFinite(parsedBalance)) {
          throw new Error('Invalid credit balance');
        }

        if (!cancelled) {
          setCreditBalance(parsedBalance);
        }
      } catch (error) {
        console.error(
          'Failed to load Snabbb Credit:',
          error
        );

        if (!cancelled) {
          setCreditBalance(null);
          setCreditError('Unable to load balance');
        }
      } finally {
        if (!cancelled) {
          setCreditLoading(false);
        }
      }
    }

    void loadCreditBalance();

    return () => {
      cancelled = true;
    };
  }, [user?.email]);

  useEffect(() => {
    let isMounted = true;

    const loadPetSelection = async () => {
      const localPetId = normalizePetId(localStorage.getItem('pet_name'));
      if (isMounted) setSelectedPetId(localPetId);

      if (!user?.id) return;

      const { data, error } = await supabase
        .from('inventory_pet')
        .select('pet_name')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isMounted || error || !data) return;

      const petId = normalizePetId(data.pet_name);
      setSelectedPetId(petId);
      localStorage.setItem('pet_name', petId);
      window.dispatchEvent(new CustomEvent('virtual-pet-selection-change', { detail: petId }));
    };

    const handlePetSelectionChange = (event: Event) => {
      setSelectedPetId(normalizePetId((event as CustomEvent).detail));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'pet_name') {
        setSelectedPetId(normalizePetId(event.newValue));
      }
    };

    loadPetSelection();
    window.addEventListener('virtual-pet-selection-change', handlePetSelectionChange);
    window.addEventListener('storage', handleStorage);

    return () => {
      isMounted = false;
      window.removeEventListener('virtual-pet-selection-change', handlePetSelectionChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [user?.id]);

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

  const handleWatchTutorial = () => {
    setIsOpen(false);
    onWatchTutorial?.();
  }

    const navigate = useCallback((url: string) => {
    if (window.location.pathname !== url) {
      window.history.pushState({}, '', url);
    }
    setPath(url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const currentInventoryName = availableInventories.find(i => i.id === currentInventoryId)?.name || 'My Inventory';

  return (
    <header className={`shadow-sm px-6 md:px-16 py-4 flex flex-wrap items-center justify-between gap-4 border-b w-full z-50 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
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
        {/* Theme toggle */}
        {onSetTheme && (
          <button
            onClick={() => onSetTheme(theme === 'dark' ? 'light' : 'dark')}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors shadow-sm"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
        {onProfileClick && (
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 group p-1 rounded-full outline-none"
            title="Account Profile"
          >
            {userAvatarUrl  ? (
              <img
                src={userAvatarUrl}
                alt="Profile avatar"
                className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-100"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#004aad] flex items-center justify-center text-white font-black text-sm shadow-sm">
                {userInitials}
              </div>
            )}
          </button>
        )}

        <AnimatePresence>
        {isOpen && (
          // <div className={`absolute top-full right-0 mt-2 w-[400px] bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in zoom-in-95 duration-100 font-sans`}>
          //   <div className="p-4">
          //     <h3 className="text-xs font-bold text-slate-700 tracking-wide mb-2">Accounts</h3>

          //     <button
          //       onClick={handleProfileClick}
          //       className="w-full flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-colors group text-left"
          //     >
          //       <div className="flex items-center gap-3 min-w-0">
          //         <div className="relative">
          //           {userAvatarUrl ? (
          //             <img
          //               src={userAvatarUrl}
          //               alt="Profile"
          //               className="w-12 h-12 rounded-full object-cover border border-slate-100"
          //             />
          //           ) : (
          //             <div className="w-12 h-12 rounded-full bg-[#004aad] flex items-center justify-center text-white font-bold text-lg">
          //               {userInitials}
          //             </div>
          //           )}
          //           <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-sm border border-slate-100 text-slate-400 group-hover:text-[#004aad] transition-colors">
          //             <Camera size={10} strokeWidth={2.5} />
          //           </div>
          //         </div>
          //         <div className="flex-1 min-w-0">
          //           <p className="font-bold text-slate-800 text-[15px] truncate">{user?.name || 'User'}</p>
          //           <p className="text-[12px] text-slate-500 font-medium truncate">{user?.email}</p>
          //         </div>
          //       </div>
          //       <ChevronRight size={16} className="text-slate-500 group-hover:text-slate-500 transition-colors shrink-0" />
          //     </button>

              

          //     <div className="my-4 border-t border-slate-100">
          //       <h2>Snabbb Credits: {balance ?? "Loading..."}</h2>
          //     </div>

          //     {availableInventories.length > 1 && (
          //       <div className="pt-4 border-t border-slate-100">
          //         <h3 className="text-xs font-bold text-slate-700 tracking-wide mb-3">Switch Inventory</h3>
          //         <div className="space-y-1">
          //           {availableInventories.map((inv) => (
          //             <button
          //               key={inv.id}
          //               onClick={() => {
          //                 onSwitchInventory?.(inv.id);
          //                 setIsOpen(false);
          //               }}
          //               className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all text-sm font-medium border
          //                 ${currentInventoryId === inv.id
          //                   ? 'bg-blue-50 text-blue-600 border-blue-100'
          //                   : 'text-slate-600 hover:bg-slate-50 border-transparent hover:border-slate-100'
          //                 }
          //               `}
          //             >
          //               <span className="truncate">{inv.name}</span>
          //               {inv.role === 'owner' ? (
          //                 <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded ml-2 font-bold">OWNER</span>
          //               ) : (
          //                 <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-2 font-bold uppercase">{inv.role}</span>
          //               )}
          //             </button>
          //           ))}
          //         </div>
          //       </div>
          //     )}
          //     <div className="pt-4 border-t border-slate-100">
          //       <h3 className="text-xs font-bold text-slate-700 tracking-normal mb-3">Collaborator</h3>
          //       <button
          //         onClick={handleAddCollaborator}
          //         className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all font-semibold text-sm text-slate-700 shadow-sm"
          //       >
          //         <Building2 size={16} />
          //         <span>Add Collaborator</span>
          //       </button>
          //     </div>

          //     {onWatchTutorial && (
          //       <div className="pt-4 border-t border-slate-100">
          //         <h3 className="text-xs font-bold text-slate-700 tracking-normal mb-3">Help</h3>
          //         <button
          //           onClick={handleWatchTutorial}
          //           className="w-full flex items-center justify-center gap-2 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl transition-all font-semibold text-sm text-slate-700 shadow-sm"
          //         >
          //           <PlayCircle size={16} />
          //           <span>Watch Tutorial</span>
          //         </button>
          //       </div>
          //     )}

          //     {showInstallBtn && (
          //       <div className="mt-4 pt-4 border-t border-slate-100">
          //         <h3 className="text-xs font-bold text-slate-700 tracking-normal mb-3">Add to Home Screen</h3>
          //         <button
          //           onClick={handleInstallClick}
          //           className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#4d9678] hover:bg-[#3d8b6c] text-white rounded-xl transition-all font-bold text-sm shadow-sm"
          //         >
          //           <Download size={16} />
          //           <span>Install App</span>
          //         </button>
          //       </div>
          //     )}

          //     {isIOS && !isStandalone && (
          //       <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
          //         <h3 className="text-xs font-bold text-slate-700 tracking-normal mb-3">Install on iOS</h3>
          //         <div className="bg-emerald-50 border border-emerald-100/50 rounded-xl p-3">
          //           <div className="flex items-start gap-2 text-emerald-800">
          //             <div className="mt-0.5 shrink-0">
          //               <Download size={14} className="text-emerald-500" />
          //             </div>
          //             <p className="text-[11px] font-bold leading-relaxed">
          //               Tap the <span className="bg-white px-1 py-0.5 rounded shadow-sm text-blue-600">Share</span> icon below and select <span className="underline decoration-emerald-200 decoration-2 underline-offset-2">"Add to Home Screen"</span> to install MR.BUR on your iPhone.
          //             </p>
          //           </div>
          //         </div>
          //       </div>
          //     )}

          //     <div className="mt-4 pt-4 border-t border-slate-100">
          //       <button
          //         onClick={onLogout}
          //         className="w-full flex items-center gap-3 px-2 py-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all font-bold text-sm"
          //       >
          //         <LogOut size={18} />
          //         <span>Log out</span>
          //       </button>
          //     </div>
          //   </div>
          // </div>
          <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute top-full right-0 mt-3 w-80 bg-white border border-slate-200 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.12)] overflow-hidden"
                  >
                    {/* Profile Info */}
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                        Profile Info
                      </p>
                
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-base font-bold text-slate-900 truncate leading-tight">
                            {user?.name || 'User'}
                          </p>
                
                          {authFormData?.jobPosition && (
                            <div className="mt-1.5 inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[9px] font-black uppercase tracking-wider border border-blue-100/50">
                              {authFormData.jobPosition}
                            </div>
                          )}
                        </div>
                        
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-slate-500">
                            <i className="fa-regular fa-envelope text-[10px] w-3 text-center"></i>
                            <p className="text-xs font-semibold truncate">{user?.email}</p>
                          </div>
                        
                          {authFormData?.phone && (
                            <div className="flex items-center gap-2 text-slate-500">
                              <i className="fa-solid fa-phone text-[10px] w-3 text-center"></i>
                              <p className="text-xs font-semibold truncate">{authFormData?.phone}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                        
                    {/* Nav Items */}
                    <div className="p-2 border-b border-slate-100">
                      {/* Snabbb Credit */}
                      <button
                        onClick={async () => {
                          const res = await createAppLink({
                            app: 'reward',
                            email: user?.email,
                            name: user?.name,
                          });
                          
                          const supabaseUserId = res.result?.supabase_user_id;
                          const w = window.open('', '_blank');
                          if (supabaseUserId && w) {
                            w.location.href = `https://reward.snabbb.com`;
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 rounded-2xl transition-all group text-left"
                      >
                        <div className="w-7 h-7 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-wallet text-[11px] text-violet-500"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 leading-tight">Snabbb Credit</p>
                          <p className="text-[11px] font-semibold text-slate-400 truncate">
                            {creditLoading
                              ? 'Loading...'
                              : creditError
                                ? creditError
                                : creditBalance !== null
                                  ? `${creditBalance} credits`
                                  : 'Balance unavailable'}
                          </p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-slate-400 transition-colors"></i>
                      </button>
                        
                      {/* My Channel */}
                      <button
                        onClick={async () => {
                          const res = await createAppLink({
                            app: 'e-learning',
                            email: user?.email,
                            name: user?.name,
                          });
                          
                          const supabaseUserId = res.result?.supabase_user_id;
                          const w = window.open('', '_blank');
                          if (supabaseUserId && w) {
                            w.location.href = `https://e-learning.snabbb.com/channel/${supabaseUserId}`;
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 rounded-2xl transition-all group text-left"
                      >
                        <div className="w-7 h-7 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-tv text-[11px] text-sky-500"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 leading-tight">My Channel</p>
                          <p className="text-[11px] font-semibold text-slate-400 truncate">Manage your channel</p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-slate-400 transition-colors"></i>
                      </button>

                      {/* Support Tickets */}
                      <button
                        type="button"
                        disabled={isOpeningSupportTickets}
                        onClick={openSupportTickets}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 rounded-2xl transition-all group text-left disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-life-ring text-[11px] text-blue-500" aria-hidden="true"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 leading-tight">Support Tickets</p>
                          <p className="text-[11px] font-semibold text-slate-400 truncate">Create and track your support tickets</p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-slate-400 transition-colors" aria-hidden="true"></i>
                      </button>
                        
                      {/* Settings */}
                      <button
                        onClick={async () => {
                          const res = await createAppLink({
                            app: 'snabbb',
                            email: user?.email,
                            name: user?.name,
                          });
                          
                          const supabaseUserId = res.result?.supabase_user_id;
                          const w = window.open('', '_blank');
                          if (supabaseUserId && w) {
                            w.location.href = `https://app.snabbb.com/profile-settings`;
                          }
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 rounded-2xl transition-all group text-left"
                      >
                        <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-gear text-[11px] text-slate-500"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 leading-tight">Settings</p>
                          <p className="text-[11px] font-semibold text-slate-400 truncate">Account & preferences</p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-slate-400 transition-colors"></i>
                      </button>
                    </div>
                        
                    {/* Log Out */}
                    <div className="p-2">
                      <button
                        onClick={onLogout}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-bold text-rose-500 hover:bg-rose-50 rounded-2xl transition-all group text-left"
                      >
                        <i className="fa-solid fa-arrow-right-from-bracket w-5"></i>
                        Log Out
                      </button>
                    </div>
                  </motion.div>
        )}
        </AnimatePresence>
      </div>
    </header >
  );
};

export default Header;
