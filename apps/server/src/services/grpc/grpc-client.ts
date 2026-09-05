// gRPC klient pro DrawThings (port starého proxy/src/grpc-client.ts).
//
// Rozdíly proti starému kódu:
// - žádná hardcoded absolutní cesta k certu ani host/port – vše z configu,
// - proto soubor se hledá relativně k monorepu (packages/protocol),
// - lazy singleton za GrpcPort interfacem (reset pro testy).
//
// Wire protokol (proto/fbs) se nemění.

import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadSslCert } from "../../config.js";
import type { ServerConfig } from "../../config.js";
import type { EchoResult, GenerationPhase, GrpcPort, StreamCallbacks } from "./grpc-port.js";

const ECHO_DEADLINE_SEC = 5;
const GENERATE_DEADLINE_SEC = 120;
const FILES_EXIST_DEADLINE_SEC = 10;
const UPLOAD_DEADLINE_SEC = 300;
const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;

function resolveProtoPath(): string {
  const candidates: string[] = [];
  if (process.env.GRPC_PROTO_PATH?.trim()) {
    candidates.push(path.resolve(process.env.GRPC_PROTO_PATH.trim()));
  }
  // apps/server/src/services/grpc → repo root → packages/protocol
  candidates.push(path.resolve(import.meta.dir, "../../../../../packages/protocol/proto/imageService.proto"));
  // fallback: běh z kořene repa
  candidates.push(path.resolve(process.cwd(), "packages/protocol/proto/imageService.proto"));
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`imageService.proto not found (tried: ${candidates.join(", ")})`);
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}

