import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';
import { getPetOption, normalizePetId } from '../VirtualPet/petOptions';

const MALLOW_FRAME_WIDTH = 192;
const MALLOW_FRAME_HEIGHT = 208;
const MALLOW_SCALE = 0.42;
const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';
const MASCOT_SESSION_STATE_KEY = 'inventory_cat_mascot_session_state';
const DEFAULT_MASCOT_POSITION = { x: -10, y: 85 };
const DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS = 6000;
const MALLOW_ROWS = {
  idle: { row: 0, frames: 6, duration: '1.1s' },
  runRight: { row: 1, frames: 8, duration: '0.7s' },
  runLeft: { row: 2, frames: 8, duration: '0.7s' },
  wave: { row: 3, frames: 4, duration: '0.8s' },
  review: { row: 3, frames: 4, duration: '0.8s' },
  sleep: { row: 5, frames: 1, duration: '1s', frame: 4 },
};

const readMascotSessionState = () => {
  try {
    const raw = sessionStorage.getItem(MASCOT_SESSION_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number'
    ) {
      return null;
    }
    return {
      x: parsed.x,
      y: parsed.y,
      facingLeft: !!parsed.facingLeft,
      entryComplete: !!parsed.entryComplete,
    };
  } catch {
    return null;
  }
};

const saveMascotSessionState = ({ x, y, facingLeft, entryComplete }) => {
  try {
    sessionStorage.setItem(
      MASCOT_SESSION_STATE_KEY,
      JSON.stringify({ x, y, facingLeft, entryComplete })
    );
  } catch {
    // Ignore storage failures; the mascot can still run normally.
  }
};

function MallowMascotSprite({
  spriteSheetUrl,
  sleepHoldFrame,
  idleFrames,
  idleDuration,
  hoverRow,
  hoverFrames,
  hoverDuration,
  clickRow,
  clickFrames,
  clickDuration,
  isWalking,
  facingLeft,
  isMeowing,
  isHovered,
  isSleeping,
  onHoverStart,
  onHoverEnd,
}) {
  const shouldSleep = isSleeping && !isWalking && !isMeowing;
  const shouldReview = isHovered && !isWalking && !shouldSleep;
  const stateClass = shouldSleep ? 'sleep' : shouldReview ? 'review' : isWalking ? (facingLeft ? 'run-left' : 'run-right') : 'idle';
  const reviewConfig = {
    row: hoverRow ?? MALLOW_ROWS.review.row,
    frames: hoverFrames ?? MALLOW_ROWS.review.frames,
    duration: hoverDuration ?? MALLOW_ROWS.review.duration,
  };
  const clickConfig = {
    row: clickRow ?? MALLOW_ROWS.wave.row,
    frames: clickFrames ?? MALLOW_ROWS.wave.frames,
    duration: clickDuration ?? MALLOW_ROWS.wave.duration,
  };
  const idleConfig = {
    ...MALLOW_ROWS.idle,
    frames: idleFrames ?? MALLOW_ROWS.idle.frames,
    duration: idleDuration ?? MALLOW_ROWS.idle.duration,
  };
  const config = shouldSleep
    ? { ...MALLOW_ROWS.sleep, frame: sleepHoldFrame ?? MALLOW_ROWS.sleep.frame }
    : shouldReview
      ? reviewConfig
      : isMeowing && !isWalking
        ? clickConfig
        : facingLeft && isWalking
          ? MALLOW_ROWS.runLeft
          : isWalking
            ? MALLOW_ROWS.runRight
            : idleConfig;

  return (
    <div
      className={`mallow-mascot ${stateClass} frames-${config.frames} ${isMeowing ? 'is-talking' : ''}`}
      aria-label={`Mallow pet ${stateClass}`}
      onPointerEnter={onHoverStart}
      onMouseEnter={onHoverStart}
      onMouseOver={onHoverStart}
      onPointerLeave={onHoverEnd}
      onMouseLeave={onHoverEnd}
      style={{
        '--sprite-row': config.row,
        '--sprite-frames': config.frames,
        '--sprite-duration': config.duration,
        '--sprite-frame': config.frame ?? 0,
        '--pet-spritesheet': `url("${spriteSheetUrl}")`,
      }}
    />
  );
}

