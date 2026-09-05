import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import PromptCard from '../components/PromptCard';
import ParamChipBar from '../components/ParamChipBar';
import CanvasArea from '../components/CanvasArea';
import ParamSheet from '../components/ParamSheet';
import { generateImage, fetchEcho, fetchCloudModels, getGalleryStats } from '@opendraw/api-client';
import type { EchoResponse, CloudModel } from '@opendraw/api-client';
import { DEFAULT_SAMPLER_ID, SAMPLERS, SAMPLER_ID_TO_ENUM, SAMPLER_ENUM_TO_ID } from '../samplers';
import { DEFAULT_SEED_MODE_ID, SEED_MODES, seedModeToInt, intToSeedMode, type SeedModeId } from '../seedModes';
import { UPSCALER_PRESETS, UPSCALER_SCALE_FACTORS, DEFAULT_UPSCALER_SCALE_FACTOR, type UpscalerScaleFactor } from '../upscalers';
import { getLoraMetadata } from '@opendraw/api-client';
import { displayLoraName } from '../lora-utils';
import type { LoraMetadata, GalleryStats } from '@opendraw/api-client';
import { ChevronRight, ChevronLeft, ClipboardImport, ClipboardExport, ArrowRotate } from 'reicon-react';
import Stop from 'reicon-react/icons/Stop';

import { useFeatureFlag } from '../hooks/useFeatureFlag';

const STORAGE_LAST = 'generate.last';
const STORAGE_PREFILL = 'generate.prefill';

export type SizeLevel = 'small' | 'normal' | 'large';
export type AspectRatio =
  | '1:2'
  | '2:3'
  | '3:4'
  | '4:5'
  | '1:1'
  | '5:4'
  | '4:3'
  | '3:2'
  | '2:1'
  | '16:9'
  | '9:16';

export const SIZE_LEVELS: SizeLevel[] = ['small', 'normal', 'large'];
export const ASPECT_RATIOS: AspectRatio[] = [
  '1:2',
  '2:3',
  '3:4',
  '4:5',
  '1:1',
  '5:4',
  '4:3',
  '3:2',
  '2:1',
  '16:9',
  '9:16',
];

const SIZE_LABEL: Record<SizeLevel, string> = {
  small: 'Small',
  normal: 'Normal',
  large: 'Large',
};

const SIZE_BASE: Record<SizeLevel, number> = {
  small: 512,
  normal: 1024,
  large: 1536,
};

const ASPECT_VALUE: Record<AspectRatio, number> = {
  '1:2': 1 / 2,
  '2:3': 2 / 3,
  '3:4': 3 / 4,
  '4:5': 4 / 5,
  '1:1': 1,
  '5:4': 5 / 4,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '2:1': 2,
  '16:9': 16 / 9,
  '9:16': 9 / 16,
};

function round8(n: number): number {
  return Math.max(64, Math.round(n / 8) * 8);
}

export function calcDimensions(
  sizeLevel: SizeLevel,
  aspectRatio: AspectRatio
): [number, number] {
  const base = SIZE_BASE[sizeLevel];
  const r = ASPECT_VALUE[aspectRatio];
  let w: number;
  let h: number;
  if (r >= 1) {
    w = base;
    h = Math.round(base / r);
  } else {
    h = base;
    w = Math.round(base * r);
  }
  return [round8(w), round8(h)];
}

function inferSizeLevel(width: number, height: number): SizeLevel {
  const base = Math.max(width, height);
  if (base <= 640) return 'small';
  if (base >= 1280) return 'large';
  return 'normal';
}

function inferAspectRatio(width: number, height: number): AspectRatio {
  const r = width / height;
  let best: AspectRatio = '1:1';
  let bestDist = Infinity;
  for (const ar of ASPECT_RATIOS) {
    const dist = Math.abs(ASPECT_VALUE[ar] - r);
    if (dist < bestDist) {
      bestDist = dist;
      best = ar;
    }
  }
  return best;
}

interface PersistedSettings {
  prompt?: string;
  negativePrompt: string;
  model: string;
  sampler: string;
  steps: number;
  cfg: number;
  seed: number;
  sizeLevel: SizeLevel;
  aspectRatio: AspectRatio;
  customDimensions: boolean;
  widthCustom: number;
  heightCustom: number;
  shift: number;
  clipSkip: number;
  resolutionDependentShift: boolean;
  randomizeSeed: boolean;
  saveToGallery: boolean;
  seedMode: SeedModeId;
  upscaler: string;
  upscalerScaleFactor: UpscalerScaleFactor;
  loras: { file: string; weight: number }[];
  strength: number;
  stochasticSamplingGamma: number;
  numFrames: number;
  cfgZeroStar: boolean;
  tiledDecoding: boolean;
  tiledDiffusion: boolean;
  decodingTileWidth: number;
  decodingTileHeight: number;
  decodingTileOverlap: number;
  diffusionTileWidth: number;
  diffusionTileHeight: number;
  diffusionTileOverlap: number;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  negativePrompt: '',
  model: '',
  sampler: DEFAULT_SAMPLER_ID,
  steps: 28,
  cfg: 3.5,
  seed: -1,
  sizeLevel: 'normal',
  aspectRatio: '1:1',
  customDimensions: false,
  widthCustom: 1024,
  heightCustom: 1024,
  shift: 1.0,
  clipSkip: 1,
  resolutionDependentShift: true,
  randomizeSeed: false,
  saveToGallery: true,
  seedMode: DEFAULT_SEED_MODE_ID,
  upscaler: '',
  upscalerScaleFactor: DEFAULT_UPSCALER_SCALE_FACTOR,
  loras: [],
  strength: 1.00,
  stochasticSamplingGamma: 0.3,
  numFrames: 0,
  cfgZeroStar: false,
  tiledDecoding: false,
  tiledDiffusion: false,
  decodingTileWidth: 640,
  decodingTileHeight: 640,
  decodingTileOverlap: 128,
  diffusionTileWidth: 1024,
  diffusionTileHeight: 1024,
  diffusionTileOverlap: 128,
};

function mergeSettings(
  parsed: Partial<PersistedSettings>,
  inferredDims?: { width: number; height: number }
): PersistedSettings {
  const merged: PersistedSettings = { ...DEFAULT_SETTINGS, ...parsed };
  if (typeof (merged.seedMode as unknown) === 'number') {
    merged.seedMode = intToSeedMode(merged.seedMode as unknown as number);
  }
  if (parsed.upscaler === undefined) {
    merged.upscaler = '';
  }
  if (parsed.upscalerScaleFactor === undefined) {
    merged.upscalerScaleFactor = DEFAULT_UPSCALER_SCALE_FACTOR;
  } else if (!UPSCALER_SCALE_FACTORS.includes(merged.upscalerScaleFactor)) {
    merged.upscalerScaleFactor = DEFAULT_UPSCALER_SCALE_FACTOR;
  }
  if (inferredDims) {
    if (parsed.sizeLevel === undefined) {
      merged.sizeLevel = inferSizeLevel(inferredDims.width, inferredDims.height);
    }
    if (parsed.aspectRatio === undefined) {
      merged.aspectRatio = inferAspectRatio(inferredDims.width, inferredDims.height);
    }
    if (parsed.widthCustom === undefined) {
      merged.widthCustom = round8(inferredDims.width);
    }
    if (parsed.heightCustom === undefined) {
      merged.heightCustom = round8(inferredDims.height);
    }
  }
  return merged;
}

function loadInitialSettings(): { settings: PersistedSettings; fromPrefill: boolean } {
  if (typeof window === 'undefined') return { settings: DEFAULT_SETTINGS, fromPrefill: false };
  try {
    const prefillRaw = window.localStorage.getItem(STORAGE_PREFILL);
    if (prefillRaw) {
      const parsed = JSON.parse(prefillRaw) as Partial<PersistedSettings> & {
        width?: number;
        height?: number;
      };
      window.localStorage.removeItem(STORAGE_PREFILL);
      const inferredDims =
        parsed.width !== undefined && parsed.height !== undefined
          ? { width: parsed.width, height: parsed.height }
          : undefined;
      const merged = mergeSettings(parsed, inferredDims);
      window.localStorage.setItem(STORAGE_LAST, JSON.stringify(merged));
      return { settings: merged, fromPrefill: true };
    }
    const lastRaw = window.localStorage.getItem(STORAGE_LAST);
    if (lastRaw) {
      const parsed = JSON.parse(lastRaw) as Partial<PersistedSettings> & {
        width?: number;
        height?: number;
      };
      const inferredDims =
        parsed.width !== undefined && parsed.height !== undefined
          ? { width: parsed.width, height: parsed.height }
          : undefined;
      return { settings: mergeSettings(parsed, inferredDims), fromPrefill: false };
    }
  } catch {}
  return { settings: DEFAULT_SETTINGS, fromPrefill: false };
}

function saveSettings(settings: PersistedSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_LAST, JSON.stringify(settings));
  } catch {}
}

