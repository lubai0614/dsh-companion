/** 宿主入口：数据根与库就绪；设置页；步 8 私聊/控制台挂点与 tick。 */
import { ensureDataRoot, resolveDefaultDbPath } from './paths.js';
import { openMemoryDb } from './db.js';
import { registerHostChatSurface } from './host/index.js';
import { registerSettingsHttp, setPluginTickActive } from './settings/index.js';

export {
  CONFIG_DEFAULTS,
  KINDS,
  SOURCES,
  SOURCE_LABEL_ZH,
} from './defaults.js';
export {
  resolveDshHome,
  resolveDataRoot,
  resolveDefaultDbPath,
  resolvePluginRoot,
  resolveBundledModelDir,
  resolveModelCacheDir,
  modelFilesPresent,
  ensureDataRoot,
  resolveLastAssembleTracePath,
  resolveConsoleCwd,
} from './paths.js';
export { MemoryDb, openMemoryDb } from './db.js';
export { findSuccessor, resolveCurrent, listCurrentByPeer } from './resolve.js';
export { remember, correct } from './write.js';
export { adjustWeight } from './weight.js';
export { promoteRemember, promoteCorrect } from './promote.js';
export {
  setEmbedFunction,
  embedText,
  cosineSimilarity,
  prefetchEmbedModel,
  resolveLocalModelRoot,
  vectorToBlob,
  blobToVector,
} from './embed.js';
export {
  upsertEmbeddingForEntry,
  deleteEmbedding,
  getEmbedding,
  loadTipEmbeddings,
  backfillEmbeddings,
} from './embedding-store.js';
export { rememberWithEmbed, correctWithEmbed } from './write-embed.js';
export { keywordSearchTips, vectorSearchTips, memorySearch } from './search.js';
export {
  localDayKey,
  shiftDayKey,
  dayKeysInLookback,
  addNearFragment,
  getNearFragment,
  listNearFragmentsByPeerDay,
  listRecentNearFragmentsByPeer,
  countNearFragmentsByPeerDay,
  getNearDigest,
  listRecentNearDigestsByPeer,
  upsertNearDigest,
  writeNearDigestIfFragments,
  listPeersWithFragmentsOnDay,
  listDigestJobsForDay,
  listDigestsForPromote,
} from './near.js';
export { SHORT_CONSTRAINTS_TEXT } from './short-constraints.js';
export { selectNearForInject, assembleContext, formatAssembleText } from './inject.js';
export {
  parseHhMm,
  localHhMmKey,
  isAtScheduledMinute,
  summarizeSchedOutcome,
  shouldAdvanceOnWake,
  withSchedLock,
  getSchedLockStatus,
  resetSchedLockForTests,
  TASKS,
  normalizeSchedTask,
  recordSchedRun,
  listSchedRuns,
  listSchedRunsPage,
  getLatestSchedRun,
  getLatestClosedSchedRun,
  getLatestProgressAt,
  isOpenOrganizeRun,
  listOpenOrganizeRuns,
  getActiveOrganizeTask,
  finalizeSchedRun,
  abandonOpenOrganizeRuns,
  completeOrganizeRun,
  createSchedRunner,
} from './sched/index.js';
export { saveLastAssembleTrace, loadLastAssembleTrace } from './trace-store.js';
export {
  readMemoryMetaPayload,
  readLtmListPayload,
  readNearListPayload,
  adjustMemoryWeightPayload,
  readConfigPayload,
  patchConfigPayload,
  readSchedStatusPayload,
  abandonSchedOrganizePayload,
  startSchedTaskPayload,
  readSchedRunsPayload,
  readLastAssembleTracePayload,
  registerSettingsHttp,
  setPluginTickActive,
  getPluginTickActive,
} from './settings/index.js';
export {
  naturalDaysBetween,
  listPeersWithEntries,
  listReassessCandidates,
  isRhythmDue,
  isGrowthDue,
  planScheduledReassess,
  markReassessComplete,
} from './reassess.js';
export {
  buildDigestConsolePrompt,
  buildPromoteConsolePrompt,
  buildReassessConsolePrompt,
  wakeConsoleSession,
  runDigestConsoleWake,
  runPromoteConsoleWake,
  runReassessConsoleWake,
} from './sched/console-wake.js';
export { installWakeHooks, getWakeHooks } from './sched/wake-hooks.js';
export {
  registerHostChatSurface,
  resolveChatPeerBucket,
  normalizeQqPeerId,
  extractUserQuery,
  INJECT_SOURCE_KIND,
  handleNearFragmentAdd,
  handleCorrect,
  handleListCurrent,
  handleMemorySearch,
  handleAssembleContext,
  handleAdjustWeight,
  handleNearFragmentsList,
  handleNearDigestWrite,
  handleDigestComplete,
  handleNearDigestsList,
  handlePromoteRemember,
  handlePromoteComplete,
  handleReassessPlan,
  handleReassessCandidatesList,
  handleReassessComplete,
  markConsoleSession,
  clearConsoleSessionsForTests,
  isConsoleSession,
  assertBooklet,
} from './host/index.js';

/**
 * @param {*} ctx
 */
export async function apply(ctx) {
  const root = ensureDataRoot();
  const dbPath = resolveDefaultDbPath();
  const db = openMemoryDb({ dbPath });
  db.close();

  const msg = `[dsh-companion] 数据根 ${root}；库 ${dbPath}（表与默认配置已就绪）`;
  if (ctx?.logger?.info) ctx.logger.info(msg);
  else console.info(msg);

  /** @type {Array<() => void>} */
  const disposers = [];

  if (ctx?.webServer?.register) {
    try {
      if (typeof ctx.effect === 'function') {
        ctx.effect(
          () => registerSettingsHttp(ctx),
          'dsh-companion: /api/dsh-companion',
        );
      } else {
        const off = registerSettingsHttp(ctx);
        if (typeof off === 'function') disposers.push(off);
      }
      setPluginTickActive(false);
      if (ctx.logger?.info) ctx.logger.info('[dsh-companion] 已挂设置页路由 /api/dsh-companion');
      else console.info('[dsh-companion] 已挂设置页路由 /api/dsh-companion');
    } catch (err) {
      const m = `[dsh-companion] 设置页路由未挂上：${err?.message || err}`;
      if (ctx?.logger?.warn) ctx.logger.warn(m);
      else console.warn(m);
    }
  } else {
    const m = '[dsh-companion] 无 webServer，设置页 HTTP 未挂（库层仍可用）';
    if (ctx?.logger?.warn) ctx.logger.warn(m);
    else console.warn(m);
  }

  try {
    const hostOffs = await registerHostChatSurface(ctx);
    for (const d of hostOffs) disposers.push(d);
  } catch (err) {
    const m = `[dsh-companion] 宿主私聊面未挂上：${err?.message || err}`;
    if (ctx?.logger?.warn) ctx.logger.warn(m);
    else console.warn(m);
  }

  return () => {
    setPluginTickActive(false);
    for (const d of disposers) {
      try {
        d();
      } catch {
        /* ignore */
      }
    }
  };
}

export const name = 'dsh-companion';
/** 叫醒控制台会话依赖 sessionController；仍在叫醒时再 get 一次以防时序。 */
export const inject = ['webServer', 'tools', 'sessionController'];