export default function CatMascot({ onCatClick, disabled = false }) {
  const restoredMascotStateRef = useRef(readMascotSessionState());
  const [catPos, setCatPos] = useState(() => {
    const restored = restoredMascotStateRef.current;
    return restored?.entryComplete ? { x: restored.x, y: restored.y } : DEFAULT_MASCOT_POSITION;
  });
  const [isWalking, setIsWalking] = useState(false);
  const [facingLeft, setFacingLeft] = useState(() => restoredMascotStateRef.current?.facingLeft ?? false);
  const [isMeowing, setIsMeowing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPetSleeping, setIsPetSleeping] = useState(() => {
    try { return localStorage.getItem(PET_SLEEPING_KEY) === 'true'; } catch { return false; }
  });
  const [selectedPetId, setSelectedPetId] = useState(() => normalizePetId(localStorage.getItem('pet_name')));
  const [walkDuration, setWalkDuration] = useState(0.8);
  const selectedPet = getPetOption(selectedPetId);

  const [dialogStep, setDialogStep] = useState(0);
  const [isDialogActive, setIsDialogActive] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const autoCloseTimerRef = useRef(null);
  const isEntryWalkComplete = useRef(!!restoredMascotStateRef.current?.entryComplete);
  // Which dialog type is currently prepared to show ('intro' | 'welcomeBack' | null),
  // and which dialog types have already been dismissed during this page lifecycle.
  // Tracking dismissal per-type (rather than one shared flag) means dismissing the
  // Post-Login Intro no longer permanently blocks the Welcome Back dialog, or vice versa.
  const currentDialogType = useRef(null);
  const dismissedDialogs = useRef(new Set());
  // Holds the auto-close duration for a prepared 'welcomeBack' dialog, set when
  // its content is fetched but only ever consumed by tryActivateDialog() at the
  // moment it actually shows — see the comment on tryActivateDialog for why.
  const welcomeBackAutoCloseMsRef = useRef(DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS);
  // Mirrors isDialogActive synchronously (React state updates aren't immediate).
  // Without this, tryActivateDialog() can be called again while a dialog is
  // already showing (e.g. StrictMode's dev double-invoke of the fetch effect,
  // or the click-to-move handler firing again) and would re-arm the Welcome
  // Back timer from scratch every time, so it could keep getting reset before
  // ever completing a full countdown.
  const isDialogActiveRef = useRef(false);
  // Unlike the other 6 Snabbb apps, this CatMascot instance is never unmounted
  // across login/logout (rendered once with disabled={!isAuthenticated}, no key).
  // Tracks the previous `disabled` value so a logged-out -> logged-in transition
  // (a real new auth session, detected via the auth boundary itself rather than
  // comparing userIds, since the same user can log back in with the same id) can
  // clear dismissedDialogs — otherwise a 'welcomeBack' dismissed in a prior
  // session would keep suppressing it after a fresh re-login in the same tab.
  const prevDisabledRef = useRef(disabled);
  // Bumped at the start of every initDialog() run. Async Supabase calls check
  // this after each await and bail out if a newer run has since started (e.g.
  // disabled flipped due to logout/login) — so a slow, stale request from a
  // previous session can never apply its result (dialog steps, dialog type)
  // to a later session or a different user.
  const initDialogRequestIdRef = useRef(0);

  const clearWelcomeBackAutoCloseTimer = () => {
    if (autoCloseTimerRef.current !== null) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
  };

  const startWelcomeBackAutoCloseTimer = () => {
    clearWelcomeBackAutoCloseTimer();

    const configuredDuration = Number(welcomeBackAutoCloseMsRef.current);
    const duration = Number.isFinite(configuredDuration) && configuredDuration > 0
      ? configuredDuration
      : DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS;

    autoCloseTimerRef.current = setTimeout(() => {
      autoCloseTimerRef.current = null;
      closeDialog();
    }, duration);
  };

  // Marks the Post-Login Intro stage complete for a given user — either because
  // they actually dismissed a visible Intro, or because a successful query
  // confirmed there's no Intro configured/usable to show. Takes an explicit
  // userId (rather than reading currentUserId state) so it's safe to call from
  // inside initDialog() itself, where the just-fetched userId may not yet be
  // reflected in currentUserId (state updates aren't synchronous).
  const markIntroCompleted = (uid) => {
    if (!uid) return;
    localStorage.setItem(`intro_shown_${uid}`, 'true');
  };

  // Fetches and prepares the Welcome Back dialog for a given user. Used both
  // when intro_shown_<userId> is already 'true' on entry, and as a same-login
  // fallback right after markIntroCompleted() when the Intro stage turns out
  // to have no usable content. Takes an explicit requestId (see
  // initDialogRequestIdRef) and bails out after every await if a newer
  // initDialog() run has since started — e.g. disabled flipped back to true,
  // or the user logged out/in again — so a slow, stale request can never
  // apply its result to a later session or a different user.
  const prepareWelcomeBackDialog = async (uid, userMeta, userEmail, requestId) => {
    try {
      const { data: config, error } = await supabase
        .from('aiboard_simulator_configs')
        .select('welcome_back_text, welcome_back_auto_close_ms')
        .eq('module_name', 'Inventory')
        .limit(1)
        .maybeSingle();

      if (initDialogRequestIdRef.current !== requestId) return;

      let welcomeText = !error ? config?.welcome_back_text : null;
      const autoCloseMs = (!error && config?.welcome_back_auto_close_ms) || DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS;

      if (welcomeText && /\[name\]/i.test(welcomeText)) {
        let displayName = null;
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, full_name')
            .eq('user_id', uid)
            .maybeSingle();
          displayName = profile?.name || profile?.full_name || null;
        } catch (err) {
          console.error("Error fetching profile for welcome back name:", err);
        }

        if (initDialogRequestIdRef.current !== requestId) return;

        if (!displayName) displayName = userMeta?.name || null;
        if (!displayName && userEmail) displayName = userEmail.split('@')[0];
        // Never show a raw email address, even if it came from profiles.name/full_name.
        if (displayName && displayName.includes('@')) displayName = displayName.split('@')[0];

        welcomeText = displayName
          ? welcomeText.replace(/\[name\]/gi, displayName)
          : welcomeText
              .replace(/,\s*\[name\]/gi, '')
              .replace(/\[name\],\s*/gi, '')
              .replace(/\[name\]/gi, '')
              .replace(/\s{2,}/g, ' ')
              .trim();
      }

      if (initDialogRequestIdRef.current !== requestId) return;

      if (welcomeText) {
        setDialogSteps([welcomeText]);
        setDialogStep(0);
        currentDialogType.current = 'welcomeBack';
        welcomeBackAutoCloseMsRef.current = autoCloseMs;
        tryActivateDialog();
      }
    } catch (err) {
      console.error("Error fetching welcome back message:", err);
    }
  };

  const closeDialog = () => {
    const dialogType = currentDialogType.current;
    if (dialogType) {
      dismissedDialogs.current.add(dialogType);
    }
    isDialogActiveRef.current = false;
    setIsDialogActive(false);
    saveMascotSessionState({
      ...catPos,
      facingLeft,
      entryComplete: isEntryWalkComplete.current,
    });
    clearWelcomeBackAutoCloseTimer();
    if (dialogType === 'intro' && !disabled && currentUserId) {
      markIntroCompleted(currentUserId);
    }
  };

  // Single source of truth for showing a prepared dialog: only activates once the
  // entry walk has finished AND a dialog type has been prepared AND that specific
  // type hasn't already been dismissed this page lifecycle. Idempotent via
  // isDialogActiveRef — once active, further calls (StrictMode's dev double-invoke
  // of the fetch effect, click-to-move, etc.) are no-ops instead of re-arming the
  // Welcome Back timer from scratch every time.
  const tryActivateDialog = () => {
    const dialogType = currentDialogType.current;
    if (
      !isEntryWalkComplete.current ||
      !dialogType ||
      dismissedDialogs.current.has(dialogType) ||
      isDialogActiveRef.current
    ) {
      return;
    }

    isDialogActiveRef.current = true;
    setIsDialogActive(true);

    if (dialogType === 'welcomeBack') {
      startWelcomeBackAutoCloseTimer();
    }
  };

  const [dialogSteps, setDialogSteps] = useState([]);

  const [meowMsg, setMeowMsg] = useState(null);
  const [petStates, setPetStates] = useState(['Normal']);
  const meowTimerRef = useRef(null);

  // Clear message bubble immediately when state changes
  useEffect(() => {
    setMeowMsg(null);
  }, [petStates]);

  const petStatesRef = useRef(['Normal']);

  useEffect(() => {
    if (disabled) return;

    const computeStates = (stats, prevStates) => {
      const HUNGRY_ENTER = 30, HUNGRY_EXIT = 35;
      const DIRTY_ENTER = 30, DIRTY_EXIT = 35;
      const ENERGY_ENTER = 30, ENERGY_EXIT = 35;
      const HAPPY_ENTER = 40, HAPPY_EXIT = 45;

      const active = [];
      if (stats.hunger < HUNGRY_ENTER || (prevStates.includes('Hungry') && stats.hunger < HUNGRY_EXIT)) active.push('Hungry');
      if (stats.hygiene < DIRTY_ENTER || (prevStates.includes('Dirty') && stats.hygiene < DIRTY_EXIT)) active.push('Dirty');
      if (stats.energy < ENERGY_ENTER || (prevStates.includes('Low Energy') && stats.energy < ENERGY_EXIT)) active.push('Low Energy');
      if (stats.happiness < HAPPY_ENTER || (prevStates.includes('Unhappy') && stats.happiness < HAPPY_EXIT)) active.push('Unhappy');

      if (active.length === 0) active.push('Normal');
      return active;
    };

    const updateStateFromStats = (stats, updatedAt) => {
      if (!stats) return;

      let finalStats = { ...stats };

      // Apply offline decay based on updated_at
      if (updatedAt) {
        const elapsedSecs = Math.max(0, (Date.now() - new Date(updatedAt).getTime()) / 1000);
        if (elapsedSecs > 0) {
          finalStats.hunger = Math.max(0, (stats.hunger || 0) - 0.01 * elapsedSecs);
          finalStats.energy = Math.max(0, (stats.energy || 0) - 0.005 * elapsedSecs);
          finalStats.hygiene = Math.max(0, (stats.hygiene || 0) - 0.004 * elapsedSecs);
          finalStats.happiness = Math.max(0, (stats.happiness || 0) - 0.006 * elapsedSecs);
        }
      }

      const newStates = computeStates(finalStats, petStatesRef.current);
      const isDifferent = newStates.length !== petStatesRef.current.length || !newStates.every((v, i) => v === petStatesRef.current[i]);

      if (isDifferent) {
        console.log('[CatMascot] States: ' + petStatesRef.current.join(', ') + ' -> ' + newStates.join(', '));
        petStatesRef.current = newStates;
        setPetStates(newStates);
      }
    };

    // 1. Initial check from localStorage (with 5-min freshness check)
    const saved = localStorage.getItem('pet_stats');
    const lastSavedAt = localStorage.getItem('pet_last_saved_at');
    const isFresh = lastSavedAt && (Date.now() - new Date(lastSavedAt).getTime() < 300000);
    if (saved && isFresh) {
      try { updateStateFromStats(JSON.parse(saved), lastSavedAt); } catch (e) { /* ignore */ }
    }

    const readLocalSleepState = () => {
      const savedSleeping = localStorage.getItem(PET_SLEEPING_KEY);
      if (savedSleeping !== null) {
        setIsPetSleeping(savedSleeping === 'true');
      }
    };

    readLocalSleepState();
    setSelectedPetId(normalizePetId(localStorage.getItem('pet_name')));

    const handlePetSleepChange = (event) => {
      setIsPetSleeping(!!event.detail);
    };

    const handlePetSelectionChange = (event) => {
      setSelectedPetId(normalizePetId(event.detail));
    };

    const handleStorage = (event) => {
      if (event.key === PET_SLEEPING_KEY) {
        setIsPetSleeping(event.newValue === 'true');
      }
      if (event.key === 'pet_name') {
        setSelectedPetId(normalizePetId(event.newValue));
      }
    };

    window.addEventListener('virtual-pet-sleep-change', handlePetSleepChange);
    window.addEventListener('virtual-pet-selection-change', handlePetSelectionChange);
    window.addEventListener('storage', handleStorage);

    // 2. Fetch from Supabase for latest data
    const fetchStats = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const { data, error } = await supabase
          .from('inventory_pet')
          .select('hunger, hygiene, energy, happiness, is_sleeping, pet_name, updated_at')
          .eq('user_id', session.user.id)
          .maybeSingle();

          if (data && !error) {
          const nextSleeping = !!data.is_sleeping;
          setIsPetSleeping(nextSleeping);
          localStorage.setItem(PET_SLEEPING_KEY, String(nextSleeping));
          localStorage.setItem(PET_SLEEPING_UPDATED_AT_KEY, data.updated_at || new Date().toISOString());
          setSelectedPetId(normalizePetId(data.pet_name));
          updateStateFromStats(data, data.updated_at);
        }
      } catch (err) {
        console.error('Error fetching pet stats:', err);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 120000);
    // Staggered retries: SSO exchange can take 0.5–4s; the first successful call wins
    const r1 = setTimeout(fetchStats, 500);
    const r2 = setTimeout(fetchStats, 2000);
    const r3 = setTimeout(fetchStats, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(r1); clearTimeout(r2); clearTimeout(r3);
      window.removeEventListener('virtual-pet-sleep-change', handlePetSleepChange);
      window.removeEventListener('virtual-pet-selection-change', handlePetSelectionChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [disabled]);

  useEffect(() => {
    // A transition from logged-out to logged-in is a new auth session boundary.
    // Clear per-type dismissals from the previous session so a dialog dismissed
    // before logout (e.g. 'welcomeBack') doesn't keep suppressing itself forever
    // just because this component instance was never unmounted.
    const wasDisabled = prevDisabledRef.current;
    prevDisabledRef.current = disabled;
    if (wasDisabled && !disabled) {
      dismissedDialogs.current.clear();
      currentDialogType.current = null;
      // If a dialog from the previous session was left open (e.g. logout while
      // Welcome Back was still showing), fully close it so the new session's
      // dialog can activate cleanly instead of being skipped as "already active".
      if (isDialogActiveRef.current) {
        isDialogActiveRef.current = false;
        setIsDialogActive(false);
      }
      clearWelcomeBackAutoCloseTimer();
    }

    const initDialog = async () => {
      const requestId = ++initDialogRequestIdRef.current;
      let userId = null;
      let userMeta = null;
      let userEmail = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (initDialogRequestIdRef.current !== requestId) return;
        userId = session?.user?.id || null;
        userMeta = session?.user?.user_metadata || null;
        userEmail = session?.user?.email || null;
        setCurrentUserId(userId);
      } catch (err) {
        console.error("Error fetching session in initDialog:", err);
      }

      // If user is logged in (disabled = false) and has seen the intro, fetch
      // the configurable Welcome Back message and auto-close after a few seconds.
      if (!disabled && userId && localStorage.getItem(`intro_shown_${userId}`) === 'true') {
        await prepareWelcomeBackDialog(userId, userMeta, userEmail, requestId);
        return;
      }

      try {
        const { data: configs, error: configsError } = await supabase
          .from('aiboard_simulator_configs')
          .select('id')
          .eq('module_name', 'Inventory')
          .limit(1);

        if (initDialogRequestIdRef.current !== requestId) return;

        if (configsError) {
          // Infrastructure/query failure — do not mark the intro stage
          // complete; preserve the ability to retry on the next login/reload.
          return;
        }

        if (!configs || configs.length === 0) {
          // Query succeeded and confirmed no simulator config exists at all
          // for this module — there is no Intro to ever show. Mark the stage
          // complete and immediately fall back to Welcome Back in this same
          // login, instead of requiring another reload/login to see it.
          if (!disabled) {
            markIntroCompleted(userId);
            await prepareWelcomeBackDialog(userId, userMeta, userEmail, requestId);
          }
          return;
        }

        const configId = configs[0].id;

        const { data, error } = await supabase
          .from('aiboard_simulator_dialog_steps')
          .select('step_text, sort_order')
          .eq('config_id', configId)
          .eq('is_post_login', !disabled)
          .order('sort_order', { ascending: true });

        if (initDialogRequestIdRef.current !== requestId) return;

        if (error) {
          // Infrastructure/query failure — do not mark the intro stage complete.
          return;
        }

        const steps = (data || [])
          .map(d => d.step_text)
          .filter(text => typeof text === 'string' && text.trim().length > 0);

        if (steps.length > 0) {
          setDialogSteps(steps);
          setDialogStep(0);
          currentDialogType.current = 'intro';
          tryActivateDialog();
          return;
        }

        // Query succeeded but returned no usable intro content (zero rows, or
        // every row was empty/whitespace-only) — there is nothing to show.
        // Mark the stage complete and immediately fall back to Welcome Back
        // in this same login, instead of requiring another reload/login.
        if (!disabled) {
          markIntroCompleted(userId);
          await prepareWelcomeBackDialog(userId, userMeta, userEmail, requestId);
        }
      } catch (err) {
        console.error("Error fetching dialog steps:", err);
        // Do not mark the intro stage complete on an unexpected/network
        // failure — preserve the ability to retry on the next login or reload.
      }
    };

    initDialog();
  }, [disabled]);

  useEffect(() => {
    if (disabled || isDialogActive) return;

    let isSubscribed = true;

    const runMeowLoop = async () => {
      try {
        const { data: configs } = await supabase.from('aiboard_meow_configs').select('id').limit(1);
        if (!configs || configs.length === 0) return;
        const configId = configs[0].id;

        const primaryState = petStates[0] || 'Normal';

        const { data: timingData, error: timingError } = await supabase
          .from('aiboard_meow_timing')
          .select('message_duration_minutes, message_interval_minutes, disabled')
          .eq('config_id', configId)
          .eq('state', primaryState)
          .order('updated_at', { ascending: false })
          .limit(1);

        let activeTiming = timingData?.[0];

        if (timingError || !activeTiming || activeTiming.disabled) {
          if (primaryState !== 'Normal') {
            console.log(`[CatMascot] No active timing for "${primaryState}" (Error: ${timingError?.message}), falling back to "Normal"`);
          }
          const { data: normalTiming, error: nError } = await supabase
            .from('aiboard_meow_timing')
            .select('message_duration_minutes, message_interval_minutes, disabled')
            .eq('config_id', configId)
            .eq('state', 'Normal')
            .order('updated_at', { ascending: false })
            .limit(1);

          if (normalTiming?.[0] && !normalTiming[0].disabled) {
            activeTiming = normalTiming[0];
          } else {
            console.warn("[CatMascot] No active or Normal timing found. Meow loop aborted.", nError);
            return;
          }
        }

        // Fetch messages for ALL active states
        const { data: msgsData, error: msgsError } = await supabase
          .from('aiboard_meow_messages')
          .select('message, state, sort_order')
          .eq('config_id', configId)
          .in('state', petStates)
          .eq('is_audio', false)
          .order('state', { ascending: true })
          .order('sort_order', { ascending: true });

        if (msgsError) {
          console.error(`[CatMascot] Error fetching messages for states [${petStates.join(', ')}]:`, msgsError);
          return;
        }

        if (!msgsData || msgsData.length === 0) {
          console.log(`[CatMascot] No messages found for states [${petStates.join(', ')}]`);
          return;
        }

        const intervalMs = (activeTiming.message_interval_minutes || 0.25) * 60 * 1000;
        const durationMs = (activeTiming.message_duration_minutes || 0.1) * 60 * 1000;

        console.log(`[CatMascot] Loop started: States=[${petStates.join(', ')}], Msgs=${msgsData.length}, Interval=${intervalMs / 1000}s, Duration=${durationMs / 1000}s`);

        let currentIndex = 0;

        const loop = () => {
          meowTimerRef.current = setTimeout(() => {
            if (!isSubscribed) return;
            const seqMsg = msgsData[currentIndex].message;
            setMeowMsg(seqMsg);
            currentIndex = (currentIndex + 1) % msgsData.length;

            setTimeout(() => {
              if (isSubscribed) setMeowMsg(null);
              loop();
            }, durationMs);
          }, intervalMs);
        };

        loop();
      } catch (err) {
        console.error("Error setting up meow loop:", err);
      }
    };

    runMeowLoop();

    return () => {
      isSubscribed = false;
      if (meowTimerRef.current) clearTimeout(meowTimerRef.current);
    };
  }, [disabled, isDialogActive, petStates]);

  const audioLoopTimerRef = useRef(null);

  useEffect(() => {
    if (disabled) return;

    let isSubscribed = true;

    const runAudioLoop = async () => {
      try {
        const { data: configs } = await supabase.from('aiboard_meow_configs').select('id').limit(1);
        if (!configs || configs.length === 0) return;
        const configId = configs[0].id;

        const { data: timingData } = await supabase
          .from('aiboard_meow_timing')
          .select('message_interval_minutes, disabled')
          .eq('config_id', configId)
          .eq('state', 'Audio')
          .order('updated_at', { ascending: false })
          .limit(1);

        const audioTiming = timingData?.[0];
        if (!audioTiming || audioTiming.disabled) return;

        const { data: msgsData } = await supabase
          .from('aiboard_meow_messages')
          .select('message')
          .eq('config_id', configId)
          .eq('state', 'Audio')
          .eq('is_audio', true);

        if (!msgsData || msgsData.length === 0) return;

        const intervalMs = (audioTiming.message_interval_minutes || 0.1) * 60 * 1000;

        const loop = () => {
          audioLoopTimerRef.current = setTimeout(() => {
            if (!isSubscribed) return;
            const randomMsg = msgsData[Math.floor(Math.random() * msgsData.length)].message;
            if (randomMsg) {
              const audioObj = new Audio(randomMsg);
              audioObj.play().catch(e => console.error("Audio playback error:", e));
            }
            loop();
          }, intervalMs);
        };

        loop();
      } catch (err) {
        console.error("Error setting up audio loop:", err);
      }
    };

    runAudioLoop();

    return () => {
      isSubscribed = false;
      if (audioLoopTimerRef.current) clearTimeout(audioLoopTimerRef.current);
    };
  }, [disabled]);

  const walkTimeoutRef = useRef(null);
  const audioRef = useRef(null);
  const lastMoveStartPos = useRef(restoredMascotStateRef.current?.entryComplete ? {
    x: restoredMascotStateRef.current.x,
    y: restoredMascotStateRef.current.y,
  } : DEFAULT_MASCOT_POSITION);
  const lastMoveStartTime = useRef(Date.now());
  const lastMoveDuration = useRef(0.8);
  const lastMoveTarget = useRef(restoredMascotStateRef.current?.entryComplete ? {
    x: restoredMascotStateRef.current.x,
    y: restoredMascotStateRef.current.y,
  } : DEFAULT_MASCOT_POSITION);

  useEffect(() => {
    audioRef.current = new Audio('/images/cat-meow.mp3');

    const restored = restoredMascotStateRef.current;

    // Walk into screen from left
    const destX = 20 + Math.random() * 60;
    const destY = 80 + Math.random() * 10;
    const duration = 2.8; // Entry walk duration

    if (restored?.entryComplete) {
      const restoredPos = { x: restored.x, y: restored.y };
      lastMoveStartPos.current = restoredPos;
      lastMoveTarget.current = restoredPos;
      lastMoveStartTime.current = Date.now();
      lastMoveDuration.current = 0;
      setCatPos(restoredPos);
      setFacingLeft(restored.facingLeft);
      setWalkDuration(0);
      setIsWalking(false);
      isEntryWalkComplete.current = true;
      tryActivateDialog();
    } else {
      lastMoveStartPos.current = DEFAULT_MASCOT_POSITION;
      lastMoveTarget.current = { x: destX, y: destY };
      lastMoveStartTime.current = Date.now();
      lastMoveDuration.current = duration;

      setFacingLeft(false);
      setWalkDuration(duration);
      setCatPos({ x: destX, y: destY });
      setIsWalking(true);

      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
      walkTimeoutRef.current = setTimeout(() => {
        setIsWalking(false);
        isEntryWalkComplete.current = true;
        saveMascotSessionState({
          x: destX,
          y: destY,
          facingLeft: false,
          entryComplete: true,
        });
        tryActivateDialog();
      }, duration * 1000);
    }

    const getInterpolatedPos = () => {
      const elapsed = (Date.now() - lastMoveStartTime.current) / 1000;
      const progress = Math.min(elapsed / lastMoveDuration.current, 1);
      return {
        x: lastMoveStartPos.current.x + (lastMoveTarget.current.x - lastMoveStartPos.current.x) * progress,
        y: lastMoveStartPos.current.y + (lastMoveTarget.current.y - lastMoveStartPos.current.y) * progress,
      };
    };

    const handleGlobalClick = (e) => {
      const target = e.target;
      if (
        target.closest('button') ||
        target.closest('a') ||
        target.closest('input') ||
        target.closest('select') ||
        target.closest('option') ||
        target.closest('textarea') ||
        target.closest('[data-cat]') ||
        target.closest('[data-cat-ignore]')
      ) return;

      const targetX_px = e.clientX;
      const targetY_px = e.clientY;

      const targetX = (targetX_px / window.innerWidth) * 100;
      const targetY = (targetY_px / window.innerHeight) * 100;
      const currentPos = getInterpolatedPos();
      const currentX_px = (currentPos.x / 100) * window.innerWidth;
      const currentY_px = (currentPos.y / 100) * window.innerHeight;

      const distance_px = Math.sqrt(Math.pow(targetX_px - currentX_px, 2) + Math.pow(targetY_px - currentY_px, 2));

      if (distance_px < 5) return;

      const duration = distance_px / 200;

      lastMoveStartPos.current = currentPos;
      lastMoveTarget.current = { x: targetX, y: targetY };
      lastMoveStartTime.current = Date.now();
      lastMoveDuration.current = duration;

      const nextFacingLeft = targetX < currentPos.x;
      setFacingLeft(nextFacingLeft);
      setWalkDuration(duration);
      setCatPos({ x: targetX, y: targetY });
      setIsWalking(true);
      saveMascotSessionState({
        x: targetX,
        y: targetY,
        facingLeft: nextFacingLeft,
        entryComplete: true,
      });

      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current);
      walkTimeoutRef.current = setTimeout(() => {
        setIsWalking(false);
        isEntryWalkComplete.current = true;
        saveMascotSessionState({
          x: targetX,
          y: targetY,
          facingLeft: nextFacingLeft,
          entryComplete: true,
        });
        tryActivateDialog();
      }, duration * 1000);
    };

    document.addEventListener('dblclick', handleGlobalClick);
    return () => {
      document.removeEventListener('dblclick', handleGlobalClick);
      if (walkTimeoutRef.current) {
        clearTimeout(walkTimeoutRef.current);
      }
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      saveMascotSessionState({
        ...lastMoveTarget.current,
        facingLeft,
        entryComplete: isEntryWalkComplete.current,
      });
    };
  }, []);

  const handleCatClick = (e) => {
    e.stopPropagation();
    // Only close the dialog on click if we are NOT in pre-login mode (disabled=true)
    if (!disabled) {
      closeDialog();
    }
    if (!isPetSleeping && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => { });
      setIsMeowing(true);
      setTimeout(() => setIsMeowing(false), 800);
    }
    if (!disabled && onCatClick) onCatClick();
  };

  return (
    <>
      <style>{`
        @keyframes cat-sound-wave {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
        }
        .cat-sound-ring {
          animation: cat-sound-wave 0.6s ease-out forwards;
        }
        .cat-tooltip {
          opacity: 0;
          transition: opacity 0.2s;
          pointer-events: none;
        }
        .cat-mascot-wrapper:hover .cat-tooltip {
          opacity: 1;
        }
        .mallow-mascot {
          position: relative;
          width: ${MALLOW_FRAME_WIDTH * MALLOW_SCALE}px;
          height: ${MALLOW_FRAME_HEIGHT * MALLOW_SCALE}px;
          background-image: var(--pet-spritesheet);
          background-repeat: no-repeat;
          background-size: ${MALLOW_FRAME_WIDTH * 8 * MALLOW_SCALE}px ${MALLOW_FRAME_HEIGHT * 9 * MALLOW_SCALE}px;
          background-position-y: calc(-1 * var(--sprite-row) * ${MALLOW_FRAME_HEIGHT * MALLOW_SCALE}px);
          image-rendering: pixelated;
          pointer-events: auto;
          cursor: pointer;
          filter: drop-shadow(0 5px 8px rgba(15, 23, 42, 0.1));
          animation-duration: var(--sprite-duration);
          animation-iteration-count: infinite;
          animation-timing-function: steps(var(--sprite-frames));
        }
        .mallow-mascot.idle {
          animation-name: mallow-sprite;
        }
        .mallow-mascot.run-left,
        .mallow-mascot.run-right,
        .mallow-mascot.review {
          animation-name: mallow-sprite;
        }
        .mallow-mascot.sleep {
          animation-name: none;
          background-position-x: calc(-1 * var(--sprite-frame) * ${MALLOW_FRAME_WIDTH * MALLOW_SCALE}px);
        }
        .mallow-mascot.sleep::after {
          content: 'Zzz...';
          position: absolute;
          left: 64%;
          top: -5px;
          color: #94a3b8;
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.02em;
          animation: mascot-sleep-float 1.8s ease-in-out infinite;
        }
        @keyframes mallow-sprite {
          from { background-position-x: 0; }
          to { background-position-x: calc(-1 * var(--sprite-frames) * ${MALLOW_FRAME_WIDTH * MALLOW_SCALE}px); }
        }
        @keyframes mascot-sleep-float {
          0%, 100% { transform: translateY(0); opacity: 0.65; }
          50% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>

      <div
        className="cat-mascot-wrapper"
        style={{
          position: 'fixed',
          left: `${catPos.x}%`,
          top: `${catPos.y}%`,
          transform: `translate(-50%, -100%)`,
          transition: `left ${walkDuration}s linear, top ${walkDuration}s linear`,
          zIndex: 9990,
          userSelect: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="wait">
          {isDialogActive && dialogSteps.length > 0 && (
            <motion.div
              data-cat="true"
              key={`dialog-bubble-${dialogStep}`}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-max shrink-0 max-w-[min(85vw,340px)] bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col overflow-visible relative pointer-events-auto mb-4 mr-1 cursor-default"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="p-4 text-sm font-semibold leading-relaxed flex flex-col relative z-10 bg-white rounded-lg text-slate-700"
              >
                <div className="flex-1 flex items-center justify-center text-center">
                  <p className="whitespace-pre-wrap text-slate-700">{dialogSteps[dialogStep]}</p>
                </div>
                <div className="pt-4 flex justify-between items-center mt-auto">
                  <button
                    onClick={(e) => { e.stopPropagation(); setDialogStep(p => Math.max(0, p - 1)); }}
                    disabled={dialogStep === 0}
                    className={`flex items-center gap-1 text-xs font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900 cursor-pointer ${dialogStep === 0 ? 'invisible' : ''
                      }`}
                  >
                    <ChevronLeft className="w-4 h-4" /> Back
                  </button>
                  {dialogStep === dialogSteps.length - 1 ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); closeDialog(); }}
                      className="flex items-center gap-1 text-xs font-semibold text-[#2A9D8F] underline underline-offset-2 hover:opacity-80 cursor-pointer"
                    >
                      Close <X className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDialogStep(p => Math.min(dialogSteps.length - 1, p + 1)); }}
                      className="flex items-center gap-1 text-xs font-semibold text-[#2A9D8F] underline underline-offset-2 hover:opacity-80 cursor-pointer"
                    >
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="absolute -bottom-2 left-1/2 w-4 h-4 bg-white transform rotate-45 -translate-x-1/2 shadow-md border-r border-b border-slate-100 z-0"></div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!disabled && !isDialogActive && meowMsg && (
            <motion.div
              initial={{ opacity: 0, y: 5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="px-4 py-2.5 bg-white border border-slate-200 rounded-lg shadow-sm relative pointer-events-auto mb-4 mr-1 cursor-default"
            >
              <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">{meowMsg}</span>
              <div className="absolute -bottom-2 left-1/2 w-4 h-4 bg-white transform rotate-45 -translate-x-1/2 shadow-md border-r border-b border-slate-100 z-0"></div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mallow pet mascot */}
        <div
          data-cat="true"
          onClick={(e) => {
            e.stopPropagation();
            handleCatClick(e);
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseOver={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{ pointerEvents: 'auto' }}
        >
          <MallowMascotSprite
            spriteSheetUrl={selectedPet.spriteSheetUrl}
            sleepHoldFrame={selectedPet.sleepHoldFrame}
            idleFrames={selectedPet.idleFrames}
            idleDuration={selectedPet.idleDuration}
            hoverRow={selectedPet.hoverRow}
            hoverFrames={selectedPet.hoverFrames}
            hoverDuration={selectedPet.hoverDuration}
            clickRow={selectedPet.clickRow}
            clickFrames={selectedPet.clickFrames}
            clickDuration={selectedPet.clickDuration}
            isWalking={isWalking}
            facingLeft={facingLeft}
            isMeowing={isMeowing}
            isHovered={isHovered}
            isSleeping={isPetSleeping}
            onHoverStart={() => setIsHovered(true)}
            onHoverEnd={() => setIsHovered(false)}
          />
        </div>
      </div>
    </>
  );
}