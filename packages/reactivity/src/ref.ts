import {
  type IfAny,
  hasChanged,
  isArray,
  isFunction,
  isIntegerKey,
  isObject,
} from '@vue/shared'
import { Dep, getDepFromReactive } from './dep'
import {
  type Builtin,
  type ShallowReactiveMarker,
  type Target,
  isProxy,
  isReactive,
  isReadonly,
  isShallow,
  toRaw,
  toReactive,
} from './reactive'
import type { ComputedRef, WritableComputedRef } from './computed'
import { ReactiveFlags, TrackOpTypes, TriggerOpTypes } from './constants'
import { warn } from './warning'

declare const RefSymbol: unique symbol
export declare const RawSymbol: unique symbol

export interface Ref<T = any, S = T> {
  get value(): T
  set value(_: S)
  /**
   * Type differentiator only.
   * We need this to be in public d.ts but don't want it to show up in IDE
   * autocomplete, so we use a private Symbol instead.
   * 仅用于类型区分。
   * 我们需要在公共 d.ts 中包含它，但不希望它出现在 IDE 自动完成中，
   * 所以我们使用私有 Symbol。
   */
  [RefSymbol]: true
}

/**
 * Checks if a value is a ref object.
 * 检查一个值是否为 ref 对象。
 *
 * @param r - The value to inspect. 要检查的值。
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#isref}
 */
export function isRef<T>(r: Ref<T> | unknown): r is Ref<T>
/*@__NO_SIDE_EFFECTS__*/
export function isRef(r: any): r is Ref {
  // 通过检查是否有 __v_isRef 标志来判断
  return r ? r[ReactiveFlags.IS_REF] === true : false
}

/**
 * Takes an inner value and returns a reactive and mutable ref object, which
 * has a single property `.value` that points to the inner value.
 * 接受一个内部值并返回一个响应式且可变的 ref 对象，
 * 该对象具有指向内部值的单个属性 `.value`。
 *
 * @param value - The object to wrap in the ref. 要包装在 ref 中的对象。
 * @see {@link https://vuejs.org/api/reactivity-core.html#ref}
 */
export function ref<T>(
  value: T,
): [T] extends [Ref] ? IfAny<T, Ref<T>, T> : Ref<UnwrapRef<T>, UnwrapRef<T> | T>
export function ref<T = any>(): Ref<T | undefined>
/*@__NO_SIDE_EFFECTS__*/
export function ref(value?: unknown) {
  return createRef(value, false)
}

declare const ShallowRefMarker: unique symbol

export type ShallowRef<T = any, S = T> = Ref<T, S> & {
  [ShallowRefMarker]?: true
}

/**
 * Shallow version of {@link ref}.
 * {@link ref} 的浅层版本。
 *
 * @example
 * ```js
 * const state = shallowRef({ count: 1 })
 *
 * // does NOT trigger change
 * // 不会触发更改
 * state.value.count = 2
 *
 * // does trigger change
 * // 会触发更改
 * state.value = { count: 2 }
 * ```
 *
 * @param value - The "inner value" for the shallow ref. 浅层 ref 的“内部值”。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#shallowref}
 */
export function shallowRef<T>(
  value: T,
): Ref extends T
  ? T extends Ref
    ? IfAny<T, ShallowRef<T>, T>
    : ShallowRef<T>
  : ShallowRef<T>
export function shallowRef<T = any>(): ShallowRef<T | undefined>
/*@__NO_SIDE_EFFECTS__*/
export function shallowRef(value?: unknown) {
  return createRef(value, true)
}

// 创建 Ref 的工厂函数
function createRef(rawValue: unknown, shallow: boolean) {
  if (isRef(rawValue)) {
    return rawValue
  }
  return new RefImpl(rawValue, shallow)
}

/**
 * @internal
 */
class RefImpl<T = any> {
  _value: T
  private _rawValue: T

  // 依赖容器，用于存储依赖于此 ref 的副作用
  dep: Dep = new Dep()

