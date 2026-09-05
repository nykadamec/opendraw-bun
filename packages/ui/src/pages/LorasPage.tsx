import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchEcho, enrichLora, getLoraMetadata, clearLoraCache } from '@opendraw/api-client';
import type { LoraEnriched, LoraEnrichedImage } from '@opendraw/api-client';
import { Puzzle as PuzzleIcon, Search, Xmark, ArrowRotate } from 'reicon-react';

const STORAGE_API_KEY = 'opendraw.civitaiApiKey';

const COMMON_MODELS = [
  'Flux.1 D',
  'Flux.1 S',
  'Flux.2 Klein 9B',
  'Flux.2 Klein 9B-base',
  'Krea 2',
  'SDXL 1.0',
  'SD 1.5',
  'Pony',
  'Illustrious',
  'NoobAI',
  'Anima',
  'LTXV 2.3',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function LorasPage() {
  const navigate = useNavigate();
  const [loraFiles, setLoraFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrichedMap, setEnrichedMap] = useState<Map<string, LoraEnriched>>(new Map());
  const [searching, setSearching] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [modelFilter, setModelFilter] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('loras.modelFilter') || '[]'); } catch { return []; }
  });
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [columns, setColumns] = useState(() => {
    try { return parseInt(localStorage.getItem('loras.columns') || '') || 4; } catch { return 4; }
  });
  const [isMobile, setIsMobile] = useState<boolean>(() => isMobileDevice());
  const [versionIdx, setVersionIdx] = useState<number | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const sheetDragStartY = useRef<number | null>(null);

  const apiKey = useMemo(() => {
    try { return localStorage.getItem(STORAGE_API_KEY) || undefined; } catch { return undefined; }
  }, []);

  const availableModels = useMemo(() => {
    const models = new Set<string>(COMMON_MODELS);
    for (const enriched of enrichedMap.values()) {
      const m = enriched?.byHash?.baseModel || enriched?.byName?.[0]?.modelVersions?.[0]?.baseModel;
      if (m) models.add(m);
    }
    return [...models].sort();
  }, [enrichedMap]);

  const modelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of loraFiles) {
      const enriched = enrichedMap.get(file);
      const m = enriched?.byHash?.baseModel || enriched?.byName?.[0]?.modelVersions?.[0]?.baseModel;
      if (m) counts.set(m, (counts.get(m) || 0) + 1);
    }
    return counts;
  }, [loraFiles, enrichedMap]);

  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return availableModels;
    const q = modelSearch.toLowerCase();
    return availableModels.filter((m) => m.toLowerCase().includes(q));
  }, [availableModels, modelSearch]);

  useEffect(() => {
    localStorage.setItem('loras.columns', String(columns));
  }, [columns]);

  useEffect(() => {
    localStorage.setItem('loras.modelFilter', JSON.stringify(modelFilter));
  }, [modelFilter]);

  useEffect(() => {
    const onResize = () => setIsMobile(isMobileDevice());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Reset detailního stavu při výběru jiné LoRA
  useEffect(() => {
    setVersionIdx(null);
    setDescExpanded(false);
  }, [selected]);

  // Load lora list
  useEffect(() => {
    setLoading(true);
    fetchEcho()
      .then((data) => {
        const loraFiles = (data.files || []).filter((f: string) =>
          f.toLowerCase().includes('lora') && (f.endsWith('.safetensors') || f.endsWith('.ckpt'))
        );
        setLoraFiles(loraFiles);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  // Enrich each LoRA with a queue (rate limiting)
  useEffect(() => {
    if (loraFiles.length === 0) return;
    let cancelled = false;

    const queue = [...loraFiles];
    const results = new Map<string, LoraEnriched>();

    const processNext = async () => {
      while (queue.length > 0 && !cancelled) {
        const file = queue.shift()!;
        if (results.has(file)) continue;

        setSearching((prev) => new Set(prev).add(file));
        try {
          const data = await enrichLora(file, apiKey, modelFilter.length > 0 ? modelFilter : undefined);
          results.set(file, data);
          setEnrichedMap(new Map(results));
        } catch {
          // Silently fail — LoRA stays without enrichment
        }
        if (!cancelled) {
          setSearching((prev) => {
            const next = new Set(prev);
            next.delete(file);
            return next;
          });
        }

        // Wait 300ms between requests to avoid rate limiting
        if (queue.length > 0 && !cancelled) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    };

    processNext();
    return () => { cancelled = true; };
  }, [loraFiles, apiKey, refreshTrigger, modelFilter]);

  // Also try to get local metadata (trigger words)
  const [localMetadatas, setLocalMetadatas] = useState<Map<string, { triggerWords: string[]; name?: string }>>(new Map());

  useEffect(() => {
    if (loraFiles.length === 0) return;
    let cancelled = false;

    const queue = [...loraFiles];
    const results = new Map<string, { triggerWords: string[]; name?: string }>();

    const processNext = async () => {
      while (queue.length > 0 && !cancelled) {
        const file = queue.shift()!;
        try {
          const meta = await getLoraMetadata(file);
          results.set(file, meta);
          setLocalMetadatas(new Map(results));
        } catch {}
        if (queue.length > 0 && !cancelled) {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
    };

    processNext();
    return () => { cancelled = true; };
  }, [loraFiles]);

  const filteredFiles = useMemo(() => {
    return loraFiles.filter((file) => {
      // Model filter
      if (modelFilter.length > 0) {
        const enriched = enrichedMap.get(file);
        const bm = enriched?.byHash?.baseModel || enriched?.byName?.[0]?.modelVersions?.[0]?.baseModel;
        if (!bm || !modelFilter.includes(bm)) return false;
      }
      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        if (file.toLowerCase().includes(q)) return true;
        const enriched = enrichedMap.get(file);
        if (enriched?.byHash?.name?.toLowerCase().includes(q)) return true;
        if (enriched?.byName?.some((m) => m.name.toLowerCase().includes(q))) return true;
        const local = localMetadatas.get(file);
        if (local?.name?.toLowerCase().includes(q)) return true;
        if (local?.triggerWords?.some((w) => w.toLowerCase().includes(q))) return true;
        return false;
      }
      return true;
    });
  }, [loraFiles, searchQuery, modelFilter, enrichedMap, localMetadatas]);

  const selectedEnriched = selected ? enrichedMap.get(selected) : undefined;
  const selectedLocal = selected ? localMetadatas.get(selected) : undefined;
  const bestMatch = selectedEnriched?.byHash || selectedEnriched?.byName?.[0]?.modelVersions?.[0] || undefined;
  const bestModel = (() => {
    const byName = selectedEnriched?.byName ?? [];
    const byHash = selectedEnriched?.byHash;
    if (!byName.length) return undefined;
    // Prefer model matching byHash.modelId
    if (byHash) {
      const match = byName.find((m) => m.id === byHash.modelId);
      if (match) return match;
    }
    return byName[0];
  })();

  const versionOptions = bestModel?.modelVersions ?? [];
  const autoVersionIdx = (() => {
    if (!bestMatch) return -1;
    return versionOptions.findIndex((v) => v.id === bestMatch.id);
  })();
  const activeVersionIdx = versionIdx ?? (autoVersionIdx >= 0 ? autoVersionIdx : 0);
  const shownVersion = versionOptions[activeVersionIdx] ?? bestMatch;

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await clearLoraCache();
    } catch {}
    setEnrichedMap(new Map());
    setRefreshTrigger((p) => p + 1);
    setRefreshing(false);
  };

  const handleUseInGeneration = (file: string) => {
    // Save to localStorage as prefill
    const prefill = { loras: [{ file, weight: 0.6 }] };
    try {
      localStorage.setItem('generate.prefill', JSON.stringify(prefill));
    } catch {}
    navigate('/');
  };

  const effectiveColumns = isMobile ? 2 : columns;

  const description = stripHtml(shownVersion?.description || bestModel?.description || '');
  const DESC_PREVIEW_LENGTH = 220;
  const descTruncated = description.length > DESC_PREVIEW_LENGTH && !descExpanded;
  const descVisible = descTruncated ? `${description.slice(0, DESC_PREVIEW_LENGTH)}…` : description;

  return (
    <div data-el-name="LorasPageRoot" className="min-h-full w-full">
      <div data-el-name="LorasContainer" className="max-w-[1400px] mx-auto px-3 lg:px-8 py-3 lg:py-10">
        {/* Sticky hlavička */}
        <div data-el-name="LorasHeader" className="sticky top-0 z-10 -mx-3 px-3 pt-1 pb-2 bg-canvas/90 backdrop-blur-lg">
          <div data-el-name="LorasTitleRow" className="flex items-center justify-between gap-2">
            <h1 data-el-name="LorasTitle" className="text-[17px] lg:text-2xl font-semibold text-txt-primary tracking-tight min-h-[44px] flex items-center">
              LoRA knihovna
            </h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setFilterSheetOpen(true)}
                data-el-name="LorasFilterBtn"
                aria-label="Filtrovat podle modelu"
                className={`h-11 px-3 rounded-xl flex items-center gap-1.5 text-[13px] border transition-colors ${
                  modelFilter.length > 0
                    ? 'bg-txt-primary text-canvas border-txt-primary font-medium'
                    : 'bg-surface border-border text-txt-secondary active:bg-border'
                }`}
              >
                Model{modelFilter.length > 0 ? `: ${modelFilter.length}` : ''}
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                data-el-name="LorasRefreshBtn"
                aria-label="Obnovit data z CivitAI"
                title="Obnovit data z CivitAI"
                className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface border border-border text-txt-secondary active:bg-border transition-colors disabled:opacity-50"
              >
                <ArrowRotate size={18} />
              </button>
              <select
                data-el-name="LorasColumnsSelect"
                value={columns}
                onChange={(e) => setColumns(Number(e.target.value))}
                aria-label="Počet sloupců"
                className="hidden lg:block bg-surface rounded-lg p-2 text-xs border border-border text-txt-primary outline-none"
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n} sl.</option>
                ))}
              </select>
            </div>
          </div>
          <p data-el-name="LorasSubtitle" className="text-[13px] text-txt-secondary">
            {loraFiles.length} dostupných LoR
            {searching.size > 0 && ` · Načítám metadata (${searching.size})`}
          </p>
          <div data-el-name="LorasSearchRow" className="relative mt-2">
            <span data-el-name="LorasSearchIcon" className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none">
              <Search size={16} />
            </span>
            <input
              data-el-name="LorasSearchInput"
              type="text"
              placeholder="Hledat LoRA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface rounded-xl pl-9 pr-11 py-2 min-h-[44px] text-sm border border-border outline-none focus:border-txt-secondary transition-colors text-txt-primary placeholder:text-txt-tertiary"
            />
            {searchQuery && (
              <button data-el-name="LorasSearchClear"
                onClick={() => setSearchQuery('')}
                aria-label="Vymazat hledání"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-11 h-11 rounded-xl flex items-center justify-center text-txt-tertiary active:bg-border transition-colors"
              >
                <Xmark size={16} />
              </button>
            )}
          </div>
          {modelFilter.length > 0 && (
            <div data-el-name="LorasActiveFilters" className="flex gap-2 overflow-x-auto scrollbar-none snap-x pt-2">
              {modelFilter.map((m) => (
                <button data-el-name="LorasActiveFilterChip"
                  key={m}
                  onClick={() => setModelFilter((prev) => prev.filter((x) => x !== m))}
                  title={`Odebrat filtr ${m}`}
                  aria-label={`Odebrat filtr ${m}`}
                  className="flex-shrink-0 snap-start flex items-center gap-1.5 min-h-[40px] px-3 rounded-full bg-txt-primary/10 border border-txt-primary/30 text-txt-primary text-[13px] active:bg-txt-primary/20 transition-colors"
                >
                  {m}
                  <Xmark size={14} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div
            data-el-name="LorasSkeleton"
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div data-el-name="LorasSkeletonItem" key={i} className="rounded-2xl overflow-hidden border border-border bg-surface animate-pulse">
                <div className="w-full aspect-[4/3] bg-surface-el" />
                <div className="p-3">
                  <div className="h-4 w-3/4 rounded bg-surface-el mb-2" />
                  <div className="h-3 w-1/2 rounded bg-surface-el" />
                </div>
              </div>
            ))}
          </div>
        ) : loraFiles.length === 0 ? (
          <div data-el-name="LorasEmpty" className="text-center py-16">
            <div data-el-name="LorasEmptyIcon" className="mx-auto mb-4 w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center text-txt-secondary">
              <PuzzleIcon size={26} />
            </div>
            <p className="text-[15px] text-txt-secondary">Žádné LoRA nejsou k dispozici</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div data-el-name="LorasNoResults" className="text-center py-16">
            <p className="text-[15px] text-txt-secondary">Žádná LoRA neodpovídá hledání</p>
            <button data-el-name="LorasNoResultsClear"
              onClick={() => { setSearchQuery(''); setModelFilter([]); }}
              className="mt-4 min-h-[48px] px-6 rounded-full bg-surface text-txt-secondary border border-border text-[15px] active:bg-border transition-colors"
            >
              Zrušit filtry
            </button>
          </div>
        ) : (
          <div
            data-el-name="LorasGrid"
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${effectiveColumns}, minmax(0, 1fr))` }}
          >
            {filteredFiles.map((file) => {
              const enriched = enrichedMap.get(file);
              const searchingFile = searching.has(file);
              const local = localMetadatas.get(file);
              const image = (() => {
                // Try all image sources: byHash, then all versions of all byName models
                if (enriched?.byHash?.images?.length) {
                  const u = enriched.byHash.images.find((i) => i.url)?.url;
                  if (u) return u;
                }
                for (const model of enriched?.byName ?? []) {
                  for (const ver of model.modelVersions ?? []) {
                    const u = ver.images?.find((i) => i.url)?.url;
                    if (u) return u;
                  }
                }
                return undefined;
              })();
              const displayName = enriched?.byHash?.name
                || enriched?.byName?.[0]?.name
                || local?.name
                || file.replace(/\.safetensors$/, '').replace(/\.ckpt$/, '').replace(/[_-]/g, ' ');
              const baseModel = enriched?.byHash?.baseModel
                || enriched?.byName?.[0]?.modelVersions?.[0]?.baseModel;
              const hasData = !searchingFile && (!!enriched || !!local);

              return (
                <button
                  data-el-name="LoraCard"
                  key={file}
                  type="button"
                  onClick={() => setSelected(file)}
                  className="relative rounded-2xl overflow-hidden border border-border bg-surface cursor-pointer hover:border-txt-secondary active:border-txt-primary transition-all group text-left"
                >
                  {image ? (
                    <div className="w-full aspect-[4/3] overflow-hidden bg-surface-el">
                      <img src={image} alt={displayName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    </div>
                  ) : (
                    <div className="w-full aspect-[4/3] flex items-center justify-center bg-surface-el text-txt-tertiary">
                      <PuzzleIcon size={32} />
                    </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-3 pt-8">
                    <p className="text-white text-[15px] font-medium truncate leading-tight">{displayName}</p>
                    {baseModel && <p className="text-white/60 text-[11px] mt-0.5">{baseModel}</p>}
                  </div>

                  {searchingFile && (
                    <div data-el-name="LoraCardSearching" className="absolute top-2 right-2 w-5 h-5 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                  )}
                  {!searchingFile && !hasData && (
                    <div data-el-name="LoraCardNoData" className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500" title="Nenalezena metadata" />
                  )}
                  {!searchingFile && hasData && (
                    <div data-el-name="LoraCardHasData" className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-500" title="Metadata nalezena" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <footer data-el-name="LorasFooter" className="pt-8 text-xs text-txt-tertiary">
          <p>Data z CivitAI · {new Date().getFullYear()}</p>
        </footer>
      </div>

      {/* Filtr modelů – bottom sheet */}
      {filterSheetOpen && (
        <>
          <div
            data-el-name="ModelFilterBackdrop"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setFilterSheetOpen(false)}
          />
          <div
            data-el-name="ModelFilterPanel"
            className="fixed z-50 bottom-0 inset-x-0 bg-surface rounded-t-[24px] p-4"
            style={{
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
              maxHeight: '70dvh',
            }}
          >
            <div data-el-name="ModelFilterHandle" className="min-h-[24px] flex items-center justify-center" aria-hidden>
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>
            <h3 data-el-name="ModelFilterTitle" className="text-[17px] font-semibold text-txt-primary mb-3">Model</h3>
            <input
              type="text"
              placeholder="Hledat model..."
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              data-el-name="ModelFilterSearch"
              className="w-full bg-surface-el rounded-xl p-2.5 min-h-[44px] text-sm border border-border text-txt-primary outline-none focus:border-txt-secondary transition-colors placeholder:text-txt-tertiary mb-2"
            />
            <div data-el-name="ModelFilterList" className="max-h-[30dvh] overflow-y-auto space-y-0.5 mb-3">
              {filteredModels.length === 0 ? (
                <p className="text-[13px] text-txt-tertiary text-center py-4">Žádné modely</p>
              ) : (
                filteredModels.map((m) => {
                  const checked = modelFilter.includes(m);
                  const count = modelCounts.get(m);
                  return (
                    <label
                      key={m}
                      data-el-name="ModelFilterOption"
                      className={`flex items-center gap-3 px-2 min-h-[48px] rounded-xl text-[15px] cursor-pointer transition-colors ${
                        checked ? 'text-txt-primary' : 'text-txt-secondary active:bg-surface-el'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setModelFilter((prev) =>
                            checked ? prev.filter((x) => x !== m) : [...prev, m]
                          );
                        }}
                        className="w-5 h-5 accent-txt-primary flex-shrink-0"
                      />
                      <span className="flex-1">{m}</span>
                      {count !== undefined && (
                        <span className="text-[13px] text-txt-tertiary tabular-nums">{count}</span>
                      )}
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setModelFilter([]); }}
                className="flex-1 min-h-[52px] rounded-2xl bg-surface border border-border text-txt-secondary text-[15px] active:bg-border transition-colors"
              >
                Zrušit vše
              </button>
              <button
                type="button"
                onClick={() => { setModelFilter([...availableModels]); }}
                className="flex-1 min-h-[52px] rounded-2xl bg-surface border border-border text-txt-secondary text-[15px] active:bg-border transition-colors"
              >
                Vybrat vše
              </button>
              <button
                type="button"
                onClick={() => setFilterSheetOpen(false)}
                className="flex-1 min-h-[52px] rounded-2xl bg-txt-primary text-canvas text-[15px] font-semibold active:opacity-80 transition-all"
              >
                Hotovo
              </button>
            </div>
          </div>
        </>
      )}

      {/* Detail LoRA – full-height sheet */}
      {selected && (
        <div data-el-name="LoraDetailBackdrop" className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm">
          <div
            data-el-name="LoraDetailPanel"
            className="absolute bottom-0 inset-x-0 bg-surface rounded-t-[24px] overflow-y-auto"
            style={{
              height: '92dvh',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              data-el-name="LoraDetailHandle"
              className="sticky top-0 z-10 min-h-[44px] flex items-center justify-center bg-surface touch-none cursor-grab"
              onTouchStart={(e) => { sheetDragStartY.current = e.touches[0].clientY; }}
              onTouchEnd={(e) => {
                if (sheetDragStartY.current === null) return;
                const delta = e.changedTouches[0].clientY - sheetDragStartY.current;
                sheetDragStartY.current = null;
                if (delta > 80) setSelected(null);
              }}
              aria-label="Táhnutím dolů zavřít"
            >
              <div className="w-10 h-1 bg-border rounded-full" />
            </div>

            {/* Náhledy – swipeable */}
            {(shownVersion?.images && shownVersion.images.length > 0) ? (
              <div data-el-name="LoraDetailImages" className="flex gap-2 overflow-x-auto snap-x scrollbar-none px-4 pb-2">
                {shownVersion.images.map((img: LoraEnrichedImage, i: number) => (
                  <img
                    key={i}
                    src={img.url}
                    alt=""
                    className="h-56 rounded-2xl flex-shrink-0 snap-start object-cover"
                    loading="lazy"
                  />
                ))}
              </div>
            ) : (
              <div data-el-name="LoraDetailNoImage" className="flex items-center justify-center h-48 bg-surface-el mx-4 rounded-2xl text-txt-tertiary">
                <PuzzleIcon size={44} />
              </div>
            )}

            <div className="p-4 pt-2 space-y-4">
              {/* Title + creator */}
              <div>
                <h2 data-el-name="LoraDetailName" className="text-[17px] font-semibold text-txt-primary">
                  {shownVersion?.name || bestModel?.name || selected.replace(/\.safetensors$/, '').replace(/\.ckpt$/, '')}
                </h2>
                {bestModel?.creator?.username && (
                  <p data-el-name="LoraDetailCreator" className="text-[15px] text-txt-secondary mt-0.5">
                    by {bestModel.creator.username}
                  </p>
                )}
              </div>

              {/* Verze jako chipy */}
              {versionOptions.length > 1 && (
                <div data-el-name="LoraDetailVersions">
                  <h3 className="text-[13px] uppercase tracking-wider text-txt-tertiary font-medium mb-2">Verze</h3>
                  <div className="flex gap-2 overflow-x-auto scrollbar-none snap-x pb-1">
                    {versionOptions.map((v, i) => (
                      <button data-el-name="LoraVersionChip"
                        key={v.id}
                        onClick={() => setVersionIdx(i)}
                        aria-pressed={i === activeVersionIdx}
                        className={`flex-shrink-0 snap-start min-h-[40px] px-3 rounded-full text-[13px] border transition-colors ${
                          i === activeVersionIdx
                            ? 'bg-txt-primary text-canvas border-txt-primary font-medium'
                            : 'bg-surface border-border text-txt-secondary active:bg-border'
                        }`}
                      >
                        {v.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* File info */}
              <div data-el-name="LoraDetailFileInfo" className="flex flex-wrap gap-2 text-[13px]">
                <span className="px-2 py-1 rounded-full bg-surface-el border border-border text-txt-secondary">{selected}</span>
                {shownVersion?.baseModel && (
                  <span className="px-2 py-1 rounded-full bg-surface-el border border-border text-txt-secondary">{shownVersion.baseModel}</span>
                )}
                {shownVersion?.files?.[0]?.sizeKB && (
                  <span className="px-2 py-1 rounded-full bg-surface-el border border-border text-txt-secondary">
                    {formatBytes(shownVersion.files[0].sizeKB * 1024)}
                  </span>
                )}
              </div>

              {/* Trigger words */}
              {(() => {
                const words = shownVersion?.trainedWords || selectedLocal?.triggerWords || [];
                if (words.length === 0) return null;
                return (
                  <div data-el-name="LoraDetailTriggerWords">
                    <h3 className="text-[13px] uppercase tracking-wider text-txt-tertiary font-medium mb-2">Trigger words</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {words.map((w: string) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => navigator.clipboard.writeText(w)}
                          className="min-h-[40px] px-2.5 text-[13px] rounded-full bg-surface-el border border-border text-txt-secondary active:bg-border transition-colors"
                          title="Kopírovat trigger word"
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Description – zkrácená + Více */}
              {description && (
                <div data-el-name="LoraDetailDescription">
                  <p className="text-[15px] text-txt-secondary leading-relaxed">{descVisible}</p>
                  {description.length > DESC_PREVIEW_LENGTH && (
                    <button data-el-name="LoraDetailMore"
                      onClick={() => setDescExpanded((v) => !v)}
                      className="min-h-[44px] px-1 text-[15px] text-txt-primary font-medium active:opacity-70 transition-opacity"
                    >
                      {descExpanded ? 'Méně' : 'Více'}
                    </button>
                  )}
                </div>
              )}

              {/* Local trigger words (fallback) */}
              {(!shownVersion && selectedLocal && selectedLocal.triggerWords.length > 0) && (
                <div data-el-name="LoraDetailLocalTriggers" className="text-[13px] text-txt-tertiary">
                  <span className="font-medium">Lokální trigger words: </span>
                  {selectedLocal.triggerWords.join(', ')}
                </div>
              )}

              {/* Stats */}
              {(shownVersion?.stats || bestModel?.stats) && (
                <div data-el-name="LoraDetailStats" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-txt-tertiary">
                  {bestModel?.stats?.downloadCount !== undefined && (
                    <span>Stažení: {bestModel.stats.downloadCount.toLocaleString()}</span>
                  )}
                  {bestModel?.stats?.rating !== undefined && (
                    <span>Hodnocení: {bestModel.stats.rating.toFixed(1)}</span>
                  )}
                  {bestModel?.stats?.favoriteCount !== undefined && (
                    <span>Oblíbené: {bestModel.stats.favoriteCount.toLocaleString()}</span>
                  )}
                </div>
              )}

              {/* Tags */}
              {bestModel?.tags && bestModel.tags.length > 0 && (
                <div data-el-name="LoraDetailTags">
                  <h3 className="text-[13px] uppercase tracking-wider text-txt-tertiary font-medium mb-2">Tagy</h3>
                  <div className="flex flex-wrap gap-1">
                    {bestModel.tags.map((t: { name: string }) => (
                      <span key={t.name} className="text-[13px] px-2.5 py-1 rounded-full bg-surface border border-border text-txt-tertiary">
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Buttons */}
              <div
                data-el-name="LoraDetailActions"
                className="flex gap-2 pt-2 sticky bottom-0 bg-surface py-3"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
              >
                <button
                  type="button"
                  onClick={() => handleUseInGeneration(selected)}
                  className="flex-1 min-h-[52px] rounded-full bg-txt-primary text-canvas text-[15px] font-semibold active:opacity-80 transition-all"
                >
                  Použít v generování
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="px-5 min-h-[52px] rounded-full bg-surface border border-border text-txt-secondary text-[15px] active:bg-border transition-colors"
                >
                  Zavřít
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
