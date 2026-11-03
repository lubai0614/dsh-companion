/** 进程内叫醒钩子槽：tick 与设置页手动启共用。 */

/** @type {object|null} */
let activeWakeHooks = null;

export function installWakeHooks(hooks) {
  activeWakeHooks = hooks || null;
}

export function getWakeHooks() {
  return activeWakeHooks;
}
