import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { listGallery, getGalleryImageUrl, deleteGalleryEntry } from '@opendraw/api-client';
import type { GalleryEntry, EntryViewData } from '@opendraw/api-client';
import { Download, Trash, ArrowRotate, Gallery as GalleryIcon, Search, Xmark, MoreH } from 'reicon-react';
import ImageViewer from '../components/ImageViewer';

const STORAGE_TILE_HEIGHT = 'gallery.tileMinHeight';
const STORAGE_PREFILL = 'generate.prefill';
const MIN_TILE = 120;
const MAX_TILE = 400;
const DEFAULT_TILE = 240;

function loadTileMinHeight(): number {
  if (typeof window === 'undefined') return DEFAULT_TILE;
  try {
    const raw = window.localStorage.getItem(STORAGE_TILE_HEIGHT);
    if (!raw) return DEFAULT_TILE;
    const n = parseInt(raw, 10);
    if (n >= MIN_TILE && n <= MAX_TILE) return n;
  } catch {}
  return DEFAULT_TILE;
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function tileAspectRatio(entry: GalleryEntry): string {
  if (entry.width > 0 && entry.height > 0) return `${entry.width} / ${entry.height}`;
  return '1 / 1';
}

function toViewData(entry: GalleryEntry): EntryViewData {
  return { ...entry, imageUrl: getGalleryImageUrl(entry.id) } as EntryViewData;
}

export default function GalleryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [viewerEntry, setViewerEntry] = useState<GalleryEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [tileMinHeight, setTileMinHeight] = useState<number>(() => loadTileMinHeight());
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileDevice());
  const [searchQuery, setSearchQuery] = useState('');
  const [sheetEntry, setSheetEntry] = useState<GalleryEntry | null>(null);
  const [sheetConfirmingDelete, setSheetConfirmingDelete] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const list = await listGallery();
    setEntries(list);
    setLoading(false);
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
      window.localStorage.setItem(STORAGE_TILE_HEIGHT, String(tileMinHeight));
    } catch {}
  }, [tileMinHeight]);

  useEffect(() => {
    if (!sheetEntry) {
      setSheetConfirmingDelete(false);
      setSheetError(null);
    }
  }, [sheetEntry]);

  const deleteEntry = async (entry: GalleryEntry): Promise<boolean> => {
    try {
      await deleteGalleryEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      return true;
    } catch {
      return false;
    }
  };

  // Desktop cesta – chování beze změny (confirm + alert)
  const handleDeleteDesktop = async (entry: GalleryEntry) => {
    const ok = window.confirm('Smazat obrázek s metadaty?');
    if (!ok) return;
    try {
      await deleteGalleryEntry(entry.id);
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    } catch (err: any) {
      window.alert(`Smazání selhalo: ${err?.message || 'neznámá chyba'}`);
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

  const filteredEntries = searchQuery.trim()
    ? entries.filter((e) =>
        (e.prompt || '').toLowerCase().includes(searchQuery.trim().toLowerCase())
      )
    : entries;

  const viewerData = viewerEntry ? toViewData(viewerEntry) : null;

  return (
    <div data-el-name="GalleryList" className="p-3">
      {/* Sticky hlavička: search + počet + obnovit */}
      <div data-el-name="GalleryListHeader" className="sticky top-0 z-10 -mx-3 px-3 pt-1 pb-2 bg-canvas/90 backdrop-blur-lg">
        <div data-el-name="GalleryTitleRow" className="flex items-center justify-between gap-2 max-w-[1400px] mx-auto w-full">
          <h1 data-el-name="GalleryTitle" className="text-[17px] font-semibold text-txt-primary shrink-0 min-h-[44px] flex items-center">
            Galerie
            <span data-el-name="GalleryCount" className="ml-2 text-[13px] font-normal text-txt-tertiary">
              {filteredEntries.length}
            </span>
          </h1>
          <div data-el-name="GalleryHeaderActions" className="flex items-center gap-1">
            <div data-el-name="GalleryTileHeightControls" className="hidden lg:flex items-center gap-2 max-w-xs">
              <span data-el-name="GalleryTileHeightLabel" className="text-[10px] text-txt-tertiary shrink-0">Min. výška dlaždice</span>
              <input data-el-name="GalleryTileHeightSlider"
                type="range"
                min={MIN_TILE}
                max={MAX_TILE}
                step={10}
                value={tileMinHeight}
                onChange={(e) => setTileMinHeight(parseInt(e.target.value, 10))}
                className="flex-1 accent-txt-primary"
                aria-label="Minimální výška dlaždice"
              />
              <span data-el-name="GalleryTileHeightValue" className="text-xs text-txt-secondary w-12 text-right tabular-nums">
                {tileMinHeight}px
              </span>
            </div>
            <button data-el-name="GalleryRefreshButton"
              onClick={load}
              disabled={loading}
              aria-label="Obnovit galerii"
              title="Obnovit"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-secondary border border-border bg-surface active:bg-border transition-colors disabled:opacity-40"
            >
              <ArrowRotate size={18} />
            </button>
          </div>
        </div>
        <div data-el-name="GallerySearchRow" className="relative max-w-[1400px] mx-auto w-full mt-1">
          <span data-el-name="GallerySearchIcon" className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none">
            <Search size={16} />
          </span>
          <input data-el-name="GallerySearchInput"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Hledat v promptech..."
            className="w-full bg-surface rounded-xl pl-9 pr-11 py-2 min-h-[44px] text-sm border border-border text-txt-primary outline-none focus:border-txt-secondary transition-colors placeholder:text-txt-tertiary"
          />
          {searchQuery && (
            <button data-el-name="GallerySearchClear"
              onClick={() => setSearchQuery('')}
              aria-label="Vymazat hledání"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl flex items-center justify-center text-txt-tertiary active:bg-border transition-colors"
            >
              <Xmark size={16} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div data-el-name="GallerySkeleton" className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              data-el-name="GallerySkeletonItem"
              key={i}
              className="rounded-2xl bg-surface border border-border animate-pulse"
              style={{ aspectRatio: '1 / 1' }}
            />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div data-el-name="GalleryEmptyState" className="text-center py-16 px-6">
          <div data-el-name="GalleryEmptyIcon" className="mx-auto mb-4 w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center text-txt-secondary">
            <GalleryIcon size={26} />
          </div>
          <p data-el-name="GalleryEmptyText" className="text-[15px] text-txt-secondary">Zatím prázdné – vygeneruj první obrázek</p>
          <button data-el-name="GalleryEmptyAction"
            onClick={() => navigate('/')}
            className="mt-4 min-h-[48px] px-6 rounded-full bg-surface-el text-txt-primary border border-border text-[15px] font-medium active:bg-border transition-colors"
          >
            Generovat
          </button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div data-el-name="GalleryNoResults" className="text-center py-16 px-6">
          <p data-el-name="GalleryNoResultsText" className="text-[15px] text-txt-secondary">Nic neodpovídá hledání „{searchQuery}"</p>
          <button data-el-name="GalleryNoResultsClear"
            onClick={() => setSearchQuery('')}
            className="mt-4 min-h-[48px] px-6 rounded-full bg-surface text-txt-secondary border border-border text-[15px] active:bg-border transition-colors"
          >
            Zrušit hledání
          </button>
        </div>
      ) : (
        <div data-el-name="GalleryGrid" className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {filteredEntries.map((entry) => (
            <div
              data-el-name="GalleryGridItem"
              key={entry.id}
              className="group relative break-inside-avoid bg-surface cursor-pointer overflow-hidden rounded-2xl border border-border"
              style={{ aspectRatio: tileAspectRatio(entry), minHeight: tileMinHeight }}
              onClick={() => setViewerEntry(entry)}
            >
              <img data-el-name="GalleryGridItemImage"
                src={getGalleryImageUrl(entry.id)}
                alt={entry.prompt || 'gallery image'}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                draggable={false}
              />
              {isMobile ? (
                <button data-el-name="GalleryGridItemMore"
                  title="Možnosti"
                  aria-label="Možnosti obrázku"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSheetEntry(entry);
                  }}
                  className="absolute top-1.5 right-1.5 z-10 w-11 h-11 rounded-full bg-black/70 text-white backdrop-blur-md flex items-center justify-center active:bg-black transition-colors"
                >
                  <MoreH size={20} />
                </button>
              ) : (
                <div data-el-name="GalleryGridItemActions"
                  className="absolute top-1.5 right-1.5 flex gap-1 z-10 transition-opacity opacity-0 group-hover:opacity-100"
                >
                  <a data-el-name="GalleryGridItemDownload"
                    href={getGalleryImageUrl(entry.id)}
                    download
                    target="_blank"
                    rel="noreferrer"
                    title="Stáhnout"
                    aria-label="Stáhnout"
                    onClick={(e) => e.stopPropagation()}
                    className="w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md flex items-center justify-center transition-colors"
                  >
                    <Download size={12} />
                  </a>
                  <button data-el-name="GalleryGridItemApplyButton"
                    title="Použít nastavení"
                    aria-label="Použít nastavení"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleApplySettings(toViewData(entry));
                    }}
                    className="w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md flex items-center justify-center transition-colors"
                  >
                    <ArrowRotate size={12} />
                  </button>
                  <button data-el-name="GalleryGridItemDeleteButton"
                    title="Smazat"
                    aria-label="Smazat"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteDesktop(entry);
                    }}
                    className="w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md flex items-center justify-center transition-colors"
                  >
                    <Trash size={12} />
                  </button>
                </div>
              )}
              <div data-el-name="GalleryGridItemOverlay"
                className="absolute inset-x-0 bottom-0 p-2 pt-6 bg-gradient-to-t from-black/80 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none hidden md:block"
              >
                <p data-el-name="GalleryGridItemPrompt" className="text-[11px] leading-tight text-white/90 line-clamp-2">
                  {entry.prompt}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobilní action sheet */}
      {sheetEntry && (
        <>
          <div
            data-el-name="GallerySheetBackdrop"
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setSheetEntry(null)}
          />
          <div
            data-el-name="GallerySheetPanel"
            className="fixed z-50 bottom-0 inset-x-0 bg-surface rounded-t-[24px] p-4 overflow-y-auto"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
              maxHeight: '70dvh',
            }}
          >
            <div data-el-name="GallerySheetHandle" className="min-h-[24px] flex items-center justify-center" aria-hidden>
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>
            <p data-el-name="GallerySheetPrompt" className="text-[13px] text-txt-secondary line-clamp-2 mb-3 px-1">
              {sheetEntry.prompt || 'Bez promptu'}
            </p>
            {sheetError && (
              <p data-el-name="GallerySheetError" className="text-[13px] text-red-500 mb-2 px-1">{sheetError}</p>
            )}
            <div data-el-name="GallerySheetActions" className="space-y-1">
              <button data-el-name="GallerySheetOpen"
                onClick={() => {
                  setViewerEntry(sheetEntry);
                  setSheetEntry(null);
                }}
                className="w-full min-h-[52px] rounded-2xl text-[15px] text-txt-primary bg-surface-el border border-border active:bg-border transition-colors"
              >
                Otevřít
              </button>
              <button data-el-name="GallerySheetApply"
                onClick={() => {
                  handleApplySettings(toViewData(sheetEntry));
                  setSheetEntry(null);
                }}
                className="w-full min-h-[52px] rounded-2xl text-[15px] text-txt-primary bg-surface-el border border-border active:bg-border transition-colors"
              >
                Použít nastavení
              </button>
              <a data-el-name="GallerySheetDownload"
                href={getGalleryImageUrl(sheetEntry.id)}
                download
                target="_blank"
                rel="noreferrer"
                className="w-full min-h-[52px] rounded-2xl text-[15px] text-txt-primary bg-surface-el border border-border active:bg-border transition-colors flex items-center justify-center"
              >
                Stáhnout
              </a>
              <button data-el-name="GallerySheetDelete"
                onClick={handleSheetDelete}
                className={`w-full min-h-[52px] rounded-2xl text-[15px] font-medium transition-colors border ${
                  sheetConfirmingDelete
                    ? 'bg-red-500 text-white border-red-500'
                    : 'text-red-500 bg-red-500/10 border-red-500/30 active:bg-red-500/20'
                }`}
              >
                {sheetConfirmingDelete ? 'Opravdu smazat? (nevratné)' : 'Smazat'}
              </button>
              <button data-el-name="GallerySheetClose"
                onClick={() => setSheetEntry(null)}
                className="w-full min-h-[52px] rounded-2xl text-[15px] text-txt-secondary active:bg-border transition-colors"
              >
                Zavřít
              </button>
            </div>
          </div>
        </>
      )}

      <ImageViewer
        entry={viewerData}
        entries={filteredEntries.map(toViewData)}
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
