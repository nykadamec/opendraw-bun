import { SamplerType } from '../proto/fbs/ts/tensor_history.js';

export const SAMPLER_MAP: Record<string, SamplerType> = {
  dpmpp_2m_karras: SamplerType.DPMPP2MKarras,
  euler_a: SamplerType.EulerA,
  ddim: SamplerType.DDIM,
  plms: SamplerType.PLMS,
  dpmpp_sde_karras: SamplerType.DPMPPSDEKarras,
  unipc: SamplerType.UniPC,
  lcm: SamplerType.LCM,
  euler_a_substep: SamplerType.EulerASubstep,
  dpmpp_sde_substep: SamplerType.DPMPPSDESubstep,
  tcd: SamplerType.TCD,
  euler_a_trailing: SamplerType.EulerATrailing,
  dpmpp_sde_trailing: SamplerType.DPMPPSDETrailing,
  dpmpp_2m_ays: SamplerType.DPMPP2MAYS,
  euler_a_ays: SamplerType.EulerAAYS,
  dpmpp_sde_ays: SamplerType.DPMPPSDEAYS,
  dpmpp_2m_trailing: SamplerType.DPMPP2MTrailing,
  ddim_trailing: SamplerType.DDIMTrailing,
  unipc_trailing: SamplerType.UniPCTrailing,
  unipc_ays: SamplerType.UniPCAYS,
  tcd_trailing: SamplerType.TCDTrailing,
};

export const SAMPLER_NAMES: Record<number, string> = {
  [SamplerType.DPMPP2MKarras]: 'dpmpp_2m_karras',
  [SamplerType.EulerA]: 'euler_a',
  [SamplerType.DDIM]: 'ddim',
  [SamplerType.PLMS]: 'plms',
  [SamplerType.DPMPPSDEKarras]: 'dpmpp_sde_karras',
  [SamplerType.UniPC]: 'unipc',
  [SamplerType.LCM]: 'lcm',
  [SamplerType.EulerASubstep]: 'euler_a_substep',
  [SamplerType.DPMPPSDESubstep]: 'dpmpp_sde_substep',
  [SamplerType.TCD]: 'tcd',
  [SamplerType.EulerATrailing]: 'euler_a_trailing',
  [SamplerType.DPMPPSDETrailing]: 'dpmpp_sde_trailing',
  [SamplerType.DPMPP2MAYS]: 'dpmpp_2m_ays',
  [SamplerType.EulerAAYS]: 'euler_a_ays',
  [SamplerType.DPMPPSDEAYS]: 'dpmpp_sde_ays',
  [SamplerType.DPMPP2MTrailing]: 'dpmpp_2m_trailing',
  [SamplerType.DDIMTrailing]: 'ddim_trailing',
  [SamplerType.UniPCTrailing]: 'unipc_trailing',
  [SamplerType.UniPCAYS]: 'unipc_ays',
  [SamplerType.TCDTrailing]: 'tcd_trailing',
};

export function resolveSampler(s: string | undefined): SamplerType {
  if (!s) return SamplerType.DPMPP2MKarras;
  return SAMPLER_MAP[s] ?? SamplerType.DPMPP2MKarras;
}

export function parseSamplerType(value: number): string {
  return SAMPLER_NAMES[value] ?? 'dpmpp_2m_karras';
}
