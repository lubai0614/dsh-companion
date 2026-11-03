/** 本机时区 HH:MM（批钟点比对）。 */

/** @param {string} hhmm */
export function parseHhMm(hhmm) {
  const m = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`invalid HH:MM: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) {
    throw new Error(`invalid HH:MM: ${hhmm}`);
  }
  return {
    hour: h,
    minute: min,
    key: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
  };
}

/** @param {Date} [d] */
export function localHhMmKey(d = new Date()) {
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

/**
 * @param {string} scheduledHhMm
 * @param {Date} [now]
 */
export function isAtScheduledMinute(scheduledHhMm, now = new Date()) {
  return localHhMmKey(now) === parseHhMm(scheduledHhMm).key;
}
