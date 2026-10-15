import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  ChevronDown,
  AlertCircle,
} from 'lucide-react';
import { TtsPlayer } from '../../hooks/useTtsPlayer';

export const TTS_VOICES = [
  { id: 'af_heart', name: 'Heart' },
  { id: 'am_adam', name: 'Adam' },
  { id: 'bf_alice', name: 'Alice' },
  { id: 'bm_george', name: 'George' },
] as const;

export const TTS_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0] as const;

export interface AudioPlayerBarProps {
  player: TtsPlayer;
  onDismiss: () => void;
  isAutoScrollPaused?: boolean;
  onResumeAutoScroll?: () => void;
}

function formatRemainingTime(remainingCount: number, speed: number): string {
  if (remainingCount <= 0) return '~0s remaining';
  const effectiveSpeed = speed > 0 ? speed : 1.0;
  const totalSeconds = Math.round((remainingCount * 6) / effectiveSpeed);
  if (totalSeconds < 60) {
    return `~${totalSeconds}s remaining`;
  }
  const minutes = Math.round(totalSeconds / 60);
  return `~${minutes}m remaining`;
}

export function AudioPlayerBar({
  player,
  onDismiss,
  isAutoScrollPaused,
  onResumeAutoScroll,
}: AudioPlayerBarProps) {
  // Global keyboard shortcuts: Space for Play/Pause, [ and ] for prev/next
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (player.isPlaying) {
          player.pause();
        } else {
          player.play();
        }
      } else if (e.key === '[') {
        e.preventDefault();
        player.stepBackward();
      } else if (e.key === ']') {
        e.preventDefault();
        player.stepForward();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [player]);

  const currentSentenceNum =
    player.activeSentenceIndex !== null ? player.activeSentenceIndex + 1 : 1;
  const sentenceDisplay =
    player.totalSentences > 0
      ? `Sentence ${currentSentenceNum} of ${player.totalSentences}`
      : 'Sentence 0 of 0';

  const remainingSentences =
    player.activeSentenceIndex !== null
      ? Math.max(0, player.totalSentences - player.activeSentenceIndex)
      : player.totalSentences;

  const timeRemainingDisplay = formatRemainingTime(
    remainingSentences,
    player.speed
  );

  return (
    <div
      role="region"
      aria-label="Audio reader controls"
      className="w-full flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-[rgb(var(--surface)/0.92)] backdrop-blur-md border border-[rgb(var(--line))] rounded-lg shadow-sm text-sm text-[rgb(var(--ink))]"
    >
      {/* Left: Play/Pause, Step Backward, Step Forward */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => (player.isPlaying ? player.pause() : player.play())}
          disabled={player.totalSentences === 0}
          className="min-h-[36px] min-w-[36px] p-2 rounded-md hover:bg-subtle text-ink hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label={player.isPlaying ? 'Pause playback' : 'Start playback'}
          title={player.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {player.isPlaying ? (
            <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
          ) : (
            <Play className="w-4 h-4 fill-current" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={player.stepBackward}
          disabled={
            player.totalSentences === 0 ||
            (player.activeSentenceIndex ?? 0) <= 0
          }
          className="min-h-[36px] min-w-[36px] p-2 rounded-md hover:bg-subtle text-ink hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Previous sentence"
          title="Previous sentence ([)"
        >
          <SkipBack className="w-4 h-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={player.stepForward}
          disabled={
            player.totalSentences === 0 ||
            (player.activeSentenceIndex !== null &&
              player.activeSentenceIndex >= player.totalSentences - 1)
          }
          className="min-h-[36px] min-w-[36px] p-2 rounded-md hover:bg-subtle text-ink hover:text-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Next sentence"
          title="Next sentence (])"
        >
          <SkipForward className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Middle: Progress & status feedback */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[rgb(var(--ink-muted))] select-none">
        <span>{sentenceDisplay}</span>
        <span aria-hidden="true">·</span>
        <span>{timeRemainingDisplay}</span>

        {/* Auto-scroll paused indicator */}
        {isAutoScrollPaused && player.isPlaying && (
          <button
            type="button"
            onClick={onResumeAutoScroll}
            className="inline-flex items-center text-micro text-accent-ink hover:underline bg-accent/10 px-2 py-0.5 rounded cursor-pointer transition-colors"
            title="Auto-scroll paused. Click to center on current sentence."
          >
            Auto-scroll paused · Resume
          </button>
        )}

        {/* Error notifications */}
        {player.error === 'model_not_installed' ? (
          <div className="inline-flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Voice models not installed.</span>
            <Link
              to="/settings"
              className="underline font-medium hover:text-amber-400 focus:outline-none focus-visible:ring-1 focus-visible:ring-amber-500 rounded"
            >
              Open Settings
            </Link>
          </div>
        ) : player.error ? (
          <div
            className="inline-flex items-center gap-1 text-xs text-err bg-err/10 border border-err/20 px-2 py-0.5 rounded max-w-xs truncate"
            title={player.error}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{player.error}</span>
          </div>
        ) : null}
      </div>

      {/* Right: Speed, Voice, Dismiss */}
      <div className="flex items-center gap-2">
        {/* Speed Selector */}
        <div className="relative inline-flex items-center">
          <select
            value={player.speed}
            onChange={(e) => player.setSpeed(Number(e.target.value))}
            className="appearance-none bg-subtle/50 hover:bg-subtle text-ink text-xs font-mono py-1 pl-2 pr-6 rounded border border-line cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            aria-label="Playback speed"
          >
            {TTS_SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s.toFixed(2).replace(/\.?0+$/, '')}x
              </option>
            ))}
          </select>
          <ChevronDown
            className="w-3 h-3 absolute right-1.5 pointer-events-none text-ink-muted"
            aria-hidden="true"
          />
        </div>

        {/* Voice Selector */}
        <div className="relative inline-flex items-center">
          <select
            value={player.voice}
            onChange={(e) => player.setVoice(e.target.value)}
            className="appearance-none bg-subtle/50 hover:bg-subtle text-ink text-xs font-mono py-1 pl-2 pr-6 rounded border border-line cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            aria-label="Voice selection"
          >
            {TTS_VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <ChevronDown
            className="w-3 h-3 absolute right-1.5 pointer-events-none text-ink-muted"
            aria-hidden="true"
          />
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-[32px] min-w-[32px] p-1.5 rounded-md hover:bg-subtle text-ink-muted hover:text-ink transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          aria-label="Close audio player"
          title="Close player"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
