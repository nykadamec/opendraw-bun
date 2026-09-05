import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listProjects,
  getProjectEntries,
  getProjectEntryImageUrl,
  getProjectEntryConfig,
  listCanvasProjects,
} from '@opendraw/api-client';
import type { ProjectInfo, ProjectEntry, EntryViewData, CanvasProjectInfo } from '@opendraw/api-client';
import { DEFAULT_SAMPLER_ID } from '../samplers';
import { intToSeedMode } from '../seedModes';
import { ArrowLeft, ArrowRotate, Grid as GridIcon, Folder as FolderIcon, Xmark } from 'reicon-react';
import ImageViewer from '../components/ImageViewer';

const STORAGE_PREFILL = 'generate.prefill';
const STORAGE_PROJECT_COLS = 'projects.columns';
const STORAGE_PROJECT_ASPECT = 'projects.aspect';

const ASPECT_OPTIONS = [
  { value: '1/1', label: '1:1' },
  { value: '3/4', label: '3:4' },
  { value: '2/3', label: '2:3' },
  { value: '9/16', label: '9:16' },
] as const;

const COL_OPTIONS = [2, 3, 4];

type SortMode = 'datum' | 'velikost' | 'obrazku' | 'nazev';

const SORT_LABELS: Record<SortMode, string> = {
  datum: 'Podle data',
  velikost: 'Podle velikosti',
  obrazku: 'Podle počtu obrázků',
  nazev: 'Podle názvu',
};

