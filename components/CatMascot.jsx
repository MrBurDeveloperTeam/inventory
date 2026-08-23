import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { normalizePetId } from '../VirtualPet/petOptions';
import { useSharedCatDialogueRuntime, SharedCatMascot } from '@mrburdeveloperteam/molar-experience/cat';

const PET_SLEEPING_KEY = 'pet_is_sleeping';
const PET_SLEEPING_UPDATED_AT_KEY = 'pet_is_sleeping_updated_at';
const DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS = 6000;

export default function CatMascot({ onCatClick, disabled = false, personalizedInsightState = null }) {
  // Presentation (sprite, position/walk animation, entry walk,
  // double-click-to-move, click-sound-wave affordance, and the three
  // dialogue bubble presentations) is now entirely owned by
  // <SharedCatMascot> — see PHASE 7C. This wrapper keeps only what's
  // genuinely Inventory host-specific: selected pet identity, sleeping
  // state, dialogue CONTENT (Intro/Welcome Back/personalized), ambient
  // mood meow content, ambient audio loop, and the click-sound asset +
  // Cat -> Virtual Pet callback.
  //
  // PHASE 7C NOTE (position restore): the pre-migration component
  // persisted its on-screen x/y/facing/entry-complete state to
  // sessionStorage (`inventory_cat_mascot_session_state`) so a same-tab
  // remount (e.g. this Phase 7B's own `key={user?.id ?? 'signed-out'}`
  // boundary on the App.tsx composition) could restore the Cat's exact
  // prior position instead of replaying the entry walk. Published
  // `SharedCatMascot@0.5.0` exposes no position/restore props at all
  // (confirmed by reading `dist/SharedCatMascot-*.d.ts`: only `disabled`,
  // `petId`, `isSleeping`, `dialogue`, `meowMessage`, `onCatClick`) — its
  // entry walk and position are fully internal, canonical, and always
  // replay from the same off-screen start point on every mount. Per this
  // phase's explicit instructions, no second local movement/position
  // engine was built around SharedCatMascot to emulate the old restore
  // behavior — the position-restore feature (and its sessionStorage key)
  // is dropped, and canonical shared entry-walk behavior is used instead.
  // This is a real, user-visible difference on every remount (including
  // the Phase 7B user-key auth boundary and any React Strict-Mode-driven
  // remount) that requires explicit manual browser acceptance.
  const [isPetSleeping, setIsPetSleeping] = useState(() => {
    try { return localStorage.getItem(PET_SLEEPING_KEY) === 'true'; } catch { return false; }
  });
  const [selectedPetId, setSelectedPetId] = useState(() => normalizePetId(localStorage.getItem('pet_name')));

  const [currentUserId, setCurrentUserId] = useState(null);
  // Content-only inputs fed into the shared dialogue runtime — this
  // component no longer decides WHICH dialogue type shows or WHEN
  // (mount-scoped shown-tracking, dismissal persistence, cross-tab sync,
  // exact-adopted-candidate binding, one-activation/no-cascade, readiness
  // arbitration all live in @mrburdeveloperteam/molar-experience's
  // useSharedCatDialogueRuntime — unchanged since Phase 7B). This file
  // keeps only what's genuinely Inventory-specific: fetching Intro/Welcome
  // Back CONTENT from Supabase, and reshaping the `personalizedInsightState`
  // prop App.tsx already computes.
  const [introInput, setIntroInput] = useState({ status: 'not_ready' });
  const [welcomeBackInput, setWelcomeBackInput] = useState({ status: 'not_ready' });
  // initDialog()'s fetched session metadata, cached here so
  // fetchWelcomeBackContent can reuse it for Welcome Back's [name]
  // placeholder without a second supabase.auth.getSession() call.
  const userMetaRef = useRef(null);
  const userEmailRef = useRef(null);

  // Reshapes App.tsx's three-way personalizedInsightState prop into the
  // shared runtime's DialogueAdapter contract. `undefined` (no state
  // published yet — the very first render before App.tsx's own state has
  // settled) is exactly what the runtime treats as "no personalized
  // candidate — proceed to Welcome Back", matching the original
  // `state === null || state === undefined` handling.
  const personalizedInput = useMemo(() => {
    if (!personalizedInsightState) return undefined;
    if (personalizedInsightState.status === 'not_ready') {
      return { state: { status: 'not_ready' }, onAction: () => {} };
    }
    // Falls back to the legacy single `personalizedInsightState.candidate`
    // when `candidates` isn't present, for defensive compatibility only.
    const candidates = Array.isArray(personalizedInsightState.candidates)
      ? personalizedInsightState.candidates
      : (personalizedInsightState.candidate ? [personalizedInsightState.candidate] : []);
    return {
      state: { status: 'ready', candidates },
      onAction: (candidate) => personalizedInsightState.onAction?.(candidate),
    };
  }, [personalizedInsightState]);

  const { dialogue, closeActiveDialogue } = useSharedCatDialogueRuntime({
    appId: 'inventory',
    userId: currentUserId,
    disabled,
    intro: introInput,
    personalized: personalizedInput,
    welcomeBack: welcomeBackInput,
  });

  // Existing Intro content fetch, unchanged in content from the
  // pre-migration `initDialog()` — only the "activate" step is gone
  // (setDialogSteps/currentDialogType/tryActivateDialog), replaced by
  // simply publishing the fetched steps into `introInput` for the shared
  // runtime to decide what to do with.
  const fetchIntroContent = async (userId) => {
    try {
      const { data: configs, error: configsError } = await supabase
        .from('aiboard_simulator_configs')
        .select('id')
        .eq('module_name', 'Inventory')
        .limit(1);

      if (configsError) {
        // Infrastructure/query failure — leave introInput at 'not_ready'
        // forever this mount; preserve the ability to retry on next reload.
        return;
      }

      if (!configs || configs.length === 0) {
        // No simulator config exists at all for this module — there is no
        // Intro to ever show. Publishing zero steps lets the shared runtime
        // mark the intro stage complete itself (mirrors the original
        // unconditional markIntroCompleted call for this case).
        setIntroInput({ status: 'ready', steps: [] });
        return;
      }

      const configId = configs[0].id;

      const { data, error } = await supabase
        .from('aiboard_simulator_dialog_steps')
        .select('step_text, sort_order')
        .eq('config_id', configId)
        .eq('is_post_login', !disabled)
        .order('sort_order', { ascending: true });

      if (error) {
        // Infrastructure/query failure — leave introInput at 'not_ready'.
        return;
      }

      const steps = (data || [])
        .map(d => d.step_text)
        .filter(text => typeof text === 'string' && text.trim().length > 0);

      setIntroInput({ status: 'ready', steps });
    } catch (err) {
      console.error("Error fetching dialog steps:", err);
      // Do not publish 'ready' on an unexpected/network failure — preserve
      // the ability to retry on the next login or reload.
    }
  };

  // Existing Welcome Back fetch, unchanged in content — publishes into
  // `welcomeBackInput` instead of directly activating a dialog. Reads
  // userMeta/userEmail from the refs initDialog() populates, rather than
  // re-fetching the session.
  const fetchWelcomeBackContent = async (userId) => {
    const userMeta = userMetaRef.current;
    const userEmail = userEmailRef.current;
    try {
      const { data: config, error } = await supabase
        .from('aiboard_simulator_configs')
        .select('welcome_back_text, welcome_back_auto_close_ms')
        .eq('module_name', 'Inventory')
        .limit(1)
        .maybeSingle();

      let welcomeText = !error ? config?.welcome_back_text : null;
      const autoCloseMs = (!error && config?.welcome_back_auto_close_ms) || DEFAULT_WELCOME_BACK_AUTO_CLOSE_MS;

      if (welcomeText && /\[name\]/i.test(welcomeText)) {
        let displayName = null;
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, full_name')
            .eq('user_id', userId)
            .maybeSingle();
          displayName = profile?.name || profile?.full_name || null;
        } catch (err) {
          console.error("Error fetching profile for welcome back name:", err);
        }
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

      setWelcomeBackInput({ status: 'ready', message: welcomeText || null, autoCloseMs });
    } catch (err) {
      console.error("Error fetching welcome back message:", err);
    }
  };

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
    const initDialog = async () => {
      let userId = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
        userMetaRef.current = session?.user?.user_metadata || null;
        userEmailRef.current = session?.user?.email || null;
        setCurrentUserId(userId);
      } catch (err) {
        console.error("Error fetching session in initDialog:", err);
      }

      // If user is logged in (disabled = false) and has seen the intro:
      // go straight to fetching Welcome Back content — the shared runtime's
      // own intro effect independently checks this exact same
      // `intro_shown_${userId}` key and will ignore `introInput` in this
      // case regardless, so there's no need to publish anything into it.
      if (!disabled && userId && localStorage.getItem(`intro_shown_${userId}`) === 'true') {
        await fetchWelcomeBackContent(userId);
        return;
      }

      await fetchIntroContent(userId);
    };

    initDialog();
  }, [disabled]);

  useEffect(() => {
    if (disabled || dialogue.kind !== 'none') return;

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
  }, [disabled, dialogue.kind, petStates]);

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

  // Existing Inventory click-sound asset — SharedCatMascot's own internal
  // click handler already plays the wave/talking sprite animation and
  // fires `onCatClick` (only when !disabled — pre-login/loading clicks are
  // suppressed at the source, same gating the original component's final
  // `if (!disabled && onCatClick) onCatClick();` used), but it does NOT
  // bundle or play any audio asset (see SharedCatMascotProps' own doc:
  // "no audio asset is bundled"). The click-sound stays host-owned here,
  // using the exact same '/images/cat-meow.mp3' path the pre-migration
  // component used, including its Inventory-specific `!isPetSleeping`
  // gate (a nuance this app has that other migrated apps did not).
  const audioRef = useRef(null);
  useEffect(() => {
    audioRef.current = new Audio('/images/cat-meow.mp3');
  }, []);

  // Preserves the original ordering: close whatever dialogue is active,
  // then (only if the pet isn't sleeping) play the click sound, then
  // invoke the host's Cat -> Virtual Pet callback. Only ever called by
  // SharedCatMascot when `!disabled`.
  const handleCatClick = () => {
    closeActiveDialogue();
    if (!isPetSleeping && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => { });
    }
    onCatClick?.();
  };

  return (
    <SharedCatMascot
      disabled={disabled}
      petId={selectedPetId}
      isSleeping={isPetSleeping}
      dialogue={dialogue}
      meowMessage={meowMsg}
      onCatClick={handleCatClick}
    />
  );
}
