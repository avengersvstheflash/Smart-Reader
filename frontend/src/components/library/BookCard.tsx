import React, { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpen, Check } from 'lucide-react';
import { Book, formatAuthorList } from '../../types/domain';
import { useThemeStore } from '../../store/useThemeStore';
import { BookCoverArt } from './BookCoverArt';

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

type CoverTheme = { name: string; gradient: string; spine: string };

const COVER_THEMES_BY_THEME: Record<string, CoverTheme[]> = {
  spring: [
    // Brights
    { name: 'spring-honey', gradient: 'from-[#F4E4A6] to-[#B89748]', spine: '#7A6130' },
    { name: 'spring-cream', gradient: 'from-[#EDE5C8] to-[#8CA070]', spine: '#5E6B45' },
    { name: 'spring-blush', gradient: 'from-[#F2D4D8] to-[#A88294]', spine: '#78596B' },
    { name: 'spring-sky', gradient: 'from-[#C8E4E0] to-[#6B9490]', spine: '#456B68' },
    // Medium
    { name: 'spring-sage', gradient: 'from-[#B8D0B6] to-[#5C8060]', spine: '#3D5A40' },
    { name: 'spring-fern', gradient: 'from-[#A4C296] to-[#4E7044]', spine: '#344E2E' },
    // Darks
    { name: 'spring-pine', gradient: 'from-[#5A7A5E] to-[#1F3A28]', spine: '#152618' },
    { name: 'spring-moss', gradient: 'from-[#7A8F5E] to-[#2E3820]', spine: '#1F2615' },
  ],
  sakura: [
    // Brights
    { name: 'sakura-cream', gradient: 'from-[#F8E5D8] to-[#C09078]', spine: '#8A6350' },
    { name: 'sakura-peach', gradient: 'from-[#F8D4BC] to-[#C88066]', spine: '#8F5340' },
    { name: 'sakura-petal', gradient: 'from-[#F8D0DC] to-[#B86F88]', spine: '#84495F' },
    { name: 'sakura-lilac', gradient: 'from-[#E5D4E8] to-[#946B9C]', spine: '#66476E' },
    // Medium
    { name: 'sakura-rose', gradient: 'from-[#E8A0B4] to-[#8A3854]', spine: '#5E2438' },
    { name: 'sakura-plum', gradient: 'from-[#C888A8] to-[#682848]', spine: '#471530' },
    // Darks
    { name: 'sakura-wine', gradient: 'from-[#8A4858] to-[#35121C]', spine: '#220A10' },
    { name: 'sakura-berry', gradient: 'from-[#A83870] to-[#3E0E28]', spine: '#27061A' },
  ],
  coffee: [
    // Brights
    { name: 'coffee-cream', gradient: 'from-[#F5E6C8] to-[#C0A170]', spine: '#8A6E42' },
    { name: 'coffee-honey', gradient: 'from-[#F5D08A] to-[#B8853E]', spine: '#7E5924' },
    { name: 'coffee-wheat', gradient: 'from-[#E8D4A8] to-[#9E7F50]', spine: '#6E5433' },
    { name: 'coffee-caramel', gradient: 'from-[#E8A868] to-[#9E5A28]', spine: '#6B3B15' },
    // Medium
    { name: 'coffee-amber', gradient: 'from-[#C89560] to-[#6E3C1A]', spine: '#48240E' },
    { name: 'coffee-mocha', gradient: 'from-[#A0704E] to-[#503020]', spine: '#321D10' },
    // Darks
    { name: 'coffee-espresso', gradient: 'from-[#6B4028] to-[#251208]', spine: '#170A04' },
    { name: 'coffee-cocoa', gradient: 'from-[#5A3018] to-[#1E0C04]', spine: '#130702' },
  ],
  cyberpunk: [
    { name: 'cyan-neon', gradient: 'from-[#00F0FF] to-[#0A2E5C]', spine: '#051833' },
    { name: 'magenta-neon', gradient: 'from-[#FF007F] to-[#4A0033]', spine: '#2E0020' },
    { name: 'lime-neon', gradient: 'from-[#39FF14] to-[#0A3D14]', spine: '#05240A' },
    { name: 'amber-neon', gradient: 'from-[#FFB800] to-[#542B00]', spine: '#331A00' },
    { name: 'deep-teal', gradient: 'from-[#00E5A3] to-[#003833]', spine: '#00211E' },
    { name: 'void-purple', gradient: 'from-[#9D00FF] to-[#250047]', spine: '#17002E' },
    { name: 'blood-orange', gradient: 'from-[#FF3B00] to-[#470B00]', spine: '#2E0500' },
    { name: 'acid-green', gradient: 'from-[#A6FF00] to-[#213D00]', spine: '#142600' },
  ],
  omni: [
    // Brights
    { name: 'omni-lavender', gradient: 'from-[#E0D0F4] to-[#9E82C8]', spine: '#6E5890' },
    { name: 'omni-pearl', gradient: 'from-[#D8D4EE] to-[#8A84B8]', spine: '#5E5888' },
    { name: 'omni-iris', gradient: 'from-[#C8B4F0] to-[#7A5EC0]', spine: '#523C90' },
    { name: 'omni-dawn', gradient: 'from-[#F0D0E4] to-[#A878A8]', spine: '#745278' },
    // Medium
    { name: 'omni-violet', gradient: 'from-[#A080D8] to-[#4E2888]', spine: '#371A62' },
    { name: 'omni-royal', gradient: 'from-[#8474C8] to-[#3E2888]', spine: '#2A185E' },
    // Darks
    { name: 'omni-midnight', gradient: 'from-[#4A4A80] to-[#151538]', spine: '#0E0E28' },
    { name: 'omni-abyss', gradient: 'from-[#3E2E68] to-[#120A24]', spine: '#0A0618' },
  ],
};