  public readonly [ReactiveFlags.IS_REF] = true
  public readonly [ReactiveFlags.IS_SHALLOW]: boolean = false

  constructor(value: T, isShallow: boolean) {
    // 如果是浅层响应，直接保存原值；否则如果是对象，需要转为原始对象（去除响应式代理）
    this._rawValue = isShallow ? value : toRaw(value)
    // 如果是浅层响应，直接保存值；否则如果 value 是对象，则将其转换为响应式对象 (reactive)
    this._value = isShallow ? value : toReactive(value)
    this[ReactiveFlags.IS_SHALLOW] = isShallow
  }

  get value() {
    // 收集依赖
    if (__DEV__) {
      this.dep.track({
        target: this,
        type: TrackOpTypes.GET,
        key: 'value',
      })
    } else {
      this.dep.track()
    }
    return this._value
  }

  set value(newValue) {
    // 准备新值和旧值进行比较
    const oldValue = this._rawValue
    // 判断是否直接使用新值（浅层模式、新值本身是浅层或只读）
    const useDirectValue =
      this[ReactiveFlags.IS_SHALLOW] ||
      isShallow(newValue) ||
      isReadonly(newValue)
    newValue = useDirectValue ? newValue : toRaw(newValue)

    // 如果值发生了变化
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue
      // 更新 _value，如果是深层响应且是对象，则转为 reactive
      this._value = useDirectValue ? newValue : toReactive(newValue)
      // 触发依赖更新
      if (__DEV__) {
        this.dep.trigger({
          target: this,
          type: TriggerOpTypes.SET,
          key: 'value',
          newValue,
          oldValue,
        })
      } else {
        this.dep.trigger()
      }
    }
  }
}

/**
 * Force trigger effects that depends on a shallow ref. This is typically used
 * after making deep mutations to the inner value of a shallow ref.
 * 强制触发依赖于浅层 ref 的副作用。这通常在对浅层 ref 的内部值进行深度变更后使用。
 *
 * @example
 * ```js
 * const shallow = shallowRef({
 *   greet: 'Hello, world'
 * })
 *
 * // Logs "Hello, world" once for the first run-through
 * // 第一次运行时记录 "Hello, world"
 * watchEffect(() => {
 *   console.log(shallow.value.greet)
 * })
 *
 * // This won't trigger the effect because the ref is shallow
 * // 这不会触发副作用，因为 ref 是浅层的
 * shallow.value.greet = 'Hello, universe'
 *
 * // Logs "Hello, universe"
 * // 记录 "Hello, universe"
 * triggerRef(shallow)
 * ```
 *
 * @param ref - The ref whose tied effects shall be executed. 需要执行关联副作用的 ref。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#triggerref}
 */
export function triggerRef(ref: Ref): void {
  // ref may be an instance of ObjectRefImpl
  // ref 可能是 ObjectRefImpl 的实例
  if ((ref as unknown as RefImpl).dep) {
    if (__DEV__) {
      ;(ref as unknown as RefImpl).dep.trigger({
        target: ref,
        type: TriggerOpTypes.SET,
        key: 'value',
        newValue: (ref as unknown as RefImpl)._value,
      })
    } else {
      ;(ref as unknown as RefImpl).dep.trigger()
    }
  }
}

export type MaybeRef<T = any> =
  | T
  | Ref<T>
  | ShallowRef<T>
  | WritableComputedRef<T>

export type MaybeRefOrGetter<T = any> = MaybeRef<T> | ComputedRef<T> | (() => T)

/**
 * Returns the inner value if the argument is a ref, otherwise return the
 * argument itself. This is a sugar function for
 * `val = isRef(val) ? val.value : val`.
 * 如果参数是 ref，则返回内部值，否则返回参数本身。
 * 这是一个语法糖函数，相当于 `val = isRef(val) ? val.value : val`。
 *
 * @example
 * ```js
 * function useFoo(x: number | Ref<number>) {
 *   const unwrapped = unref(x)
 *   // unwrapped is guaranteed to be number now
 *   // unwrapped 现在保证是数字
 * }
 * ```
 *
 * @param ref - Ref or plain value to be converted into the plain value. 要转换为普通值的 Ref 或普通值。
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#unref}
 */
