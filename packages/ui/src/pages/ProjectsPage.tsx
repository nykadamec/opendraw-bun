import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  listProjects,
  getProjectEntries,
  getProjectEntryImageUrl,
  getProjectEntryConfig,
  listCanvasProjects,
  createCanvasProject,
  deleteCanvasProject,
  renameCanvasProject,
} from '@opendraw/api-client';
import type { ProjectInfo, ProjectEntry, EntryViewData, CanvasProjectInfo } from '@opendraw/api-client';
import { DEFAULT_SAMPLER_ID } from '../samplers';
import { intToSeedMode } from '../seedModes';
import { ArrowLeft, ArrowRotate, Grid as GridIcon, Folder as FolderIcon, Xmark, Search as SearchIcon, Layout as CanvasIcon, Plus, Edit as PencilIcon, Trash } from 'reicon-react';
import ImageViewer from '../components/ImageViewer';

const STORAGE_PREFILL = 'generate.prefill';
const STORAGE_LINKS = 'projects.links';

const ASPECT_OPTIONS = [
  { value: '1/1', label: '1:1' },
  { value: '3/4', label: '3:4' },
  { value: '2/3', label: '2:3' },
  { value: '9/16', label: '9:16' },
] as const;

const COL_OPTIONS = [2, 3, 4];
const PAGE_LIMIT = 50;

type TabId = 'all' | 'dt' | 'canvas';
type SortMode = 'datum' | 'velikost' | 'obrazku' | 'nazev';
type LinkFilter = 'all' | 'linked' | 'unlinked';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'Vše' },
  { id: 'dt', label: 'DT' },
  { id: 'canvas', label: 'Canvas' },
];

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