function buildClient(config: ServerConfig): any {
  const packageDefinition = protoLoader.loadSync(resolveProtoPath(), {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const proto = grpc.loadPackageDefinition(packageDefinition) as any;
  const address = `${config.dtHost}:${config.dtPort}`;

  const channelOptions: grpc.ChannelOptions = {
    "grpc.max_send_message_length": 64 * 1024 * 1024,
    "grpc.max_receive_message_length": 64 * 1024 * 1024,
  };

  if (config.dtApiKey) {
    channelOptions["grpc.primary_user_agent"] = `secret=${config.dtApiKey}`;
  }

  // Node TLS odmítá IP v SNI servername – DT cert je vydaný na hostname,
  // takže pro IP hosta zachováme ověření proti "localhost" (stejné jako
  // staré proxy s default hostem localhost).
  if (isIpLiteral(config.dtHost)) {
    channelOptions["grpc.ssl_target_name_override"] = "localhost";
  }

  const rootCa = loadSslCert(config.sslCertPath);
  return new proto.ImageGenerationService(
    address,
    grpc.credentials.createSsl(Buffer.from(rootCa)),
    channelOptions,
  );
}

export function createGrpcPort(config: ServerConfig): GrpcPort {
  let client: any = null;
  const getClient = (): any => {
    if (!client) client = buildClient(config);
    return client;
  };
  return {
    echo(): Promise<EchoResult> {
      return new Promise((resolve, reject) => {
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + ECHO_DEADLINE_SEC);
        getClient().Echo({ name: "opendraw" }, { deadline }, (err: any, response: any) => {
          if (err) reject(err);
          else resolve(response as EchoResult);
        });
      });
    },
    reset(): void {
      if (client) {
        try {
          client.close();
        } catch {
          // ignoruj – klient se zahazuje tak jako tak
        }
        client = null;
      }
    },
    generateImageStream(
      request: unknown,
      callbacks?: StreamCallbacks,
      onCancel?: (cancel: () => void) => void,
    ): Promise<Buffer[]> {
      return generateImageStream(getClient(), request, callbacks, onCancel);
    },
    checkLorasExist(files: string[]): Promise<Map<string, boolean>> {
      return checkLorasExist(getClient(), config, files);
    },
    uploadLoraFile(filePath: string, fileName: string): Promise<boolean> {
      return uploadLoraFile(getClient(), config, filePath, fileName);
    },
  };
}

// ChunkState enum (z imageService.proto: LAST_CHUNK = 0, MORE_CHUNKS = 1)
const LAST_CHUNK = 0;
const MORE_CHUNKS = 1;
const MORE_CHUNKS_STR = "MORE_CHUNKS";

function isMoreChunks(state: unknown): boolean {
  return state === MORE_CHUNKS || state === MORE_CHUNKS_STR;
}

function sharedSecret(config: ServerConfig): string | undefined {
  return config.dtApiKey?.trim() || undefined;
}

/**
 * Generate přes Draw Things `GenerateImage` (port starého generateImageStream).
 *
 * Vrací jeden Buffer na vygenerovaný tenzor (kompletní, 68B hlavička +
 * payload) – chunky se skládají transparentně podle `chunkState` (server ho
 * posílá, když se tenzor nevejde do jedné gRPC zprávy). `previewImage` zprávy
 * se předávají do `onPreview`, nikdy nejsou finální výstup.
 */
function generateImageStream(
  client: any,
  request: unknown,
  callbacks?: StreamCallbacks,
  onCancel?: (cancel: () => void) => void,
): Promise<Buffer[]> {
  const tensors: Buffer[] = [];
  let pending: Buffer | null = null;
  let previewCount = 0;

  const req = request as Record<string, unknown>;
  console.log("[grpc] GenerateImage call started");
  console.log("[grpc] request.prompt length:", (req.prompt as string | undefined)?.length);
  console.log("[grpc] request.negativePrompt length:", (req.negativePrompt as string | undefined)?.length);
  console.log(
    "[grpc] request.configuration length:",
    (req.configuration as { length?: number } | undefined)?.length,
  );

  return new Promise((resolve, reject) => {
    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + GENERATE_DEADLINE_SEC);

    const call = client.GenerateImage(request, { deadline });
    // Registrace cancel funkce pro routu (cancel při disconnectu klienta).
    if (onCancel) {
      onCancel(() => {
        console.log("[grpc] cancelling GenerateImage call");
        call.cancel();
      });
    }

    call.on("data", (response: any) => {
      if (response.generatedImages && response.generatedImages.length) {
        const totalBytes = response.generatedImages.reduce(
          (s: number, p: any) => s + (p?.length || p?.byteLength || 0),
          0,
        );
        console.log(
          `[grpc] response: parts=${response.generatedImages.length} ` +
            `bytes=${totalBytes} chunkState=${response.chunkState} ` +
            `pending=${pending ? pending.length : 0}`,
        );
        const combined = Buffer.concat(
          response.generatedImages.map((p: any) => Buffer.from(p)),
        );
        if (isMoreChunks(response.chunkState)) {
          pending = pending ? Buffer.concat([pending, combined]) : combined;
        } else {
          const final = pending ? Buffer.concat([pending, combined]) : combined;
          pending = null;
          tensors.push(final);
        }
      }
      if (response.previewImage) {
        previewCount++;
        const previewBuf = Buffer.from(response.previewImage);
        if (callbacks?.onPreview) {
          callbacks.onPreview(previewBuf);
        }
      }
      if (response.currentSignpost) {
        const signpost = response.currentSignpost;
        let phase: GenerationPhase | null = null;
        let step: number | undefined;

        if (signpost.textEncoded !== undefined) {
          phase = "textEncoded";
        } else if (signpost.imageEncoded !== undefined) {
          phase = "imageEncoded";
        } else if (signpost.sampling !== undefined) {
          phase = "sampling";
          step = signpost.sampling.step;
        } else if (signpost.imageDecoded !== undefined) {
          phase = "imageDecoded";
        } else if (signpost.secondPassImageEncoded !== undefined) {
          phase = "secondPassImageEncoded";
        } else if (signpost.secondPassSampling !== undefined) {
          phase = "secondPassSampling";
          step = signpost.secondPassSampling.step;
        } else if (signpost.secondPassImageDecoded !== undefined) {
          phase = "secondPassImageDecoded";
        } else if (signpost.faceRestored !== undefined) {
          phase = "faceRestored";
        } else if (signpost.imageUpscaled !== undefined) {
          phase = "imageUpscaled";
        }

        if (phase && callbacks?.onSignpost) {
          callbacks.onSignpost(phase, step);
        }

        // Zpětná kompatibilita pro onProgress volající.
        if (
          (phase === "sampling" || phase === "secondPassSampling") &&
          step !== undefined &&
          callbacks?.onProgress
        ) {
          callbacks.onProgress(step, 0);
        }
      }
      if (response.remoteDownload && callbacks?.onRemoteDownload) {
        const dl = response.remoteDownload;
        callbacks.onRemoteDownload(dl.bytesReceived, dl.bytesExpected, dl.item, dl.itemsExpected);
      }
      if (response.generatedAudio && response.generatedAudio.length) {
        console.log("[grpc] received audio data, parts:", response.generatedAudio.length);
      }
    });

    call.on("status", (status: any) => {
      console.log("[grpc] status:", status.code, status.details);
    });

    call.on("end", () => {
      if (pending) {
        console.log("[grpc] stream ended with pending tensor, flushing");
        tensors.push(pending);
        pending = null;
      }
      console.log(
        "[grpc] stream ended, total tensors:",
        tensors.length,
        "previews:",
        previewCount,
      );
      resolve(tensors);
    });
    call.on("error", (err: any) => {
      console.log("[grpc] ERROR code:", err.code, "details:", err.details);
      reject(err);
    });
  });
}

