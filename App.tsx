import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Room, Item, ActivityLog, PurchaseHistory, UserProfile, ItemBatch, CatPosition, ChatHistory, UOM, TBA_ROOM_ID, TBA_ROOM_NAME } from './types';
import { PRESET_BLUEPRINTS } from './constants';
import MasterInventory from './MasterInventory';
import Header from './Header';
import ClinicMap from './ClinicMap';
import RoomModal from './RoomModal';
import LandingModal from './LandingModal';
import TutorialVideoModal from './TutorialVideoModal';
import ProfilePage from './ProfilePage';
import AdminDashboard from './AdminDashboard';
import CollaboratorModal from './CollaboratorModal';
import { VirtualPetContainer } from './VirtualPet/VirtualPetContainer';
import CatMascot from './components/CatMascot';
import MolarAIFloat from './components/MolarAIFloat';
import {
  readStoredTheme,
  writeThemeCookie,
  writeStoredTheme,
  applyThemeToDocument,
  syncThemeFromOdoo,
  pushThemeToOdoo,
  readThemeCookie,
  parseTheme,
} from './src/utils/themeSync';
import { chatWithGemini } from './services/geminiService';
import { supabase } from './supabaseClient';
import { api } from './services/api';
import { logActivityToOdoo } from './services/logActivityToOdoo';
import PromoBanner from './component/PromoBanner';
import { usePromotions } from './hooks/usePromotions';
import { jwtDecode } from 'jwt-decode';
import {
  ARCHIVED_LOCATION_LABEL,
  isPurchaseHistoryForItem,
  markItemPurchaseHistoryArchived,
  markRoomPurchaseHistoryArchived
} from './src/utils/roomDeletion';

type ManagedInventory = {
  userId: string;
  rooms: Room[];
  history: PurchaseHistory[];
  logs: ActivityLog[];
  blueprint?: string | null;
  catPosition?: CatPosition | null;
};

type ProfileRow = {
  user_id: string;
  email: string;
  name: string | null;
  account_type: string | null;
  phone?: string | null;
  position?: string | null;
  company_name?: string | null;
  avatar_url?: string | null;
  background_url?: string | null;
  segments?: string[] | null;
};

const PROFILE_IMAGE_STORAGE_PREFIX = 'denta_profile_images_';
const PROFILE_IMAGE_BUCKET = 'profile-media';
const PREFERRED_INVENTORY_ID_KEY = 'denta_preferred_inventory_id_';
const TUTORIAL_VIDEO_SEEN_KEY_PREFIX = 'denta_tutorial_video_seen_';

const hasSeenTutorialVideo = (userId: string) => {
  try {
    return localStorage.getItem(`${TUTORIAL_VIDEO_SEEN_KEY_PREFIX}${userId}`) === 'true';
  } catch (err) {
    console.error('Failed to read tutorial video flag', err);
    return false;
  }
};

const markTutorialVideoSeen = (userId: string) => {
  try {
    localStorage.setItem(`${TUTORIAL_VIDEO_SEEN_KEY_PREFIX}${userId}`, 'true');
  } catch (err) {
    console.error('Failed to persist tutorial video flag', err);
  }
};

