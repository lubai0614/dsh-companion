/** 从宿主 agent/session 解析近端分桶：platform=qq + peer_id=对方 QQ。 */

const QQ_UIN = /^\d{5,12}$/;

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeQqPeerId(raw) {
  const id = String(raw ?? '').trim();
  if (!QQ_UIN.test(id)) return null;
  return id;
}

/**
 * 从路径末段、标题、常见元数据字段试解析对方 QQ。
 * 解不出则返回 null（调用方须明确跳过，禁止瞎猜写库）。
 * @param {*} agent
 * @returns {{ platform: 'qq', peer_id: string } | null}
 */
export function resolveChatPeerBucket(agent) {
  const session = agent?.session;
  const candidates = [];

  const push = (v) => {
    const id = normalizeQqPeerId(v);
    if (id) candidates.push(id);
  };

  // cwd / workingDirectory 末段（qq-bridge 整理目录常见「…/agents/<uin>」）
  for (const p of [session?.cwd, session?.workingDirectory, agent?.cwd]) {
    if (typeof p === 'string' && p.trim()) {
      const base = p.replace(/[\\/]+$/, '').split(/[\\/]/).pop();
      push(base);
    }
  }

  push(session?.title);
  push(session?.name);
  push(session?.peer_id);
  push(session?.peerId);
  push(session?.user_id);
  push(session?.userId);
  push(session?.meta?.peer_id);
  push(session?.meta?.peerId);
  push(session?.meta?.user_id);
  push(session?.requestContext?.()?.peer_id);
  push(session?.requestContext?.()?.peerId);
  push(session?.requestContext?.()?.user_id);

  if (candidates.length === 0) return null;
  return { platform: 'qq', peer_id: candidates[0] };
}
