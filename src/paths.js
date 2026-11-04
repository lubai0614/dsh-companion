import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** `$DSH_HOME` 或 `~/.dsh` */
export function resolveDshHome() {
  if (process.env.DSH_HOME && process.env.DSH_HOME.trim()) {
    return path.resolve(process.env.DSH_HOME.trim());
  }
  return path.join(os.homedir(), '.dsh');
}

/** `$DSH_HOME/dsh-companion` */
export function resolveDataRoot() {
  return path.join(resolveDshHome(), 'dsh-companion');
}

export function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function ensureDataRoot() {
  const root = resolveDataRoot();
  fs.mkdirSync(root, { recursive: true });
  return root;
}

/** `$DSH_HOME/dsh-companion/dsh-companion.sqlite` */
export function resolveDefaultDbPath() {
  return path.join(resolveDataRoot(), 'dsh-companion.sqlite');
}

/** 插件包根（含 `models/` 随包目录）。 */
export function resolvePluginRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

/** 插件内随包模型目录：`plugins/dsh-companion/models` */
export function resolveBundledModelDir() {
  return path.join(resolvePluginRoot(), 'models');
}

/**
 * 数据根模型落出目录（仅自带文件落出，不远程下载）。
 * `$DSH_HOME/dsh-companion/models`
 */
export function resolveModelCacheDir() {
  const dir = path.join(resolveDataRoot(), 'models');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 某 model_id 在目录下是否已有可读权重（config.json）。 */
export function modelFilesPresent(modelsRoot, modelId) {
  const cfg = path.join(modelsRoot, modelId, 'config.json');
  try {
    return fs.statSync(cfg).isFile();
  } catch {
    return false;
  }
}

/** 最近一次装配召回 trace（只留一条）。`$DSH_HOME/dsh-companion/last-assemble-trace.json` */
export function resolveLastAssembleTracePath() {
  return path.join(resolveDataRoot(), 'last-assemble-trace.json');
}

/** 控制台专用会话工作目录：`$DSH_HOME/dsh-companion/console` */
export function resolveConsoleCwd() {
  const dir = path.join(resolveDataRoot(), 'console');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 固定控制台会话 id 落盘：`$DSH_HOME/dsh-companion/console-session.json` */
export function resolveConsoleSessionStatePath() {
  return path.join(resolveDataRoot(), 'console-session.json');
}
