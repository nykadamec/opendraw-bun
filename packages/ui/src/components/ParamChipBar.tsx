import type { SizeLevel, AspectRatio } from '../pages/GeneratePage';

interface ChipProps {
  label: string;
  value: string;
  onClick: () => void;
  title?: string;
}

function Chip({ label, value, onClick, title }: ChipProps) {
  return (
    <button data-el-name={`Chip_${label}`}
      onClick={onClick}
      title={title ?? (value ? `${label}: ${value}` : label)}
      className="flex-shrink-0 snap-start flex items-center gap-1.5 bg-surface rounded-full px-4 min-h-[40px] py-2 text-[13px] border border-border active:bg-border transition-colors"
    >
      <span data-el-name="ChipLabel" className="text-txt-tertiary">{label}</span>
      <span data-el-name="ChipValue" className="text-txt-primary">{value}</span>
    </button>
  );
}

interface Props {
  model: string;
  sampler: string;
  steps: number;
  cfg: number;
  seed: number;
  randomizeSeed: boolean;
  size: string;
  sizeLevel: SizeLevel;
  aspectRatio: AspectRatio;
  shift: number;
  clipSkip: number;
  loras: { file: string; weight: number }[];
  onOpenSheet: (section: string) => void;
}

export default function ParamChipBar({
  model,
  sampler,
  steps,
  cfg,
  seed,
  randomizeSeed,
  size,
  sizeLevel,
  aspectRatio,
  shift,
  clipSkip,
  loras,
  onOpenSheet,
}: Props) {
  const shortModel = model
    ? model.split('/').pop()?.split('.')[0]?.slice(0, 15) || '?'
    : '?';

  const seedLabel = randomizeSeed || seed === -1 ? '⏳' : String(seed);

  return (
    <div data-el-name="ParamChipBar" className="relative">
      <div data-el-name="ParamChipBarScroll" className="flex gap-2.5 overflow-x-auto px-3 py-2 scrollbar-none snap-x lg:overflow-visible lg:flex-wrap">
        <Chip label="Model" value={shortModel} title={model || 'Model'} onClick={() => onOpenSheet('model')} />
        <Chip label="LoRAs" value={String(loras.length)} onClick={() => onOpenSheet('lora')} />
        <Chip
          label="Size"
          value={sizeLevel === 'normal' ? aspectRatio : `${sizeLevel}·${aspectRatio}`}
          onClick={() => onOpenSheet('rozměry')}
        />
        <Chip label="Steps" value={String(steps)} onClick={() => onOpenSheet('sampler')} />
        <Chip label="CFG" value={String(cfg)} onClick={() => onOpenSheet('sampler')} />
        <Chip label="Seed" value={seedLabel} onClick={() => onOpenSheet('pokročile')} />
        {shift !== 1.0 && (
          <Chip label="Shift" value={shift.toFixed(1)} onClick={() => onOpenSheet('pokročile')} />
        )}
        {clipSkip !== 1 && (
          <Chip label="Clip" value={String(clipSkip)} onClick={() => onOpenSheet('pokročile')} />
        )}
        <Chip label={sampler} value="" onClick={() => onOpenSheet('sampler')} />
      </div>
      <div
        data-el-name="ParamChipBarFade"
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-canvas to-transparent lg:hidden"
      />
    </div>
  );
}