export function getCoverTheme(seed: string, activeTheme: string = 'spring'): CoverTheme {
  const palettes = COVER_THEMES_BY_THEME[activeTheme] || COVER_THEMES_BY_THEME.spring;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % palettes.length;
  return palettes[index];
}

function getCategoryBadgeClass(contentType?: string): string {
  const type = (contentType || '').toUpperCase();
  switch (type) {
    case 'TEXTBOOK':
      return 'bg-accent-soft text-accent-ink';
    case 'OTHER':
      return 'bg-accent-2-soft text-accent-2';
    case 'REFERENCE':
      return 'bg-[rgb(var(--neon-red)/0.15)] text-[rgb(var(--neon-red))] border border-[rgb(var(--neon-red)/0.4)]';
    case 'NOVEL':
      return 'bg-accent-3-soft text-accent-3';
    default:
      return 'bg-black/25 backdrop-blur-sm';
  }
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
  const currentTheme = useThemeStore((s) => s.theme);
  const theme = getCoverTheme(book.title + book.id, currentTheme);
  const readingTime = formatReadingTime(book.wordCount, book.chapterCount);
  const isEmptyContent = book.integrityStatus === 'empty_content';
  const displayAuthor = formatAuthorList(book.bibliographic?.authors, book.author);

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
      className={`group relative flex rounded-md border border-line bg-card p-3 transition-all duration-150 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md motion-safe:hover:border-line-strong book-cover-card ${
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
        <BookCoverArt bookId={book.id} contentType={book.contentType} />
        {/* Decorative spine gradient */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${theme.gradient}`}
          aria-hidden="true"
        />
        {/* Sleek smooth matte gradient */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(0,0,0,0.6) 100%)' }}
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
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded book-cover-badge ${getCategoryBadgeClass(
                book.contentType
              )}`}
            >
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
          <span className="truncate max-w-[80%]">{displayAuthor}</span>
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
            <div className="mb-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-medium bg-warn/20 text-warn border border-warn/40">
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
            {displayAuthor}
          </p>
          {book.chapterCount > 0 && (book.readChapterCount ?? 0) > 0 && (
            <p className="text-caption text-accent-3 mt-1">
              {book.readChapterCount} of {book.chapterCount} read
            </p>
          )}
        </div>

        {/* Footer meta */}
        <div className="mt-3 pt-2 border-t border-line/60 flex items-center justify-between text-caption text-ink-light">
          {footer ? (
            footer
          ) : (
            <>
              <span>{book.chapterCount} ch</span>
              <span>·</span>
              <span className="text-accent-4">{readingTime}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
};