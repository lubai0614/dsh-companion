/** 设置页本机路由：/api/dsh-companion/*（不经 MCP）。 */

import {
  adjustMemoryWeightPayload,
  readLtmListPayload,
  readMemoryMetaPayload,
  readNearListPayload,
} from './api-memory.js';
import { patchConfigPayload, readConfigPayload } from './api-config.js';
import {
  abandonOpenSchedPayload,
  readSchedRunsPayload,
  readSchedStatusPayload,
  startSchedTaskPayload,
} from './api-sched.js';
import { readLastAssembleTracePayload } from './api-trace.js';

function sendJson(res, code, body) {
  const raw = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(raw);
}

function sameOriginOk(req) {
  const host = String(req.headers?.host || '').toLowerCase();
  if (!host) return false;
  const local =
    host.startsWith('127.0.0.1') ||
    host.startsWith('localhost') ||
    host.startsWith('[::1]');
  if (!local) return false;
  const origin = String(req.headers?.origin || '').trim();
  const referer = String(req.headers?.referer || '').trim();
  if (!origin && !referer) return true;
  const check = (url) => {
    try {
      const u = new URL(url);
      const h = u.host.toLowerCase();
      return (
        h.startsWith('127.0.0.1') ||
        h.startsWith('localhost') ||
        h.startsWith('[::1]')
      );
    } catch {
      return false;
    }
  };
  if (origin && !check(origin)) return false;
  if (referer && !check(referer)) return false;
  return true;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('body 须为 JSON');
  }
}

function queryOf(url) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of url.searchParams.entries()) out[k] = v;
  return out;
}

/**
 * @param {*} req
 * @param {*} res
 */
export async function handleSettingsHttp(req, res) {
  if (!sameOriginOk(req)) {
    sendJson(res, 403, { ok: false, error: '只接受本机同源请求' });
    return;
  }

  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const base = '/api/dsh-companion';
  if (!path.startsWith(base)) {
    sendJson(res, 404, { ok: false, error: 'not found' });
    return;
  }
  const sub = path.slice(base.length) || '/';
  const q = queryOf(url);
  const method = String(req.method || 'GET').toUpperCase();

  try {
    if (method === 'GET' && sub === '/memory/meta') {
      return sendJson(res, 200, readMemoryMetaPayload());
    }
    if (method === 'GET' && sub === '/memory/ltm') {
      return sendJson(res, 200, readLtmListPayload(q));
    }
    if (method === 'GET' && sub === '/memory/near') {
      return sendJson(res, 200, readNearListPayload(q));
    }
    if (method === 'POST' && sub === '/memory/weight') {
      const body = await readBody(req);
      return sendJson(res, 200, adjustMemoryWeightPayload(body));
    }
    if (method === 'GET' && sub === '/trace/last') {
      return sendJson(res, 200, readLastAssembleTracePayload());
    }
    if (method === 'GET' && sub === '/config') {
      return sendJson(res, 200, readConfigPayload());
    }
    if (method === 'POST' && sub === '/config') {
      const body = await readBody(req);
      return sendJson(res, 200, patchConfigPayload(body));
    }
    if (method === 'GET' && sub === '/sched/status') {
      return sendJson(res, 200, readSchedStatusPayload());
    }
    if (method === 'GET' && sub === '/sched/runs') {
      return sendJson(res, 200, readSchedRunsPayload(q));
    }
    if (method === 'POST' && sub === '/sched/start') {
      const body = await readBody(req);
      return sendJson(res, 200, startSchedTaskPayload(body));
    }
    if (method === 'POST' && sub === '/sched/abandon') {
      return sendJson(res, 200, abandonOpenSchedPayload());
    }
    sendJson(res, 404, { ok: false, error: `未知路径: ${sub}` });
  } catch (err) {
    sendJson(res, 500, { ok: false, error: String(err?.message || err) });
  }
}

/**
 * 挂到宿主 webServer（prefix）。
 * @param {*} ctx cordis ctx（须有 webServer）
 */
export function registerSettingsHttp(ctx) {
  if (!ctx?.webServer?.register) {
    throw new Error('webServer 不可用，无法挂设置页路由');
  }
  return ctx.webServer.register({
    kind: 'prefix',
    path: '/api/dsh-companion',
    handler: handleSettingsHttp,
  });
}
