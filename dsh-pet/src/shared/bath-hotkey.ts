/**
 * 洗澡的悬停快捷键：鼠标停在宠物上时按 `B` 进浴缸洗澡、按 `N` 伸头亲一下。
 *
 * 按键规则归 shared/hotkey，本模块只绑定「哪个键 + 菜单文案 + 动画名」。
 * 两个都是单向点播（播完回到待机），与右键「动作 → 洗澡 / 伸头亲一下」完全同一件事，
 * 所以这里只提供判定与文案，真正播哪一段由 buildMenuTree 生成的叶子决定。
 *
 * 用 `B` 和 `N` 的理由：`S` 让给了截图、`Z` 让给了睡/醒、`D` 让给了待办、`L`/`M` 让给了对话，
 * 剩下能形成肌肉记忆的空位里 B（bath）与 N（昵/亲）最不容易与输入法冲突。
 * @module dsh-pet/src/shared/bath-hotkey
 */
import { isBareKey } from './hotkey.ts';
import type { HotkeyEvent } from './hotkey.ts';

/** 进浴缸洗澡的动画名（= assets/webm 下的文件名，不带扩展名）。 */
export const BATH_ANIMATION = '洗澡';

/** 洗澡时伸头亲一下屏幕的动画名。 */
export const KISS_ANIMATION = '伸头亲一下';

/** 快捷键的显示文案（菜单项右侧灰字）。与 {@link isBathHotkey} 的按键保持同一份事实。 */
export const BATH_HOTKEY_HINT = 'B 键';

/** 快捷键的显示文案。与 {@link isKissHotkey} 的按键保持同一份事实。 */
export const KISS_HOTKEY_HINT = 'N 键';

/**
 * 这次按键该不该让小狗进浴缸。
 *
 * @param e - 键盘事件。
 * @returns 裸按 `B`（含大写）时为 true，输入框里打字则为 false。
 */
export function isBathHotkey(e: HotkeyEvent): boolean {
  return isBareKey(e, 'b');
}

/**
 * 这次按键该不该让小狗伸头亲一下。
 *
 * @param e - 键盘事件。
 * @returns 裸按 `N`（含大写）时为 true，输入框里打字则为 false。
 */
export function isKissHotkey(e: HotkeyEvent): boolean {
  return isBareKey(e, 'n');
}
