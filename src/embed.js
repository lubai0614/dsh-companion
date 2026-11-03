/**
 * 句向量：随包小模本地加载；禁止运行时远程下模。
 * 测试可 setEmbedFunction 注入假实现（仅 tests/）。
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  modelFilesPresent,
  resolveBundledModelDir,
  resolveModelCacheDir,
} from './paths.js';

/** @type {null | ((text: string) => Promise<Float32Array>)} */
let embedOverride = null;

/** @type {Promise<any> | null} */
let pipelinePromise = null;

/**
 * @param {null | ((text: string) => Promise<Float32Array>)} fn
 */
export function setEmbedFunction(fn) {
  embedOverride = fn;
  pipelinePromise = null;
}

export { resolveBundledModelDir, resolveModelCacheDir };

function logEmbedFail(reason, extra = {}) {
  console.warn('[dsh-companion][embed]', reason, extra);
}

/**
 * 选用本地模型根：数据根已落出优先，否则插件随包目录。
 * @param {string} modelId
 */
export function resolveLocalModelRoot(modelId) {
  const dataRoot = resolveModelCacheDir();
  const bundled = resolveBundledModelDir();
  if (modelFilesPresent(dataRoot, modelId)) return dataRoot;
  if (modelFilesPresent(bundled, modelId)) return bundled;
  return null;
}

/**
 * 预热：本地加载 + 一次假推理。失败打日志，不假装已就绪。
 * @param {object} [opts]
 * @param {string} [opts.modelId]
 */
export async function prefetchEmbedModel(opts = {}) {
  const modelId = opts.modelId || 'Xenova/bge-small-zh-v1.5';
  const bundled = resolveBundledModelDir();
  const dataRoot = resolveModelCacheDir();
  try {
    const vec = await embedText('装机预热', { modelId });
    return {
      modelId,
      dims: vec.length,
      localRoot: resolveLocalModelRoot(modelId),
      bundled,
      dataRoot,
    };
  } catch (err) {
    logEmbedFail('prefetch failed', {
      modelId,
      bundled,
      dataRoot,
      reason: String(err?.message ?? err),
    });
    throw err;
  }
}

function float32FromOutput(output) {
  const data = output?.data ?? output;
  if (data instanceof Float32Array) return data;
  if (ArrayBuffer.isView(data)) {
    return new Float32Array(data.buffer, data.byteOffset, data.byteLength / 4);
  }
  if (Array.isArray(data)) return Float32Array.from(data);
  throw new Error('unexpected embed output shape');
}

/**
 * @param {string} modelId
 */
async function getPipeline(modelId) {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const bundled = resolveBundledModelDir();
      const dataRoot = resolveModelCacheDir();
      const localRoot = resolveLocalModelRoot(modelId);

      if (!localRoot) {
        const msg =
          `embed model missing (${modelId}): no config.json under bundled or data models`;
        logEmbedFail(msg, { bundled, dataRoot });
        pipelinePromise = null;
        throw new Error(
          `${msg}; bundled=${bundled}; dataModels=${dataRoot}; remote download disabled`,
        );
      }

      // 数据根尚无该模、随包有 → 落到数据根（仅复制自带文件，不联网）
      if (localRoot === bundled && !modelFilesPresent(dataRoot, modelId)) {
        try {
          fs.cpSync(path.join(bundled, modelId), path.join(dataRoot, modelId), {
            recursive: true,
          });
        } catch (err) {
          logEmbedFail('copy bundled model to data root failed', {
            modelId,
            bundled,
            dataRoot,
            reason: String(err?.message ?? err),
          });
          // 仍可直接从 bundled 读
        }
      }

      const loadRoot = modelFilesPresent(dataRoot, modelId) ? dataRoot : bundled;

      try {
        const { pipeline, env } = await import('@xenova/transformers');
        env.allowRemoteModels = false;
        env.allowLocalModels = true;
        env.localModelPath = loadRoot;
        env.cacheDir = dataRoot;

        return await pipeline('feature-extraction', modelId, {
          quantized: true,
        });
      } catch (err) {
        pipelinePromise = null;
        const reason = String(err?.message ?? err);
        logEmbedFail('embed model load failed', {
          modelId,
          loadRoot,
          bundled,
          dataRoot,
          reason,
        });
        throw new Error(
          `embed model load failed (${modelId}): ${reason}. ` +
            `loadRoot=${loadRoot}; bundled=${bundled}; dataModels=${dataRoot}; remote download disabled`,
        );
      }
    })();
  }
  return pipelinePromise;
}

/**
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.modelId]
 * @returns {Promise<Float32Array>}
 */
export async function embedText(text, opts = {}) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new Error('embedText: empty text');

  if (embedOverride) {
    return embedOverride(raw);
  }

  const modelId = opts.modelId || 'Xenova/bge-small-zh-v1.5';
  const extractor = await getPipeline(modelId);
  const output = await extractor(raw, {
    pooling: 'mean',
    normalize: true,
  });
  return float32FromOutput(output);
}

export function cosineSimilarity(a, b) {
  if (!(a instanceof Float32Array) || !(b instanceof Float32Array)) {
    throw new Error('cosineSimilarity expects Float32Array');
  }
  if (a.length !== b.length) throw new Error('vector dims mismatch');
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function vectorToBlob(vec) {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function blobToVector(blob) {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
