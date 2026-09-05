// POST /api/generate – generování přes DrawThings se SSE (F4).
//
// Kontrakt 1:1 se starým proxy `index.ts`:
//   request body = GenerateRequest (prompt, negativePrompt, model, sampler,
//     steps, cfg, seed, batchCount, width, height, loras, shift, clipSkip,
//     resolutionDependentShift, saveToGallery, seedMode, upscaler, …,
//     hiresFix*, tiled*, …),
//   SSE eventy: `progress` {phase, step, total}, `preview` {data: base64 PNG},
//     `complete` {id, imageBase64, seed, elapsed, index, total},
//     `error` {message}, `lora-upload` {file, status, error?},
//   `saveToGallery: false` → neukládá do galerie, `complete.id = null`.
//
// Průběh: modelVersion (echo override.models → cloud-models fallback) →
// fbs-config → LoRA check/upload → generateImageStream → decode → save →
// complete. Cancel gRPC streamu při disconnectu klienta (SSE close / abort).

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import type { ServerConfig } from "../config.js";
import type { GrpcPort } from "../services/grpc/grpc-port.js";
import type { GalleryStore } from "../services/storage/gallery-store.js";
import { decodeDtTensorToPng } from "../services/dt/dt-tensor.js";
import { getCloudModels } from "../services/cloud-models.js";
import { findLoraFile } from "../services/lora/lora-files.js";
import { buildGenerationConfiguration } from "@opendraw/protocol/src/fbs-config.js";

interface LoraRef {
  file: string;
  weight: number;
  mode?: string;
}

const log = (...args: unknown[]): void => {
  console.log("[generate]", ...args);
};

