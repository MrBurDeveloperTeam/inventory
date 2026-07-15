import React, { useState, useRef, useEffect, useCallback } from 'react';
import { UserProfile } from './types';
import { LogOut, Building2, ChevronRight, Camera, Download, Sun, Moon, PlayCircle } from 'lucide-react';
import { getWallet } from './services/getWallet';
import { supabase } from './supabaseClient';
import { PET_OPTIONS, getPetOption, normalizePetId, PetId } from './VirtualPet/petOptions';
import { creditApi, odooApi } from './services/api';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthFormData } from './types/AuthFormData';
import { useCreateAppLink } from './hooks/useCreateAppLink';
import { getAuthUser } from './src/utils/authStorage';

interface HeaderProps {
  onProfileClick?: () => void;
  onDashboardClick?: () => void;
  onLogout?: () => void;
  onAddCollaborator?: () => void;
  onWatchTutorial?: () => void;
  user?: UserProfile | null;
  userInitials?: string;
  userAvatarUrl?: string;
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
  userAvatarUrl,
  availableInventories = [],
  currentInventoryId,
  onSwitchInventory,
  theme = 'light',
  onSetTheme,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const authUser = getAuthUser();
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [selectedPetId, setSelectedPetId] = useState<PetId>(() => normalizePetId(localStorage.getItem('pet_name')));
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inventoryRef = useRef<HTMLDivElement>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const selectedPet = getPetOption(selectedPetId);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [authFormData, setAuthFormData] = useState<AuthFormData>(initialFormData);
  const [creditBalance, setCreditBalance] = useState<number | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [path, setPath] = useState(window.location.pathname);
  const { 
    mutateAsync: createAppLinks,
  } = useCreateAppLink();

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
        const info  = await odooApi.post('/web/session/get_session_info', {}).catch(err => {
          console.error('Session info error:', err);
        });
        const { data: sessionData } = info || {};
        const { data } = await creditApi.get(`/api/wallet?partner_id=${sessionData.result.partner_id}`);
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
        {/* Watch tutorial */}
        {onWatchTutorial && (
          <button
            onClick={onWatchTutorial}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 transition-colors shadow-sm"
            title="Watch tutorial"
            aria-label="Watch tutorial"
          >
            <PlayCircle size={16} />
          </button>
        )}
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
          <AnimatePresence>
                {isProfileMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="absolute right-0 mt-3 w-80 bg-white border border-slate-200 rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.12)] overflow-hidden"
                  >
                    {/* Profile Info */}
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">
                        Profile Info
                      </p>
                
                      <div className="flex flex-col gap-3">
                        <div>
                          <p className="text-base font-bold text-slate-900 truncate leading-tight">
                            {authFormData?.fullName}
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
                            <p className="text-xs font-semibold truncate">{authFormData?.email}</p>
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
                          const res = await createAppLinks({
                            app: 'reward',
                            email: authUser?.username,
                            name: authUser?.name,
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
                            {creditBalance !== null ? `${creditBalance} credits` : 'Loading...'}
                          </p>
                        </div>
                        <i className="fa-solid fa-chevron-right text-[10px] text-slate-300 group-hover:text-slate-400 transition-colors"></i>
                      </button>
                        
                      {/* My Channel */}
                      <button
                        onClick={async () => {
                          const res = await createAppLinks({
                            app: 'e-learning',
                            email: authUser?.username,
                            name: authUser?.name,
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
                        
                      {/* Settings */}
                      <button
                        onClick={() => navigate('/profile-settings')}
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
        )}
      </div>
    </header >
  );
};

export default Header;