function applySettings(
  parsed: Partial<PersistedSettings> & { prompt?: string; width?: number; height?: number },
  setters: {
    setPrompt: (v: string) => void;
    setNegative: (v: string) => void;
    setModel: (v: string) => void;
    setSampler: (v: string) => void;
    setSteps: (v: number) => void;
    setCfg: (v: number) => void;
    setSeed: (v: number) => void;
    setSizeLevel: (v: SizeLevel) => void;
    setAspectRatio: (v: AspectRatio) => void;
    setCustomDimensions: (v: boolean) => void;
    setWidthCustom: (v: number) => void;
    setHeightCustom: (v: number) => void;
    setShift: (v: number) => void;
    setClipSkip: (v: number) => void;
    setResolutionDependentShift: (v: boolean) => void;
    setRandomizeSeed: (v: boolean) => void;
    setSaveToGallery: (v: boolean) => void;
    setSeedMode: (v: SeedModeId) => void;
    setUpscaler: (v: string) => void;
    setUpscalerScaleFactor: (v: UpscalerScaleFactor) => void;
    setLoras: (v: { file: string; weight: number }[]) => void;
    setStrength: (v: number) => void;
    setStochasticSamplingGamma: (v: number) => void;
    setNumFrames: (v: number) => void;
    setCfgZeroStar: (v: boolean) => void;
    setTiledDecoding: (v: boolean) => void;
    setTiledDiffusion: (v: boolean) => void;
    setDecodingTileWidth: (v: number) => void;
    setDecodingTileHeight: (v: number) => void;
    setDecodingTileOverlap: (v: number) => void;
    setDiffusionTileWidth: (v: number) => void;
    setDiffusionTileHeight: (v: number) => void;
    setDiffusionTileOverlap: (v: number) => void;
  }
): PersistedSettings {
  const merged = mergeSettings(parsed);
  setters.setPrompt(parsed.prompt ?? '');
  setters.setNegative(merged.negativePrompt);
  setters.setModel(merged.model);
  setters.setSampler(merged.sampler);
  setters.setSteps(merged.steps);
  setters.setCfg(merged.cfg);
  setters.setSeed(merged.seed);
  setters.setSizeLevel(merged.sizeLevel);
  setters.setAspectRatio(merged.aspectRatio);
  setters.setCustomDimensions(merged.customDimensions);
  setters.setWidthCustom(merged.widthCustom);
  setters.setHeightCustom(merged.heightCustom);
  setters.setShift(merged.shift);
  setters.setClipSkip(merged.clipSkip);
  setters.setResolutionDependentShift(merged.resolutionDependentShift);
  setters.setRandomizeSeed(merged.randomizeSeed);
  setters.setSaveToGallery(merged.saveToGallery);
  setters.setSeedMode(merged.seedMode);
  setters.setLoras(merged.loras);
  setters.setStrength(merged.strength);
  setters.setStochasticSamplingGamma(merged.stochasticSamplingGamma);
  setters.setNumFrames(merged.numFrames);
  setters.setCfgZeroStar(merged.cfgZeroStar);
  setters.setTiledDecoding(merged.tiledDecoding);
  setters.setTiledDiffusion(merged.tiledDiffusion);
  setters.setDecodingTileWidth(merged.decodingTileWidth);
  setters.setDecodingTileHeight(merged.decodingTileHeight);
  setters.setDecodingTileOverlap(merged.decodingTileOverlap);
  setters.setDiffusionTileWidth(merged.diffusionTileWidth);
  setters.setDiffusionTileHeight(merged.diffusionTileHeight);
  setters.setDiffusionTileOverlap(merged.diffusionTileOverlap);
  return merged;
}

