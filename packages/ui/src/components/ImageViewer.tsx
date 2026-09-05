import { useEffect, useRef, useState } from 'react';
import {
  faDownload,
  faTrash,
  faClipboard,
  faSeedling,
  faSliders,
  faCube,
  faCircleInfo,
  faWandMagicSparkles,
  faXmark,
  faCopy,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { EntryViewData } from '@opendraw/api-client';

interface Props {
  entry: EntryViewData | null;
  showDelete?: boolean;
  onClose: () => void;
  onDelete?: (entry: EntryViewData) => void;
  onUseConfig?: (entry: EntryViewData) => void;
  /** Volitelný seznam pro swipe přepínání (mobil) */
  entries?: EntryViewData[];
  onSelect?: (entry: EntryViewData) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('cs');
  } catch {
    return iso;
  }
}

interface PillProps {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}

function Pill({ label, value, mono }: PillProps) {
  return (
    <div data-el-name="Pill" className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] transition-colors border border-white/[0.04]">
      <span data-el-name="PillLabel" className="text-[11px] uppercase tracking-wide text-txt-tertiary font-medium">
        {label}
      </span>
      <span data-el-name="PillValue"
        className={`text-[13px] text-txt-primary ${mono ? 'font-mono' : ''} truncate`}
        title={typeof value === 'string' ? value : undefined}
      >
        {value || '—'}
      </span>
    </div>
  );
}