const SORT_CHIPS: { mode: SortMode; label: string }[] = [
  { mode: 'datum', label: 'Datum' },
  { mode: 'velikost', label: 'Velikost' },
  { mode: 'obrazku', label: 'Obrázky' },
  { mode: 'nazev', label: 'Název' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sortProjects(list: ProjectInfo[], mode: SortMode): ProjectInfo[] {
  const sorted = [...list];
  switch (mode) {
    case 'datum':
      sorted.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
      break;
    case 'velikost':
      sorted.sort((a, b) => b.size - a.size);
      break;
    case 'obrazku':
      sorted.sort((a, b) => b.entryCount - a.entryCount);
      break;
    case 'nazev':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }
  return sorted;
}

/** Hluboký odkaz na webový canvas (mobil = web port + 1, viz start-dev.sh). */
function webCanvasUrl(canvasId: string): string {
  try {
    const { protocol, hostname, port } = window.location;
    const n = parseInt(port, 10);
    if (hostname && !isNaN(n)) {
      return `${protocol}//${hostname}:${n - 1}/canvas/${canvasId}`;
    }
  } catch {}
  return `/canvas/${canvasId}`;
}

function projectBaseName(name: string): string {
  return name.replace(/\.sqlite3$/i, '').toLowerCase();
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectInfo | null>(null);
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('datum');
  const [gridCols, setGridCols] = useState<number>(() => {
    if (typeof window === 'undefined') return 2;
    try {
      const raw = window.localStorage.getItem(STORAGE_PROJECT_COLS);
      if (!raw) return 2;
      const n = parseInt(raw, 10);
      if (n >= 1 && n <= 5) return n;
    } catch {}
    return 2;
  });
  const [aspectRatio, setAspectRatio] = useState<string>(() => {
    if (typeof window === 'undefined') return '1/1';
    try { return window.localStorage.getItem(STORAGE_PROJECT_ASPECT) || '1/1'; }
    catch { return '1/1'; }
  });
  const [viewerData, setViewerData] = useState<EntryViewData | null>(null);
  const [gridSheetOpen, setGridSheetOpen] = useState(false);
  const [linkedCanvas, setLinkedCanvas] = useState<CanvasProjectInfo | null>(null);

  const loadProjects = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    const list = await listProjects(refresh);
    setProjects(list);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_PROJECT_COLS, String(gridCols)); } catch {}
  }, [gridCols]);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_PROJECT_ASPECT, aspectRatio); } catch {}
  }, [aspectRatio]);

  const handleRefresh = () => loadProjects(true);

  const handleApplySettings = (data: EntryViewData) => {
    const prefill: Record<string, unknown> = { ...data };
    delete prefill.imageUrl;
    delete prefill.id;
    delete prefill.createdAt;
    delete prefill.source;
    if (data.width) prefill.widthCustom = data.width;
    if (data.height) prefill.heightCustom = data.height;
    prefill.customDimensions = true;
    prefill.seedMode = intToSeedMode(data.seedMode);
    try {
      window.localStorage.setItem(STORAGE_PREFILL, JSON.stringify(prefill));
    } catch {}
    navigate('/');
  };

  const openProject = async (p: ProjectInfo) => {
    setSelectedProject(p);
    setPage(1);
    setLinkedCanvas(null);
    const result = await getProjectEntries(p.id, 1);
    setEntries(result.entries);
    setTotal(result.total);
    // Najít odpovídající canvas projekt podle jména (hluboký odkaz na desktop)
    try {
      const canvases = await listCanvasProjects();
      const base = projectBaseName(p.name);
      const match = canvases.find((c) => c.name.toLowerCase() === base) ?? null;
      setLinkedCanvas(match);
    } catch {
      setLinkedCanvas(null);
    }
  };

  const loadMore = async () => {
    if (!selectedProject) return;
    const next = page + 1;
    const result = await getProjectEntries(selectedProject.id, next);
    setEntries((prev) => [...prev, ...result.entries]);
    setPage(next);
  };

  const openDetail = async (entry: ProjectEntry) => {
    if (!selectedProject) return;
    try {
      const config = await getProjectEntryConfig(selectedProject.id, entry.id);
      setViewerData({
        id: entry.id,
        imageUrl: getProjectEntryImageUrl(selectedProject.id, entry.id),
        prompt: config.prompt,
        negativePrompt: config.negativePrompt,
        model: config.model,
        width: config.width,
        height: config.height,
        seed: config.seed,
        source: 'generated',
        sampler: config.sampler,
        steps: config.steps,
        cfg: config.cfg,
        shift: config.shift,
        clipSkip: config.clipSkip,
        seedMode: config.seedMode,
        loras: config.loras,
        upscaler: config.upscaler,
        upscalerScaleFactor: config.upscalerScaleFactor,
        strength: config.strength,
        stochasticSamplingGamma: config.stochasticSamplingGamma,
        cfgZeroStar: config.cfgZeroStar,
        createdAt: entry.createdAt,
      });
    } catch (err) {
      console.error('Failed to load config', err);
    }
  };

  const sortedProjects = sortProjects(projects, sortMode);

  if (selectedProject) {
    const liteEntries: EntryViewData[] = entries.map((e) => ({
      id: e.id,
      imageUrl: getProjectEntryImageUrl(selectedProject.id, e.id),
      prompt: e.prompt,
      negativePrompt: e.negativePrompt,
      model: e.model,
      width: e.width,
      height: e.height,
      seed: e.seed,
      source: 'generated' as const,
      createdAt: e.createdAt,
    }));

    return (
      <div data-el-name="ProjectEntriesView" className="min-h-full">
        {/* Sticky hlavička detailu */}
        <div data-el-name="ProjectDetailHeader" className="sticky top-0 z-10 glass-panel border-x-0 border-t-0 px-3 py-2">
          <div className="flex items-center gap-1 max-w-[1400px] mx-auto">
            <button data-el-name="ProjectBackButton"
              onClick={() => setSelectedProject(null)}
              aria-label="Zpět na seznam projektů"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-primary active:bg-border transition-colors flex-shrink-0"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 data-el-name="ProjectEntriesName" className="text-[17px] font-semibold text-txt-primary truncate">{selectedProject.name}</h2>
              <p data-el-name="ProjectEntriesCount" className="text-[13px] text-txt-secondary">{total} obrázků</p>
            </div>
            <button data-el-name="ProjectGridSettingsButton"
              onClick={() => setGridSheetOpen(true)}
              aria-label="Nastavení mřížky"
              title="Nastavení mřížky"
              className="h-11 px-3 rounded-xl flex items-center gap-1.5 text-txt-secondary border border-border bg-surface active:bg-border transition-colors flex-shrink-0"
            >
              <GridIcon size={16} />
              <span className="text-[13px]">Mřížka</span>
            </button>
          </div>
        </div>

        <div data-el-name="ProjectEntriesBody" className="p-3 max-w-[1400px] mx-auto">
          {linkedCanvas && (
            <div data-el-name="ProjectCanvasCard" className="mb-3 bg-surface rounded-2xl p-3 border border-border flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p data-el-name="ProjectCanvasTitle" className="text-[15px] font-semibold text-txt-primary">Canvas k projektu</p>
                <p data-el-name="ProjectCanvasMeta" className="text-[13px] text-txt-secondary truncate">
                  {linkedCanvas.name} · {linkedCanvas.imageCount} obrázků
                </p>
              </div>
              <a data-el-name="ProjectCanvasDesktopLink"
                href={webCanvasUrl(linkedCanvas.id)}
                target="_blank"
                rel="noreferrer"
                className="min-h-[44px] px-4 rounded-full bg-surface-el border border-border text-txt-primary text-[13px] font-medium flex items-center active:bg-border transition-colors flex-shrink-0"
              >
                Otevřít na desktopu
              </a>
            </div>
          )}

          {entries.length === 0 ? (
            <div data-el-name="ProjectEntriesEmpty" className="text-center py-16">
              <p data-el-name="ProjectEntriesEmptyText" className="text-[15px] text-txt-secondary">Projekt je prázdný</p>
            </div>
          ) : (
            <div data-el-name="ProjectEntriesGrid"
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
            >
              {entries.map((entry) => (
                <button data-el-name="ProjectEntryItemButton"
                  key={entry.id}
                  onClick={() => openDetail(entry)}
                  className="relative rounded-2xl overflow-hidden bg-surface border border-border active:opacity-80 transition-opacity"
                  style={{ aspectRatio }}
                >
                  <img data-el-name="ProjectEntryItemImage"
                    src={getProjectEntryImageUrl(selectedProject.id, entry.id)}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div data-el-name="ProjectEntryItemOverlay" className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 p-1.5">
                    <p data-el-name="ProjectEntryItemPrompt" className="text-[11px] truncate text-txt-primary">{entry.prompt}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {entries.length < total && (
            <button data-el-name="ProjectLoadMoreButton"
              onClick={loadMore}
              className="w-full min-h-[48px] mt-3 text-[15px] text-txt-primary bg-surface border border-border rounded-2xl active:bg-border transition-colors"
            >
              Načíst další ({entries.length}/{total})
            </button>
          )}
        </div>

        {/* Sheet: nastavení mřížky */}
        {gridSheetOpen && (
          <>
            <div
              data-el-name="GridSheetBackdrop"
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              onClick={() => setGridSheetOpen(false)}
            />
            <div
              data-el-name="GridSheetPanel"
              className="fixed z-50 bottom-0 inset-x-0 bg-surface rounded-t-[24px] p-4"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
            >
              <div data-el-name="GridSheetHandle" className="min-h-[24px] flex items-center justify-center" aria-hidden>
                <div className="w-10 h-1 bg-border rounded-full" />
              </div>
              <div data-el-name="GridSheetCloseRow" className="flex items-center justify-between mb-3">
                <h3 data-el-name="GridSheetTitle" className="text-[17px] font-semibold text-txt-primary">Mřížka</h3>
                <button data-el-name="GridSheetClose"
                  onClick={() => setGridSheetOpen(false)}
                  aria-label="Zavřít nastavení mřížky"
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-tertiary active:bg-border transition-colors"
                >
                  <Xmark size={18} />
                </button>
              </div>
              <p data-el-name="GridSheetColsLabel" className="text-[13px] text-txt-secondary mb-2">Sloupce</p>
              <div data-el-name="GridSheetColsOptions" className="grid grid-cols-3 gap-2 mb-4">
                {COL_OPTIONS.map((n) => (
                  <button data-el-name="GridSheetColOption"
                    key={n}
                    onClick={() => setGridCols(n)}
                    aria-pressed={gridCols === n}
                    className={`min-h-[48px] rounded-2xl text-[15px] border transition-colors ${
                      gridCols === n
                        ? 'bg-txt-primary text-canvas border-txt-primary font-medium'
                        : 'bg-surface border-border text-txt-primary active:bg-border'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p data-el-name="GridSheetAspectLabel" className="text-[13px] text-txt-secondary mb-2">Poměr stran</p>
              <div data-el-name="GridSheetAspectOptions" className="grid grid-cols-4 gap-2">
                {ASPECT_OPTIONS.map((o) => (
                  <button data-el-name="GridSheetAspectOption"
                    key={o.value}
                    onClick={() => setAspectRatio(o.value)}
                    aria-pressed={aspectRatio === o.value}
                    className={`min-h-[48px] rounded-2xl text-[15px] border transition-colors ${
                      aspectRatio === o.value
                        ? 'bg-txt-primary text-canvas border-txt-primary font-medium'
                        : 'bg-surface border-border text-txt-primary active:bg-border'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <ImageViewer
          entry={viewerData}
          entries={liteEntries}
          onSelect={(data) => {
            const found = entries.find((e) => e.id === data.id);
            if (found) openDetail(found);
          }}
          showDelete={false}
          onClose={() => setViewerData(null)}
          onUseConfig={viewerData ? handleApplySettings : undefined}
        />
      </div>
    );
  }

  return (
    <div data-el-name="ProjectsListView" className="p-3 max-w-[1400px] mx-auto">
      <div data-el-name="ProjectsListHeader" className="flex items-center justify-between mb-2 gap-2">
        <h1 data-el-name="ProjectListTitle" className="text-[17px] font-semibold text-txt-primary min-h-[44px] flex items-center">DT Projekty</h1>
        <button data-el-name="ProjectRefreshButton"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Obnovit projekty"
          className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-secondary border border-border bg-surface active:bg-border transition-colors disabled:opacity-40 flex-shrink-0"
        >
          <ArrowRotate size={18} />
        </button>
      </div>

      <div data-el-name="ProjectSortChips" className="flex gap-2 overflow-x-auto scrollbar-none snap-x pb-2 mb-1">
        {SORT_CHIPS.map(({ mode, label }) => (
          <button data-el-name="ProjectSortChip"
            key={mode}
            onClick={() => setSortMode(mode)}
            aria-pressed={sortMode === mode}
            title={SORT_LABELS[mode]}
            className={`flex-shrink-0 snap-start min-h-[40px] px-4 rounded-full text-[13px] border transition-colors ${
              sortMode === mode
                ? 'bg-txt-primary text-canvas border-txt-primary font-medium'
                : 'bg-surface border-border text-txt-secondary active:bg-border'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div data-el-name="ProjectSkeleton" className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div data-el-name="ProjectSkeletonItem" key={i} className="rounded-2xl bg-surface border border-border p-3 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-surface-el mb-2" />
              <div className="h-3 w-1/2 rounded bg-surface-el" />
            </div>
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div data-el-name="ProjectEmptyState" className="text-center py-16">
          <div data-el-name="ProjectEmptyIcon" className="mx-auto mb-4 w-16 h-16 rounded-full bg-surface border border-border flex items-center justify-center text-txt-secondary">
            <FolderIcon size={26} />
          </div>
          <p data-el-name="ProjectEmptyText" className="text-[15px] text-txt-secondary">Žádné projekty nenalezeny</p>
        </div>
      ) : (
          <div data-el-name="ProjectsListContainer" className="space-y-2">
            {sortedProjects.map((p) => (
              <button data-el-name="ProjectListItemButton"
                key={p.id}
                onClick={() => openProject(p)}
                className="w-full min-h-[64px] bg-surface rounded-card p-3 text-left border border-border active:bg-surface-el transition-colors"
              >
                <p data-el-name="ProjectListItemName" className="text-[15px] font-semibold text-txt-primary">
                  {p.name.replace('.sqlite3', '')}
                </p>
                <div data-el-name="ProjectListItemInfo" className="flex gap-3 text-[13px] text-txt-secondary mt-1">
                  <span data-el-name="ProjectListItemCount">{p.entryCount} obrázků</span>
                  <span data-el-name="ProjectListItemSize">{formatBytes(p.size)}</span>
                  <span data-el-name="ProjectListItemDate">{new Date(p.modifiedAt).toLocaleDateString('cs')}</span>
                </div>
              </button>
            ))}
          </div>
      )}
    </div>
  );
}
