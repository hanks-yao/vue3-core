import { isFunction } from '@vue/shared'
import {
  type DebuggerEvent,
  type DebuggerOptions,
  EffectFlags,
  type Subscriber,
  activeSub,
  batch,
  refreshComputed,
} from './effect'
import type { Ref } from './ref'
import { warn } from './warning'
import { Dep, type Link, globalVersion } from './dep'
import { ReactiveFlags, TrackOpTypes } from './constants'

// 只读计算属性 Ref 的符号标识
declare const ComputedRefSymbol: unique symbol
// 可写计算属性 Ref 的符号标识
declare const WritableComputedRefSymbol: unique symbol

interface BaseComputedRef<T, S = T> extends Ref<T, S> {
  [ComputedRefSymbol]: true
  /**
   * @deprecated computed no longer uses effect
   * 已废弃：computed 不再使用 effect
   */
  effect: ComputedRefImpl
}

/** 只读计算属性 Ref 类型 */
export interface ComputedRef<T = any> extends BaseComputedRef<T> {
  readonly value: T
}

/** 可写计算属性 Ref 类型（带 setter） */
export interface WritableComputedRef<T, S = T> extends BaseComputedRef<T, S> {
  [WritableComputedRefSymbol]: true
}

/** 计算属性 getter：可选接收旧值，返回新值 */
export type ComputedGetter<T> = (oldValue?: T) => T
/** 计算属性 setter：接收新值 */
export type ComputedSetter<T> = (newValue: T) => void

/** 可写计算属性的配置：get / set */
export interface WritableComputedOptions<T, S = T> {
  get: ComputedGetter<T>
  set: ComputedSetter<S>
}

/**
 * @private exported by @vue/reactivity for Vue core use, but not exported from
 * the main vue package
 * 私有导出，供 Vue 核心使用，不从主 vue 包导出
 */
export class ComputedRefImpl<T = any> implements Subscriber {
  /**
   * @internal
   * 内部：计算属性的缓存值
   */
  _value: any = undefined
  /**
   * @internal
   * 内部：收集依赖本 computed 的订阅者（如 effect），用于在值变化时通知
   */
  readonly dep: Dep = new Dep(this)
  /**
   * @internal
   */
  readonly __v_isRef = true
  // TODO isolatedDeclarations ReactiveFlags.IS_REF
  /**
   * @internal
   */
  readonly __v_isReadonly: boolean
  // TODO isolatedDeclarations ReactiveFlags.IS_READONLY
  // A computed is also a subscriber that tracks other deps
  // 计算属性同时也是订阅者，会追踪其依赖的其他响应式数据
  /**
   * @internal
   * 内部：本 computed 依赖的 dep 链表头（Subscriber 接口）
   */
  deps?: Link = undefined
  /**
   * @internal
   * 内部：依赖链表尾，用于 O(1) 追加
   */
  depsTail?: Link = undefined
  /**
   * @internal
   * 内部：状态标志位，默认 DIRTY 表示需要重新求值
   */
  flags: EffectFlags = EffectFlags.DIRTY
  /**
   * @internal
   * 内部：全局版本号，用于快速判断自上次刷新以来是否有响应式变化
   */
  globalVersion: number = globalVersion - 1
  /**
   * @internal
   * 内部：批处理队列中的下一个订阅者
   */
  next?: Subscriber = undefined
  /**
   * @internal
   * 内部：是否为 SSR 环境（SSR 下无渲染 effect，求值策略不同）
   */
  isSSR: boolean

  // for backwards compat / 向后兼容
  effect: this = this
  // dev only / 仅开发环境：追踪时回调
  onTrack?: (event: DebuggerEvent) => void
  // dev only / 仅开发环境：触发时回调
  onTrigger?: (event: DebuggerEvent) => void

  /**
   * Dev only
   * @internal
   * 仅开发环境：是否已警告过递归
   */
  _warnRecursive?: boolean

  constructor(
    public fn: ComputedGetter<T>,
    private readonly setter: ComputedSetter<T> | undefined,
    isSSR: boolean,
  ) {
    // 无 setter 则为只读
    this[ReactiveFlags.IS_READONLY] = !setter
    this.isSSR = isSSR
  }

  /**
   * @internal
   * 内部：依赖变化时被调用，标记为脏并加入批处理队列
   */
  notify(): true | void {
    this.flags |= EffectFlags.DIRTY
    if (
      !(this.flags & EffectFlags.NOTIFIED) &&
      // avoid infinite self recursion / 避免无限自递归
      activeSub !== this
    ) {
      // computed 使用单独队列，优先于普通 effect 执行
      batch(this, true)
      return true
    } else if (__DEV__) {
      // TODO warn
    }
  }

  get value(): T {
    // 追踪当前正在运行的 effect 对本 computed 的依赖，返回 link 便于后续同步版本
    const link = __DEV__
      ? this.dep.track({
          target: this,
          type: TrackOpTypes.GET,
          key: 'value',
        })
      : this.dep.track()
    // 若为脏则执行 getter 并更新 _value，否则直接返回缓存
    refreshComputed(this)
    // sync version after evaluation / 求值后同步 link 版本，供依赖方判断是否需要重新执行
    if (link) {
      link.version = this.dep.version
    }
    return this._value
  }

  set value(newValue) {
    if (this.setter) {
      this.setter(newValue)
    } else if (__DEV__) {
      warn('Write operation failed: computed value is readonly')
    }
  }
}

/**
 * Takes a getter function and returns a readonly reactive ref object for the
 * returned value from the getter. It can also take an object with get and set
 * functions to create a writable ref object.
 * 接收 getter 函数，返回其返回值的只读响应式 ref；也可传入 { get, set } 创建可写 ref。
 *
 * @example
 * ```js
 * // Creating a readonly computed ref:
 * const count = ref(1)
 * const plusOne = computed(() => count.value + 1)
 *
 * console.log(plusOne.value) // 2
 * plusOne.value++ // error
 * ```
 *
 * ```js
 * // Creating a writable computed ref:
 * const count = ref(1)
 * const plusOne = computed({
 *   get: () => count.value + 1,
 *   set: (val) => {
 *     count.value = val - 1
 *   }
 * })
 *
 * plusOne.value = 1
 * console.log(count.value) // 0
 * ```
 *
 * @param getter - Function that produces the next value. / 产生下一个值的函数
 * @param debugOptions - For debugging. See {@link https://vuejs.org/guide/extras/reactivity-in-depth.html#computed-debugging}.
 * @see {@link https://vuejs.org/api/reactivity-core.html#computed}
 */
export function computed<T>(
  getter: ComputedGetter<T>,
  debugOptions?: DebuggerOptions,
): ComputedRef<T>
export function computed<T, S = T>(
  options: WritableComputedOptions<T, S>,
  debugOptions?: DebuggerOptions,
): WritableComputedRef<T, S>
/*@__NO_SIDE_EFFECTS__*/
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>,
  debugOptions?: DebuggerOptions,
  isSSR = false,
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T> | undefined

  // 支持两种入参：纯 getter 函数 或 { get, set } 对象
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }

  const cRef = new ComputedRefImpl(getter, setter, isSSR)

  // 开发环境下注入调试钩子
  if (__DEV__ && debugOptions && !isSSR) {
    cRef.onTrack = debugOptions.onTrack
    cRef.onTrigger = debugOptions.onTrigger
  }

  return cRef as any
}
