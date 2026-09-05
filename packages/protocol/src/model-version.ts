export class ModelVersion {
  constructor(private version: string) {}

  get resDptShift(): boolean {
    return ['flux1','sd3','hidream_i1','qwen_image','z_image','flux2','flux2_4b','flux2_9b'].includes(this.version);
  }
  get video(): boolean {
    return ['hunyuan_video','wan_v2.1_1.3b','wan_v2.1_14b','svd_i2v','ltx2','ltx2_3','ltx2.3'].includes(this.version);
  }
  get numFramesStep(): number {
    if (this.version === 'svd_i2v') return 1;
    if (['ltx2','ltx2_3','ltx2.3'].includes(this.version)) return 8;
    return 4;
  }
  get teaCache(): boolean {
    return ['flux1','hidream_i1','wan_v2.1_1.3b','wan_v2.1_14b','hunyuan_video'].includes(this.version);
  }
  get speedUp(): boolean {
    return ['flux1','hidream_i1','hunyuan_video','qwen_image','flux2','flux2_4b','flux2_9b'].includes(this.version);
  }
  get clipL(): boolean {
    return ['flux1','hidream_i1','sd3'].includes(this.version);
  }
  get openClipG(): boolean {
    return this.version === 'sd3';
  }
  get svd(): boolean {
    return this.version === 'svd_i2v';
  }
  get causalInference(): boolean {
    return ['wan_v2.1_1.3b','wan_v2.1_14b'].includes(this.version);
  }
  get sdxl(): boolean {
    return ['sdxl_base_v0.9','sdxl_refiner_v0.9'].includes(this.version);
  }
}
