import { def, hasOwn, isObject, toRawType } from '@vue/shared'
import {
  mutableHandlers,
  readonlyHandlers,
  shallowReactiveHandlers,
  shallowReadonlyHandlers,
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers,
  shallowCollectionHandlers,
  shallowReadonlyCollectionHandlers,
} from './collectionHandlers'
import type { RawSymbol, Ref, UnwrapRefSimple } from './ref'
import { ReactiveFlags } from './constants'
import { warn } from './warning'

export interface Target {
  [ReactiveFlags.SKIP]?: boolean // 是否跳过响应式转换
  [ReactiveFlags.IS_REACTIVE]?: boolean // 是否是响应式对象
  [ReactiveFlags.IS_READONLY]?: boolean // 是否是只读对象
  [ReactiveFlags.IS_SHALLOW]?: boolean // 是否是浅层响应式对象
  [ReactiveFlags.RAW]?: any // 原始对象
}

// 存储响应式对象的 WeakMap
export const reactiveMap: WeakMap<Target, any> = new WeakMap<Target, any>()
export const shallowReactiveMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()
export const readonlyMap: WeakMap<Target, any> = new WeakMap<Target, any>()
export const shallowReadonlyMap: WeakMap<Target, any> = new WeakMap<
  Target,
  any
>()

// 目标对象类型枚举
enum TargetType {
  INVALID = 0, // 无效目标
  COMMON = 1, // 普通对象
  COLLECTION = 2, // 集合对象 (Map, Set, WeakMap, WeakSet)
}

function targetTypeMap(rawType: string) {
  switch (rawType) {
    case 'Object':
    case 'Array':
      return TargetType.COMMON
    case 'Map':
    case 'Set':
    case 'WeakMap':
    case 'WeakSet':
      return TargetType.COLLECTION
    default:
      return TargetType.INVALID
  }
}

function getTargetType(value: Target) {
  return value[ReactiveFlags.SKIP] || !Object.isExtensible(value)
    ? TargetType.INVALID
    : targetTypeMap(toRawType(value))
}

// only unwrap nested ref
// 仅解包嵌套的 ref
export type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRefSimple<T>

declare const ReactiveMarkerSymbol: unique symbol

export interface ReactiveMarker {
  [ReactiveMarkerSymbol]?: void
}

export type Reactive<T> = UnwrapNestedRefs<T> &
  (T extends readonly any[] ? ReactiveMarker : {})

/**
 * Returns a reactive proxy of the object.
 * 返回对象的响应式代理。
 *
 * The reactive conversion is "deep": it affects all nested properties. A
 * reactive object also deeply unwraps any properties that are refs while
 * maintaining reactivity.
 * 响应式转换是“深层”的：它会影响所有嵌套属性。
 * 响应式对象还会深层解包任何是 refs 的属性，同时保持响应性。
 *
 * @example
 * ```js
 * const obj = reactive({ count: 0 })
 * ```
 *
 * @param target - The source object. 源对象。
 * @see {@link https://vuejs.org/api/reactivity-core.html#reactive}
 */
export function reactive<T extends object>(target: T): Reactive<T>
/*@__NO_SIDE_EFFECTS__*/
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  // 如果尝试观察一个只读代理，返回只读版本。
  if (isReadonly(target)) {
    return target
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap,
  )
}

export declare const ShallowReactiveMarker: unique symbol

export type ShallowReactive<T> = T & { [ShallowReactiveMarker]?: true }

