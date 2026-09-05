// GrpcPort – hranice mezi serverem a DrawThings gRPC.
// F1: Echo. F4: generateImageStream (chunkState skládání, progress/preview/
// remoteDownload, cancel) + LoRA check/upload. Implementace: ./grpc-client.ts
// (lazy singleton, TLS z configu). Wire protokol (proto/fbs) se nemění.

export interface EchoResult {
  message: string;
  files: string[];
  serverIdentifier: string;
  sharedSecretMissing: boolean;
  thresholds?: { community: number; plus: number; expireAt: number };
  override?: {
    models?: string; // base64 JSON
    loras?: string;
    controlNets?: string;
    textualInversions?: string;
    upscalers?: string;
  };
}

// ChunkState z imageService.proto: LAST_CHUNK = 0, MORE_CHUNKS = 1
// (server posílá i stringovou variantu).
export type GenerationPhase =
  | "textEncoded"
  | "imageEncoded"
  | "sampling"
  | "imageDecoded"
  | "secondPassImageEncoded"
  | "secondPassSampling"
  | "secondPassImageDecoded"
  | "faceRestored"
  | "imageUpscaled";

export interface StreamCallbacks {
  onProgress?: (step: number, total: number) => void;
  onSignpost?: (phase: GenerationPhase, step?: number) => void;
  onPreview?: (image: Buffer) => void;
  onRemoteDownload?: (
    bytesReceived: number,
    bytesExpected: number,
    item: number,
    itemsExpected: number,
  ) => void;
}

export interface GrpcPort {
  /** DrawThings Echo – ověření spojení + seznam modelů na serveru. */
  echo(): Promise<EchoResult>;
  /**
   * Generate přes `GenerateImage` (chunked). Vrací jeden Buffer na vygenerovaný
   * tenzor (68B hlavička + payload) – chunky složené podle `chunkState`.
   * `previewImage` zprávy jdou do `onPreview`, nikdy nejsou finální výstup.
   * `onCancel` dostane cancel funkci (volat při disconnectu klienta).
   */
  generateImageStream(
    request: unknown,
    callbacks?: StreamCallbacks,
    onCancel?: (cancel: () => void) => void,
  ): Promise<Buffer[]>;
  /** FilesExist – které LoRA soubory server už má. */
  checkLorasExist(files: string[]): Promise<Map<string, boolean>>;
  /** Upload jedné LoRA (init + 4MB chunky, sha256). */
  uploadLoraFile(filePath: string, fileName: string): Promise<boolean>;
  /** Zahodí lazy klienta (změna configu, testy). */
  reset(): void;
}