export function unref<T>(ref: MaybeRef<T> | ComputedRef<T>): T {
  return isRef(ref) ? ref.value : ref
}

/**
 * Normalizes values / refs / getters to values.
 * This is similar to {@link unref}, except that it also normalizes getters.
 * If the argument is a getter, it will be invoked and its return value will
 * be returned.
 * 将值 / refs / getters 规范化为值。
 * 这与 {@link unref} 类似，不同之处在于它还会规范化 getter。
 * 如果参数是 getter，它将被调用并返回其返回值。
 *
 * @example
 * ```js
 * toValue(1) // 1
 * toValue(ref(1)) // 1
 * toValue(() => 1) // 1
 * ```
 *
 * @param source - A getter, an existing ref, or a non-function value. getter、现有的 ref 或非函数值。
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#tovalue}
 */
export function toValue<T>(source: MaybeRefOrGetter<T>): T {
  return isFunction(source) ? source() : unref(source)
}

const shallowUnwrapHandlers: ProxyHandler<any> = {
  get: (target, key, receiver) =>
    key === ReactiveFlags.RAW
      ? target
      : unref(Reflect.get(target, key, receiver)), // 访问属性时自动 unref
  set: (target, key, value, receiver) => {
    const oldValue = target[key]
    // 如果旧值是 ref 而新值不是，则更新旧 ref 的 .value
    if (isRef(oldValue) && !isRef(value)) {
      oldValue.value = value
      return true
    } else {
      return Reflect.set(target, key, value, receiver)
    }
  },
}

/**
 * Returns a proxy for the given object that shallowly unwraps properties that
 * are refs. If the object already is reactive, it's returned as-is. If not, a
 * new reactive proxy is created.
 * 返回给定对象的代理，该代理浅层解包是 refs 的属性。
 * 如果对象已经是响应式的，则原样返回。如果不是，则创建一个新的响应式代理。
 *
 * @param objectWithRefs - Either an already-reactive object or a simple object
 * that contains refs. 包含 refs 的已响应式对象或简单对象。
 */
export function proxyRefs<T extends object>(
  objectWithRefs: T,
): ShallowUnwrapRef<T> {
  return isReactive(objectWithRefs)
    ? (objectWithRefs as ShallowUnwrapRef<T>)
    : new Proxy(objectWithRefs, shallowUnwrapHandlers)
}

export type CustomRefFactory<T> = (
  track: () => void,
  trigger: () => void,
) => {
  get: () => T
  set: (value: T) => void
}

class CustomRefImpl<T> {
  public dep: Dep

  private readonly _get: ReturnType<CustomRefFactory<T>>['get']
  private readonly _set: ReturnType<CustomRefFactory<T>>['set']

  public readonly [ReactiveFlags.IS_REF] = true

  public _value: T = undefined!

  constructor(factory: CustomRefFactory<T>) {
    const dep = (this.dep = new Dep())
    // 调用工厂函数，传入 track 和 trigger，获取用户定义的 get 和 set
    const { get, set } = factory(dep.track.bind(dep), dep.trigger.bind(dep))
    this._get = get
    this._set = set
  }

  get value() {
    return (this._value = this._get())
  }

  set value(newVal) {
    this._set(newVal)
  }
}

/**
 * Creates a customized ref with explicit control over its dependency tracking
 * and updates triggering.
 * 创建一个自定义的 ref，可以显式控制其依赖跟踪和更新触发。
 *
 * @param factory - The function that receives the `track` and `trigger` callbacks. 接收 `track` 和 `trigger` 回调的函数。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#customref}
 */
export function customRef<T>(factory: CustomRefFactory<T>): Ref<T> {
  return new CustomRefImpl(factory) as any
}

export type ToRefs<T = any> = {
  [K in keyof T]: ToRef<T[K]>
}