function AccordionSection({ id, label, children, openSection, onToggle }: {
  id: string;
  label: string;
  children: React.ReactNode;
  openSection: string | null;
  onToggle: (id: string) => void;
}) {
  const isOpen = openSection === id;
  const capId = id.charAt(0).toUpperCase() + id.slice(1);
  return (
    <div data-el-name={`AccordionSection${capId}`} className="border border-border rounded-xl overflow-hidden bg-canvas/40">
      <button data-el-name={`AccordionToggle${capId}`}
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between px-4 py-2.5 text-[13px] font-semibold text-txt-primary bg-surface hover:bg-surface-el active:bg-border transition-colors"
      >
        {label}
        <span data-el-name={`AccordionChevron${capId}`} className={`text-txt-tertiary text-xs transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {isOpen && <div data-el-name={`AccordionContent${capId}`} className="p-4 space-y-3 bg-canvas/60 text-xs border-t border-border">{children}</div>}
    </div>
  );
}

function ChoiceRow<T extends string>({ label, value, options, onChange, cols = 3 }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; cols?: number;
}) {
  const rowName = `ChoiceRow${label.replace(/\s+/g, '')}`;
  return (
    <div data-el-name={rowName}>
      <label data-el-name={`${rowName}Label`} className="text-xs text-txt-secondary mb-1.5 block">{label}</label>
      <div data-el-name={`${rowName}Grid`} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <div key={opt.value} data-el-name={`${rowName}Option`} role="button" tabIndex={0} onClick={() => onChange(opt.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt.value); } }}
              aria-pressed={selected}
              className={`text-center py-2 rounded-lg text-xs border cursor-pointer transition-colors ${selected ? 'bg-txt-primary text-canvas border-txt-primary' : 'bg-surface border-border text-txt-primary active:bg-border'}`}
            >
              {opt.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  const rowName = `ToggleRow${label.replace(/\s+/g, '')}`;
  return (
    <div data-el-name={rowName} role="button" tabIndex={0} onClick={() => onChange(!value)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!value); } }}
      aria-pressed={value}
      className={`flex flex-col p-2.5 rounded-lg text-xs border cursor-pointer transition-colors ${value ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'}`}
    >
      <div className="flex items-center justify-between">
        <span data-el-name={`${rowName}Label`} className="text-txt-primary">{label}</span>
        <span data-el-name={`${rowName}Track`} className={`w-9 h-5 rounded-full relative transition-colors ${value ? 'bg-txt-primary' : 'bg-border'}`}>
          <span data-el-name={`${rowName}Thumb`} className={`absolute top-0.5 w-4 h-4 rounded-full bg-canvas transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
        </span>
      </div>
      {description && (
        <p data-el-name={`${rowName}Description`} className="text-[10px] text-txt-tertiary mt-1 leading-tight">{description}</p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function GeneratePage() {
  const location = useLocation();
  const initial = loadInitialSettings();
  const [prompt, setPrompt] = useState(initial.settings.prompt ?? '');
  const [negativePrompt, setNegative] = useState(initial.settings.negativePrompt);
  const [model, setModel] = useState(initial.settings.model);
  const [sampler, setSampler] = useState(initial.settings.sampler);
  const [steps, setSteps] = useState(initial.settings.steps);
  const [cfg, setCfg] = useState(initial.settings.cfg);
  const [seed, setSeed] = useState(initial.settings.seed);
  const [sizeLevel, setSizeLevel] = useState<SizeLevel>(initial.settings.sizeLevel);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initial.settings.aspectRatio);
  const [customDimensions, setCustomDimensions] = useState(
    initial.settings.customDimensions
  );
  const [widthCustom, setWidthCustom] = useState(initial.settings.widthCustom);
  const [heightCustom, setHeightCustom] = useState(initial.settings.heightCustom);
  const [shift, setShift] = useState(initial.settings.shift);
  const [clipSkip, setClipSkip] = useState(initial.settings.clipSkip);
  const [resolutionDependentShift, setResolutionDependentShift] = useState(
    initial.settings.resolutionDependentShift
  );
  const [randomizeSeed, setRandomizeSeed] = useState(initial.settings.randomizeSeed);
  const [saveToGallery, setSaveToGallery] = useState(initial.settings.saveToGallery);
  const [seedMode, setSeedMode] = useState<SeedModeId>(initial.settings.seedMode);
  const [upscaler, setUpscaler] = useState(initial.settings.upscaler);
  const [upscalerScaleFactor, setUpscalerScaleFactor] = useState<UpscalerScaleFactor>(initial.settings.upscalerScaleFactor);
  const [loras, setLoras] = useState(initial.settings.loras);
  const [strength, setStrength] = useState(initial.settings.strength);
  const [stochasticSamplingGamma, setStochasticSamplingGamma] = useState(
    initial.settings.stochasticSamplingGamma
  );
  const [numFrames, setNumFrames] = useState(initial.settings.numFrames);
  const [cfgZeroStar, setCfgZeroStar] = useState(initial.settings.cfgZeroStar);
  const [tiledDecoding, setTiledDecoding] = useState(initial.settings.tiledDecoding);
  const [tiledDiffusion, setTiledDiffusion] = useState(initial.settings.tiledDiffusion);
  const [decodingTileWidth, setDecodingTileWidth] = useState(initial.settings.decodingTileWidth);
  const [decodingTileHeight, setDecodingTileHeight] = useState(initial.settings.decodingTileHeight);
  const [decodingTileOverlap, setDecodingTileOverlap] = useState(initial.settings.decodingTileOverlap);
  const [diffusionTileWidth, setDiffusionTileWidth] = useState(initial.settings.diffusionTileWidth);
  const [diffusionTileHeight, setDiffusionTileHeight] = useState(initial.settings.diffusionTileHeight);
  const [diffusionTileOverlap, setDiffusionTileOverlap] = useState(initial.settings.diffusionTileOverlap);
  const [modelList, setModelList] = useState<string[]>([]);
  const [cloudModels, setCloudModels] = useState<CloudModel[]>([]);
  const [loraList, setLoraList] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ step: number; total: number; phase?: string } | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [loraNames, setLoraNames] = useState<Record<string, string>>({});
  const [refinerModel, setRefinerModel] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { return window.localStorage.getItem('opendraw_refinerModel') ?? ''; }
    catch { return ''; }
  });
  const [refinerStart, setRefinerStart] = useState(() => {
    if (typeof window === 'undefined') return 0.85;
    try { return +(window.localStorage.getItem('opendraw_refinerStart') ?? '0.85'); }
    catch { return 0.85; }
  });
  const [zeroNegativePrompt, setZeroNegativePrompt] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('opendraw_zeroNegativePrompt') === 'true'; }
    catch { return false; }
  });
  const [hiresFix, setHiresFix] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('opendraw_hiresFix') === 'true'; }
    catch { return false; }
  });
  const [hiresFixWidth, setHiresFixWidth] = useState(() => {
    if (typeof window === 'undefined') return 512;
    try { return +(window.localStorage.getItem('opendraw_hiresFixWidth') ?? '512'); }
    catch { return 512; }
  });
  const [hiresFixHeight, setHiresFixHeight] = useState(() => {
    if (typeof window === 'undefined') return 512;
    try { return +(window.localStorage.getItem('opendraw_hiresFixHeight') ?? '512'); }
    catch { return 512; }
  });
  const [hiresFixStrength, setHiresFixStrength] = useState(() => {
    if (typeof window === 'undefined') return 0.7;
    try { return +(window.localStorage.getItem('opendraw_hiresFixStrength') ?? '0.7'); }
    catch { return 0.7; }
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetSection, setSheetSection] = useState('model');
  const [connected, setConnected] = useState(true);
  const [openSection, setOpenSection] = useState<string | null>('model');
  const [loraSearchDesktop, setLoraSearchDesktop] = useState('');
  const [modelSearchDesktop, setModelSearchDesktop] = useState('');
  const [loraMetadataCache, setLoraMetadataCache] = useState<Map<string, LoraMetadata>>(new Map());
  const [canvasgen2] = useFeatureFlag('canvasgen2', false);
  const [configPanelVisible, setConfigPanelVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = window.localStorage.getItem('generate.configPanelVisible');
      return saved !== null ? saved === 'true' : true;
    } catch { return true; }
  });

  const [galleryStats, setGalleryStats] = useState<GalleryStats | null>(null);
  const [storageLimitError, setStorageLimitError] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Chyby akcí: na mobilu banner, na desktopu (lg) původní alert
  const showActionError = (message: string) => {
    setGenerateError(message);
    try {
      if (window.matchMedia('(min-width: 1024px)').matches) {
        window.alert(message);
      }
    } catch {}
  };

  useEffect(() => {
    getGalleryStats().then(setGalleryStats).catch(() => {});
  }, []);

  const [derivedWidth, derivedHeight] = useMemo(
    () => calcDimensions(sizeLevel, aspectRatio),
    [sizeLevel, aspectRatio]
  );

  const width = customDimensions ? widthCustom : derivedWidth;
  const height = customDimensions ? heightCustom : derivedHeight;

  const computedShift = useMemo(() => {
    const exponent = ((width * height) / 256 - 256) * 0.00016927 + 0.5;
    return Math.round(Math.exp(exponent) * 100) / 100;
  }, [width, height]);

  const effectiveShift = resolutionDependentShift ? computedShift : shift;

  const initialized = useRef(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const stopIntentRef = useRef(false);



  useEffect(() => {
    if (location.pathname !== '/') return;
    if (typeof window === 'undefined') return;
    let parsed:
      | (Partial<PersistedSettings> & { prompt?: string; width?: number; height?: number })
      | null = null;
    let fromPrefill = false;
    try {
      const prefillRaw = window.localStorage.getItem(STORAGE_PREFILL);
      if (prefillRaw) {
        parsed = JSON.parse(prefillRaw);
        window.localStorage.removeItem(STORAGE_PREFILL);
        fromPrefill = true;
      }
    } catch {}
    if (!parsed) return;
    const merged = applySettings(parsed, {
      setPrompt,
      setNegative,
      setModel,
      setSampler,
      setSteps,
      setCfg,
      setSeed,
      setSizeLevel,
      setAspectRatio,
      setCustomDimensions,
      setWidthCustom,
      setHeightCustom,
      setShift,
      setClipSkip,
      setResolutionDependentShift,
      setRandomizeSeed,
      setSaveToGallery,
      setSeedMode,
      setUpscaler,
      setUpscalerScaleFactor,
      setLoras,
      setStrength,
      setStochasticSamplingGamma,
      setNumFrames,
      setCfgZeroStar,
      setTiledDecoding,
      setTiledDiffusion,
      setDecodingTileWidth,
      setDecodingTileHeight,
      setDecodingTileOverlap,
      setDiffusionTileWidth,
      setDiffusionTileHeight,
      setDiffusionTileOverlap,
    });
    if (fromPrefill) {
      saveSettings(merged);
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      saveSettings({
        prompt,
        negativePrompt,
        model,
        sampler,
        steps,
        cfg,
        seed,
        sizeLevel,
        aspectRatio,
        customDimensions,
        widthCustom,
        heightCustom,
        shift,
        clipSkip,
        resolutionDependentShift,
        randomizeSeed,
        saveToGallery,
        seedMode,
        upscaler,
        upscalerScaleFactor,
        loras,
        strength,
        stochasticSamplingGamma,
        numFrames,
        cfgZeroStar,
        tiledDecoding,
        tiledDiffusion,
        decodingTileWidth,
        decodingTileHeight,
        decodingTileOverlap,
        diffusionTileWidth,
        diffusionTileHeight,
        diffusionTileOverlap,
      });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [
    negativePrompt,
    model,
    sampler,
    steps,
    cfg,
    seed,
    sizeLevel,
    aspectRatio,
    customDimensions,
    widthCustom,
    heightCustom,
    shift,
    clipSkip,
    resolutionDependentShift,
    randomizeSeed,
    saveToGallery,
    seedMode,
    upscaler,
    upscalerScaleFactor,
    loras,
    strength,
    stochasticSamplingGamma,
    numFrames,
    cfgZeroStar,
    tiledDecoding, tiledDiffusion,
    decodingTileWidth, decodingTileHeight, decodingTileOverlap,
    diffusionTileWidth, diffusionTileHeight, diffusionTileOverlap,
  ]);

  useEffect(() => {
    try {
      window.localStorage.setItem('generate.configPanelVisible', String(configPanelVisible));
    } catch {}
  }, [configPanelVisible]);

  useEffect(() => {
    try {
      window.localStorage.setItem('opendraw_refinerModel', refinerModel);
    } catch {}
  }, [refinerModel]);

  useEffect(() => {
    try {
      window.localStorage.setItem('opendraw_refinerStart', String(refinerStart));
    } catch {}
  }, [refinerStart]);

  useEffect(() => {
    try {
      window.localStorage.setItem('opendraw_zeroNegativePrompt', String(zeroNegativePrompt));
    } catch {}
  }, [zeroNegativePrompt]);

  useEffect(() => {
    try {
      window.localStorage.setItem('opendraw_hiresFix', String(hiresFix));
    } catch {}
  }, [hiresFix]);

  useEffect(() => {
    try {
      window.localStorage.setItem('opendraw_hiresFixWidth', String(hiresFixWidth));
    } catch {}
  }, [hiresFixWidth]);

  useEffect(() => {
    try {
      window.localStorage.setItem('opendraw_hiresFixHeight', String(hiresFixHeight));
    } catch {}
  }, [hiresFixHeight]);

  useEffect(() => {
    try {
      window.localStorage.setItem('opendraw_hiresFixStrength', String(hiresFixStrength));
    } catch {}
  }, [hiresFixStrength]);

  useEffect(() => {
    fetchEcho()
      .then((data) => {
        setConnected(true);
        if (data.files && data.files.length > 0) {
          const allModels = data.files.filter(
            (f: string) =>
              f.endsWith('.ckpt') &&
              !f.toLowerCase().includes('lora') &&
              !f.toLowerCase().includes('clip')
          );
          setModelList(allModels);
          if (allModels.length > 0) {
            setModel((current) =>
              current && current.length > 0 ? current : allModels[0]
            );
          }
          const loraFiles = data.files.filter((f: string) =>
            f.toLowerCase().includes('lora')
          );
          setLoraList(loraFiles);
          if (data.loraNames) setLoraNames(data.loraNames);
        }
      })
      .catch(() => setConnected(false));
    fetchCloudModels()
      .then((data) => setCloudModels(data.models || []))
      .catch(() => setCloudModels([]));
  }, []);

  useEffect(() => {
    const active = loras
    .map((l) => l.file)
    .filter((f) => f.endsWith('.safetensors') || f.endsWith('.ckpt'));
    const missing = active.filter((f) => !loraMetadataCache.has(f));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((file) =>
        getLoraMetadata(file)
          .then((meta) => ({ file, meta }))
          .catch(() => ({ file, meta: { triggerWords: [] } as LoraMetadata }))
      )
    ).then((results) => {
      if (cancelled) return;
      setLoraMetadataCache((prev) => {
        const next = new Map(prev);
        for (const { file, meta } of results) {
          next.set(file, meta);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [loras, loraMetadataCache]);

  const handlePasteConfig = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const raw = JSON.parse(text) as Record<string, unknown>;

      const mapped: Partial<PersistedSettings> & { width?: number; height?: number } = {};

      if (raw.prompt !== undefined) mapped.prompt = raw.prompt as string;
      if (raw.negativePrompt !== undefined) mapped.negativePrompt = raw.negativePrompt as string;
      if (raw.model !== undefined) mapped.model = raw.model as string;
if (raw.sampler !== undefined) {
  mapped.sampler = typeof raw.sampler === 'number'
    ? (SAMPLER_ENUM_TO_ID[raw.sampler] ?? DEFAULT_SAMPLER_ID)
    : raw.sampler as string;
}
      if (raw.steps !== undefined) mapped.steps = raw.steps as number;
      if (raw.guidanceScale !== undefined) mapped.cfg = raw.guidanceScale as number;
      else if (raw.cfg !== undefined) mapped.cfg = raw.cfg as number;
      if (raw.seed !== undefined) mapped.seed = raw.seed as number;
      if (raw.shift !== undefined) mapped.shift = raw.shift as number;
      if (raw.clipSkip !== undefined) mapped.clipSkip = raw.clipSkip as number;
      if (raw.seedMode !== undefined) mapped.seedMode = typeof raw.seedMode === 'number' ? intToSeedMode(raw.seedMode) : raw.seedMode as SeedModeId;
      if (raw.strength !== undefined) mapped.strength = raw.strength as number;
      if (raw.loras !== undefined) mapped.loras = raw.loras as { file: string; weight: number }[];
      if (raw.upscaler !== undefined) mapped.upscaler = (raw.upscaler as string) || '';
      if (raw.upscalerScaleFactor !== undefined) mapped.upscalerScaleFactor = raw.upscalerScaleFactor as UpscalerScaleFactor;
      if (raw.resolutionDependentShift !== undefined) mapped.resolutionDependentShift = raw.resolutionDependentShift as boolean;
      if (raw.cfgZeroStar !== undefined) mapped.cfgZeroStar = raw.cfgZeroStar as boolean;
      if (raw.zeroNegativePrompt !== undefined) setZeroNegativePrompt(raw.zeroNegativePrompt as boolean);
      if (raw.stochasticSamplingGamma !== undefined) mapped.stochasticSamplingGamma = raw.stochasticSamplingGamma as number;
      if (raw.numFrames !== undefined) mapped.numFrames = raw.numFrames as number;
      if (raw.tiledDecoding !== undefined) mapped.tiledDecoding = raw.tiledDecoding as boolean;
      if (raw.tiledDiffusion !== undefined) mapped.tiledDiffusion = raw.tiledDiffusion as boolean;
      if (raw.decodingTileWidth !== undefined) mapped.decodingTileWidth = raw.decodingTileWidth as number;
      if (raw.decodingTileHeight !== undefined) mapped.decodingTileHeight = raw.decodingTileHeight as number;
      if (raw.decodingTileOverlap !== undefined) mapped.decodingTileOverlap = raw.decodingTileOverlap as number;
      if (raw.diffusionTileWidth !== undefined) mapped.diffusionTileWidth = raw.diffusionTileWidth as number;
      if (raw.diffusionTileHeight !== undefined) mapped.diffusionTileHeight = raw.diffusionTileHeight as number;
      if (raw.diffusionTileOverlap !== undefined) mapped.diffusionTileOverlap = raw.diffusionTileOverlap as number;
      if (raw.refinerModel !== undefined) setRefinerModel(raw.refinerModel as string);
      if (raw.refinerStart !== undefined) setRefinerStart(raw.refinerStart as number);
      if (raw.hiresFix !== undefined) setHiresFix(raw.hiresFix as boolean);
      if (raw.hiresFixWidth !== undefined) setHiresFixWidth(raw.hiresFixWidth as number);
      if (raw.hiresFixHeight !== undefined) setHiresFixHeight(raw.hiresFixHeight as number);
      if (raw.hiresFixStrength !== undefined) setHiresFixStrength(raw.hiresFixStrength as number);

      const dims = raw.width && raw.height
        ? { width: raw.width as number, height: raw.height as number }
        : undefined;

      const merged = mergeSettings(mapped, dims);

      setPrompt(mapped.prompt ?? prompt);
      setNegative(merged.negativePrompt);
      setModel(merged.model);
      setSampler(merged.sampler);
      setSteps(merged.steps);
      setCfg(merged.cfg);
      setSeed(merged.seed);
      setSizeLevel(merged.sizeLevel);
      setAspectRatio(merged.aspectRatio);
      setCustomDimensions(dims ? true : merged.customDimensions);
      setWidthCustom(merged.widthCustom);
      setHeightCustom(merged.heightCustom);
      setShift(merged.shift);
      setClipSkip(merged.clipSkip);
      setResolutionDependentShift(merged.resolutionDependentShift);
      setRandomizeSeed(merged.randomizeSeed);
      setSaveToGallery(merged.saveToGallery);
      setSeedMode(merged.seedMode);
      setLoras(merged.loras);
      setStrength(merged.strength);
      setStochasticSamplingGamma(merged.stochasticSamplingGamma);
      setNumFrames(merged.numFrames);
      setCfgZeroStar(merged.cfgZeroStar);
      setTiledDecoding(merged.tiledDecoding);
      setTiledDiffusion(merged.tiledDiffusion);
      setDecodingTileWidth(merged.decodingTileWidth);
      setDecodingTileHeight(merged.decodingTileHeight);
      setDecodingTileOverlap(merged.decodingTileOverlap);
      setDiffusionTileWidth(merged.diffusionTileWidth);
      setDiffusionTileHeight(merged.diffusionTileHeight);
      setDiffusionTileOverlap(merged.diffusionTileOverlap);
    } catch {
      showActionError('Nepodařilo se načíst config ze schránky');
    }
  };

  const handleGetConfig = () => {
    const effectiveSeed = randomizeSeed ? Math.floor(Math.random() * 2147483647) : seed;
    const config: Record<string, unknown> = {
      strength,
      upscaler,
      seedMode: seedModeToInt(seedMode),
      maskBlurOutset: 0,
      cfgZeroInitSteps: 0,
      batchSize: 1,
      maskBlur: 2.5,
      preserveOriginalAfterInpaint: true,
      cfgZeroStar,
      controls: [],
      resolutionDependentShift,
      guidanceScale: cfg,
      width,
      refinerModel,
      faceRestoration: '',
      loras: loras.map((l: { file: string; weight: number }) => ({ mode: 'all', file: l.file, weight: l.weight })),
      tiledDecoding,
      height,
      model,
      steps,
      tiledDiffusion,
      sharpness: 0,
      sampler: SAMPLER_ID_TO_ENUM[sampler] ?? 0,
      batchCount: 1,
      causalInferencePad: 0,
      seed: effectiveSeed,
      shift,
      upscalerScaleFactor,
      zeroNegativePrompt,
      refinerStart,
      hiresFixWidth,
      hiresFixHeight,
      hiresFixStrength,
      decodingTileWidth,
      decodingTileHeight,
      decodingTileOverlap,
      diffusionTileWidth,
      diffusionTileHeight,
      diffusionTileOverlap,
    };

    navigator.clipboard.writeText(JSON.stringify(config, null, 2)).catch(() => {});
  };


  const handleGenerate = () => {
    if (!prompt.trim() || generating) return;
    setGenerateError(null);

    const maxGb = parseFloat(localStorage.getItem('opendraw.maxStorageGb') || '') || 50;
    if (galleryStats && galleryStats.totalSize > maxGb * 1024 ** 3) {
      const pct = ((galleryStats.totalSize / (maxGb * 1024 ** 3)) * 100).toFixed(1);
      setStorageLimitError(
        `Úložiště je plné (${formatBytes(galleryStats.totalSize)} z ${maxGb} GB, ${pct} %).`
        + ` Před generováním prosím vymaž data v Nastavení nebo zvyš limit.`
      );
      return;
    }

    const effectiveSeed = randomizeSeed
      ? Math.floor(Math.random() * 2147483647)
      : seed;
    if (randomizeSeed) {
      setSeed(effectiveSeed);
    }
    saveSettings({
      prompt,
      negativePrompt,
      model,
      sampler,
      steps,
      cfg,
      seed: effectiveSeed,
      sizeLevel,
      aspectRatio,
      customDimensions,
      widthCustom,
      heightCustom,
      shift,
      clipSkip,
      resolutionDependentShift,
      randomizeSeed,
      saveToGallery,
      seedMode,
      upscaler,
      upscalerScaleFactor,
      loras,
      strength,
      stochasticSamplingGamma,
      numFrames,
      cfgZeroStar,
      tiledDecoding,
      tiledDiffusion,
      decodingTileWidth,
      decodingTileHeight,
      decodingTileOverlap,
      diffusionTileWidth,
      diffusionTileHeight,
      diffusionTileOverlap,
    });
    setProgress(null);
    setResultImage(null);
    setPreviewImage(null);
    setGenerating(true);
    stopIntentRef.current = false;

    cancelRef.current = generateImage(
      {
        prompt,
        negativePrompt,
        model,
        sampler,
        steps,
        cfg,
        seed: effectiveSeed,
        batchCount: 1,
        width,
        height,
        loras,
        shift,
        clipSkip,
        resolutionDependentShift,
        saveToGallery,
        seedMode: seedModeToInt(seedMode),
        upscaler: upscaler || undefined,
        upscalerScaleFactor: upscaler ? upscalerScaleFactor : undefined,
        strength,
        stochasticSamplingGamma,
        numFrames,
        cfgZeroStar,
        zeroNegativePrompt: zeroNegativePrompt || undefined,
        refinerModel: refinerModel || undefined,
        refinerStart: refinerModel ? refinerStart : undefined,
        hiresFix: hiresFix || undefined,
        hiresFixWidth: hiresFix ? hiresFixWidth : undefined,
        hiresFixHeight: hiresFix ? hiresFixHeight : undefined,
        hiresFixStrength: hiresFix ? hiresFixStrength : undefined,
        tiledDecoding,
        tiledDiffusion,
        decodingTileWidth: tiledDecoding ? decodingTileWidth : undefined,
        decodingTileHeight: tiledDecoding ? decodingTileHeight : undefined,
        decodingTileOverlap: tiledDecoding ? decodingTileOverlap : undefined,
        diffusionTileWidth: tiledDiffusion ? diffusionTileWidth : undefined,
        diffusionTileHeight: tiledDiffusion ? diffusionTileHeight : undefined,
        diffusionTileOverlap: tiledDiffusion ? diffusionTileOverlap : undefined,
      },
      {
        onProgress: (step, total, phase) => setProgress({ step, total, phase }),
        onPreview: (imageBase64) => setPreviewImage(imageBase64),
        onComplete: (data) => {
          setResultImage(data.imageBase64);
          setGenerating(false);
          setProgress(null);
          cancelRef.current = null;
          getGalleryStats().then(setGalleryStats).catch(() => {});
        },
        onError: (err) => {
          showActionError(String(err));
          setGenerating(false);
          setProgress(null);
          cancelRef.current = null;
        },
        onAbort: () => {
          cancelRef.current = null;
          setGenerating(false);
          setProgress(null);
          if (stopIntentRef.current) {
            stopIntentRef.current = false;
            return;
          }
          setGenerateError('Spojení při generování spadlo. Zkus to prosím znovu.');
        },
      }
    );
  };
  const handleStop = () => {
    if (cancelRef.current) {
      stopIntentRef.current = true;
      cancelRef.current();
      cancelRef.current = null;
    }
    setGenerating(false);
    setProgress(null);
  };



  const openSheet = (section: string) => {
    // ChipBar posílá přesné desktop sekce – pro mobilní sheet je přeložíme
    let mapped = section;
    if (section === 'lora') mapped = 'loras';
    else if (section === 'rozměry' || section === 'sampler' || section === 'pokročile') mapped = 'params';
    setSheetSection(mapped);
    setSheetOpen(true);
  };

  const sizeLabel = customDimensions
    ? `${width}×${height} (custom)`
    : `${width}×${height} (${aspectRatio})`;

  const openDesktopSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  const missingTriggers: string[] = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const promptLower = prompt.toLowerCase();
    for (const l of loras) {
      const meta = loraMetadataCache.get(l.file);
      if (!meta) continue;
      for (const word of meta.triggerWords) {
        const key = word.toLowerCase();
        if (seen.has(key)) continue;
        if (promptLower.includes(key)) continue;
        seen.add(key);
        out.push(word);
      }
    }
    return out;
  })();

  const orphanTriggers: string[] = (() => {
    const activeWords = new Set<string>();
    for (const l of loras) {
      const meta = loraMetadataCache.get(l.file);
      if (!meta) continue;
      for (const word of meta.triggerWords) {
        activeWords.add(word.toLowerCase());
      }
    }
    const seen = new Set<string>();
    const out: string[] = [];
    const promptLower = prompt.toLowerCase();
    for (const [, meta] of loraMetadataCache) {
      for (const word of meta.triggerWords) {
        const key = word.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (!activeWords.has(key) && promptLower.includes(key)) {
          out.push(word);
        }
      }
    }
    return out;
  })();

  const handleResetConfig = () => {
    setGenerateError(null);
    setSampler(DEFAULT_SAMPLER_ID);
    setSteps(28);
    setCfg(3.5);
    setSeed(-1);
    setSizeLevel('normal');
    setAspectRatio('1:1');
    setCustomDimensions(false);
    setWidthCustom(1024);
    setHeightCustom(1024);
    setShift(1.0);
    setClipSkip(1);
    setResolutionDependentShift(true);
    setRandomizeSeed(false);
    setSaveToGallery(true);
    setSeedMode(DEFAULT_SEED_MODE_ID);
    setUpscaler('');
    setUpscalerScaleFactor(DEFAULT_UPSCALER_SCALE_FACTOR);
    setLoras([]);
    setStrength(1.0);
    setStochasticSamplingGamma(0.3);
    setNumFrames(0);
    setCfgZeroStar(false);
    setRefinerModel('');
    setRefinerStart(0.85);
    setZeroNegativePrompt(false);
    setHiresFix(false);
    setHiresFixWidth(512);
    setHiresFixHeight(512);
    setHiresFixStrength(0.7);
  };

  const handleAddTrigger = (word: string) => {
    setPrompt((prev) => (prev.trim() ? `${word}, ${prev}` : word));
  };  const handleRemoveTrigger = (word: string) => {
    setPrompt((prev) => {
      const lowerWord = word.toLowerCase();
      return prev
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.toLowerCase() !== lowerWord && s !== '')
        .join(', ');
    });
  };

  const triggerChips = missingTriggers.length > 0 || orphanTriggers.length > 0 ? (
    <div data-el-name="TriggerChipList" className="flex gap-1.5 overflow-x-auto scrollbar-none snap-x px-3 py-1">
      {missingTriggers.map((word) => (
        <button
          data-el-name="TriggerChipButton"
          key={word}
          type="button"
          onClick={() => handleAddTrigger(word)}
          className="flex-shrink-0 snap-start min-h-[40px] px-3 text-[13px] rounded-full bg-surface border border-border text-txt-secondary hover:bg-surface-el hover:text-txt-primary active:bg-border transition-colors"
          title={`Přidat "${word}" na začátek promptu`}
        >
          + {word}
        </button>
      ))}
      {orphanTriggers.map((word) => (
        <button
          data-el-name="OrphanTriggerChipButton"
          key={word}
          type="button"
          onClick={() => handleRemoveTrigger(word)}
          className="flex-shrink-0 snap-start min-h-[40px] px-3 text-[13px] rounded-full bg-red-500/10 border border-red-500/30 text-red-500 hover:bg-red-500/20 active:bg-red-500/30 transition-colors"
          title={`Odebrat "${word}" z promptu`}
        >
          − {word}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div data-el-name="GeneratePageRoot" className="h-full w-full">
      {/* Mobilní layout: 100dvh sloupec – hlavička → scroll obsah → sticky akce */}
      <div data-el-name="MobileLayout" className="flex flex-col min-h-[100dvh] lg:hidden w-full">
        <header data-el-name="MobileGenerateHeader" className="sticky top-0 z-20 glass-panel border-x-0 border-t-0 px-3 min-h-[56px] flex items-center justify-between gap-2">
          <div data-el-name="MobileConnectionStatus" className="flex items-center gap-2 min-h-[44px]">
            <span
              data-el-name="MobileConnectionDot"
              className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'}`}
            />
            <span data-el-name="MobileConnectionText" className="text-[13px] text-txt-secondary">
              {connected ? 'Draw Things připojen' : 'Draw Things není připojen'}
            </span>
          </div>
          <div data-el-name="MobileHeaderActions" className="flex items-center">
            <button data-el-name="MobileResetConfigButton"
              onClick={handleResetConfig}
              aria-label="Resetovat konfiguraci"
              title="Resetovat konfiguraci na výchozí"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-tertiary active:bg-border transition-colors"
            >
              <ArrowRotate size={18} />
            </button>
            <button data-el-name="MobilePasteConfigButton"
              onClick={handlePasteConfig}
              aria-label="Vložit config ze schránky"
              title="Vložit config ze schránky (DT)"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-tertiary active:bg-border transition-colors"
            >
              <ClipboardImport size={18} />
            </button>
            <button data-el-name="MobileGetConfigButton"
              onClick={handleGetConfig}
              aria-label="Kopírovat config do schránky"
              title="Kopírovat config do schránky (DT)"
              className="w-11 h-11 rounded-xl flex items-center justify-center text-txt-tertiary active:bg-border transition-colors"
            >
              <ClipboardExport size={18} />
            </button>
          </div>
        </header>

        <PromptCard
          prompt={prompt}
          negativePrompt={negativePrompt}
          onPromptChange={setPrompt}
          onNegativeChange={setNegative}
          collapsibleNegative
          triggerChips={triggerChips}
        />

        <ParamChipBar
          model={model}
          sampler={sampler}
          steps={steps}
          cfg={cfg}
          seed={seed}
          randomizeSeed={randomizeSeed}
          size={sizeLabel}
          sizeLevel={sizeLevel}
          aspectRatio={aspectRatio}
          shift={shift}
          clipSkip={clipSkip}
          loras={loras}
          onOpenSheet={openSheet}
        />

        {storageLimitError && (
          <div data-el-name="StorageLimitBanner" className="mx-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-[13px] text-red-500 flex items-start gap-2">
            <span className="flex-1">{storageLimitError}</span>
            <button onClick={() => setStorageLimitError(null)} className="min-w-[44px] min-h-[44px] -m-2 underline whitespace-nowrap hover:text-red-400 transition-colors">Zavřít</button>
          </div>
        )}

        {generateError && (
          <div data-el-name="GenerateErrorBanner" className="mx-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-[13px] text-red-500 flex items-start gap-2">
            <span className="flex-1">{generateError}</span>
            <button onClick={() => { setGenerateError(null); handleGenerate(); }} className="min-w-[44px] min-h-[44px] -m-2 px-2 font-semibold whitespace-nowrap hover:text-red-400 transition-colors">Zkusit znovu</button>
            <button onClick={() => setGenerateError(null)} className="min-w-[44px] min-h-[44px] -m-2 underline whitespace-nowrap hover:text-red-400 transition-colors">Zavřít</button>
          </div>
        )}

        <CanvasArea image={resultImage} preview={previewImage} loading={generating} progress={progress} />

        <div data-el-name="MobileGenerateButton" className="sticky bottom-3 z-20 px-3 pt-2">
          {generating ? (
            <button data-el-name="MobileStopButtonInner"
              onClick={handleStop}
              className="w-full min-h-[56px] rounded-full font-semibold text-[17px] flex items-center justify-center gap-2 bg-red-500/15 text-red-500 border border-red-500/40 active:bg-red-500/25 transition-colors"
            >
              <Stop className="w-4 h-4" />
              Stop
            </button>
          ) : (
            <button data-el-name="MobileGenerateButtonInner"
              onClick={handleGenerate}
              disabled={!prompt.trim() || !connected}
              className="w-full min-h-[56px] rounded-full font-semibold text-[17px] bg-surface-el text-txt-primary border border-border disabled:opacity-60 active:bg-border transition-colors"
            >
              {!connected
                ? 'Draw Things není připojen'
                : !prompt.trim()
                  ? 'Napiš prompt pro generování'
                  : 'Generovat'}
            </button>
          )}
        </div>
      </div>

      {/* Desktop layout — centered canvas + right sidebar + FAB */}
      <div data-el-name="DesktopLayout" className={`hidden lg:flex lg:flex-col h-full w-full ${canvasgen2 ? 'flex-1' : 'items-center justify-center p-8'}`}>
        <div data-el-name="DesktopCanvasContainer" className={`w-full max-h-full flex flex-col flex-1 ${canvasgen2 ? '' : 'max-w-5xl'}`}>
          {storageLimitError && (
            <div data-el-name="StorageLimitBanner" className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500 flex items-start gap-2">
              <span className="flex-1">{storageLimitError}</span>
              <button onClick={() => setStorageLimitError(null)} className="underline whitespace-nowrap hover:text-red-400 transition-colors">Zavřít</button>
            </div>
          )}
          {generateError && (
            <div data-el-name="GenerateErrorBanner" className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500 flex items-start gap-2">
              <span className="flex-1">{generateError}</span>
              <button onClick={() => { setGenerateError(null); handleGenerate(); }} className="font-semibold whitespace-nowrap hover:text-red-400 transition-colors">Zkusit znovu</button>
              <button onClick={() => setGenerateError(null)} className="underline whitespace-nowrap hover:text-red-400 transition-colors">Zavřít</button>
            </div>
          )}
          <CanvasArea image={resultImage} preview={previewImage} loading={generating} progress={progress} />
        </div>

        <div
          data-el-name="GenConfigPanel"
          className={`fixed top-4 right-4 z-30 h-[calc(100vh-32px)] w-[380px] overflow-y-auto scrollbar-none
            bg-canvas/30 backdrop-blur-2xl rounded-2xl shadow-2xl
            transition-all duration-300 ease-in-out
            ${configPanelVisible ? 'translate-x-0' : 'translate-x-full'}`}
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div data-el-name="ConfigPanelHeader" className="sticky top-0 z-10 px-4 py-3 bg-canvas/80 backdrop-blur-sm border-b border-border flex items-center justify-between">
            <span data-el-name="ConfigPanelTitle" className="text-xs font-medium text-txt-primary">Konfigurace</span>
            <div className="flex items-center gap-1">
              <button data-el-name="ResetConfigButton"
                onClick={handleResetConfig}
                className="text-txt-tertiary hover:text-txt-primary transition-colors p-1"
                title="Resetovat konfiguraci na výchozí"
                aria-label="Resetovat konfiguraci"
              >
                <ArrowRotate className="w-3.5 h-3.5" />
              </button>
              <button data-el-name="PasteConfigButton"
                onClick={handlePasteConfig}
                className="text-txt-tertiary hover:text-txt-primary transition-colors p-1"
                title="Vložit config ze schránky (DT)"
                aria-label="Vložit config ze schránky"
              >
                <ClipboardImport className="w-3.5 h-3.5" />
              </button>
              <button data-el-name="GetConfigButton"
                onClick={handleGetConfig}
                className="text-txt-tertiary hover:text-txt-primary transition-colors p-1"
                title="Kopírovat config do schránky (DT)"
                aria-label="Kopírovat config do schránky"
              >
                <ClipboardExport className="w-3.5 h-3.5" />
              </button>

            </div>
          </div>

          <PromptCard
            prompt={prompt}
            negativePrompt={negativePrompt}
            onPromptChange={setPrompt}
            onNegativeChange={setNegative}
            collapsibleNegative
            triggerChips={triggerChips}
          />

          <ParamChipBar
            model={model}
            sampler={sampler}
            steps={steps}
            cfg={cfg}
            seed={seed}
            randomizeSeed={randomizeSeed}
            size={sizeLabel}
            sizeLevel={sizeLevel}
            aspectRatio={aspectRatio}
            shift={shift}
            clipSkip={clipSkip}
            loras={loras}
            onOpenSheet={openDesktopSection}
          />

          <div data-el-name="DesktopAccordionList" className="px-4 pb-3 space-y-2">
            <p data-el-name="DesktopGroupLabelBasic" className="text-[11px] uppercase tracking-wide text-txt-tertiary pt-1">Základ</p>
            <AccordionSection openSection={openSection} onToggle={openDesktopSection} id="model" label="Model">
              {model && (
                <p data-el-name="ModelSelectedLine" className="text-xs text-txt-secondary truncate" title={model}>
                  Vybráno: <span className="text-txt-primary">{model}</span>
                </p>
              )}
              <input data-el-name="ModelSearchInput"
                type="text"
                value={modelSearchDesktop}
                onChange={(e) => setModelSearchDesktop(e.target.value)}
                placeholder="Hledat model..."
                className="w-full bg-surface rounded-lg p-2.5 text-xs border border-border focus:border-txt-secondary outline-none transition-colors"
              />
              <div data-el-name="ModelList" className="space-y-1 max-h-60 overflow-y-auto">
                {(() => {
                  const q = modelSearchDesktop.trim().toLowerCase();
                  const local = modelList.filter((m) => m.toLowerCase().includes(q));
                  const cloud = cloudModels.filter((cm) => `${cm.name} ${cm.file}`.toLowerCase().includes(q));
                  if (local.length === 0 && cloud.length === 0) {
                    return <p data-el-name="ModelListEmpty" className="text-xs text-txt-tertiary">Žádné modely neodpovídají hledání</p>;
                  }
                  return (
                    <>
                      {local.map((m) => (
                        <button
                          data-el-name="ModelItemButton"
                          key={m}
                          onClick={() => setModel(m)}
                          title={m}
                          className={`w-full text-left p-2 rounded-lg text-xs border truncate ${model === m ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'}`}
                        >
                          {m}
                        </button>
                      ))}
                      {cloud.length > 0 && (
                        <div data-el-name="CloudModelsDivider" className="pt-2 mt-2 border-t border-border">
                          <p className="text-[10px] text-txt-tertiary uppercase tracking-wide mb-1">DT+ Cloud modely</p>
                          <div data-el-name="CloudModelList" className="space-y-1">
                            {cloud.map((cm) => (
                              <button
                                data-el-name="CloudModelItemButton"
                                key={cm.file}
                                onClick={() => setModel(cm.file)}
                                title={`${cm.name} (${cm.file})`}
                                className={`w-full text-left p-2 rounded-lg text-xs border truncate ${model === cm.file ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'}`}
                              >
                                {cm.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </AccordionSection>

            <AccordionSection openSection={openSection} onToggle={openDesktopSection} id="sampler" label="Sampler">
              <div data-el-name="SamplerSelectRow">
                <label data-el-name="SamplerSelectLabel" className="text-xs text-txt-secondary mb-1 block">Sampler</label>
                <select data-el-name="SamplerSelect"
                  value={sampler}
                  onChange={(e) => setSampler(e.target.value)}
                  className="w-full bg-surface rounded p-2 text-xs border border-border"
                >
                  {SAMPLERS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div data-el-name="StepsSliderRow">
                <label data-el-name="StepsLabel" className="text-xs text-txt-secondary">Steps: {steps}</label>
                <input data-el-name="RangeSliderSteps" type="range" min={1} max={50} value={steps} onChange={(e) => setSteps(+e.target.value)} className="w-full accent-txt-primary" />
              </div>
              <div data-el-name="CfgSliderRow">
                <label data-el-name="CfgLabel" className="text-xs text-txt-secondary">CFG: {cfg}</label>
                <input data-el-name="RangeSliderCfg" type="range" min={1} max={30} step={0.5} value={cfg} onChange={(e) => setCfg(+e.target.value)} className="w-full accent-txt-primary" />
              </div>
            </AccordionSection>

            <AccordionSection openSection={openSection} onToggle={openDesktopSection} id="rozměry" label="Rozměry">
              <ChoiceRow<SizeLevel> label="Velikost" value={sizeLevel}
                options={SIZE_LEVELS.map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
                onChange={(v) => setSizeLevel(v)}
              />
              <ChoiceRow<AspectRatio> label="Poměr stran" value={aspectRatio}
                options={ASPECT_RATIOS.map((a) => ({ value: a, label: a }))}
                onChange={(v) => setAspectRatio(v)} cols={4}
              />
              <div data-el-name="DimensionInfo" className="bg-surface rounded-lg p-2.5 text-xs text-txt-secondary border border-border">
                Rozměry: <span data-el-name="DimensionValue" className="text-txt-primary tabular-nums">{width}×{height}</span>
              </div>
              <ToggleRow label="Vlastní rozměry" value={customDimensions} onChange={(v) => setCustomDimensions(v)} />
              {customDimensions && (
                <div data-el-name="CustomDimensionGrid" className="grid grid-cols-2 gap-2">
                  <div data-el-name="CustomWidthRow">
                    <label data-el-name="CustomWidthLabel" className="text-xs text-txt-secondary mb-1 block">Width</label>
                    <input data-el-name="CustomWidthInput" type="number" min={64} max={4096} step={8} value={widthCustom}
                      onChange={(e) => setWidthCustom(round8(+e.target.value))}
                      className="w-full bg-surface rounded p-2 text-xs border border-border tabular-nums"
                    />
                  </div>
                  <div data-el-name="CustomHeightRow">
                    <label data-el-name="CustomHeightLabel" className="text-xs text-txt-secondary mb-1 block">Height</label>
                    <input data-el-name="CustomHeightInput" type="number" min={64} max={4096} step={8} value={heightCustom}
                      onChange={(e) => setHeightCustom(round8(+e.target.value))}
                      className="w-full bg-surface rounded p-2 text-xs border border-border tabular-nums"
                    />
                  </div>
                </div>
              )}
            </AccordionSection>

            <p data-el-name="DesktopGroupLabelAdvanced" className="text-[11px] uppercase tracking-wide text-txt-tertiary pt-2">Rozšíření</p>
            <AccordionSection openSection={openSection} onToggle={openDesktopSection} id="pokročile" label="Pokročilé">
              <div data-el-name="SeedRow">
                <div className="flex items-center justify-between mb-1">
                  <label data-el-name="SeedLabel" className="text-xs text-txt-secondary">Seed</label>
                  <div data-el-name="SeedRandomizeRow" className="flex items-center gap-1.5">
                    <input data-el-name="SeedRandomizeCheckbox" id="randomize-seed-desktop" type="checkbox" checked={randomizeSeed}
                      onChange={(e) => setRandomizeSeed(e.target.checked)} className="accent-txt-primary"
                    />
                    <label data-el-name="SeedRandomizeLabel" htmlFor="randomize-seed-desktop" className="text-[10px] text-txt-secondary cursor-pointer">Randomize</label>
                  </div>
                </div>
                <div data-el-name="SeedInputRow" className="flex gap-2">
                  <input data-el-name="SeedNumberInput" type="number" value={seed} disabled={randomizeSeed}
                    onChange={(e) => setSeed(+e.target.value)}
                    className="flex-1 bg-surface rounded p-2 text-xs border border-border disabled:opacity-40"
                  />
                  <button data-el-name="SeedRandomButton" onClick={() => setSeed(-1)} className="bg-surface rounded px-3 text-xs border border-border" title="Náhodný seed">⏳</button>
                </div>
              </div>
              <ChoiceRow<SeedModeId>
                label="Seed Mode"
                value={seedMode}
                options={SEED_MODES.map((m) => ({ value: m.id, label: m.label }))}
                onChange={(v) => setSeedMode(v)}
                cols={2}
              />
              <div data-el-name="ShiftSliderRow">
                <label data-el-name="ShiftLabel" className={`text-xs ${resolutionDependentShift ? 'text-txt-tertiary' : 'text-txt-secondary'}`}>Shift: <span data-el-name="ShiftValue" className="tabular-nums">{effectiveShift.toFixed(2)}</span>{resolutionDependentShift && <span className="ml-1 text-[10px] opacity-60">auto</span>}</label>
                <input data-el-name="RangeSliderShift" type="range" min={0} max={7} step={0.05} value={effectiveShift} onChange={(e) => { setShift(+e.target.value); if (resolutionDependentShift) setResolutionDependentShift(false); }} disabled={resolutionDependentShift} className={`w-full ${resolutionDependentShift ? 'accent-txt-tertiary opacity-50' : 'accent-txt-primary'}`} />
              </div>
              <div data-el-name="ClipSkipSliderRow">
                <label data-el-name="ClipSkipLabel" className="text-xs text-txt-secondary">Clip skip: <span data-el-name="ClipSkipValue" className="tabular-nums">{clipSkip}</span></label>
                <input data-el-name="RangeSliderClipSkip" type="range" min={1} max={12} step={1} value={clipSkip} onChange={(e) => setClipSkip(+e.target.value)} className="w-full accent-txt-primary" />
              </div>
              <div data-el-name="StrengthSliderRow">
                <label data-el-name="StrengthLabel" className="text-xs text-txt-secondary">Strength: <span data-el-name="StrengthValue" className="tabular-nums">{strength.toFixed(2)}</span></label>
                <input data-el-name="RangeSliderStrength" type="range" min={0} max={1} step={0.05} value={strength} onChange={(e) => setStrength(+e.target.value)} className="w-full accent-txt-primary" />
              </div>
              <div data-el-name="SssSliderRow">
                <label data-el-name="SssLabel" className="text-xs text-txt-secondary">SSS: <span data-el-name="SssValue" className="tabular-nums">{stochasticSamplingGamma.toFixed(2)}</span></label>
                <input data-el-name="RangeSliderSss" type="range" min={0} max={1} step={0.01} value={stochasticSamplingGamma} onChange={(e) => setStochasticSamplingGamma(+e.target.value)} className="w-full accent-txt-primary" />
              </div>
              <ToggleRow label="CFG Zero Star"
                description="When enabled, sets CFG (guidance) scale to 0 for the positive prompt. The model generates without guidance toward the prompt, producing more creative and organic results. The negative prompt is still applied normally."
                value={cfgZeroStar} onChange={(v) => setCfgZeroStar(v)} />
              <ToggleRow label="Zero Negative Prompt"
                description="When enabled, ignores the negative prompt entirely — sets it to an empty string before generation. Use this when you want to generate without a negative prompt or when certain models or LoRAs work better without one."
                value={zeroNegativePrompt} onChange={(v) => setZeroNegativePrompt(v)} />
              <ToggleRow label="Resolution dependent shift" value={resolutionDependentShift} onChange={(v) => setResolutionDependentShift(v)} />
              <ToggleRow label="Uložit do galerie" value={saveToGallery} onChange={(v) => setSaveToGallery(v)} />
              <ToggleRow label="Tiled Decoding"
                description="Rozdělí dekódování VAE na dlaždice. Užitečné pro velké obrázky, které by jinak způsobily nedostatek paměti."
                value={tiledDecoding} onChange={(v) => setTiledDecoding(v)} />
              {tiledDecoding && (
                <>
                  <div data-el-name="DecodingTileWidthSliderRow">
                    <label data-el-name="DecodingTileWidthLabel" className="text-xs text-txt-secondary">Decoding tile W: <span className="tabular-nums">{decodingTileWidth}px</span></label>
                    <input data-el-name="RangeSliderDecodingTileWidth" type="range" min={64} max={2048} step={64} value={decodingTileWidth} onChange={(e) => setDecodingTileWidth(+e.target.value)} className="w-full accent-txt-primary" />
                  </div>
                  <div data-el-name="DecodingTileHeightSliderRow">
                    <label data-el-name="DecodingTileHeightLabel" className="text-xs text-txt-secondary">Decoding tile H: <span className="tabular-nums">{decodingTileHeight}px</span></label>
                    <input data-el-name="RangeSliderDecodingTileHeight" type="range" min={64} max={2048} step={64} value={decodingTileHeight} onChange={(e) => setDecodingTileHeight(+e.target.value)} className="w-full accent-txt-primary" />
                  </div>
                  <div data-el-name="DecodingTileOverlapSliderRow">
                    <label data-el-name="DecodingTileOverlapLabel" className="text-xs text-txt-secondary">Decoding tile overlap: <span className="tabular-nums">{decodingTileOverlap}px</span></label>
                    <input data-el-name="RangeSliderDecodingTileOverlap" type="range" min={0} max={512} step={64} value={decodingTileOverlap} onChange={(e) => setDecodingTileOverlap(+e.target.value)} className="w-full accent-txt-primary" />
                  </div>
                </>
              )}
              <ToggleRow label="Tiled Diffusion"
                description="Rozdělí difuzi na dlaždice. Užitečné pro velké obrázky, které by jinak způsobily nedostatek paměti GPU."
                value={tiledDiffusion} onChange={(v) => setTiledDiffusion(v)} />
              {tiledDiffusion && (
                <>
                  <div data-el-name="DiffusionTileWidthSliderRow">
                    <label data-el-name="DiffusionTileWidthLabel" className="text-xs text-txt-secondary">Diffusion tile W: <span className="tabular-nums">{diffusionTileWidth}px</span></label>
                    <input data-el-name="RangeSliderDiffusionTileWidth" type="range" min={64} max={2048} step={64} value={diffusionTileWidth} onChange={(e) => setDiffusionTileWidth(+e.target.value)} className="w-full accent-txt-primary" />
                  </div>
                  <div data-el-name="DiffusionTileHeightSliderRow">
                    <label data-el-name="DiffusionTileHeightLabel" className="text-xs text-txt-secondary">Diffusion tile H: <span className="tabular-nums">{diffusionTileHeight}px</span></label>
                    <input data-el-name="RangeSliderDiffusionTileHeight" type="range" min={64} max={2048} step={64} value={diffusionTileHeight} onChange={(e) => setDiffusionTileHeight(+e.target.value)} className="w-full accent-txt-primary" />
                  </div>
                  <div data-el-name="DiffusionTileOverlapSliderRow">
                    <label data-el-name="DiffusionTileOverlapLabel" className="text-xs text-txt-secondary">Diffusion tile overlap: <span className="tabular-nums">{diffusionTileOverlap}px</span></label>
                    <input data-el-name="RangeSliderDiffusionTileOverlap" type="range" min={0} max={512} step={64} value={diffusionTileOverlap} onChange={(e) => setDiffusionTileOverlap(+e.target.value)} className="w-full accent-txt-primary" />
                  </div>
                </>
              )}
            </AccordionSection>

            <AccordionSection openSection={openSection} onToggle={openDesktopSection} id="upscaler" label="Upscaler">
              <div data-el-name="UpscalerModelRow">
                <label data-el-name="UpscalerModelLabel" className="text-xs text-txt-secondary mb-1 block">Model</label>
                <select data-el-name="UpscalerModelSelect"
                  value={upscaler}
                  onChange={(e) => setUpscaler(e.target.value)}
                  className="w-full bg-surface rounded-lg p-2.5 text-xs border border-border focus:border-txt-secondary outline-none transition-colors"
                >
                  {UPSCALER_PRESETS.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </div>
              <ChoiceRow<string>
                label="Scale factor"
                value={String(upscalerScaleFactor)}
                options={UPSCALER_SCALE_FACTORS.map((s) => ({ value: String(s), label: `${s}x` }))}
                onChange={(v) => setUpscalerScaleFactor(+v as UpscalerScaleFactor)}
                cols={4}
              />
            </AccordionSection>

            <AccordionSection openSection={openSection} onToggle={openDesktopSection} id="refiner" label="Refiner">
              <div data-el-name="RefinerModelRow">
                <label data-el-name="RefinerModelLabel" className="text-xs text-txt-secondary mb-1 block">
                  Model <span data-el-name="RefinerModelHint" className="text-txt-tertiary">(prázdné = vypnuto)</span>
                </label>
                <input data-el-name="RefinerModelInput" type="text"
                  value={refinerModel}
                  onChange={(e) => setRefinerModel(e.target.value)}
                  placeholder="např. sdxl_refiner_v0.9"
                  className="w-full bg-surface rounded-lg p-2.5 text-xs border border-border focus:border-txt-secondary outline-none transition-colors"
                />
              </div>
              {refinerModel && (
                <>
                  <div data-el-name="RefinerModelListLabel" className="text-xs text-txt-secondary mt-2 mb-1">Dostupné modely</div>
                  <div data-el-name="RefinerModelList" className="space-y-1 max-h-40 overflow-y-auto mb-3">
                    {modelList.filter((m) => m !== model && m.toLowerCase().includes(refinerModel.toLowerCase()))
                      .slice(0, 20)
                      .map((m) => (
                        <button key={m}
                          data-el-name="RefinerModelItem"
                          onClick={() => setRefinerModel(m)}
                          className={`w-full text-left p-2 rounded-lg text-xs border ${refinerModel === m ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'}`}
                        >
                          {m}
                        </button>
                      ))}
                  </div>
                  <div data-el-name="RefinerStartSliderRow">
                    <label data-el-name="RefinerStartLabel" className="text-xs text-txt-secondary">
                      Refiner start: <span data-el-name="RefinerStartValue" className="tabular-nums">{refinerStart.toFixed(2)}</span>
                    </label>
                    <input data-el-name="RangeSliderRefinerStart" type="range"
                      min={0} max={1} step={0.01} value={refinerStart}
                      onChange={(e) => setRefinerStart(+e.target.value)}
                      className="w-full accent-txt-primary"
                    />
                  </div>
                </>
              )}
            </AccordionSection>

            <AccordionSection openSection={openSection} onToggle={openDesktopSection} id="hires-fix" label="Hires Fix">
              <ToggleRow data-el-name="HiresFixToggle" label="Hires Fix" value={hiresFix}
                onChange={(v) => setHiresFix(v)} />
              {hiresFix && (
                <>
                  <div data-el-name="HiresFixWidthRow" className="flex gap-2 mt-2">
                    <div className="flex-1">
                      <label data-el-name="HiresFixWidthLabel" className="text-xs text-txt-secondary mb-1 block">
                        Start šířka
                      </label>
                      <input data-el-name="HiresFixWidthInput" type="number" min={64} max={2048} step={64}
                        value={hiresFixWidth}
                        onChange={(e) => setHiresFixWidth(Math.max(64, +e.target.value || 64))}
                        className="w-full bg-surface rounded-lg p-2 text-xs border border-border focus:border-txt-secondary outline-none transition-colors"
                      />
                    </div>
                    <div className="flex-1">
                      <label data-el-name="HiresFixHeightLabel" className="text-xs text-txt-secondary mb-1 block">
                        Start výška
                      </label>
                      <input data-el-name="HiresFixHeightInput" type="number" min={64} max={2048} step={64}
                        value={hiresFixHeight}
                        onChange={(e) => setHiresFixHeight(Math.max(64, +e.target.value || 64))}
                        className="w-full bg-surface rounded-lg p-2 text-xs border border-border focus:border-txt-secondary outline-none transition-colors"
                      />
                    </div>
                  </div>
                  <div data-el-name="HiresFixStrengthRow" className="mt-2">
                    <label data-el-name="HiresFixStrengthLabel" className="text-xs text-txt-secondary">
                      Denoising strength: <span data-el-name="HiresFixStrengthValue" className="tabular-nums">{hiresFixStrength.toFixed(2)}</span>
                    </label>
                    <input data-el-name="RangeSliderHiresFixStrength" type="range"
                      min={0.1} max={1} step={0.01} value={hiresFixStrength}
                      onChange={(e) => setHiresFixStrength(+e.target.value)}
                      className="w-full accent-txt-primary"
                    />
                  </div>
                </>
              )}
            </AccordionSection>
            <AccordionSection openSection={openSection} onToggle={openDesktopSection} id="lora" label="LoRA">
              <input data-el-name="LoraSearchInput" type="text" placeholder="Hledat LoRA..." value={loraSearchDesktop}
                onChange={(e) => setLoraSearchDesktop(e.target.value)}
                className="w-full bg-surface rounded-lg p-2.5 text-xs border border-border focus:border-txt-secondary outline-none transition-colors"
              />
              <div data-el-name="LoraList" className="space-y-2 max-h-52 overflow-y-auto">
                {loraList.length === 0 && <p data-el-name="LoraListEmpty" className="text-xs text-txt-tertiary">Žádné LoRA nejsou k dispozici</p>}
                {loraList.filter((l) => l.toLowerCase().includes(loraSearchDesktop.toLowerCase()))
                  .sort((a, b) => {
                    const aA = loras.some((l) => l.file === a) ? 0 : 1;
                    const bA = loras.some((l) => l.file === b) ? 0 : 1;
                    return aA - bA;
                  })
                  .map((lora) => {
                    const active = loras.find((l) => l.file === lora);
                    const toggle = () => {
                      if (active) {
                        setLoras(loras.filter((l) => l.file !== lora));
                      } else {
                        setLoras([...loras, { file: lora, weight: 0.6 }]);
                      }
                    };
                    return (
                      <div data-el-name="LoraItemRow" key={lora} role="button" tabIndex={0} onClick={toggle}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } }}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-xs border cursor-pointer ${active ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'}`}
                      >
                        <div data-el-name="LoraCheckbox" className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border ${active ? 'bg-surface-el border-txt-primary' : 'border-txt-tertiary'}`}>
                          {active && <span data-el-name="LoraCheckmark" className="text-txt-primary text-xs">✓</span>}
                        </div>
                        <span data-el-name="LoraName" className="flex-1 truncate text-txt-primary" title={displayLoraName(lora, loraNames)}>{displayLoraName(lora, loraNames)}</span>
                        {active && (
                          <div data-el-name="LoraWeightControls" className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button data-el-name="LoraWeightDecrement" type="button" onClick={(e) => {
                              const step = e.shiftKey ? 0.1 : 0.01;
                              setLoras(loras.map((l) => l.file === lora ? { ...l, weight: Math.max(-2, +(l.weight - step).toFixed(2)) } : l));
                            }}
                              className="w-7 h-7 rounded bg-surface text-sm font-medium flex items-center justify-center border border-border active:bg-border"
                            >−</button>
                            <input data-el-name="LoraWeightSlider" type="range" min={-2} max={2} step={0.01} value={active.weight}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setLoras(loras.map((l) => l.file === lora ? { ...l, weight: +e.target.value } : l))}
                              className="w-16 h-6 accent-txt-primary"
                            />
                            <span data-el-name="LoraWeightValue" className="text-xs text-txt-tertiary w-10 text-right tabular-nums">{active.weight.toFixed(2)}</span>
                            <button data-el-name="LoraWeightIncrement" type="button" onClick={(e) => {
                              const step = e.shiftKey ? 0.1 : 0.01;
                              setLoras(loras.map((l) => l.file === lora ? { ...l, weight: Math.min(2, +(l.weight + step).toFixed(2)) } : l));
                            }}
                              className="w-7 h-7 rounded bg-surface text-sm font-medium flex items-center justify-center border border-border active:bg-border"
                            >+</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </AccordionSection>
          </div>

          <div data-el-name="DesktopGenerateButtonRow" className="sticky bottom-0 z-10 px-4 py-3 bg-canvas/80 backdrop-blur-sm border-t border-border">
            {generating ? (
              <button data-el-name="DesktopStopButton"
                onClick={handleStop}
                className="w-full py-3 rounded-full font-medium text-sm flex items-center justify-center gap-2 bg-red-500/15 text-red-500 border border-red-500/40 active:bg-red-500/25 transition-colors"
              >
                <Stop className="w-4 h-4" />
                Stop
              </button>
            ) : (
              <button data-el-name="DesktopGenerateButton"
                onClick={handleGenerate}
                disabled={!prompt.trim() || !connected}
                className="w-full py-3 rounded-full font-medium text-sm bg-surface-el text-txt-primary border border-border disabled:opacity-40 active:bg-border transition-colors"
              >
                {!connected
                  ? 'Draw Things není připojen'
                  : 'Generovat'}
              </button>
            )}
          </div>
        </div>

        {configPanelVisible && (
          <button data-el-name="ConfigPanelHideButton"
            onClick={() => setConfigPanelVisible(false)}
            className="fixed top-1/2 z-30 w-8 h-16 rounded-l-lg
              bg-surface/80 backdrop-blur-xl border border-border shadow-lg
              flex items-center justify-center text-txt-secondary hover:text-txt-primary active:bg-border transition-colors"
            style={{ right: 'calc(380px + 16px)', transform: 'translateY(-50%)' }}
          >
            <ChevronRight data-el-name="ChevronRightIcon" className="w-4 h-4" />
          </button>
        )}

        {!configPanelVisible && (
          <button data-el-name="ConfigPanelToggle"
            onClick={() => setConfigPanelVisible(true)}
            className="fixed right-4 top-1/2 -translate-y-1/2 z-30 w-8 h-16 rounded-l-lg bg-surface/80 backdrop-blur-xl border border-border shadow-lg
              flex items-center justify-center text-txt-secondary hover:text-txt-primary active:bg-border transition-colors"
          >
            <ChevronLeft data-el-name="ChevronLeftIcon" className="w-4 h-4" />
          </button>
        )}
      </div>

      <ParamSheet
        open={sheetOpen}
        section={sheetSection}
        onClose={() => setSheetOpen(false)}
        model={model}
        modelList={modelList}
        cloudModels={cloudModels}
        sampler={sampler}
        steps={steps}
        cfg={cfg}
        seed={seed}
        width={width}
        height={height}
        sizeLevel={sizeLevel}
        aspectRatio={aspectRatio}
        customDimensions={customDimensions}
        widthCustom={widthCustom}
        heightCustom={heightCustom}
        shift={shift}
        clipSkip={clipSkip}
        resolutionDependentShift={resolutionDependentShift}
        randomizeSeed={randomizeSeed}
        seedMode={seedMode}
        upscaler={upscaler}
        upscalerScaleFactor={upscalerScaleFactor}
        saveToGallery={saveToGallery}
        loras={loras}
        loraList={loraList}
        loraNames={loraNames}
        refinerModel={refinerModel}
        refinerStart={refinerStart}
        strength={strength}
        stochasticSamplingGamma={stochasticSamplingGamma}
        cfgZeroStar={cfgZeroStar}
        zeroNegativePrompt={zeroNegativePrompt}
        onUpdate={(field, value) => {
          switch (field) {
            case 'model':
              setModel(value);
              break;
            case 'steps':
              setSteps(value);
              break;
            case 'cfg':
              setCfg(value);
              break;
            case 'seed':
              setSeed(value);
              break;
            case 'sizeLevel':
              setSizeLevel(value);
              break;
            case 'aspectRatio':
              setAspectRatio(value);
              break;
            case 'customDimensions':
              setCustomDimensions(value);
              break;
            case 'widthCustom':
              setWidthCustom(round8(value));
              break;
            case 'heightCustom':
              setHeightCustom(round8(value));
              break;
            case 'shift':
              setShift(value);
              break;
            case 'clipSkip':
              setClipSkip(value);
              break;
            case 'resolutionDependentShift':
              setResolutionDependentShift(value);
              break;
            case 'randomizeSeed':
              setRandomizeSeed(value);
              break;
            case 'saveToGallery':
              setSaveToGallery(value);
              break;
            case 'sampler':
              setSampler(value);
              break;
            case 'seedMode':
              setSeedMode(value);
              break;
            case 'upscaler':
              setUpscaler(value);
              break;
            case 'upscalerScaleFactor':
              setUpscalerScaleFactor(value);
              break;
            case 'loras':
              setLoras(value);
              break;
            case 'strength':
              setStrength(value);
              break;
            case 'stochasticSamplingGamma':
              setStochasticSamplingGamma(value);
              break;
            case 'cfgZeroStar':
              setCfgZeroStar(value);
              break;
            case 'zeroNegativePrompt':
              setZeroNegativePrompt(value);
              break;
            case 'refinerModel':
              setRefinerModel(value);
              break;
            case 'refinerStart':
              setRefinerStart(value);
              break;
          }
        }}
      />
    </div>
  );
}