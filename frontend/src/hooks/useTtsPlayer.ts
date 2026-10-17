import { useState, useEffect, useRef, useCallback } from 'react';
import { useSettings } from './useSettings';
import { apiUrl } from '../api/client';

export interface TtsPlayer {
  isPlaying: boolean;
  isWarming: boolean;
  autoScroll: boolean;
  activeSentenceIndex: number | null;
  totalSentences: number;
  currentDurationMs: number;
  speed: number;
  voice: string;
  autoAdvance: boolean;
  setAutoAdvance: (enabled: boolean) => void;
  resumeAtSentence0: () => void;
  onChapterComplete?: () => void;
  play: (startIndex?: number) => void;
  pause: () => void;
  stop: () => void;
  seekToSentence: (index: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  setSpeed: (s: number) => void;
  setVoice: (v: string) => void;
  error: string | null;
}

interface AudioData {
  blobUrl: string;
  durationMs: number;
}

function loadTtsPref(
  bookId: string,
  fallbackVoice = 'af_heart',
  fallbackSpeed = 1.0,
  fallbackAutoAdvance = false
): { voice: string; speed: number; autoAdvance: boolean; hasSaved: boolean } {
  try {
    if (typeof window !== 'undefined' && window.localStorage && bookId) {
      const saved = localStorage.getItem(`omnitome:reader:tts-pref:${bookId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          voice: typeof parsed.voice === 'string' ? parsed.voice : fallbackVoice,
          speed: typeof parsed.speed === 'number' ? parsed.speed : fallbackSpeed,
          autoAdvance: typeof parsed.autoAdvance === 'boolean' ? parsed.autoAdvance : fallbackAutoAdvance,
          hasSaved: true,
        };
      }
    }
  } catch {
    // Ignore storage parse errors
  }
  return { voice: fallbackVoice, speed: fallbackSpeed, autoAdvance: fallbackAutoAdvance, hasSaved: false };
}

function saveTtsPref(bookId: string, voice: string, speed: number, autoAdvance: boolean) {
  try {
    if (typeof window !== 'undefined' && window.localStorage && bookId) {
      localStorage.setItem(
        `omnitome:reader:tts-pref:${bookId}`,
        JSON.stringify({ voice, speed, autoAdvance })
      );
    }
  } catch {
    // Ignore storage write errors
  }
}

export interface UseTtsPlayerOptions {
  onChapterComplete?: () => void;
}

export function useTtsPlayer(
  sentences: string[],
  bookId: string,
  chapterId: string,
  options?: UseTtsPlayerOptions
): TtsPlayer {
  const { settings } = useSettings();
  const defaultVoice = settings?.tts?.defaultVoice || 'af_heart';
  const defaultSpeed = settings?.tts?.defaultSpeed ?? 1.0;
  const autoScroll = settings?.tts?.autoScroll ?? true;

  const pref = loadTtsPref(bookId, defaultVoice, defaultSpeed);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isWarming, setIsWarming] = useState<boolean>(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [currentDurationMs, setCurrentDurationMs] = useState<number>(0);
  const [speed, setSpeedState] = useState<number>(pref.speed);
  const [voice, setVoiceState] = useState<string>(pref.voice);
  const [autoAdvance, setAutoAdvanceState] = useState<boolean>(pref.autoAdvance);
  const [error, setError] = useState<string | null>(null);

  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWarmingTimer = useCallback(() => {
    if (warmTimerRef.current) {
      clearTimeout(warmTimerRef.current);
      warmTimerRef.current = null;
    }
    setIsWarming(false);
  }, []);

  const startWarmingTimer = useCallback(() => {
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    warmTimerRef.current = setTimeout(() => {
      setIsWarming(true);
    }, 400);
  }, []);

  // Sync settings defaults if no per-book override exists
  useEffect(() => {
    const currentPref = loadTtsPref(bookId, defaultVoice, defaultSpeed);
    if (!currentPref.hasSaved) {
      setVoiceState(defaultVoice);
      setSpeedState(defaultSpeed);
      setAutoAdvanceState(false);
    }
  }, [bookId, defaultVoice, defaultSpeed]);

  const autoAdvanceRef = useRef<boolean>(autoAdvance);
  autoAdvanceRef.current = autoAdvance;

  const isWaitingForChapterRef = useRef<boolean>(false);

  const onChapterCompleteRef = useRef<(() => void) | undefined>(options?.onChapterComplete);
  useEffect(() => {
    onChapterCompleteRef.current = options?.onChapterComplete;
  }, [options?.onChapterComplete]);

  const sentencesRef = useRef<string[]>(sentences);
  sentencesRef.current = sentences;

  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;

  const activeIndexRef = useRef<number | null>(activeSentenceIndex);
  activeIndexRef.current = activeSentenceIndex;

  const voiceRef = useRef<string>(voice);
  voiceRef.current = voice;

  const speedRef = useRef<number>(speed);
  speedRef.current = speed;

  const bookIdRef = useRef<string>(bookId);
  bookIdRef.current = bookId;

  const chapterIdRef = useRef<string>(chapterId);
  chapterIdRef.current = chapterId;

  // Dual-deck HTMLAudioElements
  const deckRefA = useRef<HTMLAudioElement | null>(null);
  const deckRefB = useRef<HTMLAudioElement | null>(null);
  const activeDeckIdRef = useRef<'A' | 'B'>('A');

  // Track which sentence index is currently preloaded in each deck
  const loadedDeckIndexRef = useRef<{ A: number | null; B: number | null }>({
    A: null,
    B: null,
  });

  // Memory cache for synthesized blob URLs and durations
  const blobMapRef = useRef<Map<number, AudioData>>(new Map());
  // In-flight fetch promises to prevent duplicate fetches
  const pendingFetchesRef = useRef<Map<number, Promise<AudioData | null>>>(new Map());
  // Active AbortControllers for cleanup
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

  // Monotonic session counter to prevent stale async callbacks from updating state
  const sessionRef = useRef<number>(0);

  // Helper to revoke blob URLs
  const revokeAllBlobs = useCallback((preserveIndex?: number | null) => {
    blobMapRef.current.forEach((data, idx) => {
      if (preserveIndex !== undefined && preserveIndex !== null && idx === preserveIndex) {
        return;
      }
      try {
        URL.revokeObjectURL(data.blobUrl);
      } catch {
        // Ignore revoke errors
      }
      blobMapRef.current.delete(idx);
    });
    pendingFetchesRef.current.clear();
  }, []);

  // Initialize audio decks once
  useEffect(() => {
    if (typeof Audio !== 'undefined') {
      const a = new Audio();
      const b = new Audio();
      a.preload = 'none';
      b.preload = 'none';
      deckRefA.current = a;
      deckRefB.current = b;
    }

    return () => {
      if (deckRefA.current) {
        deckRefA.current.pause();
        deckRefA.current.src = '';
      }
      if (deckRefB.current) {
        deckRefB.current.pause();
        deckRefB.current.src = '';
      }
      revokeAllBlobs();
    };
  }, [revokeAllBlobs]);

  // Abort all in-flight fetches
  const abortInFlight = useCallback(() => {
    abortControllersRef.current.forEach((controller) => {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors
      }
    });
    abortControllersRef.current.clear();
    pendingFetchesRef.current.clear();
  }, []);

  // Stop playback internally
  const stopInternal = useCallback(() => {
    sessionRef.current += 1;
    abortInFlight();
    clearWarmingTimer();
    if (deckRefA.current) {
      deckRefA.current.pause();
      deckRefA.current.currentTime = 0;
      deckRefA.current.src = '';
    }
    if (deckRefB.current) {
      deckRefB.current.pause();
      deckRefB.current.currentTime = 0;
      deckRefB.current.src = '';
    }
    loadedDeckIndexRef.current = { A: null, B: null };
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [abortInFlight, clearWarmingTimer]);

  // Clean up and reload preferences when bookId or chapterId changes
  useEffect(() => {
    stopInternal();
    revokeAllBlobs();
    clearWarmingTimer();
    setActiveSentenceIndex(null);
    activeIndexRef.current = null;
    setError(null);

    const p = loadTtsPref(bookId, defaultVoice, defaultSpeed);
    setVoiceState(p.voice);
    setSpeedState(p.speed);
    setAutoAdvanceState(p.autoAdvance);
  }, [bookId, chapterId, stopInternal, revokeAllBlobs, clearWarmingTimer, defaultVoice, defaultSpeed]);

  // Fetch audio helper for a specific sentence index
  const fetchSentenceAudio = useCallback(
    async (idx: number, session: number): Promise<AudioData | null> => {
      const sents = sentencesRef.current;
      if (idx < 0 || idx >= sents.length) return null;

      const rawText = sents[idx];
      const text = (rawText || '').trim();
      if (!text) return null;

      // Check cache
      const cached = blobMapRef.current.get(idx);
      if (cached) return cached;

      // Check if already in-flight
      const existingPromise = pendingFetchesRef.current.get(idx);
      if (existingPromise) {
        return existingPromise;
      }

      const controller = new AbortController();
      abortControllersRef.current.set(idx, controller);

      const fetchPromise = (async () => {
        try {
          const currentVoice = voiceRef.current;
          const currentSpeed = speedRef.current;

          const res = await fetch(apiUrl('/api/tts/synthesize'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text,
              voice: currentVoice,
              speed: currentSpeed,
            }),
            signal: controller.signal,
          });

          if (session !== sessionRef.current) return null;

          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            const err = new Error(
              errJson.error || errJson.message || `TTS failed (${res.status})`
            );
            (err as any).code = errJson.code;
            throw err;
          }

          const data = await res.json();
          if (session !== sessionRef.current) return null;

          const wavRes = await fetch(apiUrl(data.audioUrl), {
            signal: controller.signal,
          });
          if (session !== sessionRef.current) return null;

          if (!wavRes.ok) {
            throw new Error(`Failed to load audio WAV (${wavRes.status})`);
          }

          const blob = await wavRes.blob();
          if (session !== sessionRef.current) return null;

          const blobUrl = URL.createObjectURL(blob);
          const audioData: AudioData = {
            blobUrl,
            durationMs: data.durationMs || 0,
          };

          blobMapRef.current.set(idx, audioData);
          return audioData;
        } finally {
          abortControllersRef.current.delete(idx);
          pendingFetchesRef.current.delete(idx);
        }
      })();

      pendingFetchesRef.current.set(idx, fetchPromise);
      return fetchPromise;
    },
    []
  );

  // Trigger background lookahead prefetching (sentence k+1 into inactive deck, k+2 into cache)
  const triggerLookahead = useCallback(
    (currentIdx: number, inactiveDeckId: 'A' | 'B', session: number) => {
      if (!isPlayingRef.current) return;
      const sents = sentencesRef.current;
      const inactiveDeck = inactiveDeckId === 'A' ? deckRefA.current : deckRefB.current;

      // 1. Prefetch k+1 into the inactive deck
      const nextIdx = currentIdx + 1;
      if (nextIdx < sents.length) {
        fetchSentenceAudio(nextIdx, session)
          .then((nextAudio) => {
            if (session === sessionRef.current && nextAudio && inactiveDeck) {
              if (inactiveDeck.src !== nextAudio.blobUrl) {
                inactiveDeck.src = nextAudio.blobUrl;
                inactiveDeck.load();
              }
              loadedDeckIndexRef.current[inactiveDeckId] = nextIdx;
            }
          })
          .catch((err) => {
            if (session !== sessionRef.current || err?.name === 'AbortError') return;
            if (err?.code === 'UNSUPPORTED_LANGUAGE') {
              console.warn('[useTtsPlayer] Lookahead nextIdx is unsupported language:', nextIdx);
            }
          });
      }

      // 2. Prefetch k+2 into memory cache
      const nextNextIdx = currentIdx + 2;
      if (nextNextIdx < sents.length) {
        fetchSentenceAudio(nextNextIdx, session).catch((err) => {
          if (session !== sessionRef.current || err?.name === 'AbortError') return;
        });
      }
    },
    [fetchSentenceAudio]
  );

  // Forward declarations via refs
  const playSentenceRef = useRef<
    (targetIndex: number, session: number, deckId: 'A' | 'B') => Promise<void>
  >(null as any);

  // Transition to next sentence (called when current deck ends)
  const advanceToSentence = useCallback(
    async (nextIdx: number) => {
      const sents = sentencesRef.current;
      if (nextIdx >= sents.length) {
        if (autoAdvanceRef.current) {
          isWaitingForChapterRef.current = true;
          if (deckRefA.current) {
            deckRefA.current.pause();
            deckRefA.current.currentTime = 0;
            deckRefA.current.src = '';
          }
          if (deckRefB.current) {
            deckRefB.current.pause();
            deckRefB.current.currentTime = 0;
            deckRefB.current.src = '';
          }
          loadedDeckIndexRef.current = { A: null, B: null };
          onChapterCompleteRef.current?.();
          return;
        }

        // Chapter finished
        setIsPlaying(false);
        isPlayingRef.current = false;
        setActiveSentenceIndex(null);
        activeIndexRef.current = null;
        setCurrentDurationMs(0);
        return;
      }

      const session = sessionRef.current;
      const nextDeckId: 'A' | 'B' = activeDeckIdRef.current === 'A' ? 'B' : 'A';
      const freeDeckId: 'A' | 'B' = activeDeckIdRef.current;
      const targetDeck = nextDeckId === 'A' ? deckRefA.current : deckRefB.current;

      // Check if nextIdx is already loaded in targetDeck
      if (
        targetDeck &&
        loadedDeckIndexRef.current[nextDeckId] === nextIdx &&
        targetDeck.src
      ) {
        // Fast gapless path: target deck already has audio ready
        activeDeckIdRef.current = nextDeckId;
        setActiveSentenceIndex(nextIdx);
        activeIndexRef.current = nextIdx;
        setIsPlaying(true);
        isPlayingRef.current = true;
        setError(null);

        const cached = blobMapRef.current.get(nextIdx);
        if (cached) setCurrentDurationMs(cached.durationMs);

        try {
          await targetDeck.play();
        } catch (playErr) {
          if (session !== sessionRef.current) return;
          console.error('[useTtsPlayer] Gapless play error:', playErr);
        }

        if (session === sessionRef.current) {
          triggerLookahead(nextIdx, freeDeckId, session);
        }
        return;
      }

      // If not yet loaded into targetDeck, route through standard playSentence
      await playSentenceRef.current(nextIdx, session, nextDeckId);
    },
    [triggerLookahead]
  );

  // Play a specific sentence on a target deck
  const playSentence = useCallback(
    async (targetIndex: number, session: number, deckId: 'A' | 'B') => {
      const sents = sentencesRef.current;
      if (targetIndex < 0 || targetIndex >= sents.length) {
        setIsPlaying(false);
        isPlayingRef.current = false;
        return;
      }

      const activeDeck = deckId === 'A' ? deckRefA.current : deckRefB.current;
      const inactiveDeckId: 'A' | 'B' = deckId === 'A' ? 'B' : 'A';
      if (!activeDeck) return;

      try {
        // 1. Fetch / get audio for targetIndex
        const needsFetch = !blobMapRef.current.has(targetIndex);
        if (needsFetch) {
          startWarmingTimer();
        }
        let audio: AudioData | null = null;
        try {
          audio = await fetchSentenceAudio(targetIndex, session);
        } finally {
          clearWarmingTimer();
        }
        if (session !== sessionRef.current) return;

        if (!audio) {
          // If empty string or skipped, advance to next
          advanceToSentence(targetIndex + 1);
          return;
        }

        activeDeckIdRef.current = deckId;
        loadedDeckIndexRef.current[deckId] = targetIndex;
        setActiveSentenceIndex(targetIndex);
        activeIndexRef.current = targetIndex;
        setIsPlaying(true);
        isPlayingRef.current = true;
        setError(null);
        setCurrentDurationMs(audio.durationMs);

        if (activeDeck.src !== audio.blobUrl) {
          activeDeck.src = audio.blobUrl;
        }

        try {
          await activeDeck.play();
        } catch (playErr: any) {
          if (session !== sessionRef.current) return;
          console.error('[useTtsPlayer] play error:', playErr);
        }

        if (session !== sessionRef.current) return;

        // 2. Prefetch k+1 into inactive deck and k+2 into cache
        triggerLookahead(targetIndex, inactiveDeckId, session);
      } catch (err: any) {
        if (session !== sessionRef.current || err?.name === 'AbortError') return;
        console.error('[useTtsPlayer] Synthesis error at index', targetIndex, err);

        if (err?.code === 'MODEL_NOT_INSTALLED') {
          setError('model_not_installed');
          stopInternal();
          return;
        }

        if (err?.code === 'UNSUPPORTED_LANGUAGE') {
          console.warn('[useTtsPlayer] Skipping unsupported language at index', targetIndex);
          advanceToSentence(targetIndex + 1);
          return;
        }

        setError(err?.message || 'TTS playback failed');
        stopInternal();
      }
    },
    [fetchSentenceAudio, advanceToSentence, stopInternal, triggerLookahead]
  );
  playSentenceRef.current = playSentence;

  // Attach ended event listeners to decks
  useEffect(() => {
    const deckA = deckRefA.current;
    const deckB = deckRefB.current;
    if (!deckA || !deckB) return;

    const handleEnded = (deckId: 'A' | 'B') => {
      // Only proceed if this ended event comes from the active playing deck
      if (activeDeckIdRef.current !== deckId || !isPlayingRef.current) {
        return;
      }
      const currentIndex = activeIndexRef.current ?? 0;
      advanceToSentence(currentIndex + 1);
    };

    const onEndedA = () => handleEnded('A');
    const onEndedB = () => handleEnded('B');

    deckA.addEventListener('ended', onEndedA);
    deckB.addEventListener('ended', onEndedB);

    return () => {
      deckA.removeEventListener('ended', onEndedA);
      deckB.removeEventListener('ended', onEndedB);
    };
  }, [advanceToSentence]);

  // Player controls
  const play = useCallback(
    (startIndex?: number) => {
      const sents = sentencesRef.current;
      if (sents.length === 0) return;

      const target =
        startIndex !== undefined
          ? startIndex
          : activeIndexRef.current !== null
          ? activeIndexRef.current
          : 0;

      const clamped = Math.max(0, Math.min(target, sents.length - 1));

      // If active deck is already paused at this sentence and has src, resume
      const activeDeck =
        activeDeckIdRef.current === 'A' ? deckRefA.current : deckRefB.current;
      const inactiveDeckId: 'A' | 'B' = activeDeckIdRef.current === 'A' ? 'B' : 'A';

      if (
        startIndex === undefined &&
        activeIndexRef.current === clamped &&
        activeDeck &&
        activeDeck.src &&
        !activeDeck.ended &&
        activeDeck.paused
      ) {
        activeDeck
          .play()
          .then(() => {
            setIsPlaying(true);
            isPlayingRef.current = true;
            // Re-trigger lookahead prefetch after resume
            triggerLookahead(clamped, inactiveDeckId, sessionRef.current);
          })
          .catch(() => {
            // If resume fails, start fresh
            const session = ++sessionRef.current;
            abortInFlight();
            playSentence(clamped, session, 'A');
          });
        return;
      }

      const session = ++sessionRef.current;
      abortInFlight();
      setIsPlaying(true);
      isPlayingRef.current = true;
      playSentence(clamped, session, 'A');
    },
    [abortInFlight, playSentence, triggerLookahead]
  );

  const pause = useCallback(() => {
    isWaitingForChapterRef.current = false;
    sessionRef.current += 1;
    abortInFlight();
    clearWarmingTimer();
    if (deckRefA.current) deckRefA.current.pause();
    if (deckRefB.current) deckRefB.current.pause();
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [abortInFlight, clearWarmingTimer]);

  const stop = useCallback(() => {
    isWaitingForChapterRef.current = false;
    stopInternal();
    setActiveSentenceIndex(null);
    activeIndexRef.current = null;
    setCurrentDurationMs(0);
    setError(null);
    revokeAllBlobs();
  }, [stopInternal, revokeAllBlobs]);

  const resumeAtSentence0 = useCallback(() => {
    const sents = sentencesRef.current;
    if (sents.length === 0) return;

    isWaitingForChapterRef.current = false;
    const session = ++sessionRef.current;
    abortInFlight();

    // Reset decks
    if (deckRefA.current) {
      deckRefA.current.pause();
      deckRefA.current.currentTime = 0;
      deckRefA.current.src = '';
    }
    if (deckRefB.current) {
      deckRefB.current.pause();
      deckRefB.current.currentTime = 0;
      deckRefB.current.src = '';
    }
    loadedDeckIndexRef.current = { A: null, B: null };

    setActiveSentenceIndex(0);
    activeIndexRef.current = 0;
    setIsPlaying(true);
    isPlayingRef.current = true;
    setError(null);

    playSentence(0, session, 'A');
  }, [abortInFlight, playSentence]);

  const setAutoAdvance = useCallback((enabled: boolean) => {
    setAutoAdvanceState(enabled);
    autoAdvanceRef.current = enabled;
    saveTtsPref(bookIdRef.current, voiceRef.current, speedRef.current, enabled);
  }, []);

  const seekToSentence = useCallback(
    (index: number) => {
      const sents = sentencesRef.current;
      if (sents.length === 0) return;
      const target = Math.max(0, Math.min(index, sents.length - 1));

      // Stop both decks
      if (deckRefA.current) {
        deckRefA.current.pause();
        deckRefA.current.currentTime = 0;
      }
      if (deckRefB.current) {
        deckRefB.current.pause();
        deckRefB.current.currentTime = 0;
      }
      loadedDeckIndexRef.current = { A: null, B: null };

      const session = ++sessionRef.current;
      abortInFlight();
      playSentence(target, session, 'A');
    },
    [abortInFlight, playSentence]
  );

  const stepForward = useCallback(() => {
    const cur = activeIndexRef.current ?? -1;
    const next = cur + 1;
    if (next < sentencesRef.current.length) {
      seekToSentence(next);
    }
  }, [seekToSentence]);

  const stepBackward = useCallback(() => {
    const cur = activeIndexRef.current ?? 1;
    const prevIdx = Math.max(0, cur - 1);
    seekToSentence(prevIdx);
  }, [seekToSentence]);

  const setSpeed = useCallback(
    (newSpeed: number) => {
      setSpeedState(newSpeed);
      speedRef.current = newSpeed;
      saveTtsPref(bookIdRef.current, voiceRef.current, newSpeed, autoAdvanceRef.current);

      // Abort background lookahead and clear future blob cache so subsequent sentences use new speed
      abortInFlight();
      revokeAllBlobs(activeIndexRef.current);

      // Reset inactive deck preloaded state
      const inactiveDeckId: 'A' | 'B' = activeDeckIdRef.current === 'A' ? 'B' : 'A';
      loadedDeckIndexRef.current[inactiveDeckId] = null;
      const inactiveDeck = inactiveDeckId === 'A' ? deckRefA.current : deckRefB.current;
      if (inactiveDeck) {
        inactiveDeck.pause();
        inactiveDeck.src = '';
      }

      // Re-trigger lookahead with new speed if actively playing
      if (isPlayingRef.current && activeIndexRef.current !== null) {
        triggerLookahead(activeIndexRef.current, inactiveDeckId, sessionRef.current);
      }
    },
    [abortInFlight, revokeAllBlobs, triggerLookahead]
  );

  const setVoice = useCallback(
    (newVoice: string) => {
      setVoiceState(newVoice);
      voiceRef.current = newVoice;
      saveTtsPref(bookIdRef.current, newVoice, speedRef.current, autoAdvanceRef.current);

      // Abort background lookahead and clear future blob cache so subsequent sentences use new voice
      abortInFlight();
      revokeAllBlobs(activeIndexRef.current);

      // Reset inactive deck preloaded state
      const inactiveDeckId: 'A' | 'B' = activeDeckIdRef.current === 'A' ? 'B' : 'A';
      loadedDeckIndexRef.current[inactiveDeckId] = null;
      const inactiveDeck = inactiveDeckId === 'A' ? deckRefA.current : deckRefB.current;
      if (inactiveDeck) {
        inactiveDeck.pause();
        inactiveDeck.src = '';
      }

      // Re-trigger lookahead with new voice if actively playing
      if (isPlayingRef.current && activeIndexRef.current !== null) {
        triggerLookahead(activeIndexRef.current, inactiveDeckId, sessionRef.current);
      }
    },
    [abortInFlight, revokeAllBlobs, triggerLookahead]
  );

  const playerObj: TtsPlayer = {
    isPlaying,
    isWarming,
    autoScroll,
    activeSentenceIndex,
    totalSentences: sentences.length,
    currentDurationMs,
    speed,
    voice,
    autoAdvance,
    setAutoAdvance,
    resumeAtSentence0,
    play,
    pause,
    stop,
    seekToSentence,
    stepForward,
    stepBackward,
    setSpeed,
    setVoice,
    error,
  };

  Object.defineProperty(playerObj, 'onChapterComplete', {
    get() {
      return onChapterCompleteRef.current;
    },
    set(fn: (() => void) | undefined) {
      onChapterCompleteRef.current = fn;
    },
    enumerable: true,
    configurable: true,
  });

  return playerObj;
}
