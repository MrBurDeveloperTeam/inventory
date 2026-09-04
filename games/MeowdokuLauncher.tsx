// INVENTORY-MOLAR-PRODUCTION-PARITY-HOTFIX-1: host-local Meowdoku launcher.
//
// Inventory had Meowdoku before the SharedVirtualPet migration (see the
// production-parent `08f19e93`'s `VirtualPet/components/GamePage.tsx`).
// This file extracts ONLY that game's iframe/postMessage behavior — not
// the old GamePage's generic multi-game chrome/Flappy/Pac-Cat/Tetris
// handling, which now lives entirely inside
// `@mrburdeveloperteam/molar-experience/pet`'s `SharedVirtualPet`.
//
// Coin persistence is routed exclusively through `inventoryPetRepository`
// (the same atomic RPCs SharedVirtualPet itself uses) so Meowdoku and the
// Shared Virtual Pet always read/write the SAME balance — no parallel
// local wallet. The legacy "+15 happiness on reward" behavior is
// preserved via `loadSnapshot`/`saveSnapshot`, touching only `happiness`
// and never independently overwriting coins/xp/level.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { inventoryPetRepository } from '../petExperience/inventoryPetRepository';

// Versions the iframe document itself — mobile browsers can otherwise keep
// an older Meowdoku HTML shell (and therefore an older game.js URL) even
// after the main application has been updated. Same asset, same query
// convention as the pre-migration production source.
const MEOWDOKU_URL = '/games/meowdoku/index.html?v=20260817-color-contrast-v1';

interface MeowdokuLauncherProps {
  isOpen: boolean;
  onClose: () => void;
  /** Current authenticated Supabase user id — Pet/Meowdoku's shared
   *  identity boundary (same value passed to InventoryVirtualPet). `null`
   *  means signed-out; Meowdoku then runs read-only/local-progress-only,
   *  matching the pre-migration source's own guest handling. */
  userId: string | null;
}

