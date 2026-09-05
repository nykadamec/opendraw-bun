// ThumbnailProvider – generování náhledů za interfacem (F2).
//
// Staré proxy mělo dvě kopie stejného sharp pipeline (canvas-store.ts
// `generateThumbnail` → null při chybě, index.ts `makeThumbnail` → prázdný
// Buffer). Obě zachovány: `generate` vrací null, `make` fallbackuje na
// `Buffer.alloc(0)`. Parametry pipeline (200px inside, jpeg q75) 1:1.

import sharp from "sharp";

export interface ThumbnailProvider {
  /** Náhled, nebo null když vstup není dekódovatelný obrázek. */
  generate(image: Buffer): Promise<Buffer | null>;
  /** Náhled, nikdy null (fallback `Buffer.alloc(0)`) – pro routy. */
  make(image: Buffer): Promise<Buffer>;
}

export class SharpThumbnailProvider implements ThumbnailProvider {
  async generate(image: Buffer): Promise<Buffer | null> {
    try {
      return await sharp(image)
        .resize(200, 200, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
    } catch {
      return null;
    }
  }

  async make(image: Buffer): Promise<Buffer> {
    return (await this.generate(image)) ?? Buffer.alloc(0);
  }
}

let instance: ThumbnailProvider | null = null;

export function getThumbnailProvider(): ThumbnailProvider {
  if (!instance) instance = new SharpThumbnailProvider();
  return instance;
}

/** Pro testy (pixel-parity ověření). */
export function setThumbnailProvider(provider: ThumbnailProvider | null): void {
  instance = provider;
}

/** 1:1 se starým `generateThumbnail` z canvas-store.ts. */
export function generateThumbnail(image: Buffer): Promise<Buffer | null> {
  return getThumbnailProvider().generate(image);
}

/** 1:1 se starým `makeThumbnail` z index.ts. */
export function makeThumbnail(image: Buffer): Promise<Buffer> {
  return getThumbnailProvider().make(image);
}
