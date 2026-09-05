import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sparkles, Stop, ArrowRotate } from 'reicon-react';
import type { CloudModel } from '@opendraw/api-client';
import { SAMPLERS, getSamplerLabel } from '../samplers';
import { SEED_MODES } from '../seedModes';
import type { SeedModeId } from '../seedModes';
import { UPSCALER_PRESETS, UPSCALER_SCALE_FACTORS, getUpscalerLabel } from '../upscalers';
import type { UpscalerScaleFactor } from '../upscalers';
import { ASPECT_RATIOS, SIZE_LEVELS } from '../pages/GeneratePage';
import type { AspectRatio, SizeLevel } from '../pages/GeneratePage';
import { displayLoraName } from '../lora-utils';

function round8(n: number): number {
  return Math.max(64, Math.round(n / 8) * 8);
}

const SIZE_LABEL: Record<SizeLevel, string> = {
  small: 'Small',
  normal: 'Normal',
  large: 'Large',
};

interface CanvasComposerProps {
  floating?: boolean;
  // Prompt
  prompt: string;
  onPromptChange: (v: string) => void;
  negativePrompt: string;
  onNegativeChange: (v: string) => void;
  triggerChips?: ReactNode;
  // Model
  model: string;
  onModelChange: (v: string) => void;
  modelList: string[];
  cloudModels: CloudModel[];
  // Rozměry
  sizeLevel: SizeLevel;
  onSizeLevelChange: (v: SizeLevel) => void;
  aspectRatio: AspectRatio;
  onAspectRatioChange: (v: AspectRatio) => void;
  customDimensions: boolean;
  onCustomDimensionsChange: (v: boolean) => void;
  widthCustom: number;
  onWidthCustomChange: (v: number) => void;
  heightCustom: number;
  onHeightCustomChange: (v: number) => void;
  width: number;
  height: number;
  // Sampler
  sampler: string;
  onSamplerChange: (v: string) => void;
  steps: number;
  onStepsChange: (v: number) => void;
  cfg: number;
  onCfgChange: (v: number) => void;
  // Pokročilé
  seed: number;
  onSeedChange: (v: number) => void;
  randomizeSeed: boolean;
  onRandomizeSeedChange: (v: boolean) => void;
  seedMode: SeedModeId;
  onSeedModeChange: (v: SeedModeId) => void;
  effectiveShift: number;
  onShiftChange: (v: number) => void;
  resolutionDependentShift: boolean;
  onResolutionDependentShiftChange: (v: boolean) => void;
  clipSkip: number;
  onClipSkipChange: (v: number) => void;
  strength: number;
  onStrengthChange: (v: number) => void;
  stochasticSamplingGamma: number;
  onStochasticSamplingGammaChange: (v: number) => void;
  cfgZeroStar: boolean;
  onCfgZeroStarChange: (v: boolean) => void;
  zeroNegativePrompt: boolean;
  onZeroNegativePromptChange: (v: boolean) => void;
  // Upscaler
  upscaler: string;
  onUpscalerChange: (v: string) => void;
  upscalerScaleFactor: UpscalerScaleFactor;
  onUpscalerScaleFactorChange: (v: UpscalerScaleFactor) => void;
  // Refiner
  refinerModel: string;
  onRefinerModelChange: (v: string) => void;
  refinerStart: number;
  onRefinerStartChange: (v: number) => void;
  // Hires fix
  hiresFix: boolean;
  onHiresFixChange: (v: boolean) => void;
  hiresFixWidth: number;
  onHiresFixWidthChange: (v: number) => void;
  hiresFixHeight: number;
  onHiresFixHeightChange: (v: number) => void;
  hiresFixStrength: number;
  onHiresFixStrengthChange: (v: number) => void;
  // LoRA
  loras: { file: string; weight: number }[];
  onLorasChange: (v: { file: string; weight: number }[]) => void;
  loraList: string[];
  loraNames: Record<string, string>;
  loraSearch: string;
  onLoraSearchChange: (v: string) => void;
  // Sekce
  openSection: string | null;
  onOpenSection: (id: string) => void;
  // Generování
  generating: boolean;
  connected: boolean;
  onGenerate: () => void;
  onStop: () => void;
  onResetConfig: () => void;
}
function AccordionSection({ id, label, children, openSection, onToggle }: {
  id: string;
  label: string;
  children: ReactNode;
  openSection: string | null;
  onToggle: (id: string) => void;
}) {
  const isOpen = openSection === id;
  const capId = id.charAt(0).toUpperCase() + id.slice(1);
  return (
    <div data-el-name={`AccordionSection${capId}`} className="border border-border rounded-lg overflow-hidden">
      <button data-el-name={`AccordionToggle${capId}`}
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-txt-primary bg-surface-el/60 active:bg-surface-el transition-colors"
      >
        {label}
        <span data-el-name={`AccordionChevron${capId}`} className={`text-txt-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {isOpen && <div data-el-name={`AccordionContent${capId}`} className="p-3 space-y-3 text-xs">{children}</div>}
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
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-txt-primary mt-0.5" />
      <div>
        <span className="text-xs text-txt-primary">{label}</span>
        {description && <p className="text-[10px] text-txt-tertiary mt-0.5 leading-snug">{description}</p>}
      </div>
    </label>
  );
}

function Chip({ label, value, active, onClick }: { label: string; value: string; active: boolean; onClick: () => void }) {
  const name = `ComposerChip_${label.replace(/\s+/g, '')}`;
  return (
    <button data-el-name={name} type="button" onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs border transition-colors ${active ? 'bg-txt-primary text-canvas border-txt-primary' : 'bg-surface-el/70 border-border hover:border-border-hover text-txt-primary'}`}
    >
      <span data-el-name={`${name}Label`} className={active ? 'opacity-60' : 'text-txt-tertiary'}>{label}</span>
      <span data-el-name={`${name}Value`} className="tabular-nums max-w-[140px] truncate">{value}</span>
    </button>
  );
}
export default function CanvasComposer(props: CanvasComposerProps) {
  const {
    floating = false,
    prompt, onPromptChange, negativePrompt, onNegativeChange, triggerChips,
    model, onModelChange, modelList, cloudModels,
    sizeLevel, onSizeLevelChange, aspectRatio, onAspectRatioChange,
    customDimensions, onCustomDimensionsChange,
    widthCustom, onWidthCustomChange, heightCustom, onHeightCustomChange,
    width, height,
    sampler, onSamplerChange, steps, onStepsChange, cfg, onCfgChange,
    seed, onSeedChange, randomizeSeed, onRandomizeSeedChange,
    seedMode, onSeedModeChange, effectiveShift, onShiftChange,
    resolutionDependentShift, onResolutionDependentShiftChange,
    clipSkip, onClipSkipChange, strength, onStrengthChange,
    stochasticSamplingGamma, onStochasticSamplingGammaChange,
    cfgZeroStar, onCfgZeroStarChange,
    zeroNegativePrompt, onZeroNegativePromptChange,
    upscaler, onUpscalerChange,
    upscalerScaleFactor, onUpscalerScaleFactorChange,
    refinerModel, onRefinerModelChange, refinerStart, onRefinerStartChange,
    hiresFix, onHiresFixChange,
    hiresFixWidth, onHiresFixWidthChange,
    hiresFixHeight, onHiresFixHeightChange,
    hiresFixStrength, onHiresFixStrengthChange,
    loras, onLorasChange, loraList, loraNames,
    loraSearch, onLoraSearchChange,
    openSection, onOpenSection,
    generating, connected, onGenerate, onStop, onResetConfig,
  } = props;

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [showNegative, setShowNegative] = useState(false);

  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [prompt]);

  const shortModel = model
    ? (model.split('/').pop()?.split('.')[0]?.slice(0, 15) || model)
    : '?';
  const sizeValue = customDimensions
    ? `${width}×${height}`
    : (sizeLevel === 'normal' ? aspectRatio : `${SIZE_LABEL[sizeLevel]}·${aspectRatio}`);
  const seedValue = randomizeSeed || seed === -1 ? '⏳' : String(seed);

  return (
    <div
      data-el-name="CanvasComposer"
      className={`fixed bottom-4 z-30 w-[92%] max-w-4xl ${floating ? 'left-[calc(50%+136px)]' : 'left-1/2'} -translate-x-1/2`}
    >
      <div data-el-name="CanvasComposerPanel" className="glass-panel rounded-3xl shadow-2xl overflow-hidden">
        {openSection && (
          <div data-el-name="ComposerAccordionArea" className="max-h-[40vh] overflow-y-auto border-b border-border">
            <div data-el-name="ComposerAccordionList" className="p-3 space-y-1.5">
              <AccordionSection openSection={openSection} onToggle={onOpenSection} id="model" label="Model">
                <input data-el-name="ModelSearchInput"
                  type="text"
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  placeholder="např. flux_2_klein_base_9b_q8p.ckpt"
                  className="w-full bg-surface rounded-lg p-2.5 text-xs border border-border focus:border-txt-secondary outline-none transition-colors"
                />
                <div data-el-name="ModelList" className="space-y-1 max-h-40 overflow-y-auto">
                  {modelList.length === 0 && <p data-el-name="ModelListEmpty" className="text-xs text-txt-tertiary">Žádné modely nenalezeny</p>}
                  {modelList.map((m) => (
                    <button
                      data-el-name="ModelItemButton"
                      key={m}
                      onClick={() => onModelChange(m)}
                      className={`w-full text-left p-2 rounded-lg text-xs border ${model === m ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {cloudModels.length > 0 && (
                  <div data-el-name="CloudModelsDivider" className="pt-2 mt-2 border-t border-border">
                    <p className="text-[10px] text-txt-tertiary uppercase tracking-wide mb-1">DT+ Cloud modely</p>
                    <div data-el-name="CloudModelList" className="space-y-1 max-h-40 overflow-y-auto">
                      {cloudModels.map((cm) => (
                        <button
                          data-el-name="CloudModelItemButton"
                          key={cm.file}
                          onClick={() => onModelChange(cm.file)}
                          className={`w-full text-left p-2 rounded-lg text-xs border ${model === cm.file ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'}`}
                        >
                          {cm.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </AccordionSection>
              <AccordionSection openSection={openSection} onToggle={onOpenSection} id="rozměry" label="Rozměry">
                <ChoiceRow<SizeLevel> label="Velikost" value={sizeLevel}
                  options={SIZE_LEVELS.map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
                  onChange={(v) => onSizeLevelChange(v)}
                />
                <ChoiceRow<AspectRatio> label="Poměr stran" value={aspectRatio}
                  options={ASPECT_RATIOS.map((a) => ({ value: a, label: a }))}
                  onChange={(v) => onAspectRatioChange(v)} cols={4}
                />
                <div data-el-name="DimensionInfo" className="bg-surface rounded-lg p-2.5 text-xs text-txt-secondary border border-border">
                  Rozměry: <span data-el-name="DimensionValue" className="text-txt-primary tabular-nums">{width}×{height}</span>
                </div>
                <ToggleRow label="Vlastní rozměry" value={customDimensions} onChange={(v) => onCustomDimensionsChange(v)} />
                {customDimensions && (
                  <div data-el-name="CustomDimensionGrid" className="grid grid-cols-2 gap-2">
                    <div data-el-name="CustomWidthRow">
                      <label data-el-name="CustomWidthLabel" className="text-xs text-txt-secondary mb-1 block">Width</label>
                      <input data-el-name="CustomWidthInput" type="number" min={64} max={4096} step={8} value={widthCustom}
                        onChange={(e) => onWidthCustomChange(round8(+e.target.value))}
                        className="w-full bg-surface rounded p-2 text-xs border border-border tabular-nums"
                      />
                    </div>
                    <div data-el-name="CustomHeightRow">
                      <label data-el-name="CustomHeightLabel" className="text-xs text-txt-secondary mb-1 block">Height</label>
                      <input data-el-name="CustomHeightInput" type="number" min={64} max={4096} step={8} value={heightCustom}
                        onChange={(e) => onHeightCustomChange(round8(+e.target.value))}
                        className="w-full bg-surface rounded p-2 text-xs border border-border tabular-nums"
                      />
                    </div>
                  </div>
                )}
              </AccordionSection>
              <AccordionSection openSection={openSection} onToggle={onOpenSection} id="sampler" label="Sampler">
                <div data-el-name="SamplerSelectRow">
                  <label data-el-name="SamplerSelectLabel" className="text-xs text-txt-secondary mb-1 block">Sampler</label>
                  <select data-el-name="SamplerSelect"
                    value={sampler}
                    onChange={(e) => onSamplerChange(e.target.value)}
                    className="w-full bg-surface rounded p-2 text-xs border border-border"
                  >
                    {SAMPLERS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div data-el-name="StepsSliderRow">
                  <label data-el-name="StepsLabel" className="text-xs text-txt-secondary">Steps: {steps}</label>
                  <input data-el-name="RangeSliderSteps" type="range" min={1} max={50} value={steps} onChange={(e) => onStepsChange(+e.target.value)} className="w-full accent-txt-primary" />
                </div>
                <div data-el-name="CfgSliderRow">
                  <label data-el-name="CfgLabel" className="text-xs text-txt-secondary">CFG: {cfg}</label>
                  <input data-el-name="RangeSliderCfg" type="range" min={1} max={30} step={0.5} value={cfg} onChange={(e) => onCfgChange(+e.target.value)} className="w-full accent-txt-primary" />
                </div>
              </AccordionSection>
              <AccordionSection openSection={openSection} onToggle={onOpenSection} id="pokročilé" label="Pokročilé">
                <div data-el-name="SeedRow">
                  <div className="flex items-center justify-between mb-1">
                    <label data-el-name="SeedLabel" className="text-xs text-txt-secondary">Seed</label>
                    <div data-el-name="SeedRandomizeRow" className="flex items-center gap-1.5">
                      <input data-el-name="SeedRandomizeCheckbox" id="composer-randomize-seed" type="checkbox" checked={randomizeSeed}
                        onChange={(e) => onRandomizeSeedChange(e.target.checked)} className="accent-txt-primary"
                      />
                      <label data-el-name="SeedRandomizeLabel" htmlFor="composer-randomize-seed" className="text-[10px] text-txt-secondary cursor-pointer">Randomize</label>
                    </div>
                  </div>
                  <div data-el-name="SeedInputRow" className="flex gap-2">
                    <input data-el-name="SeedNumberInput" type="number" value={seed} disabled={randomizeSeed}
                      onChange={(e) => onSeedChange(+e.target.value)}
                      className="flex-1 bg-surface rounded p-2 text-xs border border-border disabled:opacity-40"
                    />
                    <button data-el-name="SeedRandomButton" onClick={() => onSeedChange(-1)} className="bg-surface rounded px-3 text-xs border border-border" title="Náhodný seed">⏳</button>
                  </div>
                </div>
                <ChoiceRow<SeedModeId>
                  label="Seed Mode"
                  value={seedMode}
                  options={SEED_MODES.map((m) => ({ value: m.id, label: m.label }))}
                  onChange={(v) => onSeedModeChange(v)}
                  cols={2}
                />
                <div data-el-name="ShiftSliderRow">
                  <label data-el-name="ShiftLabel" className={`text-xs ${resolutionDependentShift ? 'text-txt-tertiary' : 'text-txt-secondary'}`}>
                    Shift: <span data-el-name="ShiftValue" className="tabular-nums">{effectiveShift.toFixed(2)}</span>
                    {resolutionDependentShift && <span className="ml-1 text-[10px] opacity-60">auto</span>}
                  </label>
                  <input data-el-name="RangeSliderShift" type="range" min={0} max={7} step={0.05} value={effectiveShift}
                    onChange={(e) => { onShiftChange(+e.target.value); if (resolutionDependentShift) onResolutionDependentShiftChange(false); }}
                    disabled={resolutionDependentShift}
                    className={`w-full ${resolutionDependentShift ? 'accent-txt-tertiary opacity-50' : 'accent-txt-primary'}`}
                  />
                </div>
                <div data-el-name="ClipSkipSliderRow">
                  <label data-el-name="ClipSkipLabel" className="text-xs text-txt-secondary">Clip skip: <span data-el-name="ClipSkipValue" className="tabular-nums">{clipSkip}</span></label>
                  <input data-el-name="RangeSliderClipSkip" type="range" min={1} max={12} step={1} value={clipSkip} onChange={(e) => onClipSkipChange(+e.target.value)} className="w-full accent-txt-primary" />
                </div>
                <div data-el-name="StrengthSliderRow">
                  <label data-el-name="StrengthLabel" className="text-xs text-txt-secondary">Strength: <span data-el-name="StrengthValue" className="tabular-nums">{strength.toFixed(2)}</span></label>
                  <input data-el-name="RangeSliderStrength" type="range" min={0} max={1} step={0.05} value={strength} onChange={(e) => onStrengthChange(+e.target.value)} className="w-full accent-txt-primary" />
                </div>
                <div data-el-name="SssSliderRow">
                  <label data-el-name="SssLabel" className="text-xs text-txt-secondary">SSS: <span data-el-name="SssValue" className="tabular-nums">{stochasticSamplingGamma.toFixed(2)}</span></label>
                  <input data-el-name="RangeSliderSss" type="range" min={0} max={1} step={0.01} value={stochasticSamplingGamma} onChange={(e) => onStochasticSamplingGammaChange(+e.target.value)} className="w-full accent-txt-primary" />
                </div>
                <ToggleRow label="CFG Zero Star"
                  description="Sets CFG scale to 0 for the positive prompt, producing more creative results."
                  value={cfgZeroStar} onChange={(v) => onCfgZeroStarChange(v)}
                />
                <ToggleRow label="Zero Negative Prompt"
                  description="Ignores the negative prompt entirely."
                  value={zeroNegativePrompt} onChange={(v) => onZeroNegativePromptChange(v)}
                />
                <ToggleRow label="Resolution dependent shift" value={resolutionDependentShift} onChange={(v) => onResolutionDependentShiftChange(v)} />
              </AccordionSection>
              <AccordionSection openSection={openSection} onToggle={onOpenSection} id="upscaler" label="Upscaler">
                <div data-el-name="UpscalerModelRow">
                  <label data-el-name="UpscalerModelLabel" className="text-xs text-txt-secondary mb-1 block">Model</label>
                  <select data-el-name="UpscalerModelSelect"
                    value={upscaler}
                    onChange={(e) => onUpscalerChange(e.target.value)}
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
                  onChange={(v) => onUpscalerScaleFactorChange(+v as UpscalerScaleFactor)}
                  cols={4}
                />
              </AccordionSection>
              <AccordionSection openSection={openSection} onToggle={onOpenSection} id="refiner" label="Refiner">
                <div data-el-name="RefinerModelRow">
                  <label data-el-name="RefinerModelLabel" className="text-xs text-txt-secondary mb-1 block">
                    Model <span data-el-name="RefinerModelHint" className="text-txt-tertiary">(prázdné = vypnuto)</span>
                  </label>
                  <input data-el-name="RefinerModelInput" type="text"
                    value={refinerModel}
                    onChange={(e) => onRefinerModelChange(e.target.value)}
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
                            onClick={() => onRefinerModelChange(m)}
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
                        onChange={(e) => onRefinerStartChange(+e.target.value)}
                        className="w-full accent-txt-primary"
                      />
                    </div>
                  </>
                )}
              </AccordionSection>
              <AccordionSection openSection={openSection} onToggle={onOpenSection} id="hires-fix" label="Hires Fix">
                <ToggleRow label="Hires Fix" value={hiresFix} onChange={(v) => onHiresFixChange(v)} />
                {hiresFix && (
                  <>
                    <div data-el-name="HiresFixWidthRow" className="flex gap-2 mt-2">
                      <div className="flex-1">
                        <label data-el-name="HiresFixWidthLabel" className="text-xs text-txt-secondary mb-1 block">Start šířka</label>
                        <input data-el-name="HiresFixWidthInput" type="number" min={64} max={2048} step={64}
                          value={hiresFixWidth}
                          onChange={(e) => onHiresFixWidthChange(Math.max(64, +e.target.value || 64))}
                          className="w-full bg-surface rounded-lg p-2 text-xs border border-border focus:border-txt-secondary outline-none transition-colors"
                        />
                      </div>
                      <div className="flex-1">
                        <label data-el-name="HiresFixHeightLabel" className="text-xs text-txt-secondary mb-1 block">Start výška</label>
                        <input data-el-name="HiresFixHeightInput" type="number" min={64} max={2048} step={64}
                          value={hiresFixHeight}
                          onChange={(e) => onHiresFixHeightChange(Math.max(64, +e.target.value || 64))}
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
                        onChange={(e) => onHiresFixStrengthChange(+e.target.value)}
                        className="w-full accent-txt-primary"
                      />
                    </div>
                  </>
                )}
              </AccordionSection>
              <AccordionSection openSection={openSection} onToggle={onOpenSection} id="lora" label="LoRA">
                <input data-el-name="LoraSearchInput" type="text" placeholder="Hledat LoRA..." value={loraSearch}
                  onChange={(e) => onLoraSearchChange(e.target.value)}
                  className="w-full bg-surface rounded-lg p-2.5 text-xs border border-border focus:border-txt-secondary outline-none transition-colors" />
                <div data-el-name="LoraList" className="space-y-2 max-h-52 overflow-y-auto">
                  {loraList.length === 0 && <p data-el-name="LoraListEmpty" className="text-xs text-txt-tertiary">Žádné LoRA nejsou k dispozici</p>}
                  {loraList.filter((l) => l.toLowerCase().includes(loraSearch.toLowerCase()))
                    .sort((a, b) => {
                      const aA = loras.some((l) => l.file === a) ? 0 : 1;
                      const bA = loras.some((l) => l.file === b) ? 0 : 1;
                      return aA - bA;
                    })
                    .map((lora) => {
                      const active = loras.find((l) => l.file === lora);
                      const toggle = () => {
                        if (active) {
                          onLorasChange(loras.filter((l) => l.file !== lora));
                        } else {
                          onLorasChange([...loras, { file: lora, weight: 0.6 }]);
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
                                onLorasChange(loras.map((l) => l.file === lora ? { ...l, weight: Math.max(-2, +(l.weight - step).toFixed(2)) } : l));
                              }}
                                className="w-7 h-7 rounded bg-surface text-sm font-medium flex items-center justify-center border border-border active:bg-border"
                              >−</button>
                              <input data-el-name="LoraWeightSlider" type="range" min={-2} max={2} step={0.01} value={active.weight}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => onLorasChange(loras.map((l) => l.file === lora ? { ...l, weight: +e.target.value } : l))}
                                className="w-16 h-6 accent-txt-primary"
                              />
                              <span data-el-name="LoraWeightValue" className="text-xs text-txt-tertiary w-10 text-right tabular-nums">{active.weight.toFixed(2)}</span>
                              <button data-el-name="LoraWeightIncrement" type="button" onClick={(e) => {
                                const step = e.shiftKey ? 0.1 : 0.01;
                                onLorasChange(loras.map((l) => l.file === lora ? { ...l, weight: Math.min(2, +(l.weight + step).toFixed(2)) } : l));
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
          </div>
        )}
      <div data-el-name="CanvasComposerBody" className="p-4 pt-3.5 space-y-2.5">
        <textarea
          ref={promptRef}
          data-el-name="ComposerPromptTextarea"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Popiš scénu…"
          rows={2}
          className="w-full bg-transparent border-none resize-none focus:outline-none text-sm leading-relaxed placeholder:text-txt-tertiary min-h-[42px]"
        />
        {triggerChips}
        {showNegative ? (
          <div data-el-name="ComposerNegativeRow" className="flex items-start gap-2 -mt-1">
            <textarea
              data-el-name="ComposerNegativeTextarea"
              value={negativePrompt}
              onChange={(e) => onNegativeChange(e.target.value)}
              placeholder="Negativní prompt…"
              rows={1}
              className="flex-1 bg-transparent rounded-lg px-1 text-xs text-txt-secondary resize-none border border-border focus:outline-none focus:border-txt-secondary transition-colors"
            />
            <button data-el-name="ComposerNegativeHide" onClick={() => setShowNegative(false)}
              className="text-txt-tertiary hover:text-txt-primary text-xs px-1"
            >✕</button>
          </div>
        ) : (
          <button data-el-name="ComposerNegativeShow" onClick={() => setShowNegative(true)}
            className="text-xs text-txt-tertiary hover:text-txt-secondary px-1"
          >+ negativní prompt</button>
        )}
        <div data-el-name="ComposerChipRow" className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-border">
          <Chip label="Model" value={shortModel} active={openSection === 'model'} onClick={() => onOpenSection('model')} />
          <Chip label="LoRAs" value={String(loras.length)} active={openSection === 'lora'} onClick={() => onOpenSection('lora')} />
          <Chip label="Size" value={sizeValue} active={openSection === 'rozměry'} onClick={() => onOpenSection('rozměry')} />
          <Chip label="Sampler" value={getSamplerLabel(sampler)} active={openSection === 'sampler'} onClick={() => onOpenSection('sampler')} />
          <Chip label="Steps" value={String(steps)} active={openSection === 'sampler'} onClick={() => onOpenSection('sampler')} />
          <Chip label="CFG" value={String(cfg)} active={openSection === 'sampler'} onClick={() => onOpenSection('sampler')} />
          <Chip label="Seed" value={seedValue} active={openSection === 'pokročilé'} onClick={() => onOpenSection('pokročilé')} />
          <Chip label="Upscaler" value={upscaler ? `${upscalerScaleFactor}×` : '—'} active={openSection === 'upscaler'} onClick={() => onOpenSection('upscaler')} />
          {effectiveShift !== 1.0 && (
            <Chip label="Shift" value={effectiveShift.toFixed(1)} active={openSection === 'pokročilé'} onClick={() => onOpenSection('pokročilé')} />
          )}
          {clipSkip !== 1 && (
            <Chip label="Clip" value={String(clipSkip)} active={openSection === 'pokročilé'} onClick={() => onOpenSection('pokročilé')} />
          )}
          <button data-el-name="ComposerResetButton" onClick={onResetConfig}
            title="Resetovat konfiguraci" aria-label="Resetovat konfiguraci"
            className="w-8 h-8 rounded-full text-txt-tertiary hover:text-txt-primary hover:bg-surface-el flex items-center justify-center transition-colors"
          >
            <ArrowRotate className="w-3.5 h-3.5" />
          </button>
          <div className="flex-1" />
          {generating ? (
            <button data-el-name="ComposerStopButton" onClick={onStop}
              className="flex items-center gap-1.5 px-4 h-9 rounded-full bg-txt-primary/15 hover:bg-txt-primary/25 border border-txt-primary/30 text-txt-primary text-xs font-medium transition-colors"
            >
              <Stop className="w-4 h-4" /> Stop
            </button>
          ) : (
            <button data-el-name="ComposerGenerateButton" onClick={onGenerate} disabled={!connected}
              className="flex items-center gap-1.5 px-4 h-9 rounded-full bg-txt-primary text-canvas hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium transition-opacity"
            >
              <Sparkles className="w-4 h-4" /> Generovat
            </button>
          )}
        </div>
      </div>
    </div>
    </div>
  );
}
