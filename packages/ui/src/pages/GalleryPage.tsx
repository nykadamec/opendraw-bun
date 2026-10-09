import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { listGallery, getGalleryImageUrl, deleteGalleryEntry } from '@opendraw/api-client';
import type { GalleryEntry, EntryViewData } from '@opendraw/api-client';
import {
  Download,
  ArrowRotate,
  Gallery as GalleryIcon,
  Search,
  Xmark,
  MoreH,
  Grid as GridIcon,
  Grid2 as GridBigIcon,
  Grid3 as GridNormalIcon,
  Grid4 as GridSmallIcon,
  RowVertical as RowsIcon,
  Sliders as SlidersIcon,
  Share as ShareIcon,
} from 'reicon-react';
import ImageViewer from '../components/ImageViewer';

const STORAGE_PREFILL = 'generate.prefill';
const STORAGE_VIEW = 'gallery.viewMode';
const STORAGE_SORT = 'gallery.sort';
const STORAGE_VIEW_SIZE = 'gallery.viewSize';

type ViewMode = 'masonry' | 'grid';
type SortMode = 'newest' | 'oldest';
type ViewSize = 'small' | 'normal' | 'big';

function loadView(): ViewMode {
  try {
    return window.localStorage.getItem(STORAGE_VIEW) === 'grid' ? 'grid' : 'masonry';
  } catch {
    return 'masonry';
  }
}

function loadSort(): SortMode {
  try {
    return window.localStorage.getItem(STORAGE_SORT) === 'oldest' ? 'oldest' : 'newest';
  } catch {
    return 'newest';
  }
}

function loadViewSize(): ViewSize {
  try {
    const v = window.localStorage.getItem(STORAGE_VIEW_SIZE);
    return v === 'small' || v === 'big' ? v : 'normal';
  } catch {
    return 'normal';
  }
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function toViewData(entry: GalleryEntry): EntryViewData {
  return { ...entry, imageUrl: getGalleryImageUrl(entry.id) } as EntryViewData;
}

function shortModel(model: string): string {
  if (!model) return 'Neznámý model';
  const base = model.split('/').pop() || model;
  return base.replace(/\.ckpt|\.safetensors|\.gguf$/i, '').replace(/_/g, ' ');
}

function useMasonryColumnCount(): number {
  const getCount = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 2;
    if (window.matchMedia('(min-width: 1280px)').matches) return 5;
    if (window.matchMedia('(min-width: 1024px)').matches) return 4;
    if (window.matchMedia('(min-width: 640px)').matches) return 3;
    return 2;
  };
  const [count, setCount] = useState<number>(() => getCount());
  useEffect(() => {
    const xl = window.matchMedia('(min-width: 1280px)');
    const lg = window.matchMedia('(min-width: 1024px)');
    const sm = window.matchMedia('(min-width: 640px)');
    const update = () => {
      if (xl.matches) setCount(5);
      else if (lg.matches) setCount(4);
      else if (sm.matches) setCount(3);
      else setCount(2);
    };
    update();
    xl.addEventListener('change', update);
    lg.addEventListener('change', update);
    sm.addEventListener('change', update);
    return () => {
      xl.removeEventListener('change', update);
      lg.removeEventListener('change', update);
      sm.removeEventListener('change', update);
    };
  }, []);
  return count;
}