const LINK_FILTERS: { id: LinkFilter; label: string }[] = [
  { id: 'all', label: 'Vše' },
  { id: 'linked', label: 'Propojené' },
  { id: 'unlinked', label: 'Bez vazby' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function displayName(name: string): string {
  return name.replace(/\.sqlite3$/i, '');
}

/** Explicitní vazba DT → Canvas, uložená v localStorage (žádné matchování podle jména). */
function loadLinks(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_LINKS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
  } catch {}
  return {};
}

function saveLinks(map: Record<string, string>) {
  try {
    window.localStorage.setItem(STORAGE_LINKS, JSON.stringify(map));
  } catch {}
}

interface UnifiedRow {
  kind: 'dt' | 'canvas';
  id: string;
  name: string;
  count: number;
  date: string;
  size: number;
  linkedCanvasId: string | null;
  linkedCanvasName: string | null;
  linkedDtName: string | null;
}

export default function ProjectsPage({ allowCanvasOpen = true }: { allowCanvasOpen?: boolean }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const tab = (params.get('tab') as TabId) || 'all';
  const q = params.get('q') ?? '';
  const sortMode = ((params.get('sort') as SortMode) || 'datum') as SortMode;
  const projectId = params.get('project');
  const pageParam = parseInt(params.get('page') || '1', 10);
  const entryId = params.get('entry');
  const gridCols = parseInt(params.get('cols') || '2', 10);
  const aspectRatio = params.get('aspect') || '1/1';

  const setQuery = useCallback((patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      return next;
    });
  }, [setParams]);

  const validTab: TabId = tab === 'dt' || tab === 'canvas' ? tab : 'all';
  const validSort: SortMode = (['datum', 'velikost', 'obrazku', 'nazev'] as SortMode[]).includes(sortMode) ? sortMode : 'datum';
  const validCols = COL_OPTIONS.includes(gridCols) ? gridCols : 2;
  const validAspect = ASPECT_OPTIONS.some((o) => o.value === aspectRatio) ? aspectRatio : '1/1';
  const validPage = Number.isFinite(pageParam) && pageParam >= 1 ? pageParam : 1;

  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [canvases, setCanvases] = useState<CanvasProjectInfo[]>([]);
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: 'ok' | 'error'; text: string; id: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [links, setLinks] = useState<Record<string, string>>(() => (typeof window === 'undefined' ? {} : loadLinks()));
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');
  const [viewerData, setViewerData] = useState<EntryViewData | null>(null);
  const [gridSheetOpen, setGridSheetOpen] = useState(false);
  const [linkSheetOpen, setLinkSheetOpen] = useState(false);
  const [desktopBadgeOpen, setDesktopBadgeOpen] = useState(false);

  // Canvas CRUD modály (bez window.prompt/confirm)
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameTarget, setRenameTarget] = useState<CanvasProjectInfo | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CanvasProjectInfo | null>(null);

  // Search input s debounce (filtruje jen názvy)
  const [searchInput, setSearchInput] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setSearchInput(q);
  }, [q]);
  const handleSearchChange = (v: string) => {
    setSearchInput(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery({ q: v.trim() || null });
    }, 300);
  };
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  );

  const canvasById = useMemo(() => {
    const m = new Map<string, CanvasProjectInfo>();
    for (const c of canvases) m.set(c.id, c);
    return m;
  }, [canvases]);

  const dtByCanvasId = useMemo(() => {
    const m = new Map<string, ProjectInfo>();
    for (const [dtId, canvasId] of Object.entries(links)) {
      const dt = projects.find((p) => p.id === dtId);
      if (dt) m.set(canvasId, dt);
    }
    return m;
  }, [links, projects]);

  const loadAll = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [dtList, canvasList] = await Promise.all([
        listProjects(refresh),
        listCanvasProjects().catch(() => [] as CanvasProjectInfo[]),
      ]);
      setProjects(dtList);
      setCanvases(canvasList);
      setLoadError(null);
      if (refresh) setToast({ kind: 'ok', text: 'Aktualizováno', id: Date.now() });
    } catch (err) {
      const failed = 'Načtení se nezdařilo — zkuste to znovu';
      setLoadError(failed);
      if (refresh) setToast({ kind: 'error', text: failed, id: Date.now() });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Toast po obnovení sám zmizí
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [toast]);

  const handleRefresh = useCallback(() => {
    if (refreshing) return;
    void loadAll(true);
  }, [loadAll, refreshing]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Načtení entries při otevřeném detailu (stránkování, limit 50)
  useEffect(() => {
    if (!projectId) {
      setEntries([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const all: ProjectEntry[] = [];
        let totalCount = 0;
        for (let p = 1; p <= validPage; p++) {
          const result = await getProjectEntries(projectId, p, PAGE_LIMIT);
          totalCount = result.total;
          all.push(...result.entries);
          if (all.length >= result.total) break;
        }
        if (!cancelled) {
          setEntries(all);
          setTotal(totalCount);
        }
      } catch (err) {
        console.error('Failed to load entries', err);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, validPage]);

  // Viewer přes ?entry=
  useEffect(() => {
    if (!projectId || !entryId) {
      setViewerData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const found = entries.find((e) => e.id === entryId);
        const config = await getProjectEntryConfig(projectId, entryId);
        if (cancelled) return;
        setViewerData({
          id: entryId,
          imageUrl: getProjectEntryImageUrl(projectId, entryId),
          prompt: config.prompt ?? found?.prompt ?? '',
          negativePrompt: config.negativePrompt,
          model: config.model ?? found?.model ?? '',
          width: config.width ?? found?.width ?? 0,
          height: config.height ?? found?.height ?? 0,
          seed: config.seed ?? found?.seed ?? 0,
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
          createdAt: found?.createdAt ?? '',
        });
      } catch (err) {
        console.error('Failed to load config', err);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, entryId, entries]);

  const setLink = (dtId: string, canvasId: string | null) => {
    setLinks((prev) => {
      const next = { ...prev };
      if (canvasId) next[dtId] = canvasId;
      else delete next[dtId];
      saveLinks(next);
      return next;
    });
  };

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

  // --- Sjednocené řádky (bez coverů — jen textové řádky) ---
  const rows = useMemo<UnifiedRow[]>(() => {
    const query = q.trim().toLowerCase();
    const dtRows: UnifiedRow[] = projects
      .filter((p) => !query || displayName(p.name).toLowerCase().includes(query))
      .map((p) => {
        const canvasId = links[p.id] ?? null;
        const canvas = canvasId ? canvasById.get(canvasId) ?? null : null;
        return {
          kind: 'dt' as const,
          id: p.id,
          name: displayName(p.name),
          count: p.entryCount,
          date: p.modifiedAt,
          size: p.size,
          linkedCanvasId: canvas ? canvas.id : canvasId,
          linkedCanvasName: canvas ? canvas.name : null,
          linkedDtName: null,
        };
      });
    const canvasRows: UnifiedRow[] = canvases
      .filter((c) => !query || c.name.toLowerCase().includes(query))
      .map((c) => {
        const dt = dtByCanvasId.get(c.id) ?? null;
        return {
          kind: 'canvas' as const,
          id: c.id,
          name: c.name,
          count: c.imageCount,
          date: c.updatedAt,
          size: 0,
          linkedCanvasId: null,
          linkedCanvasName: null,
          linkedDtName: dt ? displayName(dt.name) : null,
        };
      });
    let list: UnifiedRow[] = [];
    if (validTab === 'dt') list = dtRows;
    else if (validTab === 'canvas') list = canvasRows;
    else list = [...dtRows, ...canvasRows];

    if (linkFilter === 'linked') list = list.filter((r) => r.linkedCanvasId || r.linkedCanvasName || r.linkedDtName);
    if (linkFilter === 'unlinked') list = list.filter((r) => !r.linkedCanvasId && !r.linkedCanvasName && !r.linkedDtName);

    const sorted = [...list];
    switch (validSort) {
      case 'datum':
        sorted.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        break;
      case 'velikost':
        sorted.sort((a, b) => b.size - a.size);
        break;
      case 'obrazku':
        sorted.sort((a, b) => b.count - a.count);
        break;
      case 'nazev':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  }, [projects, canvases, links, canvasById, dtByCanvasId, q, validTab, validSort, linkFilter]);

  const openProject = (id: string) => {
    setQuery({ project: id, page: null, entry: null });
  };

  const openCanvas = (_id: string) => {
    // CanvasPage (/canvas/:id) odstraněna — žádné mrtvé navigace, vždy badge sheet v design stylu.
    // allowCanvasOpen ponecháno pro API kompatibilitu (mobil předává false).
    void allowCanvasOpen;
    void _id;
    setDesktopBadgeOpen(true);
  };

  const loadMore = () => {
    setQuery({ page: String(validPage + 1) });
  };

  const handleCreateCanvas = async () => {
    const name = createName.trim();
    if (!name) return;
    try {
      const project = await createCanvasProject(name);
      setCanvases((prev) => [...prev, project]);
      setCreateOpen(false);
      setCreateName('');
      // Bez navigace — /canvas/:id neexistuje (CanvasPage smazána).
      void project;
    } catch (err) {
      console.error('Failed to create canvas project:', err);
    }
  };

  const handleRenameCanvas = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    try {
      await renameCanvasProject(renameTarget.id, name);
      setCanvases((prev) => prev.map((p) => (p.id === renameTarget.id ? { ...p, name } : p)));
      setRenameTarget(null);
    } catch (err) {
      console.error('Failed to rename canvas project:', err);
    }
  };

  const handleDeleteCanvas = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCanvasProject(deleteTarget.id);
      setCanvases((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      // Zrušit vazby na smazaný canvas
      setLinks((prev) => {
        const next: Record<string, string> = {};
        for (const [dtId, cId] of Object.entries(prev)) {
          if (cId !== deleteTarget.id) next[dtId] = cId;
        }
        saveLinks(next);
        return next;
      });
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete canvas project:', err);
    }
  };

  // --- Detail DT projektu ---
  if (projectId) {
    if (!loading && !selectedProject) {
      return (
        <div data-el-name="ProjectDetailMissing" className="px-4 py-6 max-w-[880px] mx-auto">
          <button
            data-el-name="ProjectBackButton"
            onClick={() => setQuery({ project: null, page: null, entry: null })}
            className="h-11 px-5 rounded-full flex items-center gap-2 text-[14px] text-txt-primary border border-border bg-surface hover:border-border-hover active:bg-border transition-colors"
          >
            <ArrowLeft size={17} /> Zpět na projekty
          </button>
          <p data-el-name="ProjectDetailMissingText" className="text-[14px] text-txt-tertiary mt-10 text-center">Projekt nebyl nalezen</p>
        </div>
      );
    }

    const linkedId = links[projectId] ?? null;
    const linked = linkedId ? canvasById.get(linkedId) ?? null : null;

    const liteEntries: EntryViewData[] = entries.map((e) => ({
      id: e.id,
      imageUrl: getProjectEntryImageUrl(projectId, e.id),
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
        <div data-el-name="ProjectDetailHeader" className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur-xl px-4 py-2.5">
          <div className="flex items-center gap-2 max-w-[1100px] mx-auto">
            <button data-el-name="ProjectBackButton"
              onClick={() => setQuery({ project: null, page: null, entry: null })}
              aria-label="Zpět na seznam projektů"
              className="w-10 h-10 rounded-full flex items-center justify-center text-txt-secondary hover:bg-surface-el active:bg-border transition-colors flex-shrink-0"
            >
              <ArrowLeft size={19} />
            </button>
            <div className="flex-1 min-w-0">
              <h2 data-el-name="ProjectEntriesName" className="text-[17px] font-semibold tracking-tight text-txt-primary truncate">
                {selectedProject ? displayName(selectedProject.name) : '…'}
              </h2>
              <p data-el-name="ProjectEntriesCount" className="text-[13px] text-txt-tertiary">{total} obrázků</p>
            </div>
            <button data-el-name="ProjectGridSettingsButton"
              onClick={() => setGridSheetOpen(true)}
              aria-label="Nastavení mřížky"
              title="Nastavení mřížky"
              className="h-10 px-4 rounded-full flex items-center gap-1.5 text-[13px] text-txt-secondary hover:bg-surface-el active:bg-border transition-colors flex-shrink-0"
            >
              <GridIcon size={15} />
              <span>Mřížka</span>
            </button>
          </div>
        </div>

        <div data-el-name="ProjectEntriesBody" className="px-4 py-4 max-w-[1100px] mx-auto">
          {/* Propojený canvas */}
          <div data-el-name="ProjectCanvasCard" className="mb-4 bg-surface rounded-2xl px-4 py-3.5 border border-border">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p data-el-name="ProjectCanvasTitle" className="text-[14px] font-medium text-txt-primary">Propojený canvas</p>
                {linked ? (
                  <p data-el-name="ProjectCanvasMeta" className="text-[13px] text-txt-tertiary truncate mt-0.5">
                    {linked.name} · {linked.imageCount} obrázků
                  </p>
                ) : (
                  <p data-el-name="ProjectCanvasEmpty" className="text-[13px] text-txt-tertiary mt-0.5">Zatím není propojeno</p>
                )}
              </div>
              {linked ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  {allowCanvasOpen ? (
                    <span data-el-name="ProjectCanvasDesktopBadge"
                      className="h-9 px-3.5 rounded-full bg-surface-el text-txt-secondary text-[12px] font-medium flex items-center"
                    >
                      Již brzy
                    </span>
                  ) : (
                    <span data-el-name="ProjectCanvasDesktopBadge"
                      className="h-9 px-3.5 rounded-full bg-surface-el text-txt-secondary text-[12px] font-medium flex items-center"
                    >
                      Canvas je na desktopu
                    </span>
                  )}
                  <button data-el-name="ProjectCanvasUnlinkButton"
                    onClick={() => setLink(projectId, null)}
                    className="h-9 px-3.5 rounded-full text-txt-tertiary text-[12px] hover:bg-surface-el active:bg-border transition-colors"
                  >
                    Rozpojit
                  </button>
                </div>
              ) : (
                <button data-el-name="ProjectCanvasLinkButton"
                  onClick={() => setLinkSheetOpen(true)}
                  className="h-10 px-4 rounded-full bg-txt-primary text-canvas text-[13px] font-medium flex items-center flex-shrink-0 active:opacity-80 transition-opacity"
                >
                  Propojit canvas
                </button>
              )}
            </div>
          </div>

          {entries.length === 0 ? (
            <div data-el-name="ProjectEntriesEmpty" className="text-center py-20">
              <p data-el-name="ProjectEntriesEmptyText" className="text-[14px] text-txt-tertiary">Projekt je prázdný</p>
            </div>
          ) : (
            <div data-el-name="ProjectEntriesGrid"
              className="grid gap-2.5"
              style={{ gridTemplateColumns: `repeat(${validCols}, minmax(0, 1fr))` }}
            >
              {entries.map((entry) => (
                <button data-el-name="ProjectEntryItemButton"
                  key={entry.id}
                  onClick={() => setQuery({ entry: entry.id })}
                  className="relative rounded-xl overflow-hidden bg-surface border border-border hover:border-border-hover active:opacity-80 transition-all"
                  style={{ aspectRatio: validAspect }}
                >
                  <img data-el-name="ProjectEntryItemImage"
                    src={getProjectEntryImageUrl(projectId, entry.id)}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div data-el-name="ProjectEntryItemOverlay" className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/55 to-transparent px-2 pt-5 pb-1.5">
                    <p data-el-name="ProjectEntryItemPrompt" className="text-[12px] truncate text-white/90 text-left">{entry.prompt}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {entries.length < total && (
            <button data-el-name="ProjectLoadMoreButton"
              onClick={loadMore}
              className="w-full h-12 mt-4 text-[14px] font-medium text-txt-secondary bg-surface border border-border rounded-full hover:text-txt-primary hover:border-border-hover active:bg-border transition-colors"
            >
              Načíst další ({entries.length}/{total})
            </button>
          )}
        </div>

        {/* Sheet: propojení canvasu */}
        {linkSheetOpen && (
          <>
            <div data-el-name="LinkSheetBackdrop" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setLinkSheetOpen(false)} />
            <div data-el-name="LinkSheetPanel" className="fixed z-50 bottom-0 inset-x-0 bg-surface rounded-t-[20px] p-4 max-h-[70vh] overflow-y-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
              <div data-el-name="LinkSheetHandle" className="py-1 flex items-center justify-center" aria-hidden>
                <div className="w-9 h-1 rounded-full bg-border" />
              </div>
              <div data-el-name="LinkSheetCloseRow" className="flex items-center justify-between mt-1 mb-3">
                <h3 data-el-name="LinkSheetTitle" className="text-[17px] font-semibold tracking-tight text-txt-primary">Propojit canvas</h3>
                <button data-el-name="LinkSheetClose" onClick={() => setLinkSheetOpen(false)} aria-label="Zavřít výběr canvasu"
                  className="w-10 h-10 rounded-full flex items-center justify-center text-txt-tertiary hover:bg-surface-el active:bg-border transition-colors">
                  <Xmark size={17} />
                </button>
              </div>
              {canvases.length === 0 ? (
                <p data-el-name="LinkSheetEmpty" className="text-[14px] text-txt-tertiary py-8 text-center">Žádné canvas projekty — nejdřív vytvořte canvas.</p>
              ) : (
                <div data-el-name="LinkSheetList" className="space-y-2">
                  {canvases.map((c) => (
                    <button data-el-name="LinkSheetItem"
                      key={c.id}
                      onClick={() => { setLink(projectId, c.id); setLinkSheetOpen(false); }}
                      aria-pressed={linkedId === c.id}
                      className={`w-full rounded-2xl px-4 py-3 text-left border transition-colors ${
                        linkedId === c.id ? 'bg-txt-primary/[0.07] border-txt-primary/40' : 'bg-canvas border-border hover:border-border-hover active:bg-border'
                      }`}
                    >
                      <p data-el-name="LinkSheetItemName" className="text-[15px] font-medium text-txt-primary truncate">{c.name}</p>
                      <p data-el-name="LinkSheetItemMeta" className="text-[13px] text-txt-tertiary mt-0.5">{c.imageCount} obrázků</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Sheet: nastavení mřížky */}
        {gridSheetOpen && (
          <>
            <div data-el-name="GridSheetBackdrop" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setGridSheetOpen(false)} />
            <div data-el-name="GridSheetPanel" className="fixed z-50 bottom-0 inset-x-0 bg-surface rounded-t-[20px] p-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}>
              <div data-el-name="GridSheetHandle" className="py-1 flex items-center justify-center" aria-hidden>
                <div className="w-9 h-1 rounded-full bg-border" />
              </div>
              <div data-el-name="GridSheetCloseRow" className="flex items-center justify-between mt-1 mb-3">
                <h3 data-el-name="GridSheetTitle" className="text-[17px] font-semibold tracking-tight text-txt-primary">Mřížka</h3>
                <button data-el-name="GridSheetClose" onClick={() => setGridSheetOpen(false)} aria-label="Zavřít nastavení mřížky"
                  className="w-10 h-10 rounded-full flex items-center justify-center text-txt-tertiary hover:bg-surface-el active:bg-border transition-colors">
                  <Xmark size={17} />
                </button>
              </div>
              <p data-el-name="GridSheetColsLabel" className="text-[12px] uppercase tracking-[0.08em] text-txt-tertiary mb-2">Sloupce</p>
              <div data-el-name="GridSheetColsOptions" className="grid grid-cols-3 gap-2 mb-5">
                {COL_OPTIONS.map((n) => (
                  <button data-el-name="GridSheetColOption" key={n}
                    onClick={() => setQuery({ cols: String(n) })}
                    aria-pressed={validCols === n}
                    className={`h-12 rounded-2xl text-[15px] border transition-colors ${
                      validCols === n ? 'bg-txt-primary text-canvas border-transparent font-medium' : 'bg-canvas border-border text-txt-primary active:bg-border'
                    }`}
                  >{n}</button>
                ))}
              </div>
              <p data-el-name="GridSheetAspectLabel" className="text-[12px] uppercase tracking-[0.08em] text-txt-tertiary mb-2">Poměr stran</p>
              <div data-el-name="GridSheetAspectOptions" className="grid grid-cols-4 gap-2">
                {ASPECT_OPTIONS.map((o) => (
                  <button data-el-name="GridSheetAspectOption" key={o.value}
                    onClick={() => setQuery({ aspect: o.value })}
                    aria-pressed={validAspect === o.value}
                    className={`h-12 rounded-2xl text-[14px] border transition-colors ${
                      validAspect === o.value ? 'bg-txt-primary text-canvas border-transparent font-medium' : 'bg-canvas border-border text-txt-primary active:bg-border'
                    }`}
                  >{o.label}</button>
                ))}
              </div>
            </div>
          </>
        )}

        <ImageViewer
          entry={viewerData}
          entries={liteEntries}
          onSelect={(data) => setQuery({ entry: data.id })}
          showDelete={false}
          onClose={() => setQuery({ entry: null })}
          onUseConfig={viewerData ? handleApplySettings : undefined}
        />
      </div>
    );
  }

  // --- Hub: seznam ---
  return (
    <div data-el-name="ProjectsHubView" className="min-h-full">
      <div data-el-name="ProjectsHubSticky" className="sticky top-0 z-10 border-b border-border bg-canvas/85 backdrop-blur-xl px-4 pt-3 pb-2">
        <div className="max-w-[880px] mx-auto">
          <div data-el-name="ProjectsListHeader" className="flex items-end justify-between gap-2">
            <div className="min-w-0">
              <h1 data-el-name="ProjectListTitle" className="text-[22px] leading-tight font-semibold tracking-tight text-txt-primary">Projekty</h1>
              <p data-el-name="ProjectListCount" className="text-[13px] text-txt-tertiary mt-0.5">
                {loading ? 'Načítám…' : `${rows.length} ${rows.length === 1 ? 'projekt' : rows.length >= 2 && rows.length <= 4 ? 'projekty' : 'projektů'}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 pb-0.5">
              <button data-el-name="ProjectRefreshButton"
                onClick={handleRefresh}
                disabled={refreshing || loading}
                aria-label={refreshing ? 'Obnovuji projekty…' : 'Obnovit projekty'}
                aria-busy={refreshing}
                title={refreshing ? 'Obnovuji…' : 'Obnovit'}
                className="w-10 h-10 rounded-full flex items-center justify-center text-txt-secondary hover:bg-surface-el active:bg-border transition-colors disabled:opacity-40"
              >
                <span className={refreshing ? 'animate-spin inline-flex' : 'inline-flex'}>
                  <ArrowRotate size={17} />
                </span>
              </button>
              <button data-el-name="CanvasCreateButton"
                onClick={() => { setCreateName(''); setCreateOpen(true); }}
                aria-label="Nový canvas"
                className="h-10 px-4 rounded-full flex items-center gap-1.5 text-[13px] font-medium bg-txt-primary text-canvas active:opacity-80 transition-opacity"
              >
                <Plus size={15} /> Canvas
              </button>
            </div>
          </div>

          <div data-el-name="ProjectsTabs" role="tablist" aria-label="Typ projektů" className="flex gap-1 mt-3 p-1 rounded-full bg-surface border border-border">
            {TABS.map((t) => (
              <button data-el-name="ProjectsTab"
                key={t.id}
                role="tab"
                aria-selected={validTab === t.id}
                onClick={() => setQuery({ tab: t.id === 'all' ? null : t.id })}
                className={`flex-1 h-9 rounded-full text-[13px] transition-all ${
                  validTab === t.id ? 'bg-txt-primary text-canvas font-medium shadow-sm' : 'text-txt-secondary hover:text-txt-primary'
                }`}
              >{t.label}</button>
            ))}
          </div>

          <div data-el-name="ProjectsSearchRow" className="relative mt-3">
            <span data-el-name="ProjectsSearchIcon" className="absolute left-4 top-1/2 -translate-y-1/2 text-txt-tertiary pointer-events-none">
              <SearchIcon size={15} />
            </span>
            <input data-el-name="ProjectsSearchInput"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Hledat projekty…"
              aria-label="Hledat projekty podle názvu"
              className="w-full h-11 rounded-full bg-surface border border-border pl-10 pr-10 text-[14px] text-txt-primary placeholder:text-txt-tertiary outline-none focus:border-txt-primary/40 transition-colors"
            />
            {searchInput && (
              <button data-el-name="ProjectsSearchClear"
                onClick={() => handleSearchChange('')}
                aria-label="Vymazat hledání"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-txt-tertiary hover:bg-surface-el active:bg-border transition-colors"
              >
                <Xmark size={15} />
              </button>
            )}
          </div>

          <div data-el-name="ProjectSortChips" className="flex gap-1.5 overflow-x-auto scrollbar-none snap-x py-2.5">
            {SORT_CHIPS.map(({ mode, label }) => (
              <button data-el-name="ProjectSortChip" key={mode}
                onClick={() => setQuery({ sort: mode === 'datum' ? null : mode })}
                aria-pressed={validSort === mode}
                title={SORT_LABELS[mode]}
                className={`flex-shrink-0 snap-start h-9 px-3.5 rounded-full text-[13px] border transition-colors ${
                  validSort === mode ? 'bg-txt-primary text-canvas border-transparent font-medium' : 'bg-transparent border-border text-txt-secondary hover:text-txt-primary active:bg-border'
                }`}
              >{label}</button>
            ))}
            <span data-el-name="ProjectsLinkFilterDivider" className="w-2 flex-shrink-0" aria-hidden />
            {LINK_FILTERS.map((f) => (
              <button data-el-name="ProjectsLinkFilterChip" key={f.id}
                onClick={() => setLinkFilter(f.id)}
                aria-pressed={linkFilter === f.id}
                className={`flex-shrink-0 snap-start h-9 px-3.5 rounded-full text-[13px] border transition-colors ${
                  linkFilter === f.id ? 'bg-txt-primary/[0.07] border-txt-primary/40 text-txt-primary font-medium' : 'bg-transparent border-transparent text-txt-tertiary hover:text-txt-secondary'
                }`}
              >{f.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div data-el-name="ProjectsListBody" className="px-4 py-4 max-w-[880px] mx-auto">
        {!loading && loadError && (
          <div data-el-name="ProjectsLoadError" role="alert" className="mb-3 flex items-center gap-3 bg-surface rounded-2xl px-4 py-3 border border-red-500/30">
            <p className="flex-1 text-[13px] text-txt-secondary">{loadError}</p>
            <button
              data-el-name="ProjectsRetryButton"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-9 px-3.5 rounded-full bg-txt-primary text-canvas text-[13px] font-medium active:opacity-80 transition-opacity disabled:opacity-40 flex-shrink-0"
            >
              {refreshing ? 'Obnovuji…' : 'Zkusit znovu'}
            </button>
          </div>
        )}
        {loading ? (
          <div data-el-name="ProjectSkeleton" className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div data-el-name="ProjectSkeletonItem" key={i} className="rounded-2xl bg-surface border border-border p-3.5 animate-pulse">
                <div className="h-4 w-2/3 rounded-md bg-surface-el mb-2" />
                <div className="h-3 w-1/3 rounded-md bg-surface-el" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div data-el-name="ProjectEmptyState" className="text-center py-20">
            <div data-el-name="ProjectEmptyIcon" className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center text-txt-tertiary">
              <FolderIcon size={24} />
            </div>
            <p data-el-name="ProjectEmptyText" className="text-[14px] text-txt-secondary">
              {q ? 'Nic jsme nenašli — zkuste jiný název' : 'Zatím tu nic není'}
            </p>
          </div>
        ) : (
          <div data-el-name="ProjectsListContainer" className="space-y-2.5">
            {rows.map((row) =>
              row.kind === 'dt' ? (
                <button data-el-name="ProjectListItemButton" key={`dt-${row.id}`}
                  onClick={() => openProject(row.id)}
                  className="w-full bg-surface rounded-2xl px-3.5 py-3 text-left border border-border hover:border-border-hover hover:shadow-sm active:bg-surface-el transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span data-el-name="ProjectListItemIcon" className="w-9 h-9 rounded-full bg-canvas border border-border flex items-center justify-center text-txt-secondary flex-shrink-0"><FolderIcon size={16} /></span>
                    <p data-el-name="ProjectListItemName" className="text-[15px] font-medium tracking-[-0.01em] text-txt-primary truncate flex-1">{row.name}</p>
                    <span data-el-name="ProjectKindBadge" className="text-[10px] uppercase tracking-[0.1em] text-txt-tertiary flex-shrink-0">DT</span>
                    {row.linkedCanvasName && (
                      <span data-el-name="ProjectLinkedBadge" className="text-[11px] px-2 py-0.5 rounded-full bg-surface-el text-txt-secondary truncate max-w-[160px] flex-shrink-0">
                        ↔ {row.linkedCanvasName}
                      </span>
                    )}
                  </div>
                  <div data-el-name="ProjectListItemInfo" className="flex items-center gap-1.5 text-[13px] text-txt-tertiary mt-1.5 ml-12">
                    <span data-el-name="ProjectListItemCount">{row.count} obrázků</span>
                    <span aria-hidden>·</span>
                    <span data-el-name="ProjectListItemSize">{formatBytes(row.size)}</span>
                    <span aria-hidden>·</span>
                    <span data-el-name="ProjectListItemDate">{new Date(row.date).toLocaleDateString('cs')}</span>
                  </div>
                </button>
              ) : (
                <div data-el-name="CanvasListItem" key={`canvas-${row.id}`}
                  className="w-full bg-surface rounded-2xl px-3.5 py-3 border border-border hover:border-border-hover transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <button data-el-name="CanvasListItemOpen" onClick={() => openCanvas(row.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <span data-el-name="CanvasListItemIcon" className="w-9 h-9 rounded-full bg-canvas border border-border flex items-center justify-center text-txt-secondary flex-shrink-0"><CanvasIcon size={16} /></span>
                      <span data-el-name="CanvasListItemName" className="text-[15px] font-medium tracking-[-0.01em] text-txt-primary truncate">{row.name}</span>
                    </button>
                    <span data-el-name="ProjectKindBadge" className="text-[10px] uppercase tracking-[0.1em] text-txt-tertiary flex-shrink-0">Canvas</span>
                    {row.linkedDtName && (
                      <span data-el-name="CanvasLinkedBadge" className="text-[11px] px-2 py-0.5 rounded-full bg-surface-el text-txt-secondary truncate max-w-[160px] flex-shrink-0">
                        ↔ {row.linkedDtName}
                      </span>
                    )}
                  </div>
                  <div data-el-name="CanvasListItemInfo" className="flex items-center gap-1.5 text-[13px] text-txt-tertiary mt-1.5 ml-12">
                    <button data-el-name="CanvasListItemMetaButton" onClick={() => openCanvas(row.id)} className="flex items-center gap-1.5 text-left hover:text-txt-secondary transition-colors">
                      <span>{row.count} obrázků</span>
                      <span aria-hidden>·</span>
                      <span>{new Date(row.date).toLocaleDateString('cs')}</span>
                    </button>
                    <span className="flex-1" />
                    <button data-el-name="CanvasRenameButton"
                      onClick={() => { const c = canvasById.get(row.id); if (c) { setRenameTarget(c); setRenameName(c.name); } }}
                      aria-label={`Přejmenovat canvas ${row.name}`}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-txt-tertiary hover:bg-surface-el active:bg-border transition-colors"
                    ><PencilIcon size={14} /></button>
                    <button data-el-name="CanvasDeleteButton"
                      onClick={() => { const c = canvasById.get(row.id); if (c) setDeleteTarget(c); }}
                      aria-label={`Smazat canvas ${row.name}`}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-txt-tertiary hover:bg-surface-el active:bg-border transition-colors"
                    ><Trash size={14} /></button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      {/* Modal: nový canvas */}
      {createOpen && (
        <>
          <div data-el-name="CanvasCreateBackdrop" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setCreateOpen(false)} />
          <div data-el-name="CanvasCreateDialog" role="dialog" aria-modal="true" aria-label="Nový canvas"
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-surface rounded-[20px] p-5 border border-border">
            <h3 data-el-name="CanvasCreateTitle" className="text-[17px] font-semibold tracking-tight text-txt-primary mb-3">Nový canvas</h3>
            <input data-el-name="CanvasCreateInput"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCanvas(); if (e.key === 'Escape') setCreateOpen(false); }}
              placeholder="Název canvasu"
              autoFocus
              className="w-full h-12 rounded-2xl bg-canvas border border-border px-4 text-[15px] text-txt-primary placeholder:text-txt-tertiary outline-none focus:border-txt-primary/40 transition-colors mb-3"
            />
            <div className="flex gap-2">
              <button data-el-name="CanvasCreateCancel" onClick={() => setCreateOpen(false)}
                className="flex-1 h-12 rounded-2xl text-txt-secondary text-[15px] hover:bg-surface-el active:bg-border transition-colors">Zrušit</button>
              <button data-el-name="CanvasCreateConfirm" onClick={handleCreateCanvas} disabled={!createName.trim()}
                className="flex-1 h-12 rounded-2xl bg-txt-primary text-canvas text-[15px] font-medium active:opacity-80 transition-opacity disabled:opacity-40">Vytvořit</button>
            </div>
          </div>
        </>
      )}

      {/* Modal: přejmenování */}
      {renameTarget && (
        <>
          <div data-el-name="CanvasRenameBackdrop" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setRenameTarget(null)} />
          <div data-el-name="CanvasRenameDialog" role="dialog" aria-modal="true" aria-label="Přejmenovat canvas"
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-surface rounded-[20px] p-5 border border-border">
            <h3 data-el-name="CanvasRenameTitle" className="text-[17px] font-semibold tracking-tight text-txt-primary mb-3">Přejmenovat canvas</h3>
            <input data-el-name="CanvasRenameInput"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameCanvas(); if (e.key === 'Escape') setRenameTarget(null); }}
              autoFocus
              className="w-full h-12 rounded-2xl bg-canvas border border-border px-4 text-[15px] text-txt-primary outline-none focus:border-txt-primary/40 transition-colors mb-3"
            />
            <div className="flex gap-2">
              <button data-el-name="CanvasRenameCancel" onClick={() => setRenameTarget(null)}
                className="flex-1 h-12 rounded-2xl text-txt-secondary text-[15px] hover:bg-surface-el active:bg-border transition-colors">Zrušit</button>
              <button data-el-name="CanvasRenameConfirm" onClick={handleRenameCanvas} disabled={!renameName.trim()}
                className="flex-1 h-12 rounded-2xl bg-txt-primary text-canvas text-[15px] font-medium active:opacity-80 transition-opacity disabled:opacity-40">Uložit</button>
            </div>
          </div>
        </>
      )}

      {/* Modal: smazání */}
      {deleteTarget && (
        <>
          <div data-el-name="CanvasDeleteBackdrop" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setDeleteTarget(null)} />
          <div data-el-name="CanvasDeleteDialog" role="dialog" aria-modal="true" aria-label="Smazat canvas"
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-surface rounded-[20px] p-5 border border-border">
            <h3 data-el-name="CanvasDeleteTitle" className="text-[17px] font-semibold tracking-tight text-txt-primary">Smazat canvas?</h3>
            <p data-el-name="CanvasDeleteText" className="text-[14px] text-txt-secondary mt-1.5 mb-5">„{deleteTarget.name}" se trvale odstraní včetně vazeb na DT projekty.</p>
            <div className="flex gap-2">
              <button data-el-name="CanvasDeleteCancel" onClick={() => setDeleteTarget(null)}
                className="flex-1 h-12 rounded-2xl text-txt-secondary text-[15px] hover:bg-surface-el active:bg-border transition-colors">Ponechat</button>
              <button data-el-name="CanvasDeleteConfirm" onClick={handleDeleteCanvas}
                className="flex-1 h-12 rounded-2xl bg-red-500 text-white text-[15px] font-medium active:opacity-80 transition-opacity">Smazat</button>
            </div>
          </div>
        </>
      )}

      {/* Badge sheet: canvas dočasně nedostupný (desktop) / mobil bez canvasu */}
      {desktopBadgeOpen && (
        <>
          <div data-el-name="DesktopBadgeBackdrop" className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={() => setDesktopBadgeOpen(false)} />
          <div data-el-name="DesktopBadgePanel" className="fixed z-50 bottom-0 inset-x-0 bg-surface rounded-t-[20px] p-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}>
            <div className="py-1 flex items-center justify-center" aria-hidden>
              <div className="w-9 h-1 rounded-full bg-border" />
            </div>
            <h3 data-el-name="DesktopBadgeTitle" className="text-[17px] font-semibold tracking-tight text-txt-primary mt-2">{allowCanvasOpen ? 'Canvas již brzy' : 'Canvas je na desktopu'}</h3>
            <p data-el-name="DesktopBadgeText" className="text-[14px] text-txt-secondary mt-1.5 mb-5">{allowCanvasOpen ? 'Canvas editor je dočasně nedostupný — sledujte další aktualizace.' : 'Otevřete si OpenDraw na počítači — mobilní aplikace canvas editor neobsahuje.'}</p>
            <button data-el-name="DesktopBadgeClose" onClick={() => setDesktopBadgeOpen(false)}
              className="w-full h-12 rounded-2xl bg-txt-primary text-canvas text-[15px] font-medium active:opacity-80 transition-opacity">Rozumím</button>
          </div>
        </>
      )}
      {/* Toast: potvrzení po obnovení */}
      {toast && (
        <div
          data-el-name="ProjectsToast"
          role="status"
          aria-live="polite"
          key={toast.id}
          className={`fixed z-50 left-1/2 -translate-x-1/2 px-4 h-11 rounded-full flex items-center gap-2 text-[13px] font-medium shadow-lg border transition-all ${
            toast.kind === 'ok'
              ? 'bg-txt-primary text-canvas border-transparent'
              : 'bg-surface text-txt-primary border-red-500/30'
          }`}
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
        >
          <span
            data-el-name="ProjectsToastDot"
            aria-hidden
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              toast.kind === 'ok' ? 'bg-canvas' : 'bg-red-500'
            }`}
          />
          {toast.text}
        </div>
      )}
    </div>
  );
}

// Udržet import bez varování při striktním buildu
void DEFAULT_SAMPLER_ID;
