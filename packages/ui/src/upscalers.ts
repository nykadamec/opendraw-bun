export interface UpscalerPreset {
  id: string;
  label: string;
}

export const UPSCALER_PRESETS: UpscalerPreset[] = [
  { id: '', label: '— Vypnuto —' },
  { id: 'realesrgan-x4plus', label: 'RealESRGAN x4 Plus' },
  { id: 'realesrgan-x4plus-anime', label: 'RealESRGAN x4 Plus (anime)' },
  { id: 'realesrgan-x2plus', label: 'RealESRGAN x2 Plus' },
  { id: 'realesrgan-general-x4v3', label: 'RealESRGAN General x4 v3' },
  { id: 'esrgan_4x_universal_upscaler_v2_sharp_f16.ckpt', label: 'UniversalUpscaler V2 Shrp' },
  { id: '4x_ultrasharp_f16.ckpt', label: 'RealESRGAN 4x UltraSharp' },
  { id: 'remacri_4x_f16.ckpt', label: 'RealESRGAN Remacri 4x' },
];

export const UPSCALER_SCALE_FACTORS = [1, 2, 3, 4] as const;
export type UpscalerScaleFactor = (typeof UPSCALER_SCALE_FACTORS)[number];
export const DEFAULT_UPSCALER_SCALE_FACTOR: UpscalerScaleFactor = 2;

export function getUpscalerLabel(id: string): string {
  const preset = UPSCALER_PRESETS.find((u) => u.id === id);
  return preset ? preset.label : id || '— Vypnuto —';
}