export default function GalleryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [viewerEntry, setViewerEntry] = useState<GalleryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadView());
  const [sortMode, setSortMode] = useState<SortMode>(() => loadSort());
  const [viewSize, setViewSize] = useState<ViewSize>(() => loadViewSize());
  const [showFilters, setShowFilters] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileDevice());
  const [sheetEntry, setSheetEntry] = useState<GalleryEntry | null>(null);
  const [sheetConfirmingDelete, setSheetConfirmingDelete] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await listGallery();
      setEntries(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_VIEW, viewMode);
    } catch {}
  }, [viewMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_SORT, sortMode);
    } catch {}
  }, [sortMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_VIEW_SIZE, viewSize);
    } catch {}
  }, [viewSize]);

  useEffect(() => {
    if (!sheetEntry) {
      setSheetConfirmingDelete(false);
      setSheetError(null);
    }
  }, [sheetEntry]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);

  const deleteEntry = async (entry: GalleryEntry): Promise<boolean> => {
    try {
      await deleteGalleryEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      return true;
    } catch {
      return false;
    }
  };

  const handleSheetDelete = async () => {
    if (!sheetEntry) return;
    if (!sheetConfirmingDelete) {
      setSheetConfirmingDelete(true);
      return;
    }
    const ok = await deleteEntry(sheetEntry);
    if (ok) {
      setSheetEntry(null);
    } else {
      setSheetError('Smazání selhalo, zkus to znovu.');
    }
  };

  const handleSave = async (entry: GalleryEntry) => {
    try {
      const res = await fetch(getGalleryImageUrl(entry.id));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entry.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setNotice('Obrázek uložen');
    } catch {
      setNotice('Uložení selhalo');
    }
  };

  const handleShare = async (entry: GalleryEntry) => {
    const text = entry.prompt || getGalleryImageUrl(entry.id);
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Prompt zkopírován');
    } catch {
      setNotice('Kopírování selhalo');
    }
  };

  const handleApplySettings = (entry: EntryViewData) => {
    const prefill: Record<string, unknown> = { ...entry };
    delete prefill.id;
    delete prefill.imageUrl;
    delete prefill.createdAt;
    delete prefill.source;
    prefill.randomizeSeed = false;
    prefill.customDimensions = false;
    prefill.widthCustom = entry.width;
    prefill.heightCustom = entry.height;
    prefill.saveToGallery = true;
    try {
      window.localStorage.setItem(STORAGE_PREFILL, JSON.stringify(prefill));
    } catch {}
    navigate('/');
  };

  const handleViewerDelete = (entry: EntryViewData) => {
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
  };

  const visibleEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? entries.filter((e) => (e.prompt || '').toLowerCase().includes(q))
      : [...entries];
    filtered.sort((a, b) => {
      const ta = new Date(a.createdAt).getTime() || 0;
      const tb = new Date(b.createdAt).getTime() || 0;
      return sortMode === 'newest' ? tb - ta : ta - tb;
    });
    return filtered;
  }, [entries, searchQuery, sortMode]);

  const viewerData = viewerEntry ? toViewData(viewerEntry) : null;
  const isMasonry = viewMode === 'masonry';
  const baseColumnCount = useMasonryColumnCount();
  const columnCount =
    viewSize === 'small'
      ? Math.min(6, baseColumnCount + 1)
      : viewSize === 'big'
        ? Math.max(2, baseColumnCount - 2)
        : baseColumnCount;

  const cycleViewSize = () => {
    setViewSize((prev) => (prev === 'small' ? 'normal' : prev === 'normal' ? 'big' : 'small'));
  };

  const viewSizeMeta =
    viewSize === 'small'
      ? { title: 'Malé náhledy – přepnout na střední', Icon: GridSmallIcon }
      : viewSize === 'big'
        ? { title: 'Velké náhledy – přepnout na malé', Icon: GridBigIcon }
        : { title: 'Střední náhledy – přepnout na velké', Icon: GridNormalIcon };

  const masonryColumns = useMemo(() => {
    const cols: { entry: GalleryEntry; index: number }[][] = Array.from(
      { length: columnCount },
      () => [],
    );
    visibleEntries.forEach((entry, i) => {
      cols[i % columnCount].push({ entry, index: i });
    });
    return cols;
  }, [visibleEntries, columnCount]);

  return (
    <div data-el-name="GalleryList" className="min-h-full bg-black text-white">
      {/* Sticky hlavička podle návrhu: titulek + akce, pod tím hledání */}
      <div
        data-el-name="GalleryListHeader"
        className="sticky top-0 z-20 bg-black/90 backdrop-blur-xl"
      >
        <div className="flex flex-col items-center gap-2.5 px-4 pt-2 pb-3">
          <div data-el-name="GalleryTitleRow" className="flex w-full max-w-[960px] items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h1 data-el-name="GalleryTitle" className="text-xl font-bold tracking-tight text-white">
                Galerie
              </h1>
              <span
                data-el-name="GalleryCount"
                className="rounded-full bg-white/10 px-2.5 py-[3px] text-xs font-semibold text-white tabular-nums"
              >
                {visibleEntries.length}
              </span>
            </div>
            <div
              data-el-name="GalleryHeaderActions"
              className="flex items-center gap-1 rounded-[14px] border border-[#222] bg-[#111] p-1.5"
            >
              <button
                data-el-name="GalleryViewToggle"
                onClick={() => setViewMode(isMasonry ? 'grid' : 'masonry')}
                title={isMasonry ? 'Přepnout na jednotnou mřížku' : 'Přepnout na vodopád'}
                aria-label={isMasonry ? 'Přepnout na jednotnou mřížku' : 'Přepnout na vodopád'}
                aria-pressed={!isMasonry}
                className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-all active:scale-95 ${
                  isMasonry
                    ? 'bg-white text-black'
                    : 'bg-transparent text-[#888] hover:text-white'
                }`}
              >
                {isMasonry ? <GridIcon size={18} /> : <RowsIcon size={18} />}
              </button>
              {isMasonry && (
                <button
                  data-el-name="GalleryViewSizeButton"
                  onClick={cycleViewSize}
                  title={viewSizeMeta.title}
                  aria-label={viewSizeMeta.title}
                  className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#888] transition-all hover:text-white active:scale-95"
                >
                  <viewSizeMeta.Icon size={18} />
                </button>
              )}
              <div data-el-name="GalleryActionsDivider" className="h-6 w-px bg-[#222]" aria-hidden />
              <button
                data-el-name="GalleryFilterButton"
                onClick={() => setShowFilters((v) => !v)}
                title="Řazení"
                aria-label="Řazení"
                aria-expanded={showFilters}
                className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-all active:scale-95 ${
                  showFilters ? 'bg-white/15 text-white' : 'text-[#888] hover:text-white'
                }`}
              >
                <SlidersIcon size={18} />
              </button>
              <button
                data-el-name="GalleryRefreshButton"
                onClick={load}
                disabled={loading}
                aria-label="Obnovit galerii"
                title="Obnovit"
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#888] transition-all hover:text-white active:scale-95 disabled:opacity-40"
              >
                <span className={loading ? 'animate-spin' : ''}>
                  <ArrowRotate size={18} />
                </span>
              </button>
            </div>
          </div>

          <div data-el-name="GallerySearchRow" className="w-full max-w-[960px]">
            <div className="relative">
              <span
                data-el-name="GallerySearchIcon"
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#555]"
              >
                <Search size={16} />
              </span>
              <input
                data-el-name="GallerySearchInput"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Hledat v promptech..."
                className="h-11 w-full rounded-[10px] border border-[#222] bg-[#111] pl-10 pr-11 text-sm text-white outline-none transition-colors placeholder:text-[#555] focus:border-[#444]"
              />
              {searchQuery && (
                <button
                  data-el-name="GallerySearchClear"
                  onClick={() => setSearchQuery('')}
                  aria-label="Vymazat hledání"
                  className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[#888] transition-colors hover:text-white"
                >
                  <Xmark size={16} />
                </button>
              )}
            </div>
            {showFilters && (
              <div
                data-el-name="GalleryFilterPanel"
                className="mt-2 flex items-center gap-2 rounded-[10px] border border-[#222] bg-[#111] p-1.5"
              >
                <span className="pl-2 text-xs text-[#888]">Řazení:</span>
                {(
                  [
                    { id: 'newest', label: 'Nejnovější' },
                    { id: 'oldest', label: 'Nejstarší' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setSortMode(opt.id)}
                    aria-pressed={sortMode === opt.id}
                    className={`h-8 rounded-lg px-3 text-[13px] font-medium transition-all active:scale-95 ${
                      sortMode === opt.id
                        ? 'bg-white text-black'
                        : 'text-[#888] hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Krátké potvrzení akce */}
      {notice && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <p
            data-el-name="GalleryNotice"
            className="rounded-full border border-white/10 bg-black/85 px-4 py-2 text-[13px] text-white shadow-xl backdrop-blur-md"
          >
            {notice}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-[80%] px-3 pb-10 pt-3 sm:px-4">
        {loading ? (
          <div
            data-el-name="GallerySkeleton"
            className="mx-auto columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5"
          >
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                data-el-name="GallerySkeletonItem"
                className="mb-3 break-inside-avoid animate-pulse rounded-2xl border border-white/5 bg-[#111]"
                style={{ aspectRatio: [3 / 4, 1 / 1, 4 / 5, 9 / 16][i % 4] }}
              />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div data-el-name="GalleryEmptyState" className="mx-auto max-w-[420px] px-6 py-20 text-center">
            <div
              data-el-name="GalleryEmptyIcon"
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-[#222] bg-[#111] text-[#888]"
            >
              <GalleryIcon size={26} />
            </div>
            <p data-el-name="GalleryEmptyTitle" className="text-[17px] font-semibold text-white">
              Zatím tu nic není
            </p>
            <p data-el-name="GalleryEmptyText" className="mt-1 text-sm leading-relaxed text-[#888]">
              Vygeneruj první obrázek a objeví se tady ve vodopádu.
            </p>
            <button
              data-el-name="GalleryEmptyAction"
              onClick={() => navigate('/')}
              className="mt-5 h-12 rounded-full bg-white px-7 text-[15px] font-semibold text-black transition-all hover:bg-white/90 active:scale-95"
            >
              Generovat
            </button>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div data-el-name="GalleryNoResults" className="mx-auto max-w-[420px] px-6 py-20 text-center">
            <p data-el-name="GalleryNoResultsText" className="text-[15px] text-[#aaa]">
              Nic neodpovídá hledání „{searchQuery}“
            </p>
            <button
              data-el-name="GalleryNoResultsClear"
              onClick={() => setSearchQuery('')}
              className="mt-4 h-12 rounded-full border border-[#333] bg-[#111] px-6 text-[15px] text-white transition-all hover:bg-[#1a1a1a] active:scale-95"
            >
              Zrušit hledání
            </button>
          </div>
        ) : isMasonry ? (
          <div data-el-name="GalleryGrid" className="mx-auto flex max-w-[1600px] items-start gap-3">
            {masonryColumns.map((col, colIdx) => (
              <div key={colIdx} className="flex min-w-0 flex-1 flex-col gap-3">
                {col.map(({ entry, index }) => (
                  <GalleryPin
                    key={entry.id}
                    entry={entry}
                    index={index}
                    uniform={false}
                    isMobile={isMobile}
                    onOpen={() => setViewerEntry(entry)}
                    onSave={() => handleSave(entry)}
                    onShare={() => handleShare(entry)}
                    onMore={() => setSheetEntry(entry)}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div
            data-el-name="GalleryGrid"
            className="mx-auto grid max-w-[1600px] grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          >
            {visibleEntries.map((entry, i) => (
              <GalleryPin
                key={entry.id}
                entry={entry}
                index={i}
                uniform
                isMobile={isMobile}
                onOpen={() => setViewerEntry(entry)}
                onSave={() => handleSave(entry)}
                onShare={() => handleShare(entry)}
                onMore={() => setSheetEntry(entry)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Spodní list – mobil i desktop „…" */}
      {sheetEntry && (
        <>
          <div
            data-el-name="GallerySheetBackdrop"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setSheetEntry(null)}
          />
          <div
            data-el-name="GallerySheetPanel"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[480px] overflow-y-auto rounded-t-[24px] border border-[#222] bg-[#111] p-4"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
              maxHeight: '70dvh',
            }}
          >
            <div data-el-name="GallerySheetHandle" className="flex min-h-[24px] items-center justify-center" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-[#333]" />
            </div>
            <p data-el-name="GallerySheetPrompt" className="mb-3 line-clamp-2 px-1 text-[13px] text-[#aaa]">
              {sheetEntry.prompt || 'Bez promptu'}
            </p>
            <p className="mb-3 px-1 text-xs text-[#666]">
              {shortModel(sheetEntry.model)} · {sheetEntry.width} × {sheetEntry.height}
            </p>
            {sheetError && (
              <p data-el-name="GallerySheetError" className="mb-2 px-1 text-[13px] text-red-500">{sheetError}</p>
            )}
            <div data-el-name="GallerySheetActions" className="space-y-1.5">
              <button
                data-el-name="GallerySheetOpen"
                onClick={() => {
                  setViewerEntry(sheetEntry);
                  setSheetEntry(null);
                }}
                className="min-h-[52px] w-full rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] text-[15px] text-white transition-colors hover:bg-[#222]"
              >
                Otevřít detail
              </button>
              <button
                data-el-name="GallerySheetApply"
                onClick={() => {
                  handleApplySettings(toViewData(sheetEntry));
                  setSheetEntry(null);
                }}
                className="min-h-[52px] w-full rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] text-[15px] text-white transition-colors hover:bg-[#222]"
              >
                Použít nastavení
              </button>
              <button
                data-el-name="GallerySheetDownload"
                onClick={() => {
                  handleSave(sheetEntry);
                  setSheetEntry(null);
                }}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-[#2a2a2a] bg-[#1a1a1a] text-[15px] text-white transition-colors hover:bg-[#222]"
              >
                <Download size={15} />
                Uložit obrázek
              </button>
              <button
                data-el-name="GallerySheetDelete"
                onClick={handleSheetDelete}
                className={`min-h-[52px] w-full rounded-2xl border text-[15px] font-medium transition-colors ${
                  sheetConfirmingDelete
                    ? 'border-red-500 bg-red-500 text-white'
                    : 'border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20'
                }`}
              >
                {sheetConfirmingDelete ? 'Opravdu smazat? (nevratné)' : 'Smazat'}
              </button>
              <button
                data-el-name="GallerySheetClose"
                onClick={() => setSheetEntry(null)}
                className="min-h-[52px] w-full rounded-2xl text-[15px] text-[#888] transition-colors hover:bg-white/5"
              >
                Zavřít
              </button>
            </div>
          </div>
        </>
      )}

      <ImageViewer
        entry={viewerData}
        entries={visibleEntries.map(toViewData)}
        onSelect={(data) => {
          const found = entries.find((e) => e.id === data.id);
          if (found) setViewerEntry(found);
        }}
        onClose={() => setViewerEntry(null)}
        onDelete={handleViewerDelete}
        onUseConfig={handleApplySettings}
      />
    </div>
  );
}

function GalleryPin({
  entry,
  index,
  uniform,
  isMobile,
  onOpen,
  onSave,
  onShare,
  onMore,
}: {
  entry: GalleryEntry;
  index: number;
  uniform?: boolean;
  isMobile: boolean;
  onOpen: () => void;
  onSave: () => void;
  onShare: () => void;
  onMore: () => void;
}) {
  const ratio = entry.width > 0 && entry.height > 0 ? `${entry.width} / ${entry.height}` : '3 / 4';

  return (
    <div
      data-el-name="GalleryGridItem"
      onClick={onOpen}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-white/5 bg-[#111] transition-shadow duration-200 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
      style={uniform ? { aspectRatio: '1 / 1' } : { aspectRatio: ratio }}
    >
      <img
        data-el-name="GalleryGridItemImage"
        src={getGalleryImageUrl(entry.id)}
        alt={entry.prompt || 'obrázek z galerie'}
        loading="lazy"
        draggable={false}
        className="absolute inset-0 h-full w-full animate-canvas-fade-in object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        style={{ animationDelay: `${(index % 12) * 30}ms` }}
      />

      {/* Horní hover akce podle návrhu – na mobilu jen „…" */}
      {isMobile ? (
        <button
          data-el-name="GalleryGridItemMore"
          title="Možnosti"
          aria-label="Možnosti obrázku"
          onClick={(e) => {
            e.stopPropagation();
            onMore();
          }}
          className="absolute right-2 top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-md transition-colors active:bg-black"
        >
          <MoreH size={20} />
        </button>
      ) : (
        <div
          data-el-name="GalleryGridItemActions"
          className="absolute inset-x-3 top-3 z-10 flex translate-y-1 items-center gap-2 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100"
        >
          <button
            data-el-name="GalleryGridItemShare"
            title="Kopírovat prompt"
            aria-label="Kopírovat prompt"
            onClick={(e) => {
              e.stopPropagation();
              onShare();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black"
          >
            <ShareIcon size={16} />
          </button>
          <button
            data-el-name="GalleryGridItemMore"
            title="Více možností"
            aria-label="Více možností"
            onClick={(e) => {
              e.stopPropagation();
              onMore();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-black"
          >
            <MoreH size={18} />
          </button>
          <div className="flex-1" />
          <button
            data-el-name="GalleryGridItemSave"
            onClick={(e) => {
              e.stopPropagation();
              onSave();
            }}
            className="rounded-full bg-white px-[18px] py-2.5 text-[13px] font-semibold text-[#111] transition-all hover:bg-white/90 active:scale-95"
          >
            Uložit
          </button>
        </div>
      )}

      {/* Spodní přechod + prompt + meta – na mobilu vždy, na desktopu při hoveru */}
      <div
        data-el-name="GalleryGridItemOverlay"
        className={`pointer-events-none absolute inset-x-0 bottom-0 p-3 pt-10 transition-opacity duration-200 ${
          isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.35) 55%, transparent 100%)',
        }}
      >
        <p data-el-name="GalleryGridItemPrompt" className="line-clamp-2 text-[13px] font-medium leading-snug text-white">
          {entry.prompt || 'Bez promptu'}
        </p>
        <p data-el-name="GalleryGridItemMeta" className="mt-0.5 text-xs tabular-nums text-[#aaa]">
          {shortModel(entry.model)} · {entry.width} × {entry.height}
        </p>
      </div>
    </div>
  );
}
