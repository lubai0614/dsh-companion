/**
 * 控制台叫醒：固定会话复用 + 投递任务说明（细案 03 §三 / 细节 §7.5）。
 * 手动启动与到点自动同一路径。不等整轮结束；收尾靠 dc_*_complete。
 */

import { randomUUID } from 'node:crypto';
import { listDigestJobsForDay, listDigestsForPromote } from '../near.js';
import { planScheduledReassess } from '../reassess.js';
import { resolveConsoleCwd } from '../paths.js';
import {
  getStoredConsoleSessionId,
  storeConsoleSessionId,
} from '../host/console-session-state.js';
import {
  getConsoleTitlePrefix,
  markConsoleSession,
} from '../host/session-kind.js';

function extractSessionId(created) {
  return (
    created?.sessionId ||
    created?.session?.sessionId ||
    created?.session?.id ||
    created?.id ||
    null
  );
}

function formatWakeError(err) {
  const msg = String(err?.message || err);
  const reason =
    err?.details?.reason ||
    err?.data?.reason ||
    err?.cause?.message ||
    err?.cause;
  if (reason != null && String(reason).trim()) {
    return `${msg}（${String(reason).trim()}）`;
  }
  return msg;
}

export function buildDigestConsolePrompt(opts) {
  const day_key = String(opts.day_key).trim();
  const jobs = Array.isArray(opts.jobs) ? opts.jobs : [];
  const lines = jobs.map(
    (j) =>
      `- peer_id=${j.peer_id} 摘记条数=${j.fragment_count}${j.existing_digest ? '（已有当日小结，可覆盖）' : ''}`,
  );
  return [
    '【整理任务·当日小结】这是控制台整理回合，不是 QQ 私聊。请勿向 QQ 发送任何内容；勿对用户念工具名或实现层名词。',
    `目标自然日 day_key=${day_key}。`,
    '原料只来自记忆库里的相处摘记，不要假设能读 QQ 聊天原文。',
    '待处理分桶：',
    ...(lines.length ? lines : ['（无作业）']),
    '对每个 peer_id：',
    '1) 调用 dc_near_fragments_list（peer_id + day_key）读取摘记与 assemble_text；',
    '2) 结合装配材料，将摘记浓缩成一条当日小结正文；',
    '3) 调用 dc_near_digest_write 写入（有摘记才写；无摘记会 skipped）。',
    '全部 peer 处理完后：必须调用 dc_digest_complete 收尾跑表（即使本回合没有新写也要调）。',
  ].join('\n');
}

export function buildPromoteConsolePrompt(opts) {
  const as_of_day = String(opts.as_of_day).trim();
  const digests = Array.isArray(opts.digests) ? opts.digests : [];
  const lines = digests.map(
    (d) => `- peer_id=${d.peer_id} day_key=${d.day_key} digest_id=${d.id}`,
  );
  return [
    '【整理任务·升入正式记得】这是控制台整理回合，不是 QQ 私聊。请勿向 QQ 发送任何内容；勿对用户念工具名。',
    `取材截止日 as_of_day=${as_of_day}。只吃日摘，不读 QQ 原文。`,
    '待处理日摘：',
    ...(lines.length ? lines : ['（无日摘）']),
    '对每条日摘：',
    '1) 可用 dc_near_digests_list 再取窗内日摘与 assemble_text；',
    '2) 自判有无值得长期留的要点；无则跳过该条，勿检索；',
    '3) 有 → dc_memory_search 对照链尖 → dc_promote_remember / dc_correct / dc_adjust_weight / 不写；',
    '4) 全部处理完后必须调用 dc_promote_complete 收尾。',
  ].join('\n');
}

export function buildReassessConsolePrompt(opts) {
  const plan = opts.plan || {};
  const reason = plan.task_reason;
  const peers = Array.isArray(plan.peers) ? plan.peers : [];
  const lines = peers.map(
    (p) => `- peer_id=${p.peer_id} 候选约 ${p.candidate_count} 条`,
  );
  return [
    '【整理任务·再评轻重】这是控制台整理回合，不是 QQ 私聊。请勿向 QQ 发送任何内容；勿对用户念工具名。',
    `本轮任务 task_reason=${reason}（只开这一项，禁止顺带推进另一项）。`,
    '目标分桶：',
    ...(lines.length ? lines : ['（无目标）']),
    '1) 可用 dc_reassess_plan 再确认 due；',
    '2) 对每个 peer：dc_reassess_candidates_list 取候选与 assemble_text；',
    '3) 只调权：dc_adjust_weight；已被取代条跳过；勿改正文；',
    `4) 全部处理完后调用 dc_reassess_complete(kind=${reason})；kind 只能是 growth 或 rhythm。`,
  ].join('\n');
}

/**
 * @param {object} opts
 * @param {*} opts.sessionController
 * @param {string} opts.promptText
 * @param {string} [opts.sessionTitle]
 * @param {string} [opts.cwd]
 * @param {string} [opts.agentPreset]
 * @param {AbortSignal} [opts.signal] 投递受理前的取消令牌；缺省用新的未中止 signal
 */