/**
 * Converts a reactive object to a plain object where each property of the
 * resulting object is a ref pointing to the corresponding property of the
 * original object. Each individual ref is created using {@link toRef}.
 * 将响应式对象转换为普通对象，其中结果对象的每个属性都是指向原始对象相应属性的 ref。
 * 每个单独的 ref 都是使用 {@link toRef} 创建的。
 *
 * @param object - Reactive object to be made into an object of linked refs. 要转换为链接 refs 对象的响应式对象。
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#torefs}
 */
/*@__NO_SIDE_EFFECTS__*/
export function toRefs<T extends object>(object: T): ToRefs<T> {
  if (__DEV__ && !isProxy(object)) {
    warn(`toRefs() expects a reactive object but received a plain one.`)
  }
  const ret: any = isArray(object) ? new Array(object.length) : {}
  for (const key in object) {
    ret[key] = propertyToRef(object, key)
  }
  return ret
}

// ObjectRefImpl 用于实现 toRef，它不存储值，而是代理到源对象的属性
class ObjectRefImpl<T extends object, K extends keyof T> {
  public readonly [ReactiveFlags.IS_REF] = true
  public _value: T[K] = undefined!

  private readonly _raw: T
  private readonly _shallow: boolean

  constructor(
    private readonly _object: T,
    private readonly _key: K,
    private readonly _defaultValue?: T[K],
  ) {
    this._raw = toRaw(_object)

    let shallow = true
    let obj = _object

    // For an array with integer key, refs are not unwrapped
    // 对于具有整数键的数组，refs 不会被解包
    if (!isArray(_object) || !isIntegerKey(String(_key))) {
      // Otherwise, check each proxy layer for unwrapping
      // 否则，检查每个代理层是否解包
      do {
        shallow = !isProxy(obj) || isShallow(obj)
      } while (shallow && (obj = (obj as Target)[ReactiveFlags.RAW]))
    }

    this._shallow = shallow
  }

  get value() {
    let val = this._object[this._key]
    if (this._shallow) {
      val = unref(val)
    }
    return (this._value = val === undefined ? this._defaultValue! : val)
  }

  set value(newVal) {
    if (this._shallow && isRef(this._raw[this._key])) {
      const nestedRef = this._object[this._key]
      if (isRef(nestedRef)) {
        nestedRef.value = newVal
        return
      }
    }

    this._object[this._key] = newVal
  }

  get dep(): Dep | undefined {
    // 从源响应式对象获取依赖
    return getDepFromReactive(this._raw, this._key)
  }
}

// GetterRefImpl 用于将 getter 函数转换为只读 ref
class GetterRefImpl<T> {
  public readonly [ReactiveFlags.IS_REF] = true
  public readonly [ReactiveFlags.IS_READONLY] = true
  public _value: T = undefined!

  constructor(private readonly _getter: () => T) {}
  get value() {
    return (this._value = this._getter())
  }
}

export type ToRef<T> = IfAny<T, Ref<T>, [T] extends [Ref] ? T : Ref<T>>

/**
 * Used to normalize values / refs / getters into refs.
 * 用于将值 / refs / getters 规范化为 refs。
 *
 * @example
 * ```js
 * // returns existing refs as-is
 * // 原样返回现有的 refs
 * toRef(existingRef)
 *
 * // creates a ref that calls the getter on .value access
 * // 创建一个在访问 .value 时调用 getter 的 ref
 * toRef(() => props.foo)
 *
 * // creates normal refs from non-function values
 * // equivalent to ref(1)
 * // 从非函数值创建普通 refs，相当于 ref(1)
 * toRef(1)
 * ```
 *
 * Can also be used to create a ref for a property on a source reactive object.
 * The created ref is synced with its source property: mutating the source
 * property will update the ref, and vice-versa.
 * 也可以用于为源响应式对象上的属性创建 ref。
 * 创建的 ref 与其源属性同步：改变源属性将更新 ref，反之亦然。
 *
 * @example
 * ```js
 * const state = reactive({
 *   foo: 1,
 *   bar: 2
 * })
 *
 * const fooRef = toRef(state, 'foo')
 *
 * // mutating the ref updates the original
 * // 改变 ref 会更新原始对象
 * fooRef.value++
 * console.log(state.foo) // 2
 *
 * // mutating the original also updates the ref
 * // 改变原始对象也会更新 ref
 * state.foo++
 * console.log(fooRef.value) // 3
 * ```
 *
 * @param source - A getter, an existing ref, a non-function value, or a
 *                 reactive object to create a property ref from. getter、现有 ref、非函数值或要从中创建属性 ref 的响应式对象。
 * @param [key] - (optional) Name of the property in the reactive object. (可选) 响应式对象中的属性名称。
 * @see {@link https://vuejs.org/api/reactivity-utilities.html#toref}
 */