export default function MeowdokuLauncher({ isOpen, onClose, userId }: MeowdokuLauncherProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) setIsLoading(true);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const post = (payload: unknown) => {
      iframeRef.current?.contentWindow?.postMessage(payload, window.location.origin);
    };

    const sendWallet = async () => {
      if (!userId) {
        post({ type: 'MEOWDOKU_WALLET', coins: 0 });
        return;
      }
      try {
        const snapshot = await inventoryPetRepository.loadSnapshot(userId);
        post({ type: 'MEOWDOKU_WALLET', coins: snapshot?.stats.coins ?? 0 });
      } catch (err) {
        console.error('[MeowdokuLauncher] Failed to load wallet balance:', err);
        post({ type: 'MEOWDOKU_WALLET', coins: 0 });
      }
    };

    const sendUnlockedAchievements = (value: unknown) => {
      const achievements = Array.isArray(value) ? value : [];
      if (!achievements.length) return;
      post({ type: 'MEOWDOKU_ACHIEVEMENTS_UNLOCKED', achievements });
    };

    const loadAchievements = async () => {
      if (!userId) return;
      const { data, error } = await supabase.rpc('meowdoku_get_achievements');
      post(
        error
          ? { type: 'MEOWDOKU_ACHIEVEMENTS_ERROR', message: error.message }
          : { type: 'MEOWDOKU_ACHIEVEMENTS', achievements: data }
      );
    };

    const loadCheckIn = async () => {
      if (!userId) return;
      const { data, error } = await supabase.rpc('meowdoku_get_check_in');
      post(
        error
          ? { type: 'MEOWDOKU_CHECK_IN_ERROR', message: error.message }
          : { type: 'MEOWDOKU_CHECK_IN', checkIn: data }
      );
    };

    const loadProgress = async (): Promise<boolean> => {
      if (!userId) {
        post({ type: 'MEOWDOKU_PROGRESS_LOCAL_ONLY' });
        return false;
      }

      const { data, error } = await supabase.rpc('meowdoku_get_mode_progress');
      if (error) {
        console.error('[MeowdokuLauncher] Unable to load Meowdoku progress:', error);
        post({ type: 'MEOWDOKU_PROGRESS_LOCAL_ONLY' });
        return true;
      }

      const progress = Array.isArray(data) ? data[0] : data;
      post({
        type: 'MEOWDOKU_PROGRESS',
        progress: {
          unlocked_level: Math.max(1, Math.min(60, Number(progress?.unlocked_level) || 1)),
          completed_modes:
            progress?.completed_modes && typeof progress.completed_modes === 'object'
              ? (progress.completed_modes as Record<string, unknown>)
              : {},
        },
      });
      return true;
    };

    const initializeMeowdoku = async () => {
      await sendWallet();
      const hasAuthenticatedUser = await loadProgress();
      if (!hasAuthenticatedUser) return;
      await Promise.all([loadCheckIn(), loadAchievements()]);
    };

    const saveMeowdokuProgress = async (payload: {
      completed_level?: unknown;
      mode?: unknown;
      score?: unknown;
      mistakes?: unknown;
      time_seconds?: unknown;
      hints_used?: unknown;
      lives_remaining?: unknown;
    }) => {
      if (!userId) return;

      const completedLevel = Math.max(1, Math.min(60, Math.floor(Number(payload.completed_level) || 0)));
      if (!completedLevel) return;
      const mode = String(payload.mode || '').toLowerCase();
      if (!['easy', 'medium', 'hard', 'hell'].includes(mode)) return;

      const { data, error } = await supabase.rpc('meowdoku_complete_mode_with_achievements', {
        p_level_number: completedLevel,
        p_mode: mode,
        p_score: Math.max(0, Math.floor(Number(payload.score) || 0)),
        p_mistakes: Math.max(0, Math.floor(Number(payload.mistakes) || 0)),
        p_time_seconds: Math.max(0, Math.floor(Number(payload.time_seconds) || 0)),
        p_hints_used: Math.max(0, Math.floor(Number(payload.hints_used) || 0)),
        p_lives_remaining: Math.max(1, Math.min(3, Math.floor(Number(payload.lives_remaining) || 3))),
      });

      if (error) {
        console.error('[MeowdokuLauncher] Unable to save Meowdoku progress:', error);
        return;
      }
      const result = Array.isArray(data) ? data[0] : data;
      sendUnlockedAchievements(result?.new_achievements);
      await loadProgress();
      await loadAchievements();
    };

    const recordMeowdokuCatFound = async (payload: { level?: unknown; cat_index?: unknown }) => {
      if (!userId) return;
      const { data, error } = await supabase.rpc('meowdoku_record_cat_found', {
        p_level_number: Math.max(1, Math.min(60, Math.floor(Number(payload.level) || 1))),
        p_cat_index: Math.max(0, Math.floor(Number(payload.cat_index) || 0)),
      });
      if (error) {
        console.error('[MeowdokuLauncher] Unable to save Meowdoku cat discovery:', error);
        return;
      }
      const result = Array.isArray(data) ? data[0] : data;
      sendUnlockedAchievements(result?.new_achievements);
      await loadAchievements();
    };

    const claimMeowdokuCheckIn = async () => {
      if (!userId) return;
      const { data, error } = await supabase.rpc('meowdoku_claim_check_in');
      if (error) {
        post({ type: 'MEOWDOKU_CHECK_IN_ERROR', message: error.message });
        return;
      }
      const result = Array.isArray(data) ? data[0] : data;
      post({ type: 'MEOWDOKU_CHECK_IN_CLAIMED', checkIn: result });
      sendUnlockedAchievements(result?.new_achievements);
      await loadAchievements();
      // Check-in coin grants happen server-side inside the RPC — refresh
      // the wallet display from the atomic source of truth rather than
      // trusting/echoing any client-side arithmetic.
      await sendWallet();
    };

    const spendMeowdokuCoins = async (data: { amount?: unknown; requestId?: unknown }) => {
      const amount = Math.max(0, Math.floor(Number(data.amount) || 0));
      const requestId = String(data.requestId || '');
      if (!userId || amount <= 0) {
        post({ type: 'MEOWDOKU_SPEND_RESULT', requestId, ok: false });
        return;
      }
      try {
        // mutateCoins throws rather than clamping when a spend would take
        // the atomic server-side balance below 0 — that failure IS the
        // "can't afford it" signal, matching the legacy affordability
        // check without a separate read-then-write race.
        await inventoryPetRepository.mutateCoins(userId, -amount);
        post({ type: 'MEOWDOKU_SPEND_RESULT', requestId, ok: true });
      } catch (err) {
        console.error('[MeowdokuLauncher] Meowdoku coin spend rejected:', err);
        post({ type: 'MEOWDOKU_SPEND_RESULT', requestId, ok: false });
      }
    };

    const applyMeowdokuReward = async (data: { coins?: unknown }) => {
      if (!userId) return;
      const reward = Math.max(0, Math.min(1000, Math.floor(Number(data.coins) || 0)));
      if (reward <= 0) return;

      try {
        await inventoryPetRepository.mutateCoins(userId, reward);
      } catch (err) {
        console.error('[MeowdokuLauncher] Unable to grant Meowdoku reward coins:', err);
      }

      // Legacy +15 happiness reward: load the current snapshot and save it
      // back with happiness bumped (capped at 100) — never independently
      // touch coins/xp/level here, those already went through their own
      // sanctioned atomic paths (mutateCoins above / addXP elsewhere).
      try {
        const snapshot = await inventoryPetRepository.loadSnapshot(userId);
        if (snapshot) {
          await inventoryPetRepository.saveSnapshot({
            ...snapshot,
            stats: {
              ...snapshot.stats,
              happiness: Math.min(100, (snapshot.stats.happiness ?? 0) + 15),
            },
          });
        }
      } catch (err) {
        console.error('[MeowdokuLauncher] Unable to apply Meowdoku happiness reward:', err);
      }
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;

      const type = event.data?.type;
      if (type === 'MEOWDOKU_READY') void initializeMeowdoku();
      else if (type === 'MEOWDOKU_SAVE_PROGRESS') void saveMeowdokuProgress(event.data.progress || {});
      else if (type === 'MEOWDOKU_CAT_FOUND') void recordMeowdokuCatFound(event.data || {});
      else if (type === 'MEOWDOKU_GET_CHECK_IN') void loadCheckIn();
      else if (type === 'MEOWDOKU_CLAIM_CHECK_IN') void claimMeowdokuCheckIn();
      else if (type === 'MEOWDOKU_GET_ACHIEVEMENTS') void loadAchievements();
      else if (type === 'MEOWDOKU_SPEND_COINS') void spendMeowdokuCoins(event.data || {});
      else if (type === 'MEOWDOKU_REWARD') void applyMeowdokuReward(event.data || {});
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
    // Re-registers (and the cleanup above tears down the prior listener)
    // whenever `userId` changes, so an account switch can never let a
    // stale closure act on the previous user's identity/coins.
  }, [isOpen, userId]);

  // Preserve the same scroll-lock behavior the legacy GamePage applied
  // while a game overlay is on screen.
  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] overflow-hidden bg-[#f3f6ff]" style={{ fontFamily: "'Fredoka', sans-serif" }}>
      <div className="relative h-full w-full">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-[calc(12px+env(safe-area-inset-top))] z-10 flex h-11 w-11 shrink-0 appearance-none items-center justify-center rounded-full border border-slate-200/80 bg-white/90 p-0 text-black shadow-xl shadow-slate-900/10 backdrop-blur-md transition-all hover:scale-105 hover:bg-white active:scale-95 sm:h-12 sm:w-12"
          title="Close Meowdoku"
          aria-label="Close Meowdoku"
        >
          <span className="text-2xl font-black leading-none sm:text-3xl">×</span>
        </button>

        {isLoading && (
          <div className="absolute inset-0 z-[5] flex items-center justify-center bg-[#f3f6ff]">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 animate-spin rounded-full border-4 border-slate-300 border-t-slate-600" />
              <span className="text-sm text-slate-500">Loading Meowdoku...</span>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={MEOWDOKU_URL}
          className="block h-full w-full border-0 shadow-none outline-none"
          title="Meowdoku"
          onLoad={() => setIsLoading(false)}
          allow="autoplay; fullscreen; screen-wake-lock"
          allowFullScreen
          scrolling="no"
        />
      </div>
    </div>
  );
}
