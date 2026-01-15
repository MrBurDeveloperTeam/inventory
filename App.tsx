
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Room, Item, ActivityLog, PurchaseHistory, UserProfile, ItemBatch, CatPosition } from './types';
import { PRESET_BLUEPRINTS } from './constants';
import MasterInventory from './MasterInventory';
import Header from './Header';
import ClinicMap from './ClinicMap';
import RoomModal from './RoomModal';
import LandingModal from './LandingModal';
import ProfilePage from './ProfilePage';
import AdminDashboard from './AdminDashboard';
import { supabase } from './supabaseClient';

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
};

const PROFILE_IMAGE_STORAGE_PREFIX = 'denta_profile_images_';
const PROFILE_IMAGE_BUCKET = 'profile-media';

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
    batches.push({ qty, unitPrice: price, expiryDate: key });
  }
  const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(batches);
  return { ...normalized, batches, quantity: totalQty, price: avgPrice, expiryDate: earliestExpiry };
};

const adjustBatchesWithDelta = (item: Item, delta: number) => {
  const normalized = ensureBatches(item);
  let batches = normalized.batches ? normalized.batches.map(b => ({ ...b })) : [];
  if (delta > 0) {
    if (batches.length === 0) batches.push({ qty: 0, unitPrice: normalized.price, expiryDate: normalized.expiryDate || null });
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
  const [history, setHistory] = useState<PurchaseHistory[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [blueprint, setBlueprint] = useState<string | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isBootstrapped, setIsBootstrapped] = useState<boolean>(false);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [managedProfiles, setManagedProfiles] = useState<ProfileRow[]>([]);
  const [managedInventories, setManagedInventories] = useState<ManagedInventory[]>([]);
  const [adminDataLoading, setAdminDataLoading] = useState<boolean>(false);
  const [adminDataError, setAdminDataError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'profile'>('dashboard');

  const [isLocked, setIsLocked] = useState(false);
  const [isAddMode, setIsAddMode] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [catPosition, setCatPosition] = useState<CatPosition>({ x: 20, y: 20 });
  const syncInFlight = useRef(false);

  useEffect(() => {
    const fetchSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        await bootstrapUser(data.session.user.id);
      } else {
        setBlueprint(PRESET_BLUEPRINTS[0].url);
      }
    };
    fetchSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        bootstrapUser(session.user.id);
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
          totalPrice: Number(h.total_price) || 0,
          location: h.location || '',
          category: h.category || 'other',
          roomId: h.room_id || '',
          uom: h.uom || 'pcs',
          expiryDate: h.expiry_date || null
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

      const prepared: ManagedInventory[] = Array.from(metaByUser.keys()).map(userId => {
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

  const bootstrapUser = async (userId: string) => {
    setIsBootstrapped(false);
    setSupabaseUserId(userId);

    const { data: authUser } = await supabase.auth.getUser();
    const storedImages = loadUserImages(userId);

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') {
      console.error('Profile fetch error', profileError);
    }

    let finalProfile = profile;
    if (!profile && authUser.user) {
      const fallbackProfile = {
        user_id: userId,
        email: authUser.user.email || '',
        name: authUser.user.user_metadata?.name || 'User',
        account_type: (authUser.user.user_metadata?.account_type as any) || 'individual',
        phone: authUser.user.user_metadata?.phone || '',
        position: authUser.user.user_metadata?.position || '',
        company_name: authUser.user.user_metadata?.company_name || null
      };
      const { data: insertedProfile, error: insertProfileError } = await supabase
        .from('profiles')
        .upsert(fallbackProfile, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (insertProfileError) {
        console.error('Profile upsert during bootstrap error', insertProfileError);
      } else {
        finalProfile = insertedProfile;
      }
    }

    const accountTypeValue = (finalProfile?.account_type as any) || (authUser.user?.user_metadata?.account_type as any) || 'individual';
    const profileSource = finalProfile || (authUser.user ? {
      name: authUser.user.user_metadata?.name || authUser.user.email || 'User',
      email: authUser.user.email || '',
      phone: authUser.user.user_metadata?.phone || '',
      position: authUser.user.user_metadata?.position || '',
      companyName: authUser.user.user_metadata?.company_name || undefined
    } : null);

    if (profileSource) {
      setUser({
        name: profileSource.name || 'User',
        email: profileSource.email,
        accountType: accountTypeValue as any,
        phone: (profileSource as any).phone || '',
        position: (profileSource as any).position || '',
        companyName: (profileSource as any).companyName || (profileSource as any).company_name || undefined,
        avatarUrl: (profileSource as any).avatar_url || storedImages.avatarUrl,
        backgroundUrl: (profileSource as any).background_url || storedImages.backgroundUrl
      });
    }

    const { data: meta } = await supabase
      .from('inventory_meta')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const { data: roomsData, error: roomsError } = await supabase
      .from('inventory_rooms')
      .select('id, name, pos_x, pos_y')
      .eq('user_id', userId);
    if (roomsError) {
      console.error('Rooms fetch error', roomsError);
    }

    const roomIds = (roomsData || []).map((r: any) => r.id);
    const { data: itemsData } = roomIds.length
      ? await supabase.from('inventory_items').select('*, item_batches:inventory_item_batches(*)').in('room_id', roomIds)
      : { data: [] as any[] };

    const { data: historyData } = await supabase
      .from('inventory_purchase_history')
      .select('*')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false });

    const { data: logData } = await supabase
      .from('inventory_activity_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const itemsByRoom: Record<string, Item[]> = {};
    (itemsData || []).forEach((row: any) => {
      const batches: ItemBatch[] = (row.item_batches || []).map((b: any) => ({
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

    setRooms(hydratedRooms);
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
        expiryDate: h.expiry_date || null
      }))
    );
    setLogs(
      (logData || []).map((l: any) => ({
        id: l.id,
        timestamp: l.created_at,
        roomId: l.room_id || '',
        roomName: l.room_name || '',
        action: l.action,
        details: l.details
      }))
    );
    setBlueprint(meta?.blueprint || PRESET_BLUEPRINTS[0].url);
    setCatPosition({
      x: meta?.cat_position_x !== undefined ? Number(meta.cat_position_x) : 20,
      y: meta?.cat_position_y !== undefined ? Number(meta.cat_position_y) : 20
    });

    const isUserAdmin = accountTypeValue === 'admin';
    setIsAdmin(isUserAdmin);
    if (isUserAdmin) {
      await fetchAdminData(true);
    } else {
      setManagedProfiles([]);
      setManagedInventories([]);
    }

    setIsAuthenticated(!!authUser.user);
    setIsBootstrapped(true);
  };

  const handleLogin = async (userProfile: UserProfile) => {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id || null;
    if (userId) setSupabaseUserId(userId);
    const storedImages = userId ? loadUserImages(userId) : {};

    setIsAdmin(userProfile.accountType === 'admin');
    setUser({ ...userProfile, ...storedImages });
    setIsAuthenticated(true);
    setCurrentView('dashboard');
    if (userId) {
      const { error } = await supabase.from('profiles').upsert({
        user_id: userId,
        email: userProfile.email,
        name: userProfile.name,
        account_type: userProfile.accountType,
        phone: userProfile.phone,
        position: userProfile.position,
        company_name: userProfile.companyName,
        avatar_url: storedImages.avatarUrl || null,
        background_url: storedImages.backgroundUrl || null
      });
      if (error) console.error('Profile upsert error', error);
      await bootstrapUser(userId);
    }
  };

  const handleLogout = async () => {
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
        company_name: user?.companyName || null,
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

  const addRoom = (x: number, y: number) => {
    setRooms(prev => {
      const roomNumbers = prev
        .map(r => {
          const match = r.name.match(/^Room (\d+)$/);
          return match ? parseInt(match[1], 10) : null;
        })
        .filter((n): n is number => n !== null);

      const nextNumber = roomNumbers.length > 0
        ? Math.max(...roomNumbers) + 1
        : 1;

      const newRoom: Room = {
        id: crypto.randomUUID(),
        name: `Room ${nextNumber}`,
        x,
        y,
        items: [],
      };

      return [...prev, newRoom];
    });

    setIsAddMode(false);
  };

  const deleteRoom = (id: string) => setRooms(prev => prev.filter(r => r.id !== id));

  const updateRoomName = (id: string, name: string) =>
    setRooms(prev => prev.map(r => r.id === id ? { ...r, name } : r));

  const addActivity = (roomId: string, roomName: string, action: ActivityLog['action'], details: string) => {
    const timestamp = new Date().toISOString();
    const newLog: ActivityLog = {
      id: crypto.randomUUID(),
      timestamp,
      roomId,
      roomName,
      action,
      details
    };
    setLogs(prev => {
      const isDuplicate = prev.some(l =>
        l.action === action &&
        l.roomId === roomId &&
        l.details === details &&
        Math.abs(new Date(l.timestamp).getTime() - new Date(timestamp).getTime()) < 1500 // within 1.5s
      );
      if (isDuplicate) return prev;
      return [newLog, ...prev].slice(0, 100);
    });
  };

  const receiveStock = (roomId: string, itemData: Partial<Item>, qty: number, price: number, purchaseDate: string, expiry?: string) => {
    setRooms(prev => prev.map(room => {
      if (room.id !== roomId) return room;
      const existingItem = room.items.find(i =>
        i.name.toLowerCase() === itemData.name?.toLowerCase() &&
        (itemData.brand ? i.brand.toLowerCase() === itemData.brand.toLowerCase() : true)
      );
      let updatedItems;
      if (existingItem) {
        const merged = mergeBatchAdd(existingItem, qty, price, expiry);
        updatedItems = room.items.map(i => i.id === existingItem.id ? merged : i);
      } else {
        const newItem: Item = {
          id: crypto.randomUUID(),
          name: itemData.name || '',
          brand: itemData.brand || '',
          code: itemData.code || '',
          quantity: qty,
          price: price,
          uom: itemData.uom || 'pcs',
          vendor: itemData.vendor || '',
          category: itemData.category || 'other',
          description: itemData.description || '',
          expiryDate: expiry || null,
          batches: [{
            qty,
            unitPrice: price,
            expiryDate: expiry || null
          }]
        };
        updatedItems = [...room.items, newItem];
      }
      addActivity(roomId, room.name, 'receive', `Received ${qty} ${itemData.uom || 'pcs'} of "${itemData.name}" [${itemData.code || 'N/A'}] @ $${price.toFixed(2)}`);

      const historyTimestamp = purchaseDate ? new Date(`${purchaseDate}T00:00:00`).toISOString() : new Date().toISOString();
      const historyEntry: PurchaseHistory = {
        id: crypto.randomUUID(),
        timestamp: historyTimestamp,
        productName: itemData.name || '',
        brand: itemData.brand || '',
        code: itemData.code || '',
        vendor: itemData.vendor || '',
        qty,
        unitPrice: price,
        totalPrice: qty * price,
        location: room.name,
        category: itemData.category || 'other',
        roomId: room.id,
        uom: itemData.uom || existingItem?.uom || 'pcs',
        expiryDate: expiry
      };
      setHistory(h => {
        const duplicate = h.some(
          entry =>
            entry.id === historyEntry.id ||
            (entry.productName === historyEntry.productName &&
              entry.roomId === historyEntry.roomId &&
              entry.qty === historyEntry.qty &&
              entry.unitPrice === historyEntry.unitPrice &&
              entry.timestamp === historyEntry.timestamp)
        );
        return duplicate ? h : [historyEntry, ...h];
      });
      return { ...room, items: updatedItems };
    }));
  };

  const updateItemQty = (roomId: string, itemId: string, delta: number) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        items: r.items.map(i => {
          if (i.id !== itemId) return i;
          if (delta < 0 && i.quantity <= 1) return i;
          const safeDelta = delta < 0 ? Math.max(delta, -(i.quantity - 1)) : delta;
          if (safeDelta === 0) return i;
          const adjusted = adjustBatchesWithDelta(i, safeDelta);
          if (adjusted.quantity !== i.quantity) {
            addActivity(roomId, r.name, 'edit', `Adjusted qty of "${i.name}" to ${adjusted.quantity}`);
          }
          return adjusted;
        })
      };
    }));
  };

  const updateItemBatchQty = (roomId: string, itemId: string, batchIndex: number, delta: number) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      return {
        ...r,
        items: r.items.map(i => {
          if (i.id !== itemId) return i;
          const normalized = ensureBatches(i);
          const batches = normalized.batches ? normalized.batches.map(b => ({ ...b })) : [];
          if (batchIndex < 0 || batchIndex >= batches.length) return normalized;
          const b = batches[batchIndex];
          if (delta < 0 && b.qty <= 1) return normalized;
          const safeDelta = delta < 0 ? Math.max(delta, -(b.qty - 1)) : delta;
          if (safeDelta === 0) return normalized;
          const newQty = Math.max(0, b.qty + safeDelta);
          batches[batchIndex] = { ...b, qty: newQty };
          const filtered = batches.filter(x => x.qty > 0);
          const { totalQty, avgPrice, earliestExpiry } = summarizeBatches(filtered);
          const adjusted = { ...normalized, batches: filtered, quantity: totalQty, price: avgPrice, expiryDate: earliestExpiry };
          if (adjusted.quantity !== i.quantity) {
            addActivity(roomId, r.name, 'edit', `Adjusted batch qty of "${i.name}" to ${adjusted.quantity}`);
          }
          return adjusted;
        })
      };
    }));
  };

  const deleteItem = (roomId: string, itemId: string) => {
    setRooms(prev => prev.map(r => {
      if (r.id !== roomId) return r;
      const item = r.items.find(i => i.id === itemId);
      const updated = r.items.filter(i => i.id !== itemId);
      if (item) {
        addActivity(roomId, r.name, 'delete', `Deleted "${item.name}"`);
      }
      return { ...r, items: updated };
    }));
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
        moved.push({ ...batch, qty: move });
      }
      const leftover = batch.qty - move;
      if (leftover > 0) {
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
    const byExpiry = new Map<string | null, { qty: number; unitPrice: number; expiryDate: string | null }>();
    all.forEach(batch => {
      const key = batch.expiryDate || null;
      const existing = byExpiry.get(key);
      if (!existing) {
        byExpiry.set(key, { qty: batch.qty, unitPrice: batch.unitPrice, expiryDate: batch.expiryDate || null });
      } else {
        const totalQty = existing.qty + batch.qty;
        const totalValue = (existing.qty * existing.unitPrice) + (batch.qty * batch.unitPrice);
        byExpiry.set(key, {
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

  const moveItem = (fromRoomId: string, toRoomId: string, itemId: string, quantity: number) => {
    const fromRoom = rooms.find(r => r.id === fromRoomId);
    const toRoom = rooms.find(r => r.id === toRoomId);
    const item = fromRoom?.items.find(i => i.id === itemId);
    if (!fromRoom || !toRoom || !item) return;

    const qtyToMove = Math.min(Math.max(quantity || 0, 1), item.quantity);
    const remainingQty = item.quantity - qtyToMove;
    const { kept, moved } = splitBatchesForTransfer(item.batches, qtyToMove);
    const movedItemId = remainingQty > 0 ? crypto.randomUUID() : item.id;

    const movedBatches = moved.length ? moved : item.batches || [];
    const { totalQty: movedQty, avgPrice: movedPrice, earliestExpiry: movedExpiry } = summarizeBatches(movedBatches);
    const movedItem = {
      ...item,
      id: movedItemId,
      quantity: movedQty,
      price: movedPrice,
      batches: movedBatches,
      expiryDate: movedExpiry
    };

    const keptBatches = kept.length ? kept : item.batches || [];
    const { totalQty: keptQty, avgPrice: keptPrice, earliestExpiry: keptExpiry } = summarizeBatches(keptBatches);
    const remainingItem = remainingQty > 0 ? {
      ...item,
      quantity: keptQty,
      price: keptPrice,
      batches: keptBatches,
      expiryDate: keptExpiry
    } : null;

    setRooms(prev => prev.map(r => {
      if (r.id === fromRoomId) {
        const updatedItems = r.items.flatMap(i => {
          if (i.id !== itemId) return [i];
          return remainingItem ? [remainingItem] : [];
        });
        return { ...r, items: updatedItems };
      }
      if (r.id === toRoomId) {
        const existingIdx = r.items.findIndex(i => i.name.toLowerCase() === item.name.toLowerCase() && (i.brand || '').toLowerCase() === (item.brand || '').toLowerCase());
        if (existingIdx >= 0) {
          const existingItem = r.items[existingIdx];
          const merged = mergeItemBatches(existingItem, movedItem);
          const nextItems = [...r.items];
          nextItems[existingIdx] = merged;
          return { ...r, items: nextItems };
        }
        return { ...r, items: [...r.items, movedItem] };
      }
      return r;
    }));
    addActivity(fromRoomId, fromRoom.name, 'transfer_out', `Transferred ${qtyToMove} ${item.uom} of "${item.name}" to ${toRoom.name}`);
    addActivity(toRoomId, toRoom.name, 'transfer_in', `Received ${qtyToMove} ${item.uom} of "${item.name}" from ${fromRoom.name}`);
  };

  const activeRoom = useMemo(() => rooms.find(r => r.id === activeRoomId), [rooms, activeRoomId]);

  const userInitials = useMemo(() => {
    if (!user) return 'U';
    return user.name.split(' ').map(n => n[0]).join('').toUpperCase();
  }, [user]);

  useEffect(() => {
    const sync = async () => {
      const userId = supabaseUserId;
      if (!userId || isAdmin) return;
      if (syncInFlight.current) return;
      syncInFlight.current = true;
      const logMap = new Map<string, ActivityLog>();
      logs.forEach(l => logMap.set(l.id, l));
      const uniqueLogs = Array.from(logMap.values());

      const historyMap = new Map<string, PurchaseHistory>();
      history.forEach(h => historyMap.set(h.id, h));
      const uniqueHistory = Array.from(historyMap.values());
      const uniqueRooms = (() => {
        const seenNames = new Map<string, number>();
        return rooms.map((r) => {
          const base = r.name || 'Room';
          const count = seenNames.get(base) || 0;
          seenNames.set(base, count + 1);
          const finalName = count === 0 ? base : `${base} (${count + 1})`;
          return { ...r, name: finalName };
        });
      })();
      try {
        const metaPayload = {
          user_id: userId,
          blueprint: blueprint || PRESET_BLUEPRINTS[0].url,
          cat_position_x: catPosition.x,
          cat_position_y: catPosition.y
        };
        const metaResult = await supabase.from('inventory_meta').upsert(metaPayload);
        if (metaResult.error) {
          console.error('inventory_meta upsert error', metaResult.error);
          return;
        }

        // wipe user-specific rows in dependency order to avoid FK conflicts
        await supabase.from('inventory_activity_logs').delete().eq('user_id', userId);
        await supabase.from('inventory_purchase_history').delete().eq('user_id', userId);
        await supabase.from('inventory_rooms').delete().eq('user_id', userId); // cascades to items and item_batches

        const roomRows = uniqueRooms.map(r => ({
          id: r.id,
          user_id: userId,
          name: r.name,
          pos_x: r.x,
          pos_y: r.y
        }));
        if (roomRows.length) {
          const res = await supabase.from('inventory_rooms').insert(roomRows);
          if (res.error) {
            console.error('rooms insert error', res.error);
            return;
          }
        }

        const allowedRoomIds = new Set(roomRows.map(r => r.id));

        const itemRows = uniqueRooms.flatMap(room =>
          room.items.map(item => ({
            id: item.id,
            user_id: userId,
            room_id: room.id,
            name: item.name,
            brand: item.brand,
            code: item.code,
            quantity: item.quantity,
            uom: item.uom,
            price: item.price,
            vendor: item.vendor,
            category: item.category,
            description: item.description,
            expiry_date: item.expiryDate || null
          }))
        );
        const itemMap = new Map<string, typeof itemRows[0]>();
        itemRows.forEach(r => itemMap.set(r.id, r));
        const dedupedItemRows = Array.from(itemMap.values()).filter(r => allowedRoomIds.has(r.room_id));
        if (dedupedItemRows.length) {
          const res = await supabase.from('inventory_items').upsert(dedupedItemRows, { onConflict: 'id' });
          if (res.error) console.error('items insert error', res.error);
        }

        const batchRows = uniqueRooms.flatMap(room =>
          room.items.flatMap(item =>
            (item.batches || []).map(batch => ({
              item_id: item.id,
              qty: batch.qty,
              unit_price: batch.unitPrice,
              expiry_date: batch.expiryDate || null
            }))
          )
        );
        const batchMap = new Map<string, typeof batchRows[0]>();
        batchRows.forEach(b => batchMap.set(`${b.item_id}|${b.expiry_date || 'none'}|${b.qty}|${b.unit_price}`, b));
        const dedupedBatchRows = Array.from(batchMap.values()).filter(b => dedupedItemRows.find(i => i.id === b.item_id));
        if (dedupedBatchRows.length) {
          const res = await supabase.from('inventory_item_batches').insert(dedupedBatchRows);
          if (res.error) console.error('item_batches insert error', res.error);
        }

        const historyRows = uniqueHistory.map(h => ({
          id: h.id,
          user_id: userId,
          room_id: allowedRoomIds.has(h.roomId) ? h.roomId : null,
          occurred_at: h.timestamp,
          product_name: h.productName,
          brand: h.brand,
          code: h.code,
          vendor: h.vendor,
          qty: h.qty,
          unit_price: h.unitPrice,
          total_price: h.totalPrice,
          location: h.location,
          category: h.category,
          uom: h.uom,
          expiry_date: h.expiryDate || null
        }));
        const historyMap = new Map<string, typeof historyRows[0]>();
        historyRows.forEach(h => historyMap.set(h.id, h));
        const dedupedHistoryRows = Array.from(historyMap.values());
        if (dedupedHistoryRows.length) {
          const res = await supabase.from('inventory_purchase_history').insert(dedupedHistoryRows);
          if (res.error) console.error('purchase_history insert error', res.error);
        }

        const logRows = uniqueLogs.map(l => ({
          id: l.id,
          user_id: userId,
          room_id: allowedRoomIds.has(l.roomId) ? l.roomId : null,
          room_name: l.roomName,
          action: l.action,
          details: l.details,
          created_at: l.timestamp
        }));
        const logMap = new Map<string, typeof logRows[0]>();
        logRows.forEach(l => logMap.set(l.id, l));
        const dedupedLogRows = Array.from(logMap.values());
        if (dedupedLogRows.length) {
          const res = await supabase.from('inventory_activity_logs').insert(dedupedLogRows);
          if (res.error) console.error('activity_logs insert error', res.error);
        }
      } finally {
        syncInFlight.current = false;
      }
      syncInFlight.current = false;
    };
    if (isAuthenticated && isBootstrapped) {
      const timer = setTimeout(() => {
        sync();
      }, 2000); // Debounce sync by 2 seconds
      return () => clearTimeout(timer);
    }
  }, [rooms, history, logs, blueprint, catPosition, isAuthenticated, isBootstrapped, supabaseUserId, isAdmin]);

  const adminRooms = useMemo(() => managedInventories.flatMap((inv) => inv.rooms || []), [managedInventories]);
  const adminHistory = useMemo(() => managedInventories.flatMap((inv) => inv.history || []), [managedInventories]);

  if (!isAuthenticated) {
    return <LandingModal onLogin={handleLogin} />;
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
    <div className="min-h-screen flex flex-col select-none bg-slate-50">
      <Header
        onProfileClick={() => setCurrentView('profile')}
        onDashboardClick={() => setCurrentView('dashboard')}
        onLogout={handleLogout}
        user={user}
        userInitials={userInitials}
        userAvatarUrl={user?.avatarUrl}
      />

      <div className="max-w-[1600px] mx-auto w-full flex flex-col gap-8 px-6 md:px-16 lg:px-32 py-8">
        <main className="flex-1 flex flex-col gap-8">
          {currentView === 'dashboard' ? (
            <>
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
                onDeleteRoom={deleteRoom}
                onSelectRoom={setActiveRoomId}
                onUpdateRooms={setRooms}
                onSelectTemplate={setBlueprint}
                catPosition={catPosition}
                onCatPositionChange={setCatPosition}
              />

              <MasterInventory
                rooms={rooms}
                history={history}
                logs={logs}
                onReceive={receiveStock}
                onUpdateQty={updateItemQty}
                onTransfer={moveItem}
                onDeleteItem={deleteItem}
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
          onUpdateName={updateRoomName}
          onReceive={receiveStock}
          onUpdateQty={updateItemQty}
          onUpdateBatchQty={updateItemBatchQty}
          onTransfer={moveItem}
          onDeleteItem={deleteItem}
        />
      )}
    </div>
  );
};

export default App;