/**
 * Shallow version of {@link reactive}.
 * {@link reactive} 的浅层版本。
 *
 * Unlike {@link reactive}, there is no deep conversion: only root-level
 * properties are reactive for a shallow reactive object. Property values are
 * stored and exposed as-is - this also means properties with ref values will
 * not be automatically unwrapped.
 * 与 {@link reactive} 不同，这里没有深层转换：对于浅层响应式对象，只有根级别的属性是响应式的。
 * 属性值按原样存储和暴露 - 这也意味着具有 ref 值的属性不会被自动解包。
 *
 * @example
 * ```js
 * const state = shallowReactive({
 *   foo: 1,
 *   nested: {
 *     bar: 2
 *   }
 * })
 *
 * // mutating state's own properties is reactive
 * // 变更 state 自身的属性是响应式的
 * state.foo++
 *
 * // ...but does not convert nested objects
 * // ...但不会转换嵌套对象
 * isReactive(state.nested) // false
 *
 * // NOT reactive
 * // 不是响应式的
 * state.nested.bar++
 * ```
 *
 * @param target - The source object. 源对象。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowreactive}
 */
/*@__NO_SIDE_EFFECTS__*/
export function shallowReactive<T extends object>(
  target: T,
): ShallowReactive<T> {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap,
  )
}

type Primitive = string | number | boolean | bigint | symbol | undefined | null
export type Builtin = Primitive | Function | Date | Error | RegExp
export type DeepReadonly<T> = T extends Builtin
  ? T
  : T extends Map<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends ReadonlyMap<infer K, infer V>
      ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
      : T extends WeakMap<infer K, infer V>
        ? WeakMap<DeepReadonly<K>, DeepReadonly<V>>
        : T extends Set<infer U>
          ? ReadonlySet<DeepReadonly<U>>
          : T extends ReadonlySet<infer U>
            ? ReadonlySet<DeepReadonly<U>>
            : T extends WeakSet<infer U>
              ? WeakSet<DeepReadonly<U>>
              : T extends Promise<infer U>
                ? Promise<DeepReadonly<U>>
                : T extends Ref<infer U, unknown>
                  ? Readonly<Ref<DeepReadonly<U>>>
                  : T extends {}
                    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
                    : Readonly<T>

/**
 * Takes an object (reactive or plain) or a ref and returns a readonly proxy to
 * the original.
 * 接受一个对象（响应式或普通）或一个 ref，并返回原始对象的只读代理。
 *
 * A readonly proxy is deep: any nested property accessed will be readonly as
 * well. It also has the same ref-unwrapping behavior as {@link reactive},
 * except the unwrapped values will also be made readonly.
 * 只读代理是深层的：访问的任何嵌套属性也将是只读的。
 * 它具有与 {@link reactive} 相同的 ref 解包行为，除了解包的值也将被设为只读。
 *
 * @example
 * ```js
 * const original = reactive({ count: 0 })
 *
 * const copy = readonly(original)
 *
 * watchEffect(() => {
 *   // works for reactivity tracking
 *   // 适用于响应性追踪
 *   console.log(copy.count)
 * })
 *
 * // mutating original will trigger watchers relying on the copy
 * // 变更 original 将触发依赖于 copy 的侦听器
 * original.count++
 *
 * // mutating the copy will fail and result in a warning
 * // 变更 copy 将失败并导致警告
 * copy.count++ // warning!
 * ```
 *
 * @param target - The source object. 源对象。
 * @see {@link https://vuejs.org/api/reactivity-core.html#readonly}
 */
/*@__NO_SIDE_EFFECTS__*/
export function readonly<T extends object>(
  target: T,
): DeepReadonly<UnwrapNestedRefs<T>> {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap,
  )
}

/**
 * Shallow version of {@link readonly}.
 * {@link readonly} 的浅层版本。
 *
 * Unlike {@link readonly}, there is no deep conversion: only root-level
 * properties are made readonly. Property values are stored and exposed as-is -
 * this also means properties with ref values will not be automatically
 * unwrapped.
 * 与 {@link readonly} 不同，这里没有深层转换：只有根级别的属性被设为只读。
 * 属性值按原样存储和暴露 - 这也意味着具有 ref 值的属性不会被自动解包。
 *
 * @example
 * ```js
 * const state = shallowReadonly({
 *   foo: 1,
 *   nested: {
 *     bar: 2
 *   }
 * })
 *
 * // mutating state's own properties will fail
 * // 变更 state 自身的属性将失败
 * state.foo++
 *
 * // ...but works on nested objects
 * // ...但在嵌套对象上有效
 * isReadonly(state.nested) // false
 *
 * // works
 * // 有效
 * state.nested.bar++
 * ```
 *
 * @param target - The source object. 源对象。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowreadonly}
 */
