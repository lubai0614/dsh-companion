/**
 * 整理会话识别：叫醒时登记 sessionId；标题/cwd 作回落。
 * 分册拒绝靠此判定（细节稿 §7.5）。
 */

const TITLE_PREFIX = '角色世界·整理';

/** @type {Set<string>} */
const organizeSessionIds = new Set();

export function getOrganizeTitlePrefix() {
  return TITLE_PREFIX;
}

/** @param {string} sessionId */
export function markOrganizeSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (id) organizeSessionIds.add(id);
}

/** @param {string} sessionId */
export function unmarkOrganizeSession(sessionId) {
  organizeSessionIds.delete(String(sessionId || '').trim());
}

export function clearOrganizeSessionsForTests() {
  organizeSessionIds.clear();
}

/**
 * @param {object} [session]
 * @param {string} [organizeCwd]
 */
export function isOrganizeSession(session, organizeCwd) {
  if (!session) return false;
  const id = String(session.id || session.sessionId || '').trim();
  if (id && organizeSessionIds.has(id)) return true;

  const title = String(session.title || session.name || '');
  if (title.startsWith(TITLE_PREFIX)) return true;

  const cwd = String(session.cwd || session.workingDirectory || '');
  if (organizeCwd && cwd) {
    const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (norm(cwd) === norm(organizeCwd) || norm(cwd).endsWith('/organize')) return true;
  } else if (cwd.replace(/\\/g, '/').toLowerCase().endsWith('/organize')) {
    return true;
  }
  return false;
}

/**
 * 从工具 exec 取 agent.session。
 * @param {object} [exec]
 */
export function sessionFromExec(exec) {
  return exec?.agent?.session || exec?.session || null;
}

/**
 * @param {'chat'|'organize'|'shared'} booklet
 * @param {object} [exec]
 * @param {string} [organizeCwd]
 */
export function assertBooklet(booklet, exec, organizeCwd) {
  if (booklet === 'shared') return;
  const organize = isOrganizeSession(sessionFromExec(exec), organizeCwd);
  if (booklet === 'organize' && !organize) {
    throw new Error('此工具仅整理会话可用（日摘/晋升/再评估专用回合）');
  }
  if (booklet === 'chat' && organize) {
    throw new Error('整理会话不可用此私聊工具；请用整理分册工具');
  }
}
