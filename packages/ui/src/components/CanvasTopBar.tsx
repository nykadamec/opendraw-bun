import { Search } from 'reicon-react';

interface Props {
  projectName: string;
  search: string;
  onSearchChange: (v: string) => void;
  /** Počet shod pro aktuální dotaz; null = nevyhledává se */
  matchCount: number | null;
  /** canvasgen2 layout: sidebar plovoucí vlevo → odsunout obsah lišty */
  floating?: boolean;
}

function formatMatchCount(n: number): string {
  if (n === 1) return '1 shoda';
  if (n >= 2 && n <= 4) return `${n} shody`;
  return `${n} shod`;
}

export default function CanvasTopBar({
  projectName,
  search,
  onSearchChange,
  matchCount,
  floating = false,
}: Props) {
  return (
    <header
      data-el-name="CanvasTopBar"
      className={`glass-panel shrink-0 h-14 flex items-center gap-3 px-4 z-20 ${floating ? 'pl-[272px]' : ''}`}
    >
      <div data-el-name="CanvasTopBarTitle" className="min-w-0 flex-1">
        <h1
          data-el-name="CanvasProjectName"
          className="text-sm font-medium text-txt-primary truncate"
          title={projectName}
        >
          {projectName}
        </h1>
      </div>

      {matchCount !== null && (
        <span
          data-el-name="CanvasSearchCount"
          className="text-[10px] text-txt-tertiary tabular-nums whitespace-nowrap"
        >
          {formatMatchCount(matchCount)}
        </span>
      )}

      <div data-el-name="CanvasSearch" className="relative w-36 sm:w-52">
        <Search
          data-el-name="CanvasSearchIcon"
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none"
        />
        <input
          data-el-name="CanvasSearchField"
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Hledat prompt, seed…"
          aria-label="Hledat v canvasu"
          className="w-full h-8 pl-8 pr-7 rounded-full bg-surface-el/70 border border-border
            text-xs text-txt-primary placeholder:text-txt-tertiary
            focus:outline-none focus:border-txt-secondary transition-colors"
        />
        {search && (
          <button
            data-el-name="CanvasSearchClear"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-txt-tertiary hover:text-txt-primary transition-colors"
            aria-label="Vymazat hledání"
            title="Vymazat hledání"
          >
            <span className="block w-4 h-4 rounded-full bg-txt-primary/20 text-txt-primary text-[10px] leading-none flex items-center justify-center">
              ✕
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