export function generateRoutes(grpc: GrpcPort, config: ServerConfig, gallery: GalleryStore): Hono {
  const app = new Hono();

  app.post("/api/generate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, any>;
    const {
      prompt,
      negativePrompt,
      model,
      sampler,
      steps,
      cfg,
      seed,
      batchCount,
      width,
      height,
      loras,
      shift,
      clipSkip,
      resolutionDependentShift,
      saveToGallery,
      seedMode,
      upscaler,
      upscalerScaleFactor,
      strength,
      stochasticSamplingGamma,
      numFrames,
      cfgZeroStar,
      maskBlur,
      originalImageHeight,
      originalImageWidth,
      negativeOriginalImageHeight,
      negativeOriginalImageWidth,
      refinerModel,
      refinerStart,
      tiledDecoding,
      tiledDiffusion,
      decodingTileWidth,
      decodingTileHeight,
      decodingTileOverlap,
      diffusionTileWidth,
      diffusionTileHeight,
      diffusionTileOverlap,
      hiresFix,
      hiresFixWidth,
      hiresFixHeight,
      hiresFixStrength,
    } = body;

    log("--- /api/generate ---");
    log("prompt:", (prompt as string | undefined)?.slice(0, 80));
    log("model:", model);
    log("sampler:", sampler);
    log("steps:", steps);
    log("cfg:", cfg);
    log("seed:", seed);
    log("batchCount:", batchCount);
    log("width x height:", `${width} x ${height}`);
    log("loras count:", (loras as LoraRef[] | undefined)?.length || 0);
    if ((loras as LoraRef[] | undefined)?.length) {
      (loras as LoraRef[]).forEach((l, i) => log(`  lora[${i}]:`, l.file, "weight:", l.weight));
    }
    log("strength:", strength);
    log("stochasticSamplingGamma:", stochasticSamplingGamma);
    log("numFrames:", numFrames);
    log("cfgZeroStar:", cfgZeroStar);

    const encoder = new TextEncoder();
    let grpcCancel: (() => void) | null = null;
    let clientDisconnected = false;
    let closed = false;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const sendSSE = (event: string, data: unknown): void => {
          if (closed || clientDisconnected) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            // stream už zavřený (disconnect) – zbytek pipeline se zastaví
          }
        };
        const finish = (): void => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            // ignoruj – disconnect už stream ukončil
          }
        };

        const onAbort = (): void => {
          if (closed) return;
          log("client disconnected, cancelling gRPC stream");
          clientDisconnected = true;
          if (grpcCancel) grpcCancel();
        };
        c.req.raw.signal.addEventListener("abort", onAbort, { once: true });

        void run();
        return;

        async function run(): Promise<void> {
          try {
            let modelVersion: string | undefined;
            try {
              const echoResult = await grpc.echo();
              if (echoResult.override?.models) {
                const models = JSON.parse(
                  Buffer.from(echoResult.override.models, "base64").toString("utf-8"),
                );
                const found = (models as unknown[]).find((m: unknown) => {
                  if (m && typeof m === "object" && m !== null) {
                    const mm = m as Record<string, unknown>;
                    return mm.file === model || mm.name === model;
                  }
                  return false;
                });
                if (found && typeof found === "object" && found !== null) {
                  const fm = found as Record<string, unknown>;
                  modelVersion = typeof fm.version === "string" ? fm.version : undefined;
                }
              }
            } catch {
              // echo selhalo – zkus cloud fallback, pak bez verze
            }
            if (!modelVersion && model) {
              const cloudMatch = getCloudModels().find(
                (cm) => cm.file === model || cm.name === model,
              );
              if (cloudMatch) {
                modelVersion = cloudMatch.version;
              }
            }

            if (clientDisconnected) return; // abort během echo – nepokračovat
            const { buffer: configBuffer, config: resolvedConfig } =
              buildGenerationConfiguration({
                model,
                version: modelVersion,
                sampler,
                steps,
                cfg: cfg ?? 3.5,
                seed: seed ?? -1,
                batchCount: batchCount || 1,
                width: width || 1024,
                height: height || 1024,
                loras: loras || [],
                shift: shift ?? 1.0,
                clipSkip: clipSkip ?? 1,
                resolutionDependentShift:
                  resolutionDependentShift !== undefined ? resolutionDependentShift : true,
                seedMode,
                upscaler,
                upscalerScaleFactor,
                strength,
                stochasticSamplingGamma,
                numFrames,
                cfgZeroStar,
                maskBlur,
                originalImageHeight,
                originalImageWidth,
                negativeOriginalImageHeight,
                negativeOriginalImageWidth,
                refinerModel,
                refinerStart,
                tiledDecoding,
                tiledDiffusion,
                decodingTileWidth,
                decodingTileHeight,
                decodingTileOverlap,
                diffusionTileWidth,
                diffusionTileHeight,
                diffusionTileOverlap,
                hiresFix,
                hiresFixWidth,
                hiresFixHeight,
                hiresFixStrength,
              });

            if ((loras as LoraRef[] | undefined)?.length) {
              const loraFiles = (loras as LoraRef[]).map((l) => l.file);
              log("checking LoRA existence on server:", loraFiles.join(", "));

              try {
                const existenceMap = await grpc.checkLorasExist(loraFiles);

                for (const lora of loras as LoraRef[]) {
                  if (clientDisconnected) return;
                  if (!existenceMap.get(lora.file)) {
                    log(`LoRA "${lora.file}" not on server, uploading...`);
                    if (!config.modelsDir) {
                      log("WARNING: models dir not found, skipping upload");
                      continue;
                    }
                    const localPath = await findLoraFile(config.modelsDir, lora.file);
                    if (localPath) {
                      try {
                        await grpc.uploadLoraFile(localPath, lora.file);
                        log(`LoRA "${lora.file}" uploaded successfully`);
                        sendSSE("lora-upload", { file: lora.file, status: "uploaded" });
                      } catch (uploadErr: unknown) {
                        const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
                        log(`WARNING: LoRA upload failed for "${lora.file}": ${msg}`);
                        sendSSE("lora-upload", { file: lora.file, status: "failed", error: msg });
                      }
                    } else {
                      log(`WARNING: LoRA "${lora.file}" not found locally, skipping upload`);
                    }
                  } else {
                    log(`LoRA "${lora.file}" already on server`);
                  }
                }
              } catch (checkErr: unknown) {
                const msg = checkErr instanceof Error ? checkErr.message : String(checkErr);
                log(`WARNING: FilesExist check failed: ${msg}`);
              }
            }

            if (clientDisconnected) return; // abort během LoRA fáze – negenerovat
            const grpcRequest = {
              prompt: prompt || "",
              negativePrompt: negativePrompt || "",
              configuration: configBuffer,
              user: "opendraw",
              device: "LAPTOP",
              chunked: true,
            };

            log("sending gRPC request to Draw Things (chunked=true)");
            log("config bytes length:", configBuffer.length);
            log("config hex:", configBuffer.toString("hex"));

            const total = steps || 28;
            const tensors = await grpc.generateImageStream(
              grpcRequest,
              {
                onSignpost: (phase, step) => {
                  log("signpost:", phase, step ?? "");
                  sendSSE("progress", { phase, step, total });
                },
                onPreview: (previewBuf) => {
                  decodeDtTensorToPng(previewBuf)
                    .then((pngBuf) => sendSSE("preview", { data: pngBuf.toString("base64") }))
                    .catch((err) => log("preview decode error:", err));
                },
              },
              (cancel) => {
                grpcCancel = cancel;
                if (clientDisconnected) {
                  log("client already disconnected, cancelling gRPC stream immediately");
                  cancel();
                }
              },
            );

            log("received", tensors.length, "tensors from Draw Things");

            if (!tensors.length) {
              sendSSE("error", { message: "No image tensors returned by Draw Things" });
              finish();
              return;
            }

            const shouldSave = saveToGallery !== false;
            for (let i = 0; i < tensors.length; i++) {
              if (clientDisconnected) return;
              const id = uuidv4();
              const tensor = tensors[i];
              log(`decoding tensor ${i + 1}/${tensors.length} (${tensor.length} bytes) → PNG`);
              const pngBuffer = await decodeDtTensorToPng(tensor);
              const effectiveSeed = seed ?? Math.floor(Math.random() * 2147483647);

              if (shouldSave) {
                await gallery.save(id, pngBuffer, {
                  prompt: prompt || "",
                  negativePrompt: negativePrompt || "",
                  model: model || "",
                  width: width || 1024,
                  height: height || 1024,
                  seed: effectiveSeed,
                  source: "generated",
                  sampler: sampler || "euler",
                  steps: steps || 28,
                  cfg: cfg ?? 3.5,
                  loras: loras || [],
                  shift: shift ?? 1.0,
                  clipSkip: clipSkip ?? 1,
                  seedMode,
                  resolutionDependentShift:
                    resolutionDependentShift !== undefined ? resolutionDependentShift : true,
                  upscaler,
                  upscalerScaleFactor,
                  strength,
                  stochasticSamplingGamma,
                  cfgZeroStar,
                  hiresFix,
                  hiresFixWidth,
                  hiresFixHeight,
                  hiresFixStrength,
                  generationConfig: resolvedConfig as Record<string, unknown>,
                });

                log("saved image", i + 1, "/", tensors.length, "->", id);
              } else {
                log("skipped saving image", i + 1, "/", tensors.length, "(saveToGallery=false)");
              }

              sendSSE("complete", {
                id: shouldSave ? id : null,
                imageBase64: pngBuffer.toString("base64"),
                seed: effectiveSeed,
                elapsed: 0,
                index: i,
                total: tensors.length,
              });
            }

            log("--- /api/generate done ---");
            finish();
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (clientDisconnected) {
              log("gRPC cancelled after client disconnect, skipping SSE error");
              return;
            }
            const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
            const details =
              err && typeof err === "object" && "details" in err ? err.details : undefined;
            const stack = err instanceof Error ? err.stack : undefined;
            log("ERROR in /api/generate:", message);
            log("ERROR details:", err);
            if (code) log("ERROR code:", code);
            if (details) log("ERROR details:", details);
            if (stack) log("ERROR stack:", stack);
            sendSSE("error", { message });
            finish();
          }
        }
      },
      cancel() {
        if (closed) return;
        log("client disconnected (stream cancel), cancelling gRPC stream");
        clientDisconnected = true;
        if (grpcCancel) grpcCancel();
      },
    });

    return c.body(stream, 200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  });

  return app;
}