export default function ImageViewer({ entry, showDelete = true, onClose, onDelete, onUseConfig, entries, onSelect }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!entry) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goRelative(1);
      if (e.key === 'ArrowLeft') goRelative(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [entry, onClose]);

  // Reset stavů při změně obrázku
  useEffect(() => {
    setConfirmingDelete(false);
    setError(null);
  }, [entry?.id]);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const goRelative = (dir: 1 | -1) => {
    if (!entry || !entries || entries.length < 2 || !onSelect) return;
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx === -1) return;
    const next = entries[(idx + dir + entries.length) % entries.length];
    onSelect(next);
  };

  const handleTouchStart = (x: number, y: number) => {
    touchStart.current = { x, y };
  };

  const handleTouchEnd = (x: number, y: number) => {
    if (!touchStart.current) return;
    const dx = x - touchStart.current.x;
    const dy = y - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dy) > 100 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
    } else if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy)) {
      goRelative(dx < 0 ? 1 : -1);
    }
  };

  if (!entry) return null;

  const handleDownload = async () => {
    try {
      setError(null);
      const res = await fetch(entry.imageUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entry.id}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Stažení selhalo: ${(err as Error)?.message || 'neznámá chyba'}`);
    }
  };

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmingDelete(false);
    onDelete?.(entry);
    onClose();
  };

  const handleUseConfig = () => {
    onUseConfig?.(entry);
    onClose();
  };

  const handleCopyPrompt = () => {
    if (entry.prompt) {
      navigator.clipboard.writeText(entry.prompt).catch(() => {});
    }
  };

  const handleCopySeed = () => {
    if (entry.seed !== undefined) {
      navigator.clipboard.writeText(String(entry.seed)).catch(() => {});
    }
  };

  const handleCopyConfig = () => {
    let config: Record<string, unknown>;
    if (entry.generationConfig) {
      config = entry.generationConfig;
    } else {
      config = {
        id: 0,
        prompt: entry.prompt,
        negativePrompt: entry.negativePrompt || null,
        model: entry.model,
        sampler: entry.sampler || null,
        steps: entry.steps || 0,
        guidanceScale: entry.cfg || 0,
        seed: entry.seed,
        width: entry.width,
        height: entry.height,
        shift: entry.shift || 1,
        clipSkip: entry.clipSkip || 1,
        seedMode: entry.seedMode || 0,
        strength: entry.strength || 1,
        loras: entry.loras || [],
        upscaler: entry.upscaler || null,
        upscalerScaleFactor: entry.upscalerScaleFactor || 0,
        resolutionDependentShift: entry.resolutionDependentShift ?? false,
        cfgZeroStar: entry.cfgZeroStar ?? false,
        stochasticSamplingGamma: entry.stochasticSamplingGamma ?? 0.3,
      };
    }
    navigator.clipboard.writeText(JSON.stringify(config, null, 2)).catch(() => {});
  };

  return (
    <div
      data-el-name="ImageViewer"
      className="fixed inset-0 z-50 bg-black/95 flex flex-col"
      onClick={onClose}
    >
      {/* Close button */}
      <button data-el-name="CloseButton"
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md text-white text-base leading-none flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-all z-10 border border-white/10"
        aria-label="Zavřít"
      >
        <FontAwesomeIcon icon={faXmark} />
      </button>

      <div data-el-name="ImageViewerLayout" className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Image Panel – swipe dolů zavře, swipe do stran přepíná */}
        <div
          data-el-name="ImagePanel"
          className="flex-1 min-w-0 flex items-center justify-center p-6 md:p-10 touch-none"
          onTouchStart={(e) => {
            const t = e.touches[0];
            handleTouchStart(t.clientX, t.clientY);
          }}
          onTouchEnd={(e) => {
            const t = e.changedTouches[0];
            handleTouchEnd(t.clientX, t.clientY);
          }}
        >
          <img data-el-name="ViewerImage"
            src={entry.imageUrl}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl pointer-events-none"
            draggable={false}
          />
        </div>

        {/* Metadata Panel */}
        <div data-el-name="MetadataPanel"
          className="md:max-w-[420px] md:w-[420px] flex-shrink-0 overflow-y-auto bg-canvas/95 backdrop-blur-xl border-l border-white/[0.06]"
          onClick={(e) => e.stopPropagation()}
        >
          <div data-el-name="MetadataContent" className="p-5 md:p-6 space-y-6">
            {/* Header */}
            <div data-el-name="MetadataHeader" className="flex items-center justify-between">
              <div data-el-name="HeaderLeft" className="flex items-center gap-2 text-txt-tertiary">
                <FontAwesomeIcon icon={faWandMagicSparkles} className="text-xs" />
                <span data-el-name="MetadataSourceLabel" className="text-[11px] uppercase tracking-widest font-semibold">
                  Generování
                </span>
              </div>
              <span data-el-name="SourceBadge"
                className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full font-medium ${
                  entry.source === 'generated'
                    ? 'bg-primary/15 text-primary'
                    : 'bg-white/[0.06] text-txt-tertiary'
                }`}
              >
                {entry.source === 'generated' ? 'Vygenerováno' : 'Importováno'}
              </span>
            </div>

            {/* Prompt Section */}
            <section data-el-name="PromptSection" className="space-y-2">
              <div data-el-name="PromptHeader" className="flex items-center justify-between">
                <h3 data-el-name="PromptTitle" className="text-[11px] uppercase tracking-widest text-txt-tertiary font-semibold">
                  Prompt
                </h3>
                <button data-el-name="CopyPromptButton"
                  onClick={handleCopyPrompt}
                  className="text-txt-tertiary hover:text-txt-primary transition-colors p-1"
                  title="Kopírovat prompt"
                  aria-label="Kopírovat prompt"
                >
                  <FontAwesomeIcon icon={faCopy} className="text-[11px]" />
                </button>
              </div>
              <p data-el-name="PromptText" className="text-[15px] leading-relaxed text-txt-primary whitespace-pre-wrap break-words">
                {entry.prompt || '—'}
              </p>
            </section>

            {/* Negative Prompt */}
            {entry.negativePrompt ? (
              <section data-el-name="NegativePromptSection" className="space-y-2">
                <h3 data-el-name="NegativePromptTitle" className="text-[11px] uppercase tracking-widest text-txt-tertiary font-semibold">
                  Negative prompt
                </h3>
                <p data-el-name="NegativePromptText" className="text-[13px] leading-relaxed text-txt-secondary whitespace-pre-wrap break-words opacity-80">
                  {entry.negativePrompt}
                </p>
              </section>
            ) : null}

            {/* Divider */}
            <div data-el-name="MetadataDivider" className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            {/* Model */}
            <section data-el-name="ModelSection" className="space-y-2">
              <div data-el-name="ModelHeader" className="flex items-center gap-1.5 text-txt-tertiary">
                <FontAwesomeIcon icon={faCube} className="text-[11px]" />
                <h3 data-el-name="ModelTitle" className="text-[11px] uppercase tracking-widest font-semibold">
                  Model
                </h3>
              </div>
              <p data-el-name="ModelName" className="text-[13px] text-txt-primary break-all font-mono opacity-90">
                {entry.model || '—'}
              </p>
            </section>

            {/* Core Parameters */}
            <section data-el-name="ParamsSection" className="space-y-3">
              <div data-el-name="ParamsHeader" className="flex items-center gap-1.5 text-txt-tertiary">
                <FontAwesomeIcon icon={faSliders} className="text-[11px]" />
                <h3 data-el-name="ParamsTitle" className="text-[11px] uppercase tracking-widest font-semibold">
                  Parametry
                </h3>
              </div>
              <div data-el-name="ParamsGrid" className="grid grid-cols-2 gap-1.5">
                <Pill label="Sampler" value={entry.sampler} />
                <Pill label="Steps" value={entry.steps} />
                <Pill label="CFG" value={entry.cfg} mono />
                <Pill
                  label="Seed"
                  value={
                    entry.seed !== undefined ? (
                      <button data-el-name="CopySeedButton"
                        onClick={handleCopySeed}
                        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                        title="Kopírovat seed"
                      >
                        {entry.seed}
                      </button>
                    ) : null
                  }
                  mono
                />
                <Pill label="Rozměry" value={`${entry.width}×${entry.height}`} />
                <Pill label="Shift" value={entry.shift?.toFixed(1)} mono />
                <Pill label="Clip skip" value={entry.clipSkip} />
                <Pill label="Seed mode" value={entry.seedMode} />
              </div>
            </section>

            {/* Loras */}
            {entry.loras && entry.loras.length > 0 ? (
              <section data-el-name="LoraSection" className="space-y-2">
                <h3 data-el-name="LoraTitle" className="text-[11px] uppercase tracking-widest text-txt-tertiary font-semibold">
                  LoRA · {entry.loras.length}
                </h3>
                <div data-el-name="LoraList" className="space-y-1">
                  {entry.loras.map((l, i) => (
                    <div data-el-name="LoraItem"
                      key={i}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                    >
                      <span data-el-name="LoraFileName"
                        className="text-[13px] text-txt-secondary font-mono truncate"
                        title={l.file}
                      >
                        {l.file}
                      </span>
                      <span data-el-name="LoraWeight" className="text-[11px] text-txt-tertiary font-mono shrink-0">
                        ×{l.weight}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Advanced Flags */}
            <section data-el-name="AdvancedSection" className="space-y-3">
              <div data-el-name="AdvancedHeader" className="flex items-center gap-1.5 text-txt-tertiary">
                <FontAwesomeIcon icon={faCircleInfo} className="text-[11px]" />
                <h3 data-el-name="AdvancedTitle" className="text-[11px] uppercase tracking-widest font-semibold">
                  Rozšířené
                </h3>
              </div>
              <div data-el-name="AdvancedFlags" className="flex flex-wrap gap-1.5">
                {entry.upscaler && entry.upscaler !== 'none' ? (
                  <span data-el-name="AdvancedFlagUpscaler" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-medium">
                    {entry.upscaler}
                    {entry.upscalerScaleFactor ? ` ×${entry.upscalerScaleFactor}` : ''}
                  </span>
                ) : null}
                {entry.resolutionDependentShift ? (
                  <span data-el-name="AdvancedFlagResDepShift" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-txt-secondary text-[11px] font-medium">
                    Res. dep. shift
                  </span>
                ) : null}
                {entry.lcmMode ? (
                  <span data-el-name="AdvancedFlagLcm" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-txt-secondary text-[11px] font-medium">
                    LCM
                  </span>
                ) : null}
                {entry.teaCache ? (
                  <span data-el-name="AdvancedFlagTeaCache" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-txt-secondary text-[11px] font-medium">
                    Tea cache
                  </span>
                ) : null}
                {entry.causalInference ? (
                  <span data-el-name="AdvancedFlagCausalInference" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] text-txt-secondary text-[11px] font-medium">
                    Causal inf.
                  </span>
                ) : null}
                {!entry.upscaler &&
                !entry.resolutionDependentShift &&
                !entry.lcmMode &&
                !entry.teaCache &&
                !entry.causalInference ? (
                  <span data-el-name="AdvancedFlagNone" className="text-[11px] text-txt-tertiary opacity-60">
                    Žádné rozšířené volby
                  </span>
                ) : null}
              </div>
            </section>

            {/* Divider */}
            <div data-el-name="MetadataDivider2" className="h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

            {/* Meta */}
            <section data-el-name="MetaSection" className="flex items-center justify-between text-[11px] text-txt-tertiary">
              <div data-el-name="MetaDate" className="flex items-center gap-1.5">
                <FontAwesomeIcon icon={faSeedling} className="opacity-60" />
                <span>{formatDate(entry.createdAt)}</span>
              </div>
              <span data-el-name="MetaId" className="font-mono opacity-50" title={entry.id}>
                #{entry.id.slice(0, 8)}
              </span>
            </section>
          </div>

          {/* Action Bar - sticky bottom */}
          {error && (
            <p data-el-name="ViewerError" className="px-4 py-2 text-[13px] text-red-500 bg-red-500/10 border-t border-red-500/20">
              {error}
            </p>
          )}
          <div
            data-el-name="ActionBar"
            className="sticky bottom-0 bg-canvas/80 backdrop-blur-xl border-t border-white/[0.06] px-4 pt-3 flex items-center gap-2"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
          >
            <button data-el-name="UseConfigButton"
              onClick={handleUseConfig}
              disabled={!onUseConfig}
              className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-primary text-white text-xs font-semibold hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:hover:bg-primary shadow-sm"
            >
              <FontAwesomeIcon icon={faClipboard} className="text-[13px]" />
              <span>Použít nastavení</span>
            </button>
            <button data-el-name="CopyConfigButton"
              onClick={handleCopyConfig}
              className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-txt-primary border border-white/[0.06] transition-all active:scale-95 flex items-center justify-center flex-shrink-0"
              aria-label="Kopírovat config"
              title="Kopírovat config (DT)"
            >
              <FontAwesomeIcon icon={faCopy} className="text-sm" />
            </button>
            <button data-el-name="DownloadButton"
              onClick={handleDownload}
              className="w-11 h-11 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-txt-primary border border-white/[0.06] transition-all active:scale-95 flex items-center justify-center flex-shrink-0"
              aria-label="Stáhnout"
              title="Stáhnout"
            >
              <FontAwesomeIcon icon={faDownload} className="text-sm" />
            </button>
            {showDelete && (
              <button data-el-name="DeleteButton"
                onClick={handleDelete}
                aria-label={confirmingDelete ? 'Opravdu smazat' : 'Smazat'}
                title={confirmingDelete ? 'Opravdu smazat' : 'Smazat'}
                className={`rounded-full transition-all active:scale-95 flex items-center justify-center flex-shrink-0 border ${
                  confirmingDelete
                    ? 'min-h-[44px] px-4 gap-2 bg-err text-white border-err text-xs font-semibold'
                    : 'w-11 h-11 bg-err/10 hover:bg-err/20 text-err border-err/20'
                }`}
              >
                <FontAwesomeIcon icon={faTrash} className="text-sm" />
                {confirmingDelete && <span>Smazat?</span>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}