/**
 * 叫醒结果 → 跑表状态/摘要（面板中文前缀）。
 * @param {object} out
 */
export function summarizeSchedOutcome(out) {
  if (!out || typeof out !== 'object') {
    return pack('unknown', '未知', '无返回');
  }
  if (out.status === 'busy') {
    return pack('busy', '已拒启', `当前占用：${out.running?.task || '未知'}`);
  }
  if (out.status === 'skipped_not_due' || out.skipped) {
    return pack('skipped_not_due', '已跳过', '条件未满足，未叫醒');
  }
  if (out.status === 'skipped_no_hook') {
    return pack('skipped_no_hook', '已跳过', '无叫醒钩子');
  }
  if (out.ok === false || (out.woken === false && out.error)) {
    return pack('failed', '失败', String(out.error || out.message || '未知错误'));
  }
  if (out.error) {
    return pack('failed', '失败', String(out.error));
  }
  if (out.job_count != null) {
    const n = Number(out.job_count) || 0;
    if (n <= 0) return pack('empty', '空转', '无待处理分桶');
    return pack('woken', '整理中', `待处理 ${n} 个分桶`);
  }
  if (out.digest_count != null) {
    const n = Number(out.digest_count) || 0;
    if (n <= 0) return pack('empty', '空转', '无日摘可晋升');
    return pack('woken', '整理中', `取材日摘 ${n} 条`);
  }
  if (out.woken === true) {
    return pack('woken', '整理中', '已投递整理会话');
  }
  return pack('ran', '已完成', '已触发');
}

function pack(status, label, detail) {
  const d = String(detail || '').trim();
  return {
    status,
    label,
    summary: d ? `${label}：${d}` : label,
  };
}

/** 日摘/晋升叫醒是否推进：仅空转；有活留「整理中」等收尾。 */
export function shouldAdvanceOnWake(out) {
  if (!out || typeof out !== 'object') return false;
  if (out.status === 'no_jobs') return true;
  if (out.job_count != null && Number(out.job_count) === 0) return true;
  if (out.digest_count != null && Number(out.digest_count) === 0) return true;
  return false;
}