const loadUserImages = (userId: string) => {
  try {
    const raw = localStorage.getItem(`${PROFILE_IMAGE_STORAGE_PREFIX}${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return {
      avatarUrl: parsed.avatarUrl || undefined,
      backgroundUrl: parsed.backgroundUrl || undefined
    };
  } catch (err) {
    console.error('Failed to load profile images', err);
    return {};
  }
};

const persistUserImages = (userId: string, images: { avatarUrl?: string; backgroundUrl?: string }) => {
  try {
    const payload = {
      avatarUrl: images.avatarUrl || null,
      backgroundUrl: images.backgroundUrl || null
    };
    localStorage.setItem(`${PROFILE_IMAGE_STORAGE_PREFIX}${userId}`, JSON.stringify(payload));
  } catch (err) {
    console.error('Failed to save profile images', err);
  }
};

const uploadProfileImage = async (file: File, userId: string, type: 'avatar' | 'background') => {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `profiles/${userId}/${type}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(PROFILE_IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

const generateId = () => {
  try {
    return window.crypto.randomUUID();
  } catch (e) {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
};

const summarizeBatches = (batches: ItemBatch[]) => {
  const totalQty = batches.reduce((sum, b) => sum + b.qty, 0);
  const totalValue = batches.reduce((sum, b) => sum + (b.qty * b.unitPrice), 0);
  const avgPrice = totalQty > 0 ? totalValue / totalQty : 0;
  const expiryTimes = batches
    .map(b => b.expiryDate ? new Date(b.expiryDate).getTime() : null)
    .filter((v): v is number => v !== null);
  const earliestExpiry = expiryTimes.length ? new Date(Math.min(...expiryTimes)).toISOString().split('T')[0] : null;
  return { totalQty, avgPrice, earliestExpiry };
};

const ensureBatches = (item: Item): Item => {
  const baseBatches = item.batches && item.batches.length > 0
    ? item.batches.map(b => ({ ...b }))
    : [{
      id: generateId(),
      qty: item.quantity,
      unitPrice: item.price,
      expiryDate: item.expiryDate || null
    }];
  const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(baseBatches);
  return {
    ...item,
    batches: baseBatches,
    quantity: totalQty,
    price: avgPrice,
    expiryDate: earliestExpiry
  };
};

const normalizeRooms = (rooms: Room[]) => rooms.map(room => ({
  ...room,
  items: room.items.map(ensureBatches)
}));

const mergeBatchAdd = (item: Item, qty: number, price: number, expiry?: string) => {
  const normalized = ensureBatches(item);
  const batches = normalized.batches ? [...normalized.batches] : [];
  const key = expiry || null;
  const idx = batches.findIndex(b => (b.expiryDate || null) === key);
  if (idx >= 0) {
    const b = batches[idx];
    const newQty = b.qty + qty;
    const newPrice = newQty > 0 ? ((b.qty * b.unitPrice) + (qty * price)) / newQty : price;
    batches[idx] = { ...b, qty: newQty, unitPrice: newPrice, expiryDate: key };
  } else {
    batches.push({ id: generateId(), qty, unitPrice: price, expiryDate: key });
  }
  const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(batches);
  return { ...normalized, batches, quantity: totalQty, price: avgPrice, expiryDate: earliestExpiry };
};

const adjustBatchesWithDelta = (item: Item, delta: number) => {
  const normalized = ensureBatches(item);
  let batches = normalized.batches ? normalized.batches.map(b => ({ ...b })) : [];
  if (delta > 0) {
    if (batches.length === 0) batches.push({ id: generateId(), qty: 0, unitPrice: normalized.price, expiryDate: normalized.expiryDate || null });
    batches[0].qty += delta;
  } else if (delta < 0) {
    let remaining = Math.abs(delta);
    for (let i = batches.length - 1; i >= 0 && remaining > 0; i--) {
      const take = Math.min(batches[i].qty, remaining);
      batches[i].qty -= take;
      remaining -= take;
    }
    batches = batches.filter(b => b.qty > 0);
  }
  const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(batches);
  return { ...normalized, batches, quantity: totalQty, price: avgPrice, expiryDate: earliestExpiry };
};

const App: React.FC = () => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isCollaboratorModalOpen, setIsCollaboratorModalOpen] = useState(false);
  const [showTutorialVideo, setShowTutorialVideo] = useState(false);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [blueprint, setBlueprint] = useState<string | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isBootstrapped, setIsBootstrapped] = useState<boolean>(false);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [theUser, setTheUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [managedProfiles, setManagedProfiles] = useState<ProfileRow[]>([]);
  const [managedInventories, setManagedInventories] = useState<ManagedInventory[]>([]);
  const [adminDataLoading, setAdminDataLoading] = useState<boolean>(false);
  const [adminDataError, setAdminDataError] = useState<string | null>(null);
  const [finalProfile, setFinalProfile] = useState<ProfileRow | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'profile'>('dashboard');

  const [isLocked, setIsLocked] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [pendingRoomDeleteId, setPendingRoomDeleteId] = useState<string | null>(null);
  const [deleteRoomTransferTargetId, setDeleteRoomTransferTargetId] = useState('');
  const [catPosition, setCatPosition] = useState<CatPosition>({ x: 20, y: 20 });
  const isHydrated = useRef(false);
  const syncInFlight = useRef(false);
  const [isLoadingMain, setIsLoadingMain] = useState(true);
  const [isReloading, setIsReloading] = useState(false);
  const lastLocalMutation = useRef(0);
  const isDirty = useRef(false);
  const lastLoadRequestId = useRef(0);
  const metaSyncTimer = useRef<number | null>(null);
  /** Ref always holding the latest TBA virtual room — survives loadInventory resets. */
  const tbaRoomRef = useRef<Room | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'error'>('synced');
  const [authReady, setAuthReady] = useState(false);
  const [authInitializing, setAuthInitializing] = useState(true);

  // Keep tbaRoomRef always up-to-date so loadInventory can read it synchronously
  useEffect(() => {
    const tba = rooms.find(r => r.id === TBA_ROOM_ID) ?? null;
    tbaRoomRef.current = tba && tba.items.length > 0 ? tba : null;
  }, [rooms]);

  // ─── Theme state — hybrid: cookie (instant) + Odoo (cross-device) ───────────
  const [theme, setThemeState] = useState<string>(() => readStoredTheme() || 'light');

  // Apply theme to DOM whenever it changes
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  // Sync from Odoo on mount (cross-device)
  useEffect(() => {
    syncThemeFromOdoo((odooTheme) => {
      setThemeState(odooTheme);
    });
  }, []);

  // 1s cookie poll — catches gallery/appointment changing theme on same browser
  useEffect(() => {
    let lastCookie = readThemeCookie();
    const interval = window.setInterval(() => {
      const current = readThemeCookie();
      if (current && current !== lastCookie) {
        lastCookie = current;
        setThemeState(current);
      }
    }, 1000);

    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'theme') return;
      const next = parseTheme(e.newValue);
      if (next) setThemeState(next);
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // Sync Odoo on auth completion
  useEffect(() => {
    if (isAuthenticated) {
      syncThemeFromOdoo((odooTheme) => setThemeState(odooTheme));
    }
  }, [isAuthenticated]);

  const handleSetTheme = (newTheme: string) => {
    const valid = new Set(['light', 'dark', 'system']);
    const t = valid.has(newTheme) ? newTheme : 'light';
    setThemeState(t);
    writeThemeCookie(t);
    writeStoredTheme(t);
    pushThemeToOdoo(t); // fire and forget
  };

  // Virtual Pet State
  const [isVirtualPetOpen, setIsVirtualPetOpen] = useState(false);

  // Global Chat State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatAudioRef = useRef<HTMLAudioElement | null>(null);
  const handleClearChat = () => setChatHistory([]);

  //promotions
  const role = finalProfile?.position || 'staff';
  const segments = finalProfile?.segments || [];

  const { promotions } = usePromotions('inventory', role, segments);

  const bannerPromos = promotions.filter((p) => p.placement === 'banner');

useEffect(() => {
  let cancelled = false;

  (async () => {
    try {
      // audio init
      const baseUrl = import.meta.env.BASE_URL || "/";
      const audioPath = `${baseUrl.endsWith("/") ? baseUrl : baseUrl + "/"}images/cat-meow.mp3`.replace(/\/+/g, "/");
      chatAudioRef.current = new Audio(audioPath);

      // 1) try SSO -> setSession (may fail, that's ok)
      await checkSession();

      // 2) read session after SSO exchange attempt
      const { data } = await supabase.auth.getSession();

      if (cancelled) return;

      if (data.session?.user) {
        await bootstrapUser(data.session.user);
      } else {
        setBlueprint(PRESET_BLUEPRINTS[0].url);
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.error("Auth boot failed:", e);
      setIsAuthenticated(false);
      setBlueprint(PRESET_BLUEPRINTS[0].url);
    } finally {
      if (!cancelled) setAuthInitializing(false);
    }
  })();

  return () => {
    cancelled = true;
  };
}, []);

useEffect(() => {
  if (!authReady) return;            // ✅ block until checkSession done

  const fetchSession = async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) await bootstrapUser(data.session.user);
    else setBlueprint(PRESET_BLUEPRINTS[0].url);
  };

  fetchSession();
}, [authReady]);

  const checkSession = async () => {
    try{
      const sso = await api.get('/sso/exchange');
      await supabase.auth.setSession({
        access_token: sso.data.access_token,
        refresh_token: sso.data.refresh_token
      });
      // Decode the token (no verification)
      const decoded_token = jwtDecode(sso.data.access_token);

      // Extract the user or partner ID from the 'sub' field
      const user_id = decoded_token.sub;

      console.log(`User ID: ${user_id}`)
    } catch (err) {
      await supabase.auth.signOut();
      console.error('SSO exchange failed:', err);
    }
  };

  const playMeowChat = () => {
    if (chatAudioRef.current) {
      chatAudioRef.current.currentTime = 0;
      chatAudioRef.current.play().catch(err => console.log("Audio blocked:", err));
    }
  };

  useEffect(() => {
    if (isChatOpen && chatHistory.length > 0 && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [chatHistory, isChatOpen]);

  const getPredefinedChatResponse = async (message: string): Promise<string | null> => {
    const normalizedMessage = message.toLowerCase();

    const { data: targetApps, error: targetAppsError } = await supabase
      .from('aiboard_response_target_apps')
      .select('response_id')
      .in('app_name', ['Inventory', 'All']);

    if (targetAppsError) {
      console.error('Failed to fetch response target apps:', targetAppsError);
      return null;
    }

    const responseIds = [...new Set((targetApps || []).map((app: any) => app.response_id).filter(Boolean))];
    if (responseIds.length === 0) return null;

    const { data: keywords, error: keywordsError } = await supabase
      .from('aiboard_response_keywords')
      .select('keyword, response_id')
      .in('response_id', responseIds);

    if (keywordsError) {
      console.error('Failed to fetch response keywords:', keywordsError);
      return null;
    }

    const matchedKeyword = (keywords || [])
      .filter((item: any) => item.keyword && normalizedMessage.includes(String(item.keyword).toLowerCase()))
      .sort((a: any, b: any) => String(b.keyword).length - String(a.keyword).length)[0];

    if (!matchedKeyword?.response_id) return null;

    const { data: responseData, error: responseError } = await supabase
      .from('aiboard_responses')
      .select('response')
      .eq('id', matchedKeyword.response_id)
      .maybeSingle();

    if (responseError) {
      console.error('Failed to fetch predefined response:', responseError);
      return null;
    }

    return responseData?.response || null;
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!chatInput.trim() || isChatLoading) return;

    const userMsg = chatInput;
    setChatInput("");

    const newHistory: ChatHistory[] = [
      ...chatHistory,
      { role: "user", parts: [{ text: userMsg }] }
    ];
    setChatHistory(newHistory);
    setIsChatLoading(true);

    try {
      const simpleInventory = rooms.map(r => ({
        id: r.id,
        room: r.name,
        items: r.items.map(i => ({
          name: i.name,
          brand: i.brand,
          code: i.code,
          category: i.category,
          uom: i.uom,
          totalQty: i.quantity,
          avgPrice: i.price,
          location: r.name,
          batches: i.batches?.map(b => ({
            qty: b.qty,
            unitPrice: b.unitPrice,
            expiryDate: b.expiryDate
          }))
        }))
      }));

      // Prepare purchase history (last 100 records for performance)
      const recentPurchases = history.slice(0, 100).map(h => ({
        date: h.timestamp,
        product: h.productName,
        brand: h.brand,
        vendor: h.vendor,
        qty: h.qty,
        unitPrice: h.unitPrice,
        total: h.totalPrice,
        location: h.location,
        category: h.category
      }));

      // Prepare activity logs (last 100 records for performance)
      const recentLogs = logs.slice(0, 100).map(l => ({
        date: l.timestamp,
        room: l.roomName,
        action: l.action,
        details: l.details,
        actor: l.actorName
      }));

      const contextStr = JSON.stringify(simpleInventory);
      const purchaseHistoryStr = recentPurchases.length ? JSON.stringify(recentPurchases) : undefined;
      const activityLogsStr = recentLogs.length ? JSON.stringify(recentLogs) : undefined;

      const response = await getPredefinedChatResponse(userMsg)
        || await chatWithGemini(chatHistory, userMsg, contextStr, purchaseHistoryStr, activityLogsStr);

      let finalResponseText = response;
      const actionMatch = response.match(/<ACTION>(.*?)<\/ACTION>/);

      if (actionMatch && actionMatch[1]) {
        try {
          const actionData = JSON.parse(actionMatch[1]);
          if (actionData.type === 'receive') {
            receiveStock(
              actionData.roomId,
              {
                name: actionData.itemName,
                brand: actionData.brand || '',
                code: actionData.code || '',
                uom: (actionData.uom || 'pcs').toLowerCase() as any,
                vendor: actionData.vendor || '',
                category: (actionData.category || 'consumables').toLowerCase() as any
              },
              actionData.qty,
              actionData.price,
              new Date().toISOString().split('T')[0],
              actionData.expiry,
              actionData.createNewBatch
            );
          } else if (actionData.type === 'remove') {
            removeStock(
              actionData.roomId,
              actionData.itemName,
              actionData.brand,
              actionData.qty,
              actionData.expiry
            );
          } else if (actionData.type === 'transfer') {
            const fromRoom = rooms.find(r => r.id === actionData.fromRoomId || r.name === (actionData.fromRoomName || actionData.fromRoom));
            const toRoom = rooms.find(r => r.id === actionData.toRoomId || r.name === (actionData.toRoomName || actionData.toRoom));
            if (fromRoom && toRoom) {
              const item = fromRoom.items.find(i => 
                i.name.toLowerCase() === actionData.itemName.toLowerCase() &&
                (actionData.brand ? i.brand.toLowerCase() === actionData.brand.toLowerCase() : true)
              );
              if (item) {
                moveItem(fromRoom.id, toRoom.id, item.id, actionData.qty);
              }
            }
          }
          finalResponseText = response.replace(/<ACTION>.*?<\/ACTION>/s, '').trim();
        } catch (err) {
          console.error('Failed to parse AI action:', err);
        }
      }

      setChatHistory(prev => [
        ...prev,
        { role: "model", parts: [{ text: finalResponseText }] }
      ]);
      // playMeowChat();
    } catch (err) {
      console.error(err);
      setChatHistory([
        ...newHistory,
        { role: "model", parts: [{ text: "I'm having trouble processing your request at the moment. Please try again shortly." }] }
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // Sharing Logic
  const [currentInventoryOwnerId, setCurrentInventoryOwnerId] = useState<string | null>(null);

  // Persist inventory selection to localStorage whenever it changes
  useEffect(() => {
    if (supabaseUserId && currentInventoryOwnerId) {
      localStorage.setItem(`${PREFERRED_INVENTORY_ID_KEY}${supabaseUserId}`, currentInventoryOwnerId);
    }
  }, [currentInventoryOwnerId, supabaseUserId]);
  const [availableInventories, setAvailableInventories] = useState<{ id: string; name: string; role: string }[]>([]);

  const fetchAvailableInventories = async (uid: string) => {
    // 1. Own Inventory
    const list: { id: string; name: string; role: string }[] = [{ id: uid, name: 'My Inventory', role: 'owner' }];

    // 2. Shared Inventories - get collaborator records
    // const shared = await api.get<any>('/collaborators', { params: { uid: uid } }).catch(async err => {
      const { data: shared, error } = await supabase
        .from('collaborators')
        .select('owner_id, role')
        .eq('user_id', uid);

        if (error) {
          console.error('Error fetching shared inventories:', error);
        }
        // return shared as any
      // }
      // );
      
      if (shared && shared.length > 0) {
      // Fetch owner profiles separately to avoid FK join issues
      const ownerIds = shared.map((s: any) => s.owner_id);
      const { data: ownerProfiles } = await supabase
        .from('profiles')
        .select('user_id, email, name')
        .in('user_id', ownerIds);

      const profileMap = new Map<string, any>();
      (ownerProfiles || []).forEach((p: any) => profileMap.set(p.user_id, p));

      shared.forEach((s: any) => {
        const ownerProfile = profileMap.get(s.owner_id);
        const ownerName = ownerProfile?.name || ownerProfile?.email || 'Unknown';
        list.push({
          id: s.owner_id,
          name: `${ownerName}'s Inventory`,
          role: s.role
        });
      });
    }


    setAvailableInventories(list);
    // Determine which ID to use. If currentInventoryOwnerId is already set and valid, keep it. Otherwise default to own.
    setCurrentInventoryOwnerId(prev => {
      const storedId = uid ? localStorage.getItem(`${PREFERRED_INVENTORY_ID_KEY}${uid}`) : null;
      const targetId = prev || storedId || uid;
      const stillValid = list.find(i => i.id === targetId);
      const nextId = stillValid ? targetId : uid;

      if (nextId !== prev) {
        console.log('Switching inventory to:', nextId, '(from:', prev, ') resetting hydration');
        isHydrated.current = false;
        isDirty.current = false;
        setIsLoadingMain(true);
        setRooms([]); // Clear local state for new inventory
      }
      return nextId;
    });
  };


  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // bootstrapUser(session.user);
      } else {
        setIsAuthenticated(false);
        setSupabaseUserId(null);
        setIsAdmin(false);
        setManagedProfiles([]);
        setManagedInventories([]);
        setAdminDataError(null);
        setUser(null);
        setRooms([]);
        setHistory([]);
        setLogs([]);
        setBlueprint(PRESET_BLUEPRINTS[0].url);
      }
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  // Invitation Logic
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('invite_token');
    if (token) {
      setPendingInviteToken(token);
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const checkInvite = async () => {
      if (pendingInviteToken && user) {
        // Accept invitation
        const { data: invite, error } = await supabase
          .from('invitations')
          .select('*')
          .eq('token', pendingInviteToken)
          .single();

        if (error || !invite) {
          // Silent fail or alert if needed
          console.error('Invalid invitation');
          setPendingInviteToken(null);
          return;
        }

        if (invite.status !== 'pending') {
          alert('This invitation has already been used.');
          setPendingInviteToken(null);
          return;
        }

        // Create collaborator record
        const { error: collabError } = await supabase
          .from('collaborators')
          .insert({
            owner_id: invite.owner_id,
            user_id: user.id,
            role: invite.role
          });

        if (collabError) {
          if (!collabError.message.includes('duplicate key')) {
            console.error('Error accepting invite:', collabError);
            return;
          }
        }

        // Update invitation status
        await supabase
          .from('invitations')
          .update({ status: 'accepted' })
          .eq('id', invite.id);

        alert(`Invitation accepted! You are now a ${invite.role} for this inventory.`);
        setPendingInviteToken(null);
        // Refresh or switch context could happen here (future task)
      } else if (pendingInviteToken && !user && !isAuthenticated) {
        // User not logged in, prompt them
        // The LandingModal will naturally show up.
        // We can optionally show a message or banner.
        console.log('User needs to login to accept invite');
      }
    };
    checkInvite();
  }, [pendingInviteToken, user]);

  const fetchAdminData = async (force = false) => {
    if (!force && !isAdmin) return;
    setAdminDataLoading(true);
    setAdminDataError(null);
    try {
      const { data: profiles, error: profileError } = await supabase.from('profiles').select('*');
      if (profileError) {
        console.error('Admin profiles fetch error', profileError);
        setAdminDataError('Failed to load profiles. Please retry.');
      } else {
        setManagedProfiles(profiles || []);
      }

      const { data: meta } = await supabase.from('inventory_meta').select('*');
      const { data: roomsData } = await supabase
        .from('inventory_rooms')
        .select('id, user_id, name, pos_x, pos_y, items:inventory_items(*, item_batches:inventory_item_batches(*))');
      const { data: historyData } = await supabase.from('inventory_purchase_history').select('*');
      const { data: logData } = await supabase.from('inventory_activity_logs').select('*');

      const metaByUser = new Map<string, any>((meta || []).map((m: any) => [m.user_id, m]));
      const roomsByUser = new Map<string, Room[]>();
      (roomsData || []).forEach((r: any) => {
        const items: Item[] = (r.items || []).map((it: any) =>
          ensureBatches({
            id: it.id,
            name: it.name || '',
            brand: it.brand || '',
            code: it.code || '',
            quantity: Number(it.quantity) || 0,
            uom: it.uom || 'pcs',
            price: Number(it.price) || 0,
            vendor: it.vendor || '',
            category: (it.category as any) || 'other',
            description: it.description || '',
            expiryDate: it.expiry_date || null,
            batches: (it.item_batches || []).map((b: any) => ({
              qty: Number(b.qty) || 0,
              unitPrice: Number(b.unit_price) || 0,
              expiryDate: b.expiry_date || null
            }))
          })
        );
        const arr = roomsByUser.get(r.user_id) || [];
        arr.push({ id: r.id, name: r.name, x: Number(r.pos_x) || 0, y: Number(r.pos_y) || 0, items });
        roomsByUser.set(r.user_id, arr);
      });

      const historyByUser = new Map<string, PurchaseHistory[]>();
      (historyData || []).forEach((h: any) => {
        const arr = historyByUser.get(h.user_id) || [];
        arr.push({
          id: h.id,
          timestamp: h.occurred_at || h.created_at,
          productName: h.product_name || '',
          brand: h.brand || '',
          code: h.code || '',
          vendor: h.vendor || '',
          qty: Number(h.qty) || 0,
          unitPrice: Number(h.unit_price) || 0,
          totalPrice: h.total_price !== undefined && h.total_price !== null ? Number(h.total_price) : (Number(h.qty) || 0) * (Number(h.unit_price) || 0),
          location: h.location || '',
          category: h.category || 'other',
          roomId: h.room_id || '',
          uom: h.uom || 'pcs',
          expiryDate: h.expiry_date || null,
          description: h.description || ''
        });
        historyByUser.set(h.user_id, arr);
      });

      const logsByUser = new Map<string, ActivityLog[]>();
      (logData || []).forEach((l: any) => {
        const arr = logsByUser.get(l.user_id) || [];
        arr.push({
          id: l.id,
          timestamp: l.created_at,
          roomId: l.room_id || '',
          roomName: l.room_name || '',
          action: l.action,
          details: l.details
        });
        logsByUser.set(l.user_id, arr);
      });

      const allActiveUserIds = new Set([
        ...Array.from(metaByUser.keys()),
        ...Array.from(roomsByUser.keys()),
        ...Array.from(historyByUser.keys()),
        ...Array.from(logsByUser.keys())
      ]);

      const prepared: ManagedInventory[] = Array.from(allActiveUserIds).map(userId => {
        const metaRow = metaByUser.get(userId);
        return {
          userId,
          rooms: roomsByUser.get(userId) || [],
          history: historyByUser.get(userId) || [],
          logs: logsByUser.get(userId) || [],
          blueprint: metaRow?.blueprint || PRESET_BLUEPRINTS[0].url,
          catPosition: {
            x: metaRow?.cat_position_x !== undefined ? Number(metaRow.cat_position_x) : 20,
            y: metaRow?.cat_position_y !== undefined ? Number(metaRow.cat_position_y) : 20
          }
        };
      });

      setManagedInventories(prepared);
    } finally {
      setAdminDataLoading(false);
    }
  };

  const bootstrapUser = async (sbUser: any) => {
    setIsBootstrapped(false);
    const userId = sbUser.id;
    console.log('Bootstrapping user:', userId);
    setSupabaseUserId(userId);
    const { data: { user } } = await supabase.auth.getUser();
    setTheUser(user);

    const { data: prof, error: profError } = await supabase
       .from('profiles')
       .select('*')
       .eq('user_id', userId)
       .order('updated_at', { ascending: false })
       .limit(1)
       .maybeSingle();

    if (profError && profError.code !== 'PGRST116') {
      console.error('Profile fetch error', profError);
    }
    setFinalProfile(prof);

    // Tutorial trigger is intentionally independent of whether a `profiles`
    // row already exists — signup can provision that row server-side before
    // the user ever logs in, so "no row yet" is not a reliable first-login
    // signal. The per-user localStorage flag is the source of truth instead.
    if (sbUser && !hasSeenTutorialVideo(userId)) {
      setShowTutorialVideo(true);
      markTutorialVideoSeen(userId);
    }

    if (!prof && sbUser) {
      const fallbackProfile = {
        user_id: userId,
        email: sbUser.email || '',
        name: sbUser.user_metadata?.name || 'User',
        account_type: (sbUser.user_metadata?.account_type as any) || 'individual',
        phone: sbUser.user_metadata?.phone || '',
        position: sbUser.user_metadata?.position || '',
        company_name: sbUser.user_metadata?.company_name || null
      };

      const { data: insertedProfile, error: insertProfileError } = await supabase
        .from('profiles')
        .upsert(fallbackProfile, { onConflict: 'user_id' })
        .select('*')
        .single();

      if (insertProfileError && insertProfileError.code !== '23505') {
        console.error('Profile upsert error', insertProfileError);
      } else if (insertedProfile) {
        setFinalProfile(insertedProfile);
      }
    }

    // Final check if user is admin
    if (finalProfile?.account_type === 'admin') {
      setIsAdmin(true);
      fetchAdminData(true);
    }

    // Load available inventories
    await fetchAvailableInventories(userId);

    setIsAuthenticated(true);
    setIsBootstrapped(true);
  };

  useEffect(() => {
        const storedImages = loadUserImages(supabaseUserId);
        setUser({
          id: supabaseUserId,
          email: finalProfile?.email || '',
          name: theUser?.user_metadata?.name || theUser?.user_metadata?.full_name || finalProfile?.name || 'User',
          accountType: finalProfile?.account_type as any || 'individual',
          phone: finalProfile?.phone || '',
          position: finalProfile?.position || '',
          clinicName: finalProfile?.company_name || undefined,
          avatarUrl: finalProfile?.avatar_url || storedImages.avatarUrl,
          backgroundUrl: finalProfile?.background_url || storedImages.backgroundUrl
        });
  },[finalProfile, theUser])

  const loadInventory = useCallback(async () => {
    if (!currentInventoryOwnerId) return;
    if (isDirty.current) {
      console.log('loadInventory: Local state is dirty, skipping reload to prevent overwrite');
      return;
    }
    // Prevent background reload if we just did a local mutation (echo prevention for full loads)
    if (Date.now() - lastLocalMutation.current < 2000) {
      console.log('loadInventory: Local mutation buffer active, skipping reload');
      return;
    }
    const reqId = ++lastLoadRequestId.current;
    if (isHydrated.current) {
      setIsReloading(true);
      setSyncStatus('syncing');
    }

    try {
      let meta = null, roomsData = null, itemsData = null, historyData = null, logData = null;
        const { data:metadata } = await supabase
        .from('inventory_meta')
        .select('*')
        .eq('user_id', currentInventoryOwnerId) 
        .maybeSingle();

      meta = metadata;

      
      const { data:roomdata, error: roomsError } = await supabase
      .from('inventory_rooms')
      .select('id, name, pos_x, pos_y')
      .eq('user_id', currentInventoryOwnerId);

      roomsData = roomdata;
      if (roomsError) {
        console.error('Rooms fetch error', roomsError);
      }
    

      const roomIds = (roomsData || []).map((r: any) => r.id);
      const { data: itemData } = roomIds.length
        ? await supabase.from('inventory_items').select('*, item_batches:inventory_item_batches(*)').in('room_id', roomIds)
        : { data: [] as any[] };
      itemsData = itemData;
      const { data: historiesData } = await supabase
        .from('inventory_purchase_history')
        .select('*')
        .eq('user_id', currentInventoryOwnerId)
        .order('occurred_at', { ascending: false })
        .order('created_at', { ascending: false });
      historyData = historiesData;
      const { data: logsData } = await supabase
        .from('inventory_activity_logs')
        .select('*, actor:actor_id(name, email)')
        .eq('user_id', currentInventoryOwnerId)
        .order('created_at', { ascending: false });
        logData = logsData;

      const itemsByRoom: Record<string, Item[]> = {};
      (itemsData || []).forEach((row: any) => {
        const batches: ItemBatch[] = (row.item_batches || []).map((b: any) => ({
          id: b.id,
          qty: Number(b.qty) || 0,
          unitPrice: Number(b.unit_price) || 0,
          expiryDate: b.expiry_date || null
        }));
        const item: Item = ensureBatches({
          id: row.id,
          name: row.name || '',
          brand: row.brand || '',
          code: row.code || '',
          quantity: Number(row.quantity) || 0,
          uom: row.uom || 'pcs',
          price: Number(row.price) || 0,
          vendor: row.vendor || '',
          category: (row.category as any) || 'other',
          description: row.description || '',
          expiryDate: row.expiry_date || null,
          createdAt: row.created_at,
          batches
        });
        itemsByRoom[row.room_id] = [...(itemsByRoom[row.room_id] || []), item];
      });

      const hydratedRooms: Room[] = (roomsData || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        x: Number(r.pos_x) || 0,
        y: Number(r.pos_y) || 0,
        items: (itemsByRoom[r.id] || []).map(ensureBatches)
      }));

      if (roomsData) {
        if (reqId !== lastLoadRequestId.current) {
          console.log('Discarding stale inventory load result');
          return;
        }
        console.log(`Inventory loaded successfully for ${currentInventoryOwnerId}. Found ${hydratedRooms.length} rooms.`);
        isHydrated.current = true;

        // Preserve TBA virtual room — it only lives in local state and must
        // survive full reloads triggered by Realtime or other mutations.
        // Use tbaRoomRef (always current) instead of prev to avoid stale closures.
        const currentTba = tbaRoomRef.current;
        setRooms(currentTba ? [...hydratedRooms, currentTba] : hydratedRooms);
      }
      setHistory(
        (historyData || []).map((h: any) => ({
          id: h.id,
          timestamp: h.occurred_at || h.created_at,
          productName: h.product_name || '',
          brand: h.brand || '',
          code: h.code || '',
          vendor: h.vendor || '',
          qty: Number(h.qty) || 0,
          unitPrice: Number(h.unit_price) || 0,
          totalPrice: Number(h.total_price) || (Number(h.qty) || 0) * (Number(h.unit_price) || 0),
          location: h.location || '',
          category: h.category || 'other',
          roomId: h.room_id || '',
          uom: h.uom || 'pcs',
          expiryDate: h.expiry_date || null,
          description: h.description || ''
        }))
      );
      setLogs(
        (logData || []).map((l: any) => ({
          id: l.id,
          timestamp: l.created_at,
          roomId: l.room_id || '',
          roomName: l.room_name || '',
          action: l.action,
          details: l.details,
          actorId: l.actor_id || undefined,
          actorName: l.actor?.name || l.actor?.email || undefined,
          beforeValue: l.before_value || undefined,
          afterValue: l.after_value || undefined
        }))
      );
      setBlueprint(meta?.blueprint || PRESET_BLUEPRINTS[0].url);
      setCatPosition({
        x: meta?.cat_position_x !== undefined ? Number(meta.cat_position_x) : 20,
        y: meta?.cat_position_y !== undefined ? Number(meta.cat_position_y) : 20
      });
      setIsLoadingMain(false);
      setIsReloading(false);
      setSyncStatus('synced');
    } catch (err) {
      console.error('Inventory load failed:', err);
      setIsLoadingMain(false);
      setIsReloading(false);
      setSyncStatus('error');
    }
  }, [currentInventoryOwnerId]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory, currentInventoryOwnerId]);

  // Realtime Subscriptions
  useEffect(() => {
    if (!currentInventoryOwnerId) return;

    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedReload = () => {
      // If we are currently syncing our own changes, don't reload from the database
      // to avoid infinite loops and UI flickering
      if (syncInFlight.current) return;

      // If we recently made a local change, don't reload yet to give sync a chance to complete
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        console.log('Debounced Reload Triggering loadInventory...');
        loadInventory();
      }, 500); // Reduce to 500ms for faster collaborative updates
    };

    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_rooms' },
        (payload) => {
          if (Date.now() - lastLocalMutation.current < 800) return;
          console.log('Realtime Room Change:', payload.eventType);

          if (payload.eventType === 'INSERT') {
            if (payload.new.user_id !== currentInventoryOwnerId) return;
            const newRoom: Room = {
              id: payload.new.id,
              name: payload.new.name,
              x: Number(payload.new.pos_x),
              y: Number(payload.new.pos_y),
              items: []
            };
            setRooms(prev => {
              if (prev.find(r => r.id === newRoom.id)) return prev;
              return [...prev, newRoom];
            });
          } else if (payload.eventType === 'UPDATE') {
            if (payload.new.user_id !== currentInventoryOwnerId) return;
            setRooms(prev => prev.map(r => r.id === payload.new.id ? {
              ...r,
              name: payload.new.name,
              x: Number(payload.new.pos_x),
              y: Number(payload.new.pos_y)
            } : r));
          } else if (payload.eventType === 'DELETE') {
            // For DELETE, payload.old only has the ID. 
            // We just filter it out of our local state if it exists.
            setRooms(prev => prev.filter(r => r.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_items' },
        (payload) => {
          if (Date.now() - lastLocalMutation.current < 800) return;
          console.log('Realtime Item Change:', payload.eventType);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new.user_id !== currentInventoryOwnerId) return;
            const newItemData = payload.new;
            setRooms(prev => prev.map(r => {
              if (r.id !== newItemData.room_id) return r;
              const exists = r.items.find(i => i.id === newItemData.id);
              if (exists) {
                return {
                  ...r,
                  items: r.items.map(i => i.id === newItemData.id ? {
                    ...i,
                    name: newItemData.name,
                    brand: newItemData.brand,
                    code: newItemData.code,
                    quantity: Number(newItemData.quantity),
                    price: Number(newItemData.price),
                    uom: newItemData.uom,
                    vendor: newItemData.vendor,
                    category: newItemData.category,
                    description: newItemData.description,
                    expiryDate: newItemData.expiry_date
                  } : i)
                };
              } else {
                // For INSERT, we can't fully hydrate without batches, so reload is safer
                debouncedReload();
                return r;
              }
            }));
          } else if (payload.eventType === 'DELETE') {
            setRooms(prev => prev.map(r => ({
              ...r,
              items: r.items.filter(i => i.id !== payload.old.id)
            })));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_item_batches' },
        (payload) => {
          if (Date.now() - lastLocalMutation.current < 800) return;
          console.log('Realtime Batch Change:', payload.eventType);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newBatch = payload.new;
            setRooms(prev => prev.map(r => ({
              ...r,
              items: r.items.map(i => {
                if (i.id !== newBatch.item_id) return i;
                const batchExists = i.batches?.find(b => b.id === newBatch.id);
                let updatedBatches;
                if (batchExists) {
                  updatedBatches = i.batches!.map(b => b.id === newBatch.id ? {
                    id: newBatch.id,
                    qty: Number(newBatch.qty),
                    unitPrice: Number(newBatch.unit_price),
                    expiryDate: newBatch.expiry_date
                  } : b);
                } else {
                  updatedBatches = [...(i.batches || []), {
                    id: newBatch.id,
                    qty: Number(newBatch.qty),
                    unitPrice: Number(newBatch.unit_price),
                    expiryDate: newBatch.expiry_date
                  }];
                }
                const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(updatedBatches);
                return {
                  ...i,
                  batches: updatedBatches,
                  quantity: totalQty,
                  price: avgPrice,
                  expiryDate: earliestExpiry
                };
              })
            })));
          } else if (payload.eventType === 'DELETE') {
            setRooms(prev => prev.map(r => ({
              ...r,
              items: r.items.map(i => {
                const updatedBatches = (i.batches || []).filter(b => b.id !== payload.old.id);
                if (updatedBatches.length === i.batches?.length) return i;
                const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(updatedBatches);
                return {
                  ...i,
                  batches: updatedBatches,
                  quantity: totalQty,
                  price: avgPrice,
                  expiryDate: earliestExpiry
                };
              })
            })));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_meta' },
        (payload) => {
          if (Date.now() - lastLocalMutation.current < 800) return;
          if (payload.eventType === 'UPDATE') {
            if (payload.new.user_id !== currentInventoryOwnerId) return;
            setBlueprint(payload.new.blueprint);
            setCatPosition({ x: Number(payload.new.cat_position_x), y: Number(payload.new.cat_position_y) });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory_purchase_history' },
        (payload) => {
          if (Date.now() - lastLocalMutation.current < 800) return;
          console.log('Realtime History Change:', payload.eventType);

          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (payload.new.user_id !== currentInventoryOwnerId) return;
            const h = payload.new;
            const newEntry: PurchaseHistory = {
              id: h.id,
              timestamp: h.occurred_at || h.created_at,
              productName: h.product_name || '',
              brand: h.brand || '',
              code: h.code || '',
              vendor: h.vendor || '',
              qty: Number(h.qty) || 0,
              unitPrice: Number(h.unit_price) || 0,
              totalPrice: Number(h.total_price) || (Number(h.qty) || 0) * (Number(h.unit_price) || 0),
              location: h.location || '',
              category: h.category || 'other',
              roomId: h.room_id || '',
              uom: h.uom || 'pcs',
              expiryDate: h.expiry_date || null,
              description: h.description || ''
            };
            setHistory(prev => {
              if (prev.find(x => x.id === newEntry.id)) {
                return prev.map(x => x.id === newEntry.id ? newEntry : x);
              }
              return [newEntry, ...prev].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
            });
          } else if (payload.eventType === 'DELETE') {
            setHistory(prev => prev.filter(h => h.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inventory_activity_logs' },
        (payload) => {
          if (Date.now() - lastLocalMutation.current < 800) return;
          if (payload.new.user_id !== currentInventoryOwnerId) return;
          console.log('Realtime Log Change: INSERT');
          const l = payload.new;
          const newLog: ActivityLog = {
            id: l.id,
            timestamp: l.created_at,
            roomId: l.room_id || '',
            roomName: l.room_name || '',
            action: l.action,
            details: l.details,
            actorId: l.actor_id || undefined,
            actorName: undefined, // Will be hydrated on next full load or by a separate lookup if needed
            beforeValue: l.before_value || undefined,
            afterValue: l.after_value || undefined
          };
          setLogs(prev => {
            if (prev.find(x => x.id === newLog.id)) return prev;
            return [newLog, ...prev].slice(0, 100);
          });
        }
      )
      .subscribe((status) => {
        console.log(`Realtime Subscription Status for ${currentInventoryOwnerId}:`, status);
        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime Channel Error - collaborators may not see updates. Check DB Realtime settings.');
          setSyncStatus('error');
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (reloadTimer) clearTimeout(reloadTimer);
    };
  }, [currentInventoryOwnerId, loadInventory]);

  const handleLogin = async (userProfile: UserProfile) => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || null;
    if (userId) setSupabaseUserId(userId);
    const storedImages = userId ? loadUserImages(userId) : {};

    setIsAdmin(userProfile.accountType === 'admin');
    setUser({ ...userProfile, ...storedImages });
    setIsAuthenticated(true);
    setCurrentView('dashboard');
    if (userId) {
      // Tutorial trigger relies solely on the per-user localStorage flag —
      // not on whether a `profiles` row exists yet, since that row can be
      // provisioned server-side during signup before the user ever logs in.
      if (!hasSeenTutorialVideo(userId)) {
        setShowTutorialVideo(true);
        markTutorialVideoSeen(userId);
      }

      const { error } = await supabase.from('profiles').upsert({
        user_id: userId,
        email: userProfile.email,
        name: userProfile.name,
        account_type: userProfile.accountType,
        phone: userProfile.phone,
        position: userProfile.position,
        company_name: userProfile.clinicName,
        avatar_url: storedImages.avatarUrl || null,
        background_url: storedImages.backgroundUrl || null
      });
      if (error) console.error('Profile upsert error', error);
      await bootstrapUser(userData?.user);
    }
  };

const handleLogout = async () => {
  try {
    await api.post('/logout');
    await supabase.auth.signOut();

    setIsAuthenticated(false);
    setIsBootstrapped(false);
    setUser(null);
    setIsAdmin(false);
    setManagedProfiles([]);
    setManagedInventories([]);
    setAdminDataError(null);
    setAdminDataLoading(false);
    setCurrentView('dashboard');
    setRooms([]);
    setHistory([]);
    setLogs([]);

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: 'SSO_LOGOUT', source: 'miniapp' },
        'https://app.snabbb.com'
      );
    }
  } catch (error) {
    console.error('Logout failed:', error);
  } finally {
    window.location.href = 'https://app.snabbb.com';
  }
};

  const handleUpdateUserImages = async (payload: { type: 'avatar' | 'background'; file: File; previewUrl: string }) => {
    if (!supabaseUserId) throw new Error('User is not authenticated.');

    const nextAvatar = payload.type === 'avatar' ? payload.previewUrl : user?.avatarUrl;
    const nextBackground = payload.type === 'background' ? payload.previewUrl : user?.backgroundUrl;
    setUser(prev => prev ? { ...prev, avatarUrl: nextAvatar, backgroundUrl: nextBackground } : prev);

    const remoteUrl = await uploadProfileImage(payload.file, supabaseUserId, payload.type);
    const finalAvatar = payload.type === 'avatar' ? remoteUrl : (user?.avatarUrl || null);
    const finalBackground = payload.type === 'background' ? remoteUrl : (user?.backgroundUrl || null);

    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, avatarUrl: finalAvatar || undefined, backgroundUrl: finalBackground || undefined };
      persistUserImages(supabaseUserId, {
        avatarUrl: next.avatarUrl,
        backgroundUrl: next.backgroundUrl
      });
      return next;
    });

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        avatar_url: finalAvatar,
        background_url: finalBackground
      })
      .eq('user_id', supabaseUserId);

    if (updateError) {
      console.error('Failed to update profile images, attempting upsert', updateError);
      const fallback = {
        user_id: supabaseUserId,
        email: user?.email || '',
        name: user?.name || '',
        account_type: user?.accountType || 'individual',
        phone: user?.phone || '',
        position: user?.position || '',
        company_name: user?.clinicName || null,
        avatar_url: finalAvatar,
        background_url: finalBackground
      };
      const { error: upsertError } = await supabase.from('profiles').upsert(fallback, { onConflict: 'user_id' });
      if (upsertError) {
        console.error('Failed to persist profile images (upsert)', upsertError);
        throw upsertError;
      }
    }
  };

  const addRoom = async (x: number, y: number, forceName?: string): Promise<string | null> => {
    console.log('addRoom initiated:', { x, y });
    lastLocalMutation.current = Date.now();

    const roomNumbers = rooms
      .map(r => {
        const m = r.name.match(/Room\s+(\d+)/);
        return m ? parseInt(m[1]) : null;
      })
      .filter((n): n is number => n !== null);
    const nextNumber = roomNumbers.length > 0
      ? Math.max(...roomNumbers) + 1
      : 1;

    const newRoomId = generateId();
    const newRoom: Room = {
      id: newRoomId,
      name: forceName || `Room ${nextNumber}`,
      x,
      y,
      items: [],
    };

    // 1. Optimistic Update
    setRooms(prev => [...prev, newRoom]);
    setIsAddMode(false);
    isDirty.current = true;

    // 2. Direct Persistence — insert the room itself first. The activity
    // log below references this room's id via a foreign key
    // (inventory_activity_logs_room_id_fkey), so the room row must exist
    // before we try to log against it — logging first (fire-and-forget)
    // was racing this insert and intermittently losing.
    let roomPersisted = true;
    if (currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      const { error } = await supabase.from('inventory_rooms').insert({
        id: newRoomId,
        user_id: currentInventoryOwnerId,
        name: newRoom.name,
        pos_x: x,
        pos_y: y
      });
      if (error) {
        console.error('Failed to persist new room:', error);
        setSyncStatus('error');
        roomPersisted = false;
      } else {
        setSyncStatus('synced');
      }
      isDirty.current = false;
      syncInFlight.current = false;
    }

    // Only log once we know the room row exists (or no remote persistence
    // is in play at all, in which case addActivity's own Supabase write is
    // skipped too via the same currentInventoryOwnerId check).
    if (roomPersisted) {
      await addActivity(newRoomId, newRoom.name, 'add', `Created "${newRoom.name}"`);
    }

    return newRoomId;
  };

  const requestDeleteRoom = (id: string) => {
    const room = rooms.find(r => r.id === id);
    if (!room) return;
    setPendingRoomDeleteId(id);
    setDeleteRoomTransferTargetId(rooms.find(r => r.id !== id)?.id || '');
  };

  const deleteRoom = async (id: string, itemAction: 'delete' | 'transfer', targetRoomId?: string) => {
    console.log('deleteRoom initiated:', id);
    const room = rooms.find(r => r.id === id);
    const targetRoom = targetRoomId ? rooms.find(r => r.id === targetRoomId) : undefined;
    if (!room) return;
    if (itemAction === 'transfer' && (!targetRoom || targetRoom.id === id)) return;
    lastLocalMutation.current = Date.now();

    // 1. Optimistic Update
    setRooms(prev => prev
      .filter(r => r.id !== id)
      .map(r => {
        if (itemAction !== 'transfer' || r.id !== targetRoomId) return r;
        return { ...r, items: [...r.items, ...room.items] };
      }));
    setHistory(prev => itemAction === 'delete'
      ? markRoomPurchaseHistoryArchived(prev, id)
      : prev.map(h => h.roomId === id && targetRoom ? { ...h, roomId: targetRoom.id, location: targetRoom.name } : h));
    // Awaited (unlike other addActivity call sites) because this log
    // references the room's own id, and that room row is about to be
    // deleted for real a few lines below. Without awaiting, the log's
    // Supabase insert can lose the race and land after the room DELETE,
    // violating inventory_activity_logs_room_id_fkey.
    await addActivity(
      id,
      room.name,
      'delete',
      itemAction === 'transfer' && targetRoom
        ? `Deleted room "${room.name}" and transferred items to "${targetRoom.name}"`
        : `Deleted room "${room.name}" and archived its items`
    );
    isDirty.current = true;

    // 2. Direct Persistence:
    //    - Update orphaned items' room_id to NULL in Supabase (preserve items)
    //    - Then delete the room
    if (currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        if (itemAction === 'transfer' && targetRoom) {
          await supabase
            .from('inventory_items')
            .update({ room_id: targetRoom.id, user_id: currentInventoryOwnerId })
            .eq('user_id', currentInventoryOwnerId)
            .eq('room_id', id);

          await supabase
            .from('inventory_purchase_history')
            .update({ room_id: targetRoom.id, location: targetRoom.name })
            .eq('user_id', currentInventoryOwnerId)
            .eq('room_id', id);
        } else {
          await supabase
            .from('inventory_purchase_history')
            .update({ room_id: null, location: ARCHIVED_LOCATION_LABEL })
            .eq('user_id', currentInventoryOwnerId)
            .eq('room_id', id);

          // Since we might not have server-side CASCADE, we perform a manual cascade delete logic.
          // Identify all items in this room
          const { data: itemsToDelete } = await supabase
            .from('inventory_items')
            .select('id')
            .eq('room_id', id);

          if (itemsToDelete && itemsToDelete.length > 0) {
            const itemIds = itemsToDelete.map(i => i.id);

            // Delete batches for those items first
            await supabase
              .from('inventory_item_batches')
              .delete()
              .in('item_id', itemIds);

            // Delete the items
            await supabase
              .from('inventory_items')
              .delete()
              .in('id', itemIds);
          }
        }

        // Delete the room (cascade will only delete items still pointing to it)
        const { error } = await supabase
          .from('inventory_rooms')
          .delete()
          .eq('id', id);

        if (error) throw error;
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to delete room:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    }
  };

  /**
   * Assign a TBA (unassigned) item to a real room.
   * Moves it out of the virtual TBA room and persists room_id to Supabase.
   */
  const assignTbaItemToRoom = async (itemId: string, toRoomId: string) => {
    const tbaRoom = rooms.find(r => r.id === TBA_ROOM_ID);
    const item = tbaRoom?.items.find(i => i.id === itemId);
    const targetRoom = rooms.find(r => r.id === toRoomId);
    if (!item || !targetRoom) return;

    lastLocalMutation.current = Date.now();
    isDirty.current = true;

    // Optimistic update — move item from TBA to target room
    setRooms(prev => prev
      .map(r => {
        if (r.id === TBA_ROOM_ID) {
          const remaining = r.items.filter(i => i.id !== itemId);
          return { ...r, items: remaining };
        }
        if (r.id === toRoomId) {
          return { ...r, items: [...r.items, { ...item, tba: false }] };
        }
        return r;
      })
      // Remove TBA room if it's now empty
      .filter(r => !(r.id === TBA_ROOM_ID && r.items.length === 0))
    );

    addActivity(toRoomId, targetRoom.name, 'transfer_in',
      `Assigned "${item.name}" from TBA to "${targetRoom.name}"`
    );

    // Persist
    if (currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        const { error } = await supabase
          .from('inventory_items')
          .upsert({
            id: item.id,
            room_id: toRoomId,
            user_id: currentInventoryOwnerId,
            name: item.name,
            brand: item.brand,
            code: item.code,
            quantity: item.quantity,
            price: item.price,
            uom: normalizeUom(item.uom),
            vendor: item.vendor,
            category: normalizeCategory(item.category),
            description: item.description,
            expiry_date: item.expiryDate,
          });
        if (error) throw error;
        setSyncStatus('synced');
      } catch (err) {
        console.error('assignTbaItemToRoom: failed to persist', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    }
  };

  /**
   * restoreRoom — recreates a deleted room and re-adds all its items atomically.
   * Keeps isDirty=true throughout so Realtime reloads don't overwrite mid-restore.
   */
  const restoreRoom = async (roomName: string, itemSnapshot?: string) => {
    if (!currentInventoryOwnerId) return;

    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    setSyncStatus('syncing');
    syncInFlight.current = true;

    try {
      // 1. Create the room in Supabase directly (bypass addRoom to keep isDirty locked)
      const newRoomId = generateId();
      const x = 20 + Math.random() * 40;
      const y = 20 + Math.random() * 40;

      const { error: roomErr } = await supabase.from('inventory_rooms').insert({
        id: newRoomId,
        user_id: currentInventoryOwnerId,
        name: roomName,
        pos_x: x,
        pos_y: y,
      });
      if (roomErr) throw roomErr;

      // Optimistic update — add room to local state
      const restoredRoom: Room = { id: newRoomId, name: roomName, x, y, items: [] };
      setRooms(prev => [...prev, restoredRoom]);
      addActivity(newRoomId, roomName, 'add', `Restored room "${roomName}"`);

      // 2. Re-add items if snapshot exists
      if (itemSnapshot) {
        const items = JSON.parse(itemSnapshot) as Array<{
          id?: string; name: string; brand: string; code: string; quantity: number;
          price: number; uom: string; vendor: string; category: string;
          description: string; expiryDate: string | null;
        }>;

        const today = new Date().toISOString().split('T')[0];
        let restoredItems: Item[] = [];

        for (const item of items) {
          const newItem: Item = {
            id: generateId(),
            name: item.name,
            brand: item.brand || '',
            code: item.code || '',
            quantity: item.quantity,
            price: item.price,
            uom: normalizeUom(item.uom),
            vendor: item.vendor || '',
            category: normalizeCategory(item.category) as any,
            description: item.description || '',
            expiryDate: item.expiryDate || null,
            createdAt: new Date().toISOString(),
            batches: [{ id: generateId(), qty: item.quantity, unitPrice: item.price, expiryDate: item.expiryDate || null }],
          };
          restoredItems.push(newItem);

          // Persist item to Supabase
          const { error: itemErr } = await supabase.from('inventory_items').upsert({
            id: newItem.id,
            room_id: newRoomId,
            user_id: currentInventoryOwnerId,
            name: newItem.name,
            brand: newItem.brand,
            code: newItem.code,
            quantity: newItem.quantity,
            price: newItem.price,
            uom: newItem.uom,
            vendor: newItem.vendor,
            category: newItem.category,
            description: newItem.description,
            expiry_date: newItem.expiryDate,
          });
          if (itemErr) throw itemErr;

          await supabase.from('inventory_item_batches').upsert({
            id: newItem.batches![0].id,
            item_id: newItem.id,
            qty: newItem.quantity,
            unit_price: newItem.price,
            expiry_date: newItem.expiryDate,
          });
        }

        // Optimistic update — add all items to the new room at once
        // AND remove them from the TBA virtual room (they are now assigned)
        setRooms(prev => prev
          .map(r => {
            if (r.id === newRoomId) return { ...r, items: restoredItems };
            if (r.id === TBA_ROOM_ID) {
              // Remove exactly the items that belong to this restored room,
              // matched by their original snapshot id (set during deleteRoom).
              // Falls back to name|brand only for old snapshots that predate the id field.
              const snapshotIds = new Set(items.map(i => i.id).filter(Boolean));
              const snapshotNameBrand = new Set(items.map(i => `${i.name}|${i.brand}`));
              const remaining = snapshotIds.size > 0
                ? r.items.filter(i => !snapshotIds.has(i.id))
                : r.items.filter(i => !snapshotNameBrand.has(`${i.name}|${i.brand}`));
              return { ...r, items: remaining };
            }
            return r;
          })
          // Remove TBA room if it's now empty
          .filter(r => !(r.id === TBA_ROOM_ID && r.items.length === 0))
        );

        addActivity(newRoomId, roomName, 'receive',
          `Restored ${restoredItems.length} item${restoredItems.length !== 1 ? 's' : ''} to "${roomName}"`
        );
      }

      setSyncStatus('synced');
    } catch (err) {
      console.error('restoreRoom failed:', err);
      setSyncStatus('error');
    } finally {
      isDirty.current = false;
      syncInFlight.current = false;
    }
  };

  const addActivity = async (
    roomId: string,
    roomName: string,
    action: ActivityLog['action'],
    details: string,
    options?: { beforeValue?: string; afterValue?: string }
  ) => {
    const timestamp = new Date().toISOString();
    const newLogId = generateId();
    const newLog: ActivityLog = {
      id: newLogId,
      timestamp,
      roomId,
      roomName,
      action,
      details,
      actorId: supabaseUserId || undefined,
      actorName: user?.name || undefined,
      beforeValue: options?.beforeValue,
      afterValue: options?.afterValue
    };

    // Optimistic Update
    setLogs(prev => [newLog, ...prev].slice(0, 100));

    // Direct Persistence
    if (currentInventoryOwnerId) {
      syncInFlight.current = true;
      const { error } = await supabase.from('inventory_activity_logs').insert({
        id: newLogId,
        user_id: currentInventoryOwnerId,
        room_id: roomId,
        room_name: roomName,
        action,
        details,
        created_at: timestamp,
        actor_id: supabaseUserId || null,
        before_value: options?.beforeValue || null,
        after_value: options?.afterValue || null
      });
      if (error) console.error('Failed to persist activity log:', error);
      syncInFlight.current = false;
    }

    // Best-effort sync to Odoo. Never awaited by callers and never allowed
    // to throw — Odoo being slow/unreachable must not block the UI or the
    // Supabase write above, which remains the source of truth locally.
    logActivityToOdoo({
      logId: newLogId,
      actorEmail: user?.email || null,
      supabaseUserId: supabaseUserId || null,
      actorName: user?.name || null,
      action,
      roomId,
      roomName,
      details,
      beforeValue: options?.beforeValue,
      afterValue: options?.afterValue,
      occurredAt: timestamp,
    }).catch((err) => console.error('logActivityToOdoo threw unexpectedly:', err));
  };

  const updateRoomName = async (id: string, name: string) => {
    lastLocalMutation.current = Date.now();
    let oldName = '';
    setRooms(prev => prev.map(r => {
      if (r.id === id) { oldName = r.name; return { ...r, name }; }
      return r;
    }));
    if (oldName && oldName !== name) {
      addActivity(id, name, 'edit', `Renamed room "${oldName}" to "${name}"`, { beforeValue: oldName, afterValue: name });
    }
    if (currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      const { error } = await supabase.from('inventory_rooms').update({ name }).eq('id', id);
      if (error) { console.error('Failed to update room name in DB:', error); setSyncStatus('error'); }
      else { setSyncStatus('synced'); }
      syncInFlight.current = false;
    }
  };

  const updateRoomPosition = async (id: string, x: number, y: number) => {
    lastLocalMutation.current = Date.now();
    isDirty.current = true;

    if (currentInventoryOwnerId) {
      setSyncStatus('syncing');
      try {
        console.log(`Updating position for room ${id} to (${x}, ${y})`);
        // await api.patch('/inventory/rooms/position', { id, pos_x: x, pos_y: y }).catch(async err => {
         await supabase
          .from('inventory_rooms')
          .update({ pos_x: x, pos_y: y })
          .eq('id', id);
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to update room position in DB:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
      }
    }
  };

  const receiveStock = async (roomId: string, itemData: Partial<Item>, qty: number, price: number, purchaseDate: string, expiry?: string, createNewBatch?: boolean) => {
    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    let affectedItemToSync: Item | null = null;
    let roomNameForLog = '';

    // 1. Calculate the new state first (so we have affectedItemToSync immediately)
    const room = rooms.find(r => r.id === roomId);
    if (!room) return;

    roomNameForLog = room.name;
    const existingItem = room.items.find(i =>
      i.name.toLowerCase() === itemData.name?.toLowerCase() &&
      (itemData.brand ? i.brand.toLowerCase() === itemData.brand.toLowerCase() : true)
    );

    if (existingItem) {
      // If createNewBatch is explicitly true, force creation of a new batch
      if (createNewBatch === true) {
        // Create a new batch by adding it to the batches array
        const normalized = ensureBatches(existingItem);
        const batches = normalized.batches ? [...normalized.batches] : [];
        batches.push({
          id: generateId(),
          qty,
          unitPrice: price,
          expiryDate: expiry || null
        });
        const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(batches);
        affectedItemToSync = { ...normalized, batches, quantity: totalQty, price: avgPrice, expiryDate: earliestExpiry };
      } else {
        // Default behavior: merge with existing batch if expiry matches
        affectedItemToSync = mergeBatchAdd(existingItem, qty, price, expiry);
      }
    } else {
      affectedItemToSync = {
        id: generateId(),
        name: itemData.name || '',
        brand: itemData.brand || '',
        code: itemData.code || '',
        quantity: qty,
        price: price,
        uom: normalizeUom(itemData.uom),
        vendor: itemData.vendor || '',
        category: normalizeCategory(itemData.category) as any,
        description: itemData.description || '',
        expiryDate: expiry || null,
        createdAt: new Date().toISOString(),
        batches: [{
          id: generateId(),
          qty,
          unitPrice: price,
          expiryDate: expiry || null
        }]
      };
    }

    // 2. Optimistic Update
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const updatedItems = existingItem
        ? r.items.map(i => i.id === existingItem.id ? affectedItemToSync! : i)
        : [...r.items, affectedItemToSync!];
      return { ...r, items: updatedItems };
    }));

    // Add activity and history locally
    addActivity(
      roomId,
      roomNameForLog,
      'receive',
      `Received ${qty} ${itemData.uom || 'pcs'} of "${itemData.name}" [${itemData.code || 'N/A'}] @ $${price.toFixed(2)}`,
      { beforeValue: existingItem ? String(existingItem.quantity) : '0', afterValue: String(existingItem ? existingItem.quantity + qty : qty) }
    );

    const historyTimestamp = purchaseDate
      ? new Date(`${purchaseDate}T${new Date().toTimeString().split(' ')[0]}`).toISOString()
      : new Date().toISOString();
    const historyEntry: PurchaseHistory = {
      id: generateId(),
      timestamp: historyTimestamp,
      productName: itemData.name || '',
      brand: itemData.brand || '',
      code: itemData.code || '',
      vendor: itemData.vendor || '',
      qty,
      unitPrice: price,
      totalPrice: qty * price,
      location: roomNameForLog,
      category: itemData.category || 'other',
      roomId: roomId,
      uom: itemData.uom || existingItem?.uom || 'pcs',
      expiryDate: expiry,
      description: itemData.description || existingItem?.description || ''
    };
    setHistory(h => [historyEntry, ...h]);

    // 3. Direct Persistence
    if (affectedItemToSync && currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        const itm = affectedItemToSync as Item;
        const { error: itemErr } = await supabase.from('inventory_items').upsert({
          id: itm.id,
          room_id: roomId,
          user_id: currentInventoryOwnerId,
          name: itm.name,
          brand: itm.brand,
          code: itm.code,
          quantity: itm.quantity,
          price: itm.price,
          uom: normalizeUom(itm.uom),
          vendor: itm.vendor,
          category: normalizeCategory(itm.category),
          description: itm.description,
          expiry_date: itm.expiryDate
        });
        if (itemErr) throw itemErr;

        if (itm.batches) {
          for (const b of itm.batches) {
            await supabase.from('inventory_item_batches').upsert({
              id: b.id,
              item_id: itm.id,
              qty: b.qty,
              unit_price: b.unitPrice,
              expiry_date: b.expiryDate
            });
          }
        }

        // 3. Persist History Entry
        const { error: historyErr } = await supabase.from('inventory_purchase_history').insert({
          id: historyEntry.id,
          user_id: currentInventoryOwnerId,
          room_id: historyEntry.roomId,
          occurred_at: historyEntry.timestamp,
          product_name: historyEntry.productName,
          brand: historyEntry.brand,
          code: historyEntry.code,
          vendor: historyEntry.vendor,
          qty: historyEntry.qty,
          unit_price: historyEntry.unitPrice,
          total_price: historyEntry.totalPrice,
          location: historyEntry.location,
          category: historyEntry.category,
          uom: historyEntry.uom,
          expiry_date: historyEntry.expiryDate || null,
        });
        if (historyErr) throw historyErr;

        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to persist received stock:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    }
  };

  const VALID_CATEGORIES = new Set(['consumables', 'equipment', 'instruments', 'materials', 'medication', 'ppe', 'other']);
  const VALID_UOMS = new Set(['pcs', 'box', 'unit', 'kit']);

  const normalizeCategory = (cat?: string): string => {
    if (!cat) return 'other';
    const lower = cat.trim().toLowerCase();
    return VALID_CATEGORIES.has(lower) ? lower : 'other';
  };

  const normalizeUom = (uom?: string): UOM => {
    if (!uom) return 'pcs';
    const lower = uom.trim().toLowerCase();
    return (VALID_UOMS.has(lower) ? lower : 'pcs') as UOM;
  };

  /**
   * receiveStockBatch — persists multiple items atomically.
   *
   * Unlike calling receiveStock() N times in a forEach (which creates N
   * concurrent async operations each independently clearing isDirty),
   * this function keeps isDirty = true until ALL items are upserted,
   * preventing the Realtime subscription from triggering loadInventory
   * mid-batch and overwriting items that haven't been saved yet.
   */
  const receiveStockBatch = async (
    roomId: string,
    items: Array<{ itemData: Partial<Item>; qty: number; price: number; purchaseDate: string; expiry?: string }>
  ) => {
    if (!items.length) return;
    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    setSyncStatus('syncing');
    syncInFlight.current = true;

    const room = rooms.find(r => r.id === roomId);
    if (!room) { isDirty.current = false; syncInFlight.current = false; return; }

    const roomNameForLog = room.name;
    const affectedItems: Item[] = [];
    const historyEntries: PurchaseHistory[] = [];
    let currentItems = [...room.items];

    // Build the full new state for each item sequentially (so merges are correct)
    for (const { itemData, qty, price, purchaseDate, expiry } of items) {
      if (!itemData.name) continue;

      const existingItem = currentItems.find(i =>
        i.name.toLowerCase() === itemData.name!.toLowerCase() &&
        (itemData.brand ? i.brand.toLowerCase() === itemData.brand.toLowerCase() : true)
      );

      let newItem: Item;
      if (existingItem) {
        newItem = mergeBatchAdd(existingItem, qty, price, expiry);
        currentItems = currentItems.map(i => i.id === existingItem.id ? newItem : i);
      } else {
        newItem = {
          id: generateId(),
          name: itemData.name || '',
          brand: itemData.brand || '',
          code: itemData.code || '',
          quantity: qty,
          price,
          uom: normalizeUom(itemData.uom),
          vendor: itemData.vendor || '',
          category: normalizeCategory(itemData.category) as any,
          description: itemData.description || '',
          expiryDate: expiry || null,
          createdAt: new Date().toISOString(),
          batches: [{ id: generateId(), qty, unitPrice: price, expiryDate: expiry || null }],
        };
        currentItems = [...currentItems, newItem];
      }
      affectedItems.push(newItem);

      // Activity log
      addActivity(
        roomId, roomNameForLog, 'receive',
        `Received ${qty} ${itemData.uom || 'pcs'} of "${itemData.name}" @ $${price.toFixed(2)}`,
        { beforeValue: String(existingItem?.quantity ?? 0), afterValue: String(newItem.quantity) }
      );

      // History
      const historyEntry: PurchaseHistory = {
        id: generateId(),
        timestamp: purchaseDate
          ? new Date(`${purchaseDate}T${new Date().toTimeString().split(' ')[0]}`).toISOString()
          : new Date().toISOString(),
        productName: itemData.name || '',
        brand: itemData.brand || '',
        code: itemData.code || '',
        vendor: itemData.vendor || '',
        qty,
        unitPrice: price,
        totalPrice: qty * price,
        location: roomNameForLog,
        category: itemData.category || 'other',
        roomId,
        uom: itemData.uom || existingItem?.uom || 'pcs',
        expiryDate: expiry,
        description: itemData.description || existingItem?.description || '',
      };
      setHistory(h => [historyEntry, ...h]);
      historyEntries.push(historyEntry);
    }

    // Optimistic update — apply all at once
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, items: currentItems } : r));

    if (!currentInventoryOwnerId) {
      isDirty.current = false;
      syncInFlight.current = false;
      return;
    }

    try {
      // Persist ALL items before clearing isDirty
      for (const itm of affectedItems) {
        const { error: itemErr } = await supabase.from('inventory_items').upsert({
          id: itm.id,
          room_id: roomId,
          user_id: currentInventoryOwnerId,
          name: itm.name,
          brand: itm.brand,
          code: itm.code,
          quantity: itm.quantity,
          price: itm.price,
          uom: normalizeUom(itm.uom),
          vendor: itm.vendor,
          category: normalizeCategory(itm.category),
          description: itm.description,
          expiry_date: itm.expiryDate,
        });
        if (itemErr) throw itemErr;

        if (itm.batches) {
          for (const b of itm.batches) {
            await supabase.from('inventory_item_batches').upsert({
              id: b.id,
              item_id: itm.id,
              qty: b.qty,
              unit_price: b.unitPrice,
              expiry_date: b.expiryDate,
            });
          }
        }
      }

      // Persist all history entries to Supabase
      for (const h of historyEntries) {
        const { error: histErr } = await supabase.from('inventory_purchase_history').insert({
          id: h.id,
          user_id: currentInventoryOwnerId,
          room_id: h.roomId,
          occurred_at: h.timestamp,
          product_name: h.productName,
          brand: h.brand,
          code: h.code,
          vendor: h.vendor,
          qty: h.qty,
          unit_price: h.unitPrice,
          total_price: h.totalPrice,
          location: h.location,
          category: normalizeCategory(h.category),
          uom: normalizeUom(h.uom as string),
          expiry_date: h.expiryDate || null,
        });
        if (histErr) console.error('receiveStockBatch: failed to persist history entry', histErr);
      }

      setSyncStatus('synced');
    } catch (err) {
      console.error('receiveStockBatch: failed to persist items', err);
      setSyncStatus('error');
    } finally {
      // Only NOW is it safe to clear isDirty — all items are in Supabase
      isDirty.current = false;
      syncInFlight.current = false;
    }
  };

  const removeStock = async (roomId: string, itemName: string, brand: string | undefined, qty: number, targetExpiry?: string) => {
    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    let affectedItemToSync: Item | null = null;
    let roomNameForLog = '';

    // 1. Find the room and item
    const room = rooms.find(r => r.id === roomId);
    if (!room) {
      console.error('Room not found:', roomId);
      isDirty.current = false;
      return;
    }

    roomNameForLog = room.name;
    const existingItem = room.items.find(i =>
      i.name.toLowerCase() === itemName.toLowerCase() &&
      (brand ? i.brand.toLowerCase() === brand.toLowerCase() : true)
    );

    if (!existingItem) {
      console.error('Item not found:', itemName);
      isDirty.current = false;
      return;
    }

    if (existingItem.quantity < qty) {
      console.error('Insufficient quantity. Available:', existingItem.quantity, 'Requested:', qty);
      isDirty.current = false;
      return;
    }

    // 2. Deduct quantity
    // If targetExpiry is provided, prioritize that batch
    if (targetExpiry) {
      const normalized = ensureBatches(existingItem);
      let batches = normalized.batches ? normalized.batches.map(b => ({ ...b })) : [];

      // Try to find the specific batch
      const targetBatchIndex = batches.findIndex(b => b.expiryDate === targetExpiry);

      if (targetBatchIndex !== -1) {
        let remainingToRemove = qty;

        // Remove from target batch first
        const takeFromTarget = Math.min(batches[targetBatchIndex].qty, remainingToRemove);
        batches[targetBatchIndex].qty -= takeFromTarget;
        remainingToRemove -= takeFromTarget;

        // If still need to remove more, fall back to FIFO (others)
        if (remainingToRemove > 0) {
          // Iterate others (excluding the one we just processed if it's now 0, though filter handles 0 later)
          // Logic similar to adjustBatchesWithDelta but handling the generic pool
          // Simple approach: Apply remaining delta to the list (FIFO logic)
          for (let i = batches.length - 1; i >= 0 && remainingToRemove > 0; i--) {
            if (i === targetBatchIndex) continue; // Skip the one we already drained
            const take = Math.min(batches[i].qty, remainingToRemove);
            batches[i].qty -= take;
            remainingToRemove -= take;
          }
        }

        batches = batches.filter(b => b.qty > 0);
        const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(batches);
        affectedItemToSync = { ...normalized, batches, quantity: totalQty, price: avgPrice, expiryDate: earliestExpiry };
      } else {
        // Target batch not found by date, fallback to standard FIFO
        affectedItemToSync = adjustBatchesWithDelta(existingItem, -qty);
      }
    } else {
      // Standard FIFO
      affectedItemToSync = adjustBatchesWithDelta(existingItem, -qty);
    }

    // 3. Optimistic Update
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const updatedItems = r.items.map(i =>
        i.id === existingItem.id ? affectedItemToSync! : i
      ).filter(i => i.quantity > 0); // Remove items with 0 quantity
      return { ...r, items: updatedItems };
    }));

    // Add activity log
    addActivity(
      roomId,
      roomNameForLog,
      'remove',
      `Removed ${qty} ${existingItem.uom} of "${itemName}" [${existingItem.code || 'N/A'}]`,
      { beforeValue: String(existingItem.quantity), afterValue: String(affectedItemToSync.quantity) }
    );

    // 4. Direct Persistence
    if (affectedItemToSync && currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        const itm = affectedItemToSync as Item;

        // If quantity is 0, delete the item and its batches
        if (itm.quantity === 0) {
          // Delete batches first
          await supabase.from('inventory_item_batches').delete().eq('item_id', itm.id);
          // Delete item
          const { error: itemErr } = await supabase.from('inventory_items').delete().eq('id', itm.id);
          if (itemErr) throw itemErr;
        } else {
          // Update item
          const { error: itemErr } = await supabase.from('inventory_items').update({
            quantity: itm.quantity,
            price: itm.price,
            expiry_date: itm.expiryDate
          }).eq('id', itm.id);
          if (itemErr) throw itemErr;

          // Delete all existing batches and re-insert
          await supabase.from('inventory_item_batches').delete().eq('item_id', itm.id);
          if (itm.batches && itm.batches.length > 0) {
            for (const b of itm.batches) {
              await supabase.from('inventory_item_batches').insert({
                id: b.id,
                item_id: itm.id,
                qty: b.qty,
                unit_price: b.unitPrice,
                expiry_date: b.expiryDate
              });
            }
          }
        }

        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to persist removed stock:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    }
  };

  const updateItemQty = async (roomId: string, itemId: string, delta: number) => {
    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    const room = rooms.find(r => r.id === roomId);
    const item = room?.items.find(i => i.id === itemId);
    if (!room || !item) {
      isDirty.current = false;
      return;
    }

    const updatedItem = adjustBatchesWithDelta(item, delta);

    if (updatedItem.quantity !== item.quantity) {
      addActivity(
        roomId,
        room.name,
        'edit',
        `Adjusted qty of "${item.name}" to ${updatedItem.quantity}`,
        { beforeValue: String(item.quantity), afterValue: String(updatedItem.quantity) }
      );
    }

    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const items = r.items.map(i => {
        if (i.id !== itemId) return i;
        return updatedItem!;
      });
      return { ...r, items };
    }));

    if (updatedItem && currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        const itm = updatedItem as Item;
        // 1. Update parent item
        const { error } = await supabase.from('inventory_items').update({
          quantity: itm.quantity,
          price: itm.price,
          expiry_date: itm.expiryDate,
        }).eq('id', itm.id);

        if (error) throw error;

        // 2. Sync batches (Upsert remaining, Delete missing)
        if (itm.batches) {
          // Get current batch IDs for this item to identify which ones to delete
          const { data: dbBatches } = await supabase
            .from('inventory_item_batches')
            .select('id')
            .eq('item_id', itm.id);

          const currentBatchIds = new Set(itm.batches.map(b => b.id));
          const idsToDelete = dbBatches
            ? dbBatches.filter(dbB => !currentBatchIds.has(dbB.id)).map(dbB => dbB.id)
            : [];

          if (idsToDelete.length > 0) {
            await supabase.from('inventory_item_batches').delete().in('id', idsToDelete);
          }

          for (const b of itm.batches) {
            await supabase.from('inventory_item_batches').upsert({
              id: b.id,
              item_id: itm.id,
              qty: b.qty,
              unit_price: b.unitPrice,
              expiry_date: b.expiryDate
            });
          }
        }
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to update item quantity:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    } else {
      isDirty.current = false;
    }
  };

  const updateItemBatchQty = async (roomId: string, itemId: string, batchIndex: number, delta: number) => {
    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    const room = rooms.find(r => r.id === roomId);
    const item = room?.items.find(i => i.id === itemId);
    if (!room || !item) {
      isDirty.current = false;
      return;
    }

    const normalized = ensureBatches(item);
    const batches = normalized.batches ? normalized.batches.map(b => ({ ...b })) : [];
    if (batchIndex < 0 || batchIndex >= batches.length) {
      isDirty.current = false;
      return;
    }
    const b = batches[batchIndex];
    const targetBatchId = b.id;

    if (delta === 0) {
      isDirty.current = false;
      return;
    }
    const newQty = Math.max(0, b.qty + delta);
    if (newQty === b.qty) {
      isDirty.current = false;
      return;
    }
    batches[batchIndex] = { ...b, qty: newQty };
    const filtered = batches.filter(x => x.qty > 0);
    const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(filtered);
    const updatedItem = { ...normalized, batches: filtered, quantity: totalQty, price: avgPrice, expiryDate: earliestExpiry };

    if (newQty !== b.qty) {
      addActivity(
        roomId,
        room.name,
        'edit',
        `Adjusted Batch ${batchIndex + 1} of "${item.name}" from ${b.qty} to ${newQty}`,
        { beforeValue: String(b.qty), afterValue: String(newQty) }
      );
    }

    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        items: r.items.map(i => i.id === itemId ? updatedItem! : i)
      };
    }));

    if (updatedItem && currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        const itm = updatedItem as Item;
        // 1. Update parent item
        const { error: itemUpdateError } = await supabase.from('inventory_items').update({
          quantity: itm.quantity,
          price: itm.price,
          expiry_date: itm.expiryDate,
        }).eq('id', itm.id);

        if (itemUpdateError) throw itemUpdateError;

        // 2. Update specific batch (If newly zero, delete from DB. If > 0, upsert.)
        const targetBatchInStore = itm.batches?.find(b => b.id === targetBatchId);

        if (!targetBatchInStore || targetBatchInStore.qty <= 0) {
          // It was filtered out or set to 0, so delete it from DB
          const { error: batchDeleteError } = await supabase.from('inventory_item_batches').delete().eq('id', targetBatchId);
          if (batchDeleteError) throw batchDeleteError;
        } else {
          // Upsert the updated batch
          const { error: batchUpsertError } = await supabase.from('inventory_item_batches').upsert({
            id: targetBatchInStore.id,
            item_id: itm.id,
            qty: targetBatchInStore.qty,
            unit_price: targetBatchInStore.unitPrice,
            expiry_date: targetBatchInStore.expiryDate
          });
          if (batchUpsertError) throw batchUpsertError;
        }
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to update batch qty:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    } else {
      isDirty.current = false;
    }
  };

  const updateItemMetadata = async (roomId: string, itemId: string, itemData: Partial<Item>) => {
    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    const room = rooms.find(r => r.id === roomId);
    const item = room?.items.find(i => i.id === itemId);
    if (!room || !item) {
      isDirty.current = false;
      return;
    }

    // Merge metadata
    const updatedItem: Item = { ...item, ...itemData };

    // If quantity or price was provided in itemData, ensure the first batch (latest) reflects it if appropriate
    // Or just let user manage batches separately? 
    // Usually, "Edit Item" from the simple UI should probably update the primary/summary fields and the latest batch.
    if (updatedItem.batches && updatedItem.batches.length > 0) {
      // Update the most recent batch to match the summary if they are different
      // For simplicity, if editing from modal, we update the summary and the first batch.
      updatedItem.batches[0] = {
        ...updatedItem.batches[0],
        qty: updatedItem.quantity,
        unitPrice: updatedItem.price,
        expiryDate: updatedItem.expiryDate
      };
    } else {
      // Create a batch if missing
      updatedItem.batches = [{
        id: generateId(),
        qty: updatedItem.quantity,
        unitPrice: updatedItem.price,
        expiryDate: updatedItem.expiryDate || null
      }];
    }

    // Optimistic Update
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        items: r.items.map(i => i.id === itemId ? updatedItem : i)
      };
    }));

    addActivity(roomId, room.name, 'edit', `Updated details for "${item.name}"`);

    if (currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        // 1. Update main item
        const { error } = await supabase.from('inventory_items').update({
          name: updatedItem.name,
          brand: updatedItem.brand,
          code: updatedItem.code,
          uom: normalizeUom(updatedItem.uom),
          vendor: updatedItem.vendor,
          category: normalizeCategory(updatedItem.category),
          description: updatedItem.description,
          expiry_date: updatedItem.expiryDate,
          quantity: updatedItem.quantity,
          price: updatedItem.price,
        }).eq('id', itemId);
        if (error) throw error;

        // 2. Update the batch (primary)
        if (updatedItem.batches && updatedItem.batches[0]) {
          const b = updatedItem.batches[0];
          await supabase.from('inventory_item_batches').upsert({
            id: b.id,
            item_id: itemId,
            qty: b.qty,
            unit_price: b.unitPrice,
            expiry_date: b.expiryDate
          });
        }

        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to update item metadata:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    } else {
      isDirty.current = false;
    }
  };

  const updateBatchMetadata = async (roomId: string, itemId: string, batchId: string, batchData: Partial<ItemBatch>) => {
    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    const room = rooms.find(r => r.id === roomId);
    const item = room?.items.find(i => i.id === itemId);
    if (!room || !item) {
      isDirty.current = false;
      return;
    }

    const batches = item.batches ? item.batches.map(b => b.id === batchId ? { ...b, ...batchData } : b) : [];

    // Recalculate item totals
    let totalQty = 0;
    let totalCost = 0;
    let earliestExpiry: string | null = null;

    batches.forEach(b => {
      totalQty += b.qty;
      totalCost += b.qty * b.unitPrice;
      if (b.expiryDate) {
        if (!earliestExpiry || b.expiryDate < earliestExpiry) {
          earliestExpiry = b.expiryDate;
        }
      }
    });

    const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;
    const updatedItem = { ...item, batches, quantity: totalQty, price: avgPrice, expiryDate: earliestExpiry };

    // Optimistic Update
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        items: r.items.map(i => i.id === itemId ? updatedItem : i)
      };
    }));

    addActivity(roomId, room.name, 'edit', `Updated batch details for "${item.name}"`);

    if (currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        // 1. Update batch
        const { error: batchErr } = await supabase.from('inventory_item_batches').update({
          qty: batchData.qty,
          unit_price: batchData.unitPrice,
          expiry_date: batchData.expiryDate,
        }).eq('id', batchId);
        if (batchErr) throw batchErr;

        // 2. Update parent item summary
        const { error: itemErr } = await supabase.from('inventory_items').update({
          quantity: updatedItem.quantity,
          price: updatedItem.price,
          expiry_date: updatedItem.expiryDate,
        }).eq('id', itemId);
        if (itemErr) throw itemErr;

        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to update batch metadata:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    } else {
      isDirty.current = false;
    }
  };

  const deleteItem = async (roomId: string, itemId: string) => {
    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    let roomName = '';
    let itemName = '';
    let beforeQty = '0';
    const room = rooms.find(r => r.id === roomId);
    const itemToDelete = room?.items.find(i => i.id === itemId) || null;
    const archivedHistoryIds = itemToDelete
      ? history.filter(h => isPurchaseHistoryForItem(h, roomId, itemToDelete)).map(h => h.id)
      : [];

    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      roomName = r.name;
      const item = r.items.find(i => i.id === itemId);
      if (item) {
        itemName = item.name;
        beforeQty = String(item.quantity);
      }
      return { ...r, items: r.items.filter(i => i.id !== itemId) };
    }));
    if (itemToDelete) {
      setHistory(prev => markItemPurchaseHistoryArchived(prev, roomId, itemToDelete));
    }

    if (itemName) {
      addActivity(roomId, roomName, 'delete', `Deleted "${itemName}"`, { beforeValue: beforeQty, afterValue: '0' });
    }

    if (currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        if (archivedHistoryIds.length > 0) {
          const { error: historyErr } = await supabase
            .from('inventory_purchase_history')
            .update({ room_id: null, location: ARCHIVED_LOCATION_LABEL })
            .eq('user_id', currentInventoryOwnerId)
            .in('id', archivedHistoryIds);
          if (historyErr) throw historyErr;
        }

        const { error } = await supabase.from('inventory_items').delete().eq('id', itemId);
        if (error) throw error;
        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to delete item:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    }
  };

  const splitBatchesForTransfer = (batches: ItemBatch[] | undefined, qtyToMove: number) => {
    if (!batches || batches.length === 0) return { kept: [] as ItemBatch[], moved: [] as ItemBatch[] };
    let remaining = qtyToMove;
    const kept: ItemBatch[] = [];
    const moved: ItemBatch[] = [];

    for (const batch of batches) {
      if (remaining <= 0) {
        kept.push(batch);
        continue;
      }
      const move = Math.min(batch.qty, remaining);
      if (move > 0) {
        // If moving the full amount, keep same ID, otherwise new ID for the snippet
        const movedId = move === batch.qty ? batch.id : generateId();
        moved.push({ ...batch, id: movedId, qty: move });
      }
      const leftover = batch.qty - move;
      if (leftover > 0) {
        // If some stayed, we might need a new ID if the full batch was "moved" above?
        // Actually, let's just say the "kept" part keeps the original ID if it exists.
        kept.push({ ...batch, qty: leftover });
      }
      remaining -= move;
    }

    return { kept, moved };
  };

  const mergeItemBatches = (a: Item, b: Item): Item => {
    const aBatches = ensureBatches(a).batches || [];
    const bBatches = ensureBatches(b).batches || [];
    const all = [...aBatches, ...bBatches];
    const byExpiry = new Map<string | null, ItemBatch>();
    all.forEach(batch => {
      const key = batch.expiryDate || null;
      const existing = byExpiry.get(key);
      if (!existing) {
        byExpiry.set(key, { id: generateId(), qty: batch.qty, unitPrice: batch.unitPrice, expiryDate: batch.expiryDate || null });
      } else {
        const totalQty = existing.qty + batch.qty;
        const totalValue = (existing.qty * existing.unitPrice) + (batch.qty * batch.unitPrice);
        byExpiry.set(key, {
          ...existing,
          qty: totalQty,
          unitPrice: totalQty > 0 ? totalValue / totalQty : existing.unitPrice,
          expiryDate: key
        });
      }
    });
    const mergedBatches = Array.from(byExpiry.values());
    const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(mergedBatches);
    return {
      ...a,
      quantity: totalQty,
      price: avgPrice,
      expiryDate: earliestExpiry,
      batches: mergedBatches
    };
  };

  const moveItem = async (fromRoomId: string, toRoomId: string, itemId: string, quantity: number, batchIndex?: number) => {
    lastLocalMutation.current = Date.now();
    isDirty.current = true;
    if (fromRoomId === toRoomId) {
      isDirty.current = false;
      return;
    }

    const fromRoom = rooms.find(r => r.id === fromRoomId);
    const toRoom = rooms.find(r => r.id === toRoomId);
    if (!fromRoom || !toRoom) {
      isDirty.current = false;
      return;
    }

    const item = fromRoom.items.find(i => i.id === itemId);
    if (!item) {
      isDirty.current = false;
      return;
    }

    // 1. Calculate Movements
    const { kept, moved } = (typeof batchIndex === 'number')
      ? {
        kept: item.batches?.map((b, idx) => idx === batchIndex ? { ...b, qty: Math.max(0, b.qty - quantity) } : b).filter(b => b.qty > 0) || [],
        moved: [{ ...item.batches![batchIndex], qty: quantity, id: generateId() }]
      }
      : splitBatchesForTransfer(item.batches, quantity);

    const keptSummary = summarizeBatches(kept);
    const updatedFromItem = { ...item, batches: kept, quantity: keptSummary.totalQty, price: keptSummary.avgPrice, expiryDate: keptSummary.earliestExpiry };

    const movedSummary = summarizeBatches(moved);
    const movedItemTemplate = { ...item, id: generateId(), batches: moved, quantity: movedSummary.totalQty, price: movedSummary.avgPrice, expiryDate: movedSummary.earliestExpiry, roomId: toRoomId };

    let finalMovedItem: Item = movedItemTemplate;
    const existingInTarget = toRoom.items.find(i => i.name === item.name && i.brand === item.brand && i.category === item.category);
    if (existingInTarget) {
      finalMovedItem = mergeBatchAdd(existingInTarget, movedItemTemplate.quantity, movedItemTemplate.price, movedItemTemplate.expiryDate);
    }

    // 2. Optimistic Update
    setRooms(prev => prev.map(r => {
      if (r.id === fromRoomId) {
        return { ...r, items: updatedFromItem.quantity > 0 ? r.items.map(i => i.id === itemId ? updatedFromItem : i) : r.items.filter(i => i.id !== itemId) };
      }
      if (r.id === toRoomId) {
        if (existingInTarget) {
          return { ...r, items: r.items.map(i => i.id === existingInTarget.id ? finalMovedItem : i) };
        }
        return { ...r, items: [...r.items, finalMovedItem] };
      }
      return r;
    }));

    addActivity(fromRoomId, fromRoom.name, 'transfer_out', `Moved ${quantity} of "${item.name}" to ${toRoom.name}`);
    addActivity(toRoomId, toRoom.name, 'transfer_in', `Received ${quantity} of "${item.name}" from ${fromRoom.name}`);

    // 3. Direct Persistence
    if (currentInventoryOwnerId) {
      setSyncStatus('syncing');
      syncInFlight.current = true;
      try {
        // A. PERSIST SOURCE (Update or Delete)
        if (updatedFromItem.quantity > 0) {
          await supabase.from('inventory_items').update({
            quantity: updatedFromItem.quantity,
            price: updatedFromItem.price,
            expiry_date: updatedFromItem.expiryDate,
          }).eq('id', updatedFromItem.id);

          // Update batches for source
          const { data: dbBatches } = await supabase.from('inventory_item_batches').select('id').eq('item_id', updatedFromItem.id);
          const currentBatchIds = new Set(updatedFromItem.batches!.map(b => b.id));
          const idsToDelete = dbBatches ? dbBatches.filter(dbB => !currentBatchIds.has(dbB.id)).map(dbB => dbB.id) : [];
          if (idsToDelete.length > 0) await supabase.from('inventory_item_batches').delete().in('id', idsToDelete);
          for (const b of updatedFromItem.batches!) {
            await supabase.from('inventory_item_batches').upsert({ id: b.id, item_id: updatedFromItem.id, qty: b.qty, unit_price: b.unitPrice, expiry_date: b.expiryDate });
          }
        } else {
          // Full move - delete source
          await supabase.from('inventory_item_batches').delete().eq('item_id', item.id);
          await supabase.from('inventory_items').delete().eq('id', item.id);
        }

        // B. PERSIST DESTINATION
        await supabase.from('inventory_items').upsert({
          id: finalMovedItem.id,
          room_id: toRoomId,
          name: finalMovedItem.name,
          brand: finalMovedItem.brand,
          category: normalizeCategory(finalMovedItem.category),
          uom: normalizeUom(finalMovedItem.uom),
          quantity: finalMovedItem.quantity,
          price: finalMovedItem.price,
          expiry_date: finalMovedItem.expiryDate,
          code: finalMovedItem.code,
          vendor: finalMovedItem.vendor,
          description: finalMovedItem.description,
          user_id: currentInventoryOwnerId
        });

        if (finalMovedItem.batches) {
          for (const b of finalMovedItem.batches) {
            await supabase.from('inventory_item_batches').upsert({ id: b.id, item_id: finalMovedItem.id, qty: b.qty, unit_price: b.unitPrice, expiry_date: b.expiryDate });
          }
        }

        setSyncStatus('synced');
      } catch (err) {
        console.error('Failed to persist item move:', err);
        setSyncStatus('error');
      } finally {
        isDirty.current = false;
        syncInFlight.current = false;
      }
    }
  };

  const navigatetoSnabbb = () => {
    window.open('https://app.snabbb.com', '_self');
  }

  const activeRoom = useMemo(() => rooms.find(r => r.id === activeRoomId), [rooms, activeRoomId]);
  const pendingRoomDelete = useMemo(() => rooms.find(r => r.id === pendingRoomDeleteId), [rooms, pendingRoomDeleteId]);
  const roomDeleteTransferTargets = useMemo(() => rooms.filter(r => r.id !== pendingRoomDeleteId), [rooms, pendingRoomDeleteId]);

  const userInitials = useMemo(() => {
    console.log('user',user)
    if (!user) return 'U';
    return user.name.split(' ').map(n => n[0]).join('').toUpperCase();
  }, [user]);



  const adminRooms = useMemo(() => managedInventories.flatMap((inv) => inv.rooms || []), [managedInventories]);
  const adminHistory = useMemo(() => managedInventories.flatMap((inv) => inv.history || []), [managedInventories]);

  const currentRole = useMemo(() => {
    if (!currentInventoryOwnerId || currentInventoryOwnerId === user?.id) return 'owner';
    const inv = availableInventories.find(i => i.id === currentInventoryOwnerId);
    return inv?.role || 'viewer';
  }, [currentInventoryOwnerId, user, availableInventories]);

  const canManageStructure = currentRole === 'owner' || currentRole === 'admin';
  const canEditItems = currentRole === 'owner' || currentRole === 'admin' || currentRole === 'editor';

  if (authInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-700 font-medium">Checking session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <LandingModal
        onLogin={handleLogin}
        theme={theme}
        onThemeToggle={() => handleSetTheme(theme === 'dark' ? 'light' : 'dark')}
      />
    );
  }

  if (isAuthenticated && isAdmin && user) {
    return (
      <AdminDashboard
        user={user}
        rooms={adminRooms}
        history={adminHistory}
        onLogout={handleLogout}
        onSwitchToClinic={() => { }}
        managedProfiles={managedProfiles}
        managedInventories={managedInventories}
        adminLoading={adminDataLoading}
        adminError={adminDataError}
        onRefreshAdminData={() => fetchAdminData(true)}
      />
    );
  }

  return (
    <div className={`min-h-screen flex flex-col select-none ${theme === 'dark' ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      <Header
        onProfileClick={() => setCurrentView('profile')}
        onDashboardClick={() => navigatetoSnabbb()}
        // onDashboardClick={() => setCurrentView('dashboard')}
        onLogout={handleLogout}
        onAddCollaborator={currentRole === 'owner' ? () => setIsCollaboratorModalOpen(true) : undefined}
        onWatchTutorial={() => setShowTutorialVideo(true)}
        user={user}
        userInitials={userInitials}
        userAvatarUrl={user?.avatarUrl}
        availableInventories={availableInventories}
        currentInventoryId={currentInventoryOwnerId}
        onSwitchInventory={setCurrentInventoryOwnerId}
        theme={theme}
        onSetTheme={handleSetTheme}
      />

      <div className="max-w-[1600px] mx-auto w-full flex flex-col gap-8 px-0 md:px-16 lg:px-32 py-8">
        <main className="flex-1 flex flex-col gap-8">
          {currentView === 'dashboard' ? (
            <>
              {isLoadingMain && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-indigo-900 font-medium">Hydrating Inventory...</p>
                  </div>
                </div>
              )}
              {isReloading && (
                <div className="absolute top-4 right-4 z-40 bg-white/80 p-2 rounded-full shadow-sm animate-pulse flex items-center gap-2">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Syncing...</span>
                </div>
              )}
              {bannerPromos.map((promo) => (
                <PromoBanner key={promo.id} appCode="inventory" promo={promo} />
              ))}
              <ClinicMap
                rooms={rooms}
                blueprint={blueprint}
                isLocked={isLocked}
                isAddMode={isAddMode}
                isDeleteMode={isDeleteMode}
                onSetLocked={setIsLocked}
                onSetAddMode={setIsAddMode}
                onSetDeleteMode={setIsDeleteMode}
                onAddRoom={addRoom}
                onDeleteRoom={requestDeleteRoom}
                onSelectRoom={setActiveRoomId}
                onDragEnd={canManageStructure ? updateRoomPosition : undefined}
                onUpdateRooms={canManageStructure ? (newRooms) => {
                  console.log('onUpdateRooms (drag/update) called');
                  lastLocalMutation.current = Date.now();
                  isDirty.current = true;
                  setRooms(newRooms);
                } : undefined}
                onSelectTemplate={canManageStructure ? (url) => {
                  console.log('onSelectTemplate called');
                  lastLocalMutation.current = Date.now();
                  isDirty.current = true;
                  setBlueprint(url);

                  if (currentInventoryOwnerId) {
                    if (metaSyncTimer.current) window.clearTimeout(metaSyncTimer.current);
                    metaSyncTimer.current = window.setTimeout(async () => {
                      setSyncStatus('syncing');
                      await supabase.from('inventory_meta').upsert({
                        user_id: currentInventoryOwnerId,
                        blueprint: url,
                        // Include latest cat position from state or just rely on current local state
                        cat_position_x: catPosition.x,
                        cat_position_y: catPosition.y
                      }, { onConflict: 'user_id' });
                      setSyncStatus('synced');
                    }, 1000);
                  }
                } : undefined}
                catPosition={catPosition}
                onCatPositionChange={canManageStructure ? (pos) => {
                  lastLocalMutation.current = Date.now();
                  isDirty.current = true;
                  setCatPosition(pos);

                  if (currentInventoryOwnerId) {
                    if (metaSyncTimer.current) window.clearTimeout(metaSyncTimer.current);
                    metaSyncTimer.current = window.setTimeout(async () => {
                      setSyncStatus('syncing');
                      console.log('Debounced Meta Sync: Saving cat position', pos);
                      await supabase.from('inventory_meta').upsert({
                        user_id: currentInventoryOwnerId,
                        cat_position_x: pos.x,
                        cat_position_y: pos.y,
                        blueprint: blueprint || PRESET_BLUEPRINTS[0].url
                      }, { onConflict: 'user_id' });
                      setSyncStatus('synced');
                    }, 1000);
                  }
                } : undefined}
                onReceive={receiveStock}
                onOpenChat={() => setIsChatOpen(true)}
                onOpenVirtualPet={() => setIsVirtualPetOpen(true)}
                readOnly={!canManageStructure || isLoadingMain}
                syncStatus={syncStatus}
              />

              <MasterInventory
                rooms={rooms}
                history={history}
                logs={logs}
                onReceive={(rid, data, q, p, date, exp) => { lastLocalMutation.current = Date.now(); isDirty.current = true; receiveStock(rid, data, q, p, date, exp); }}
                onUpdateQty={(rid, iid, d) => { lastLocalMutation.current = Date.now(); isDirty.current = true; updateItemQty(rid, iid, d); }}
                onUpdateBatchQty={(rid, iid, bidx, d) => { lastLocalMutation.current = Date.now(); isDirty.current = true; updateItemBatchQty(rid, iid, bidx, d); }}
                onTransfer={(frid, trid, iid, q) => { lastLocalMutation.current = Date.now(); isDirty.current = true; moveItem(frid, trid, iid, q); }}
                onDeleteItem={(rid, iid) => { lastLocalMutation.current = Date.now(); isDirty.current = true; deleteItem(rid, iid); }}
                onUpdateItem={(rid, iid, data) => { lastLocalMutation.current = Date.now(); isDirty.current = true; updateItemMetadata(rid, iid, data); }}
                onUpdateBatch={(rid, iid, bid, data) => { lastLocalMutation.current = Date.now(); isDirty.current = true; updateBatchMetadata(rid, iid, bid, data); }}
                onRestoreRoom={(roomName, itemSnapshot) => restoreRoom(roomName, itemSnapshot)}
                onAssignTbaItem={(itemId, toRoomId) => assignTbaItemToRoom(itemId, toRoomId)}
                readOnly={!canEditItems || isLoadingMain}
              />
            </>
          ) : (
            user && (
              <ProfilePage
                user={user}
                onLogout={handleLogout}
                onBack={() => setCurrentView('dashboard')}
                onUpdateImages={handleUpdateUserImages}
              />
            )
          )}
        </main>
      </div>

      {activeRoomId && activeRoom && currentView === 'dashboard' && (
        <RoomModal
          room={activeRoom}
          allRooms={rooms}
          logs={logs.filter(l => l.roomId === activeRoomId)}
          onClose={() => setActiveRoomId(null)}
          onUpdateName={(id, name) => { lastLocalMutation.current = Date.now(); isDirty.current = true; updateRoomName(id, name); }}
          onReceive={(rid, data, q, p, date, exp) => { lastLocalMutation.current = Date.now(); isDirty.current = true; receiveStock(rid, data, q, p, date, exp); }}
          onReceiveBatch={(rid, items) => receiveStockBatch(rid, items)}
          onUpdateQty={(rid, iid, d) => { lastLocalMutation.current = Date.now(); isDirty.current = true; updateItemQty(rid, iid, d); }}
          onUpdateBatchQty={(rid, iid, bidx, d) => { lastLocalMutation.current = Date.now(); isDirty.current = true; updateItemBatchQty(rid, iid, bidx, d); }}
          onTransfer={(frid, trid, iid, q) => { lastLocalMutation.current = Date.now(); isDirty.current = true; moveItem(frid, trid, iid, q); }}
          onDeleteItem={(rid, iid) => { lastLocalMutation.current = Date.now(); isDirty.current = true; deleteItem(rid, iid); }}
          onUpdateItem={(rid, iid, data) => { lastLocalMutation.current = Date.now(); isDirty.current = true; updateItemMetadata(rid, iid, data); }}
          onUpdateBatch={(rid, iid, bid, data) => { lastLocalMutation.current = Date.now(); isDirty.current = true; updateBatchMetadata(rid, iid, bid, data); }}
          readOnly={!canEditItems}
        />
      )}

      {pendingRoomDelete && (
        <div
          data-cat-ignore="true"
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/45 backdrop-blur-sm p-4"
        >
          <div
            data-cat-ignore="true"
            className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-500 mb-2">Delete room</p>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">
                Delete "{pendingRoomDelete.name}"?
              </h3>
              <p className="mt-2 text-sm font-medium text-slate-500 leading-6">
                This room contains {pendingRoomDelete.items.length} SKU. Choose what should happen to the items before the room is removed from the clinic map.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <button
                onClick={() => {
                  deleteRoom(pendingRoomDelete.id, 'delete');
                  setPendingRoomDeleteId(null);
                }}
                className="w-full text-left rounded-2xl border border-rose-100 bg-rose-50/60 p-4 hover:bg-rose-50 transition-colors"
              >
                <span className="block text-sm font-black text-rose-600">Delete items with room</span>
                <span className="mt-1 block text-xs font-medium text-slate-500 leading-5">
                  Items will be removed from inventory. Purchase history for this room will show Archived in the Location column.
                </span>
              </button>

              <div className="rounded-2xl border border-slate-200 p-4">
                <label className="block text-sm font-black text-slate-700 mb-2">Transfer items to another room</label>
                <select
                  data-cat-ignore="true"
                  value={deleteRoomTransferTargetId}
                  onChange={e => setDeleteRoomTransferTargetId(e.target.value)}
                  disabled={roomDeleteTransferTargets.length === 0}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none disabled:bg-slate-50 disabled:text-slate-300"
                >
                  {roomDeleteTransferTargets.length === 0 ? (
                    <option value="">No other room available</option>
                  ) : (
                    roomDeleteTransferTargets.map(room => (
                      <option key={room.id} value={room.id}>{room.name}</option>
                    ))
                  )}
                </select>
                <button
                  onClick={() => {
                    if (!deleteRoomTransferTargetId) return;
                    deleteRoom(pendingRoomDelete.id, 'transfer', deleteRoomTransferTargetId);
                    setPendingRoomDeleteId(null);
                  }}
                  disabled={!deleteRoomTransferTargetId || roomDeleteTransferTargets.length === 0}
                  className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Transfer and delete room
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
              <button
                onClick={() => setPendingRoomDeleteId(null)}
                className="rounded-xl px-4 py-2 text-sm font-black text-slate-500 hover:bg-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <CollaboratorModal
        isOpen={isCollaboratorModalOpen}
        onClose={() => setIsCollaboratorModalOpen(false)}
        currentUser={user}
      />

      <TutorialVideoModal
        isOpen={showTutorialVideo}
        onClose={() => setShowTutorialVideo(false)}
      />

      {!isVirtualPetOpen && (
        <>
        <CatMascot onCatClick={() => setIsVirtualPetOpen(true)} disabled={!isAuthenticated} />
        <MolarAIFloat
          isOpen={isChatOpen}
          onOpen={() => setIsChatOpen(true)}
          onClose={() => setIsChatOpen(false)}
          chatHistory={chatHistory}
          isChatLoading={isChatLoading}
          chatInput={chatInput}
          setChatInput={setChatInput}
          onSendMessage={handleSendChat}
          onClearChat={handleClearChat}
          chatEndRef={chatEndRef}
          onPetToggle={() => {
            setIsChatOpen(false);
            setIsVirtualPetOpen(true);
          }}
          disabled={!isAuthenticated}
        />
        </>
      )}

      <VirtualPetContainer isOpen={isVirtualPetOpen} onClose={() => setIsVirtualPetOpen(false)} />
    </div>
  );
};

export default App;
