/**
 * 控制台会话识别：叫醒时登记 sessionId；标题/cwd 作回落。
 * 分册拒绝靠此判定（细节稿 §7.5）。
 */

const TITLE_PREFIX = '角色世界·控制台';

/** @type {Set<string>} */
const consoleSessionIds = new Set();

export function getConsoleTitlePrefix() {
  return TITLE_PREFIX;
}

/** @param {string} sessionId */
export function markConsoleSession(sessionId) {
  const id = String(sessionId || '').trim();
  if (id) consoleSessionIds.add(id);
}

/** @param {string} sessionId */
export function unmarkConsoleSession(sessionId) {
  consoleSessionIds.delete(String(sessionId || '').trim());
}

export function clearConsoleSessionsForTests() {
  consoleSessionIds.clear();
}

/**
 * @param {object} [session]
 * @param {string} [consoleCwd]
 */
export function isConsoleSession(session, consoleCwd) {
  if (!session) return false;
  const id = String(session.id || session.sessionId || '').trim();
  if (id && consoleSessionIds.has(id)) return true;

  const title = String(session.title || session.name || '');
  if (title.startsWith(TITLE_PREFIX)) return true;

  const cwd = String(session.cwd || session.workingDirectory || '');
  if (consoleCwd && cwd) {
    const norm = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (norm(cwd) === norm(consoleCwd) || norm(cwd).endsWith('/console')) return true;
  } else if (cwd.replace(/\\/g, '/').toLowerCase().endsWith('/console')) {
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
 * @param {'chat'|'console'|'shared'} booklet
 * @param {object} [exec]
 * @param {string} [consoleCwd]
 */
export function assertBooklet(booklet, exec, consoleCwd) {
  if (booklet === 'shared') return;
  const isConsole = isConsoleSession(sessionFromExec(exec), consoleCwd);
  if (booklet === 'console' && !isConsole) {
    throw new Error('此工具仅控制台会话可用（日摘/晋升/再评估）');
  }
  if (booklet === 'chat' && isConsole) {
    throw new Error('控制台会话不可用此私聊工具；请用控制台分册工具');
  }
}