export async function wakeConsoleSession(opts) {
  const sessionController = opts.sessionController;
  if (!sessionController || typeof sessionController.create !== 'function') {
    throw new Error('sessionController.create 不可用');
  }
  const promptText = String(opts.promptText ?? '').trim();
  if (!promptText) throw new Error('promptText required');

  const cwd = opts.cwd || resolveConsoleCwd();
  const storedId = getStoredConsoleSessionId();
  let created;
  try {
    created = await sessionController.create({
      cwd,
      ...(storedId ? { sessionId: storedId } : {}),
      ...(opts.agentPreset ? { agentPreset: opts.agentPreset } : {}),
    });
  } catch (err) {
    throw new Error(formatWakeError(err));
  }
  const sessionId = extractSessionId(created);
  if (!sessionId) throw new Error('session/create missing sessionId');

  storeConsoleSessionId(sessionId);
  markConsoleSession(sessionId);

  const title =
    opts.sessionTitle ||
    `${getConsoleTitlePrefix()}·任务`;
  if (typeof sessionController.rename === 'function') {
    try {
      await sessionController.rename({ sessionId, title });
    } catch {
      /* 标题失败不挡投递 */
    }
  }

  if (typeof sessionController.prompt !== 'function') {
    throw new Error('sessionController.prompt 不可用');
  }
  // 宿主签名：prompt(request, signal)；须 requestId + signal
  const signal =
    opts.signal instanceof AbortSignal
      ? opts.signal
      : new AbortController().signal;
  const requestId = String(opts.requestId || randomUUID());
  let accepted;
  try {
    accepted = await sessionController.prompt(
      {
        sessionId,
        requestId,
        mode: 'queue',
        content: [{ type: 'text', text: promptText }],
      },
      signal,
    );
  } catch (err) {
    throw new Error(formatWakeError(err));
  }

  return { ok: true, sessionId, cwd, accepted, title, requestId };
}

/**
 * @param {import('../db.js').MemoryDb} db
 * @param {{ day_key: string, sessionController: *, cwd?: string }} opts
 */
export async function runDigestConsoleWake(db, opts) {
  const day_key = String(opts.day_key || '').trim();
  if (!day_key) throw new Error('day_key required');

  const jobs = listDigestJobsForDay(db, day_key);
  if (jobs.length === 0) {
    return { day_key, job_count: 0, status: 'no_jobs', woken: false };
  }

  const promptText = buildDigestConsolePrompt({
    day_key,
    jobs: jobs.map((j) => ({
      peer_id: j.peer_id,
      fragment_count: j.fragment_count,
      existing_digest: !!j.existing_digest,
    })),
  });

  const wake = await wakeConsoleSession({
    sessionController: opts.sessionController,
    cwd: opts.cwd,
    promptText,
    sessionTitle: `${getConsoleTitlePrefix()}·日摘 ${day_key}`,
  });

  return {
    day_key,
    job_count: jobs.length,
    status: 'woken',
    woken: true,
    peers: jobs.map((j) => j.peer_id),
    sessionId: wake.sessionId,
  };
}

/**
 * @param {import('../db.js').MemoryDb} db
 * @param {{ as_of_day: string, sessionController: *, cwd?: string }} opts
 */
export async function runPromoteConsoleWake(db, opts) {
  const as_of_day = String(opts.as_of_day || '').trim();
  if (!as_of_day) throw new Error('as_of_day required');

  const digests = listDigestsForPromote(db, { as_of_day, platform: 'qq' });
  if (digests.length === 0) {
    return {
      as_of_day,
      digest_count: 0,
      job_count: 0,
      status: 'no_jobs',
      woken: false,
    };
  }

  const promptText = buildPromoteConsolePrompt({
    as_of_day,
    digests: digests.map((d) => ({
      id: d.id,
      peer_id: d.peer_id,
      day_key: d.day_key,
    })),
  });

  const wake = await wakeConsoleSession({
    sessionController: opts.sessionController,
    cwd: opts.cwd,
    promptText,
    sessionTitle: `${getConsoleTitlePrefix()}·晋升 ${as_of_day}`,
  });

  return {
    as_of_day,
    digest_count: digests.length,
    job_count: digests.length,
    status: 'woken',
    woken: true,
    sessionId: wake.sessionId,
  };
}

/**
 * @param {import('../db.js').MemoryDb} db
 * @param {{ trigger: string, now?: number, sessionController: *, cwd?: string }} opts
 */
export async function runReassessConsoleWake(db, opts) {
  const trigger = opts.trigger === 'rhythm' ? 'rhythm' : 'growth';
  const plan = planScheduledReassess(db, {
    trigger,
    now: opts.now,
  });

  if (plan.skipped) {
    return {
      status: 'skipped_not_due',
      skipped: true,
      woken: false,
      trigger,
      reason: plan.reason,
      task_reason: plan.task_reason,
      job_count: 0,
    };
  }

  const promptText = buildReassessConsolePrompt({ plan });
  const wake = await wakeConsoleSession({
    sessionController: opts.sessionController,
    cwd: opts.cwd,
    promptText,
    sessionTitle: `${getConsoleTitlePrefix()}·${plan.task_reason}`,
  });

  return {
    status: 'woken',
    woken: true,
    trigger,
    task_reason: plan.task_reason,
    job_count: (plan.target_peers || []).length,
    peers: (plan.target_peers || []).map((p) => p.peer_id),
    sessionId: wake.sessionId,
  };
}
