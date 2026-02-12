import {
  camelize,
  extend,
  hyphenate,
  isArray,
  isObject,
  isReservedProp,
  normalizeClass,
} from '@vue/shared'
import type { ComponentInternalInstance, Data } from '../component'
import type { Slot } from '../componentSlots'
import { createSlots } from '../helpers/createSlots'
import { renderSlot } from '../helpers/renderSlot'
import { toHandlers } from '../helpers/toHandlers'
import { type VNode, mergeProps } from '../vnode'

/**
 * 将数组转换为对象
 * Helper to convert array of objects to a single object
 */
function toObject(arr: Array<any>): Object {
  const res = {}
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]) {
      extend(res, arr[i])
    }
  }
  return res
}

/**
 * 兼容 Vue 2 的 v-bind="object" 行为
 * Handles Vue 2 style v-bind="object" binding
 */
export function legacyBindObjectProps(
  data: any,
  _tag: string,
  value: any,
  _asProp: boolean,
  isSync?: boolean,
): any {
  if (value && isObject(value)) {
    if (isArray(value)) {
      value = toObject(value)
    }
    for (const key in value) {
      if (isReservedProp(key)) {
        data[key] = value[key]
      } else if (key === 'class') {
        data.class = normalizeClass([data.class, value.class])
      } else if (key === 'style') {
        data.style = normalizeClass([data.style, value.style])
      } else {
        const attrs = data.attrs || (data.attrs = {})
        const camelizedKey = camelize(key)
        const hyphenatedKey = hyphenate(key)
        // 如果属性未在 attrs 中定义，则添加
        // Check if key is already present in attrs
        if (!(camelizedKey in attrs) && !(hyphenatedKey in attrs)) {
          attrs[key] = value[key]

          // 处理 .sync 修饰符
          // Handle .sync modifier
          if (isSync) {
            const on = data.on || (data.on = {})
            on[`update:${key}`] = function ($event: any) {
              value[key] = $event
            }
          }
        }
      }
    }
  }
  return data
}

/**
 * 兼容 Vue 2 的 v-on="object" 行为
 * Handles Vue 2 style v-on="object" binding
 */
export function legacyBindObjectListeners(props: any, listeners: any): Data {
  return mergeProps(props, toHandlers(listeners))
}

/**
 * 兼容 Vue 2 的插槽渲染
 * Handles Vue 2 style slot rendering
 */
export function legacyRenderSlot(
  instance: ComponentInternalInstance,
  name: string,
  fallback?: VNode[],
  props?: any,
  bindObject?: any,
): VNode {
  if (bindObject) {
    props = mergeProps(props, bindObject)
  }
  return renderSlot(instance.slots, name, props, fallback && (() => fallback))
}

type LegacyScopedSlotsData = Array<
  | {
      key: string
      fn: Function
    }
  | LegacyScopedSlotsData
>

/**
 * 兼容 Vue 2 的作用域插槽解析
 * Handles Vue 2 style scoped slots resolution
 */
export function legacyResolveScopedSlots(
  fns: LegacyScopedSlotsData,
  raw?: Record<string, Slot>,
  // the following are added in 2.6
  // 以下参数在 2.6 中添加
  hasDynamicKeys?: boolean,
): ReturnType<typeof createSlots> {
  // v2 default slot doesn't have name
  // v2 默认插槽没有名称
  return createSlots(
    raw || ({ $stable: !hasDynamicKeys } as any),
    mapKeyToName(fns),
  )
}

/**
 * 将插槽的 key 映射为 name
 * Helper to map slot keys to names
 */
function mapKeyToName(slots: LegacyScopedSlotsData) {
  for (let i = 0; i < slots.length; i++) {
    const fn = slots[i]
    if (fn) {
      if (isArray(fn)) {
        mapKeyToName(fn)
      } else {
        ;(fn as any).name = fn.key || 'default'
      }
    }
  }
  return slots as any
}

const staticCacheMap = /*@__PURE__*/ new WeakMap<
  ComponentInternalInstance,
  any[]
>()

/**
 * 兼容 Vue 2 的静态渲染函数 (staticRenderFns)
 * Handles Vue 2 style static render functions
 */
export function legacyRenderStatic(
  instance: ComponentInternalInstance,
  index: number,
): any {
  let cache = staticCacheMap.get(instance)
  if (!cache) {
    staticCacheMap.set(instance, (cache = []))
  }
  if (cache[index]) {
    return cache[index]
  }
  const fn = (instance.type as any).staticRenderFns[index]
  const ctx = instance.proxy
  return (cache[index] = fn.call(ctx, null, ctx))
}

/**
 * 兼容 Vue 2 的 keyCodes 检查
 * Handles Vue 2 style keyCodes checking
 */
export function legacyCheckKeyCodes(
  instance: ComponentInternalInstance,
  eventKeyCode: number,
  key: string,
  builtInKeyCode?: number | number[],
  eventKeyName?: string,
  builtInKeyName?: string | string[],
): boolean | undefined {
  const config = instance.appContext.config as any
  const configKeyCodes = config.keyCodes || {}
  const mappedKeyCode = configKeyCodes[key] || builtInKeyCode
  if (builtInKeyName && eventKeyName && !configKeyCodes[key]) {
    return isKeyNotMatch(builtInKeyName, eventKeyName)
  } else if (mappedKeyCode) {
    return isKeyNotMatch(mappedKeyCode, eventKeyCode)
  } else if (eventKeyName) {
    return hyphenate(eventKeyName) !== key
  }
}

function isKeyNotMatch<T>(expect: T | T[], actual: T): boolean {
  if (isArray(expect)) {
    return !expect.includes(actual)
  } else {
    return expect !== actual
  }
}

/**
 * 兼容 Vue 2 的 v-once
 * Placeholder for Vue 2 v-once compatibility
 */
export function legacyMarkOnce(tree: VNode): VNode {
  return tree
}

/**
 * 兼容 Vue 2 的动态键绑定
 * Handles Vue 2 style dynamic key binding
 */
export function legacyBindDynamicKeys(props: any, values: any[]): any {
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i]
    if (typeof key === 'string' && key) {
      props[values[i]] = values[i + 1]
    }
  }
  return props
}

/**
 * 兼容 Vue 2 的修饰符前缀处理
 * Handles Vue 2 style modifier prefixing
 */
export function legacyPrependModifier(value: any, symbol: string): any {
  return typeof value === 'string' ? symbol + value : value
}
