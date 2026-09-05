export interface SamplerOption {
  id: string;
  label: string;
}

export const SAMPLERS: SamplerOption[] = [
  { id: 'dpmpp_2m_karras', label: 'DPM++ 2M Karras' },
  { id: 'euler_a', label: 'Euler Ancestral' },
  { id: 'ddim', label: 'DDIM' },
  { id: 'plms', label: 'PLMS' },
  { id: 'dpmpp_sde_karras', label: 'DPM++ SDE Karras' },
  { id: 'unipc', label: 'UniPC' },
  { id: 'lcm', label: 'LCM' },
  { id: 'euler_a_substep', label: 'Euler A Substep' },
  { id: 'dpmpp_sde_substep', label: 'DPM++ SDE Substep' },
  { id: 'tcd', label: 'TCD' },
  { id: 'euler_a_trailing', label: 'Euler A (Trailing)' },
  { id: 'dpmpp_sde_trailing', label: 'DPM++ SDE (Trailing)' },
  { id: 'dpmpp_2m_ays', label: 'DPM++ 2M AYS' },
  { id: 'euler_a_ays', label: 'Euler A AYS' },
  { id: 'dpmpp_sde_ays', label: 'DPM++ SDE AYS' },
  { id: 'dpmpp_2m_trailing', label: 'DPM++ 2M (Trailing)' },
  { id: 'ddim_trailing', label: 'DDIM (Trailing)' },
  { id: 'unipc_trailing', label: 'UniPC (Trailing)' },
  { id: 'unipc_ays', label: 'UniPC AYS' },
  { id: 'tcd_trailing', label: 'TCD (Trailing)' },
];

export const DEFAULT_SAMPLER_ID = 'dpmpp_2m_karras';

export const SAMPLER_ID_MAP: Record<string, string> = {};
for (const s of SAMPLERS) {
  SAMPLER_ID_MAP[s.id] = s.label;
}

export function getSamplerLabel(id: string): string {
  return SAMPLER_ID_MAP[id] ?? id;
}

export const SAMPLER_ID_TO_ENUM: Record<string, number> = {
  dpmpp_2m_karras: 0,
  euler_a: 1,
  ddim: 2,
  plms: 3,
  dpmpp_sde_karras: 4,
  unipc: 5,
  lcm: 6,
  euler_a_substep: 7,
  dpmpp_sde_substep: 8,
  tcd: 9,
  euler_a_trailing: 10,
  dpmpp_sde_trailing: 11,
  dpmpp_2m_ays: 12,
  euler_a_ays: 13,
  dpmpp_sde_ays: 14,
  dpmpp_2m_trailing: 15,
  ddim_trailing: 16,
  unipc_trailing: 17,
  unipc_ays: 18,
  tcd_trailing: 19,
};

export const SAMPLER_ENUM_TO_ID: Record<number, string> = Object.fromEntries(
  Object.entries(SAMPLER_ID_TO_ENUM).map(([id, enumIdx]) => [enumIdx, id])
);

