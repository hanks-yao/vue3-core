import type { VNode, VNodeChild } from '../vnode'
import {
  isReactive,
  isReadonly,
  isShallow,
  shallowReadArray,
  toReactive,
  toReadonly,
} from '@vue/reactivity'
import { isArray, isObject, isString } from '@vue/shared'
import { warn } from '../warning'

/**
 * v-for string
 * v-for 字符串
 * @private
 */
export function renderList(
  source: string,
  renderItem: (value: string, index: number) => VNodeChild,
): VNodeChild[]

/**
 * v-for number
 * v-for 数字
 */
export function renderList(
  source: number,
  renderItem: (value: number, index: number) => VNodeChild,
): VNodeChild[]

/**
 * v-for array
 * v-for 数组
 */
export function renderList<T>(
  source: T[],
  renderItem: (value: T, index: number) => VNodeChild,
): VNodeChild[]

/**
 * v-for iterable
 * v-for 可迭代对象
 */
export function renderList<T>(
  source: Iterable<T>,
  renderItem: (value: T, index: number) => VNodeChild,
): VNodeChild[]

/**
 * v-for object
 * v-for 对象
 */
export function renderList<T>(
  source: T,
  renderItem: <K extends keyof T>(
    value: T[K],
    key: string,
    index: number,
  ) => VNodeChild,
): VNodeChild[]

/**
 * Actual implementation
 * 实际实现
 */
export function renderList(
  source: any,
  renderItem: (...args: any[]) => VNodeChild,
  cache?: any[],
  index?: number,
): VNodeChild[] {
  let ret: VNodeChild[]
  // Try to get cached items if cache is provided
  // 如果提供了缓存，尝试获取缓存的项
  const cached = (cache && cache[index!]) as VNode[] | undefined
  const sourceIsArray = isArray(source)

  if (sourceIsArray || isString(source)) {
    // Handle Array or String
    // 处理数组或字符串
    const sourceIsReactiveArray = sourceIsArray && isReactive(source)
    let needsWrap = false
    let isReadonlySource = false
    // If source is a reactive array, we need to ensure items are also reactive
    // 如果源是响应式数组，我们需要确保项也是响应式的
    if (sourceIsReactiveArray) {
      needsWrap = !isShallow(source)
      isReadonlySource = isReadonly(source)
      // Read the array shallowly to avoid triggering getters for every item during iteration
      // 浅读取数组以避免在迭代期间为每个项触发 getter
      source = shallowReadArray(source)
    }
    ret = new Array(source.length)
    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(
        // If it's a reactive array, wrap the item to be reactive/readonly
        // 如果是响应式数组，将项包装为响应式/只读
        needsWrap
          ? isReadonlySource
            ? toReadonly(toReactive(source[i]))
            : toReactive(source[i])
          : source[i],
        i,
        undefined,
        cached && cached[i],
      )
    }
  } else if (typeof source === 'number') {
    // Handle Number: v-for="i in 10"
    // 处理数字：v-for="i in 10"
    if (__DEV__ && !Number.isInteger(source)) {
      warn(`The v-for range expect an integer value but got ${source}.`)
    }
    ret = new Array(source)
    for (let i = 0; i < source; i++) {
      // Note: number iteration starts from 1
      // 注意：数字迭代从 1 开始
      ret[i] = renderItem(i + 1, i, undefined, cached && cached[i])
    }
  } else if (isObject(source)) {
    if (source[Symbol.iterator as any]) {
      // Handle Iterable (e.g. Set, Map)
      // 处理可迭代对象（例如 Set, Map）
      ret = Array.from(source as Iterable<any>, (item, i) =>
        renderItem(item, i, undefined, cached && cached[i]),
      )
    } else {
      // Handle Object: v-for="(val, key, index) in object"
      // 处理对象：v-for="(val, key, index) in object"
      const keys = Object.keys(source)
      ret = new Array(keys.length)
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i]
        ret[i] = renderItem(source[key], key, i, cached && cached[i])
      }
    }
  } else {
    // Fallback for invalid source
    // 无效源的回退
    ret = []
  }

  if (cache) {
    // Cache the result if cache array is provided
    // 如果提供了缓存数组，则缓存结果
    cache[index!] = ret
  }
  return ret
}
