import {
  type ComponentInternalInstance,
  DeprecationTypes,
  type Directive,
  type LegacyConfig,
  compatUtils,
  getCurrentInstance,
} from '@vue/runtime-core'
import { hyphenate, isArray } from '@vue/shared'

// 系统修饰符列表，对应键盘上的控制键 / List of system modifiers
const systemModifiers = ['ctrl', 'shift', 'alt', 'meta'] as const
type SystemModifiers = (typeof systemModifiers)[number]
type CompatModifiers = keyof typeof keyNames

export type VOnModifiers = SystemModifiers | ModifierGuards | CompatModifiers
type KeyedEvent = KeyboardEvent | MouseEvent | TouchEvent

type ModifierGuards =
  | 'shift'
  | 'ctrl'
  | 'alt'
  | 'meta'
  | 'left'
  | 'right'
  | 'stop'
  | 'prevent'
  | 'self'
  | 'middle'
  | 'exact'

// 事件修饰符守卫：当守卫函数返回 true 时，表示条件不满足，应该阻止执行后续的事件处理器
// Event modifier guards: if the guard returns true, it stops the execution of the event handler
const modifierGuards: Record<
  ModifierGuards,
  | ((e: Event) => void | boolean)
  | ((e: Event, modifiers: string[]) => void | boolean)
> = {
  stop: (e: Event) => e.stopPropagation(),
  prevent: (e: Event) => e.preventDefault(),
  self: (e: Event) => e.target !== e.currentTarget,
  ctrl: (e: Event) => !(e as KeyedEvent).ctrlKey,
  shift: (e: Event) => !(e as KeyedEvent).shiftKey,
  alt: (e: Event) => !(e as KeyedEvent).altKey,
  meta: (e: Event) => !(e as KeyedEvent).metaKey,
  left: (e: Event) => 'button' in e && (e as MouseEvent).button !== 0,
  middle: (e: Event) => 'button' in e && (e as MouseEvent).button !== 1,
  right: (e: Event) => 'button' in e && (e as MouseEvent).button !== 2,
  exact: (e, modifiers) =>
    systemModifiers.some(m => (e as any)[`${m}Key`] && !modifiers.includes(m)),
}

/**
 * 带有修饰符的事件处理函数高阶函数
 * @private
 */
export const withModifiers = <
  T extends (event: Event, ...args: unknown[]) => any,
>(
  fn: T & { _withMods?: { [key: string]: T } },
  modifiers: VOnModifiers[],
): T => {
  // 使用函数的 _withMods 属性做缓存，避免为同一事件处理器重复创建包装函数
  // Use _withMods on the function to cache and avoid creating duplicate wrappers
  const cache = fn._withMods || (fn._withMods = {})
  const cacheKey = modifiers.join('.')
  return (
    cache[cacheKey] ||
    (cache[cacheKey] = ((event, ...args) => {
      // 遍历所有修饰符并执行对应的守卫函数 / Loop through modifiers and execute guards
      for (let i = 0; i < modifiers.length; i++) {
        const guard = modifierGuards[modifiers[i] as ModifierGuards]
        // 如果 guard 存在且返回 true，则直接返回，不执行原处理函数
        // If guard exists and returns true, exit early without calling the original function
        if (guard && guard(event, modifiers)) return
      }
      return fn(event, ...args)
    }) as T)
  )
}

// 为 2.x 兼容性保留。 / Kept for 2.x compat.
// 注意：暂时移除了 IE11 对 `spacebar` 和 `del` 的兼容。 / Note: IE11 compat for `spacebar` and `del` is removed for now.
const keyNames: Record<
  'esc' | 'space' | 'up' | 'left' | 'right' | 'down' | 'delete',
  string
> = {
  esc: 'escape',
  space: ' ',
  up: 'arrow-up',
  left: 'arrow-left',
  right: 'arrow-right',
  down: 'arrow-down',
  delete: 'backspace',
}

/**
 * 处理按键修饰符的高阶函数
 * @private
 */
export const withKeys = <T extends (event: KeyboardEvent) => any>(
  fn: T & { _withKeys?: { [k: string]: T } },
  modifiers: string[],
): T => {
  let globalKeyCodes: LegacyConfig['keyCodes']
  let instance: ComponentInternalInstance | null = null
  // 处理 Vue 2.x 兼容模式下的配置 / Handle configuration in Vue 2.x compat mode
  if (__COMPAT__) {
    instance = getCurrentInstance()
    if (
      compatUtils.isCompatEnabled(DeprecationTypes.CONFIG_KEY_CODES, instance)
    ) {
      if (instance) {
        globalKeyCodes = (instance.appContext.config as LegacyConfig).keyCodes
      }
    }
    // 检测是否使用了弃用的数字按键码修饰符 / Warn if deprecated numeric keycode modifiers are used
    if (__DEV__ && modifiers.some(m => /^\d+$/.test(m))) {
      compatUtils.warnDeprecation(
        DeprecationTypes.V_ON_KEYCODE_MODIFIER,
        instance,
      )
    }
  }

  // 使用函数的 _withKeys 属性做缓存 / Use _withKeys to cache wrapper functions
  const cache: { [k: string]: T } = fn._withKeys || (fn._withKeys = {})
  const cacheKey = modifiers.join('.')

  return (
    cache[cacheKey] ||
    (cache[cacheKey] = (event => {
      if (!('key' in event)) {
        return
      }

      // 将事件的 key 转为连字符格式（如 ArrowUp -> arrow-up）
      // Convert event key to hyphenated format
      const eventKey = hyphenate(event.key)
      // 如果任何一个修饰符匹配当前按下的键，则执行原函数
      // Execute original function if any modifier matches the pressed key
      if (
        modifiers.some(
          k =>
            k === eventKey ||
            keyNames[k as unknown as CompatModifiers] === eventKey,
        )
      ) {
        return fn(event)
      }

      // Vue 2.x 兼容模式下的 keyCode 匹配逻辑 / Fallback keycode matching in Vue 2.x compat mode
      if (__COMPAT__) {
        const keyCode = String(event.keyCode)
        if (
          compatUtils.isCompatEnabled(
            DeprecationTypes.V_ON_KEYCODE_MODIFIER,
            instance,
          ) &&
          modifiers.some(mod => mod == keyCode)
        ) {
          return fn(event)
        }
        if (globalKeyCodes) {
          for (const mod of modifiers) {
            const codes = globalKeyCodes[mod]
            if (codes) {
              const matches = isArray(codes)
                ? codes.some(code => String(code) === keyCode)
                : String(codes) === keyCode
              if (matches) {
                return fn(event)
              }
            }
          }
        }
      }
    }) as T)
  )
}

export type VOnDirective = Directive<any, any, VOnModifiers>