function checkLorasExist(
  client: any,
  config: ServerConfig,
  loraFiles: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  if (!loraFiles.length) return Promise.resolve(result);

  return new Promise((resolve, reject) => {
    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + FILES_EXIST_DEADLINE_SEC);

    const request: any = { files: loraFiles };
    const secret = sharedSecret(config);
    if (secret) request.sharedSecret = secret;

    client.FilesExist(request, { deadline }, (err: any, response: any) => {
      if (err) {
        console.log("[lora-upload] FilesExist error:", err.message);
        reject(err);
        return;
      }
      const files: string[] = response.files ?? [];
      const existences: boolean[] = response.existences ?? [];
      for (let i = 0; i < files.length; i++) {
        result.set(files[i], existences[i] ?? false);
      }
      for (const f of loraFiles) {
        if (!result.has(f)) result.set(f, false);
      }
      resolve(result);
    });
  });
}

function uploadLoraFile(
  client: any,
  config: ServerConfig,
  filePath: string,
  fileName: string,
): Promise<boolean> {
  const fileBuffer = fs.readFileSync(filePath);
  const totalSize = fileBuffer.length;
  const sha256Hash = crypto.createHash("sha256").update(fileBuffer).digest();
  const secret = sharedSecret(config);

  console.log(
    `[lora-upload] uploading "${fileName}" (${totalSize} bytes, sha256=${sha256Hash.toString("hex").slice(0, 16)}...)`,
  );

  return new Promise((resolve, reject) => {
    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + UPLOAD_DEADLINE_SEC);

    const call = client.UploadFile({ deadline });

    const initRequest: any = {
      initRequest: {
        filename: fileName,
        sha256: sha256Hash,
        totalSize,
      },
    };
    if (secret) initRequest.sharedSecret = secret;
    call.write(initRequest);

    let offset = 0;
    while (offset < totalSize) {
      const end = Math.min(offset + UPLOAD_CHUNK_SIZE, totalSize);
      const chunk = fileBuffer.subarray(offset, end);
      const chunkMsg: any = {
        chunk: {
          content: chunk,
          filename: fileName,
          offset,
        },
      };
      if (secret) chunkMsg.sharedSecret = secret;
      call.write(chunkMsg);
      offset = end;
    }

    call.end();

    call.on("data", (response: any) => {
      if (response.chunkUploadSuccess === false) {
        console.log(`[lora-upload] chunk upload failed for "${fileName}": ${response.message}`);
      }
    });

    call.on("end", () => {
      console.log(`[lora-upload] upload of "${fileName}" completed`);
      resolve(true);
    });

    call.on("error", (err: any) => {
      console.log(`[lora-upload] upload error for "${fileName}":`, err.message);
      reject(err);
    });
  });
}