/*@__NO_SIDE_EFFECTS__*/
export function shallowReadonly<T extends object>(target: T): Readonly<T> {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap,
  )
}

function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>,
  proxyMap: WeakMap<Target, any>,
) {
  if (!isObject(target)) {
    if (__DEV__) {
      warn(
        `value cannot be made ${isReadonly ? 'readonly' : 'reactive'}: ${String(
          target,
        )}`,
      )
    }
    return target
  }
  // target is already a Proxy, return it.
  // exception: calling readonly() on a reactive object
  // 目标已经是一个 Proxy，直接返回它。
  // 例外：对一个响应式对象调用 readonly()
  if (
    target[ReactiveFlags.RAW] &&
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
  ) {
    return target
  }
  // only specific value types can be observed.
  // 只有特定的值类型可以被观察。
  const targetType = getTargetType(target)
  if (targetType === TargetType.INVALID) {
    return target
  }
  // target already has corresponding Proxy
  // 目标已经有对应的 Proxy
  const existingProxy = proxyMap.get(target)
  if (existingProxy) {
    return existingProxy
  }
  const proxy = new Proxy(
    target,
    targetType === TargetType.COLLECTION ? collectionHandlers : baseHandlers,
  )
  proxyMap.set(target, proxy)
  return proxy
}

/**
 * Checks if an object is a proxy created by {@link reactive} or
 * {@link shallowReactive} (or {@link ref} in some cases).
 * 检查一个对象是否是由 {@link reactive} 或 {@link shallowReactive} 创建的代理
 * （在某些情况下也包括 {@link ref}）。
 *
 * @example
 * ```js
 * isReactive(reactive({}))            // => true
 * isReactive(readonly(reactive({})))  // => true
 * isReactive(ref({}).value)           // => true
 * isReactive(readonly(ref({})).value) // => true
 * isReactive(ref(true))               // => false
 * isReactive(shallowRef({}).value)    // => false
 * isReactive(shallowReactive({}))     // => true
 * ```
 *
 * @param value - The value to check. 要检查的值。
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isreactive}
 */
/*@__NO_SIDE_EFFECTS__*/
export function isReactive(value: unknown): boolean {
  if (isReadonly(value)) {
    return isReactive((value as Target)[ReactiveFlags.RAW])
  }
  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}

/**
 * Checks whether the passed value is a readonly object. The properties of a
 * readonly object can change, but they can't be assigned directly via the
 * passed object.
 * 检查传入的值是否为只读对象。只读对象的属性可以更改，但不能通过传入的对象直接赋值。
 *
 * The proxies created by {@link readonly} and {@link shallowReadonly} are
 * both considered readonly, as is a computed ref without a set function.
 * 由 {@link readonly} 和 {@link shallowReadonly} 创建的代理都被视为只读，
 * 没有 set 函数的计算属性 ref 也是如此。
 *
 * @param value - The value to check. 要检查的值。
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isreadonly}
 */
/*@__NO_SIDE_EFFECTS__*/
export function isReadonly(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
}

/*@__NO_SIDE_EFFECTS__*/
export function isShallow(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_SHALLOW])
}

/**
 * Checks if an object is a proxy created by {@link reactive},
 * {@link readonly}, {@link shallowReactive} or {@link shallowReadonly}.
 * 检查对象是否是由 {@link reactive}、{@link readonly}、{@link shallowReactive}
 * 或 {@link shallowReadonly} 创建的代理。
 *
 * @param value - The value to check. 要检查的值。
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isproxy}
 */
