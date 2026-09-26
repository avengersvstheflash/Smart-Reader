import React, { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpen, Check } from 'lucide-react';
import { Book } from '../../types/domain';

export interface BookCardProps {
  book: Book;
  selected?: boolean;
  selectionMode?: boolean;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
  variant?: 'grid' | 'hero' | 'row';
  footer?: ReactNode;
}

export const WORDS_PER_MINUTE = 200;

export function formatReadingTime(wordCount?: number, chapterCount = 0): string {
  const words = wordCount && wordCount > 0 ? wordCount : chapterCount * 1500;
  if (words <= 0) return '0 min';
  const mins = Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  if (mins < 60) {
    return `${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours}h ${remainingMins}m` : `${hours}h`;
}

interface CoverTheme {
  name: string;
  gradient: string;
  spine: string;
}

const COVER_THEMES: CoverTheme[] = [
  { name: 'terracotta', gradient: 'from-[#8B3A1C] to-[#54210D]', spine: '#3D1608' },
  { name: 'indigo', gradient: 'from-[#2C3B5E] to-[#151D33]', spine: '#0E1322' },
  { name: 'moss', gradient: 'from-[#2D4F37] to-[#14291B]', spine: '#0D1B11' },
  { name: 'amber', gradient: 'from-[#784E1A] to-[#42290B]', spine: '#2E1C07' },
  { name: 'plum', gradient: 'from-[#5C2B4E] to-[#311429]', spine: '#210C1B' },
  { name: 'slate', gradient: 'from-[#3B4654] to-[#1F252E]', spine: '#14181F' },
  { name: 'teal', gradient: 'from-[#1D4F4F] to-[#0D2929]', spine: '#081B1B' },
];

export function getCoverTheme(seed: string): CoverTheme {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COVER_THEMES.length;
  return COVER_THEMES[index];
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  selected = false,
  selectionMode = false,
  onSelect,
  onOpen,
  variant = 'grid',
  footer,
}) => {
  const navigate = useNavigate();
  const theme = getCoverTheme(book.title + book.id);
  const readingTime = formatReadingTime(book.wordCount, book.chapterCount);
  const isEmptyContent = book.integrityStatus === 'empty_content';

  const handleCardClick = () => {
    if (onOpen) {
      onOpen(book.id);
    } else {
      navigate(`/book/${book.id}`);
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelect?.(book.id);
  };

  const isRow = variant === 'row';
  const isHero = variant === 'hero';

  return (
    <article
      className={`group relative flex rounded-md border border-line bg-card p-3 transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:hover:border-line-strong ${
        isRow ? 'flex-row gap-4 items-center' : 'flex-col'
      } ${
        isHero ? 'p-5 shadow-sm' : ''
      } ${
        selected ? 'ring-2 ring-accent border-accent' : ''
      }`}
    >
      {/* Sibling selection checkbox (no nested interactive elements inside link) */}
      {selectionMode && (
        <label
          className="absolute top-4 right-4 z-20 flex items-center justify-center w-6 h-6 rounded bg-surface/90 backdrop-blur border border-line shadow-sm cursor-pointer hover:border-accent"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={handleCheckboxChange}
            aria-label={`Select ${book.title}`}
            className="sr-only"
          />
          {selected && <Check className="w-4 h-4 text-accent stroke-[2.5]" aria-hidden="true" />}
        </label>
      )}

      {/* Main Clickable Cover and Link */}
      <div className="relative aspect-[3/4] w-full rounded overflow-hidden shadow-inner flex flex-col justify-between p-3.5 text-white select-none bg-gradient-to-br mb-3">
        {/* Decorative spine gradient */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${theme.gradient}`}
          aria-hidden="true"
        />
        <div
          className="absolute left-0 top-0 bottom-0 w-2.5 opacity-90 shadow"
          style={{ backgroundColor: theme.spine }}
          aria-hidden="true"
        />
        <div
          className="absolute left-2.5 top-0 bottom-0 w-px bg-white/20"
          aria-hidden="true"
        />

        {/* Cover Header */}
        <div className="relative z-10 flex items-center justify-between pl-2">
          <BookOpen className="w-4 h-4 opacity-80" aria-hidden="true" />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded bg-black/30 backdrop-blur-sm">
              {book.contentType}
            </span>
          </div>
        </div>

        {/* Cover Title */}
        <div className="relative z-10 my-auto pl-2">
          <h4 className="font-display text-sm md:text-base font-semibold line-clamp-3 leading-snug drop-shadow-sm">
            {book.title}
          </h4>
        </div>

        {/* Cover Footer */}
        <div className="relative z-10 flex items-center justify-between pl-2 text-[11px] opacity-90 font-medium">
          <span className="truncate max-w-[80%]">{book.author || 'Unknown Author'}</span>
          <span className="text-accent-wash opacity-80" aria-hidden="true">✦</span>
        </div>

        {/* Stretched Link for click target */}
        <Link
          to={`/book/${book.id}`}
          onClick={(e) => {
            if (onOpen) {
              e.preventDefault();
              handleCardClick();
            }
          }}
          className="absolute inset-0 z-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
          aria-label={`Open book: ${book.title}`}
        >
          <span className="sr-only">Open {book.title}</span>
        </Link>
      </div>

      {/* Metadata & Title */}
      <div className="flex-1 flex flex-col justify-between">
        <div>
          {/* Integrity Warning Badge (Non-color-only) */}
          {isEmptyContent && (
            <div className="mb-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-medium bg-warn/15 text-warn border border-warn/30">
              <AlertTriangle className="w-3 h-3 text-warn shrink-0" aria-hidden="true" />
              <span>Empty Content</span>
            </div>
          )}

          <h3
            className="font-ui font-semibold text-ui-sm text-ink line-clamp-1 group-hover:text-accent-ink transition-colors"
            title={book.title}
          >
            {book.title}
          </h3>
          <p className="text-caption text-ink-muted line-clamp-1 mt-0.5">
            {book.author || 'Unknown Author'}
          </p>
        </div>

        {/* Footer meta */}
        <div className="mt-3 pt-2 border-t border-line/60 flex items-center justify-between text-caption text-ink-light">
          {footer ? (
            footer
          ) : (
            <>
              <span>{book.chapterCount} ch</span>
              <span>·</span>
              <span>{readingTime}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
};