/**
 * 宿主半端依赖：优先从运行中的 Desktop 解析树取 @deepseek-ai/*；
 * 取不到再用本地等价实现（避免缺 peer 依赖时整包不激活）。
 */
import { randomUUID } from 'node:crypto';

function localDefineTool(options) {
  const check = (schema, where) => {
    if (!schema || typeof schema !== 'object') return;
    if (schema.type === 'object' && schema.additionalProperties === undefined) {
      throw new Error(`defineTool(${options.name}): ${where} 是 object 却没写 additionalProperties`);
    }
    for (const [k, v] of Object.entries(schema.properties || {})) {
      check(v, `${where}.properties.${k}`);
    }
  };
  check(options.parameters, 'parameters');
  check(options.output?.schema, 'output.schema');
  return options;
}

function localCreateUserMessage(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const msg = {
    id: randomUUID(),
    role: 'user',
    content: Array.isArray(p.content) ? p.content : [],
  };
  if (p.source !== undefined) msg.source = p.source;
  return msg;
}

/**
 * @returns {Promise<{ defineTool: Function, createUserMessage: Function, notes: string[] }>}
 */
export async function loadHostDeps() {
  const notes = [];

  let defineTool = localDefineTool;
  try {
    const mod = await import('@deepseek-ai/dsh-tools');
    if (typeof mod.defineTool === 'function') {
      defineTool = mod.defineTool;
      notes.push('defineTool: @deepseek-ai/dsh-tools');
    } else {
      notes.push('defineTool: 本地等价（模块无 defineTool）');
    }
  } catch (err) {
    notes.push(`defineTool: 本地等价（${err?.code || err?.message || err}）`);
  }

  let createUserMessage = localCreateUserMessage;
  try {
    const mod = await import('@deepseek-ai/dsh-llm');
    if (typeof mod.createUserMessage === 'function') {
      createUserMessage = mod.createUserMessage;
      notes.push('createUserMessage: @deepseek-ai/dsh-llm');
    } else {
      notes.push('createUserMessage: 本地等价（模块无 createUserMessage）');
    }
  } catch (err) {
    notes.push(`createUserMessage: 本地等价（${err?.code || err?.message || err}）`);
  }

  return { defineTool, createUserMessage, notes };
}