export function toRef<T>(
  value: T,
): T extends () => infer R
  ? Readonly<Ref<R>>
  : T extends Ref
    ? T
    : Ref<UnwrapRef<T>>
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
): ToRef<T[K]>
export function toRef<T extends object, K extends keyof T>(
  object: T,
  key: K,
  defaultValue: T[K],
): ToRef<Exclude<T[K], undefined>>
/*@__NO_SIDE_EFFECTS__*/
export function toRef(
  source: Record<string, any> | MaybeRef,
  key?: string,
  defaultValue?: unknown,
): Ref {
  if (isRef(source)) {
    return source
  } else if (isFunction(source)) {
    return new GetterRefImpl(source) as any
  } else if (isObject(source) && arguments.length > 1) {
    return propertyToRef(source, key!, defaultValue)
  } else {
    return ref(source)
  }
}

function propertyToRef(
  source: Record<string, any>,
  key: string,
  defaultValue?: unknown,
) {
  return new ObjectRefImpl(source, key, defaultValue) as any
}

/**
 * This is a special exported interface for other packages to declare
 * additional types that should bail out for ref unwrapping. For example
 * \@vue/runtime-dom can declare it like so in its d.ts:
 * 这是一个特殊的导出接口，供其他包声明应该退出 ref 解包的附加类型。
 * 例如 \@vue/runtime-dom 可以在其 d.ts 中这样声明：
 *
 * ``` ts
 * declare module '@vue/reactivity' {
 *   export interface RefUnwrapBailTypes {
 *     runtimeDOMBailTypes: Node | Window
 *   }
 * }
 * ```
 */
export interface RefUnwrapBailTypes {}

export type ShallowUnwrapRef<T> = {
  [K in keyof T]: DistributeRef<T[K]>
}

type DistributeRef<T> = T extends Ref<infer V, unknown> ? V : T

export type UnwrapRef<T> =
  T extends ShallowRef<infer V, unknown>
    ? V
    : T extends Ref<infer V, unknown>
      ? UnwrapRefSimple<V>
      : UnwrapRefSimple<T>

export type UnwrapRefSimple<T> = T extends
  | Builtin
  | Ref
  | RefUnwrapBailTypes[keyof RefUnwrapBailTypes]
  | { [RawSymbol]?: true }
  ? T
  : T extends Map<infer K, infer V>
    ? Map<K, UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Map<any, any>>>
    : T extends WeakMap<infer K, infer V>
      ? WeakMap<K, UnwrapRefSimple<V>> &
          UnwrapRef<Omit<T, keyof WeakMap<any, any>>>
      : T extends Set<infer V>
        ? Set<UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof Set<any>>>
        : T extends WeakSet<infer V>
          ? WeakSet<UnwrapRefSimple<V>> & UnwrapRef<Omit<T, keyof WeakSet<any>>>
          : T extends ReadonlyArray<any>
            ? { [K in keyof T]: UnwrapRefSimple<T[K]> }
            : T extends object & { [ShallowReactiveMarker]?: never }
              ? {
                  [P in keyof T]: P extends symbol ? T[P] : UnwrapRef<T[P]>
                }
              : T
