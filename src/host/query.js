/** 从本轮消息抽出对方话作装配 query（跳过本插件注入源）。 */

export const INJECT_SOURCE_KIND = 'dsh-companion';

/**
 * @param {unknown} content
 * @returns {string}
 */
export function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
  }
  return parts.join('\n');
}

/**
 * @param {unknown[]} messages
 * @returns {string}
 */
export function extractUserQuery(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || typeof m !== 'object') continue;
    if (m.role !== 'user') continue;
    const kind = m.source?.kind;
    if (kind === INJECT_SOURCE_KIND) continue;
    const text = textFromContent(m.content).trim();
    if (text) return text;
  }
  return '';
}