/*@__NO_SIDE_EFFECTS__*/
export function isProxy(value: any): boolean {
  return value ? !!value[ReactiveFlags.RAW] : false
}

/**
 * Returns the raw, original object of a Vue-created proxy.
 * 返回 Vue 创建的代理的原始对象。
 *
 * `toRaw()` can return the original object from proxies created by
 * {@link reactive}, {@link readonly}, {@link shallowReactive} or
 * {@link shallowReadonly}.
 * `toRaw()` 可以返回由 {@link reactive}、{@link readonly}、{@link shallowReactive}
 * 或 {@link shallowReadonly} 创建的代理的原始对象。
 *
 * This is an escape hatch that can be used to temporarily read without
 * incurring proxy access / tracking overhead or write without triggering
 * changes. It is **not** recommended to hold a persistent reference to the
 * original object. Use with caution.
 * 这是一个转义舱，可用于临时读取而不会产生代理访问/跟踪开销，或写入而不会触发更改。
 * **不**建议持有对原始对象的持久引用。请谨慎使用。
 *
 * @example
 * ```js
 * const foo = {}
 * const reactiveFoo = reactive(foo)
 *
 * console.log(toRaw(reactiveFoo) === foo) // true
 * ```
 *
 * @param observed - The object for which the "raw" value is requested. 请求“原始”值的对象。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#toraw}
 */
/*@__NO_SIDE_EFFECTS__*/
export function toRaw<T>(observed: T): T {
  const raw = observed && (observed as Target)[ReactiveFlags.RAW]
  return raw ? toRaw(raw) : observed
}

export type Raw<T> = T & { [RawSymbol]?: true }

/**
 * Marks an object so that it will never be converted to a proxy. Returns the
 * object itself.
 * 标记一个对象，使其永远不会转换为代理。返回对象本身。
 *
 * @example
 * ```js
 * const foo = markRaw({})
 * console.log(isReactive(reactive(foo))) // false
 *
 * // also works when nested inside other reactive objects
 * // 当嵌套在其他响应式对象中时也有效
 * const bar = reactive({ foo })
 * console.log(isReactive(bar.foo)) // false
 * ```
 *
 * **Warning:** `markRaw()` together with the shallow APIs such as
 * {@link shallowReactive} allow you to selectively opt-out of the default
 * deep reactive/readonly conversion and embed raw, non-proxied objects in your
 * state graph.
 * **警告：** `markRaw()` 与浅层 API（如 {@link shallowReactive}）一起使用，
 * 允许你选择性地退出默认的深层响应式/只读转换，并将原始的、非代理的对象嵌入到你的状态图中。
 *
 * @param value - The object to be marked as "raw". 要标记为“原始”的对象。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#markraw}
 */
export function markRaw<T extends object>(value: T): Raw<T> {
  if (!hasOwn(value, ReactiveFlags.SKIP) && Object.isExtensible(value)) {
    def(value, ReactiveFlags.SKIP, true)
  }
  return value
}

/**
 * Returns a reactive proxy of the given value (if possible).
 * 返回给定值的响应式代理（如果可能）。
 *
 * If the given value is not an object, the original value itself is returned.
 * 如果给定值不是对象，则返回原始值本身。
 *
 * @param value - The value for which a reactive proxy shall be created. 为其创建响应式代理的值。
 */
export const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value

/**
 * Returns a readonly proxy of the given value (if possible).
 * 返回给定值的只读代理（如果可能）。
 *
 * If the given value is not an object, the original value itself is returned.
 * 如果给定值不是对象，则返回原始值本身。
 *
 * @param value - The value for which a readonly proxy shall be created. 为其创建只读代理的值。
 */
export const toReadonly = <T extends unknown>(value: T): DeepReadonly<T> =>
  isObject(value) ? readonly(value) : (value as DeepReadonly<T>)
