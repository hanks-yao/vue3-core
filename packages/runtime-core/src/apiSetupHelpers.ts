import {
  type IfAny,
  type LooseRequired,
  type Prettify,
  type UnionToIntersection,
  extend,
  isArray,
  isFunction,
  isPromise,
} from '@vue/shared'
import {
  type SetupContext,
  createSetupContext,
  getCurrentInstance,
  setCurrentInstance,
  unsetCurrentInstance,
} from './component'
import type { EmitFn, EmitsOptions, ObjectEmitsOptions } from './componentEmits'
import type {
  ComponentOptionsBase,
  ComponentOptionsMixin,
  ComputedOptions,
  MethodOptions,
} from './componentOptions'
import type {
  ComponentObjectPropsOptions,
  ComponentPropsOptions,
  ExtractPropTypes,
  PropOptions,
} from './componentProps'
import { warn } from './warning'
import type { SlotsType, StrictUnwrapSlotsType } from './componentSlots'
import type { Ref } from '@vue/reactivity'

// dev only
// 仅开发环境
const warnRuntimeUsage = (method: string) =>
  warn(
    `${method}() is a compiler-hint helper that is only usable inside ` +
      `<script setup> of a single file component. Its arguments should be ` +
      `compiled away and passing it at runtime has no effect.` +
      `\n${method}() 是一个编译器提示辅助函数，仅在单文件组件的 <script setup> 中可用。` +
      `它的参数应该被编译掉，在运行时传递参数没有任何效果。`,
  )

/**
 * Vue `<script setup>` compiler macro for declaring component props. The
 * expected argument is the same as the component `props` option.
 *
 * Vue `<script setup>` 编译器宏，用于声明组件 props。
 * 期望的参数与组件 `props` 选项相同。
 *
 * Example runtime declaration:
 * 运行时声明示例：
 * ```js
 * // using Array syntax
 * // 使用数组语法
 * const props = defineProps(['foo', 'bar'])
 * // using Object syntax
 * // 使用对象语法
 * const props = defineProps({
 *   foo: String,
 *   bar: {
 *     type: Number,
 *     required: true
 *   }
 * })
 * ```
 *
 * Equivalent type-based declaration:
 * 等价的基于类型的声明：
 * ```ts
 * // will be compiled into equivalent runtime declarations
 * // 将被编译成等价的运行时声明
 * const props = defineProps<{
 *   foo?: string
 *   bar: number
 * }>()
 * ```
 *
 * @see {@link https://vuejs.org/api/sfc-script-setup.html#defineprops-defineemits}
 *
 * This is only usable inside `<script setup>`, is compiled away in the
 * output and should **not** be actually called at runtime.
 * 这仅在 `<script setup>` 中可用，会在输出中被编译掉，**不**应该在运行时实际调用。
 */
// overload 1: runtime props w/ array
// 重载 1：使用数组的运行时 props
export function defineProps<PropNames extends string = string>(
  props: PropNames[],
): Prettify<Readonly<{ [key in PropNames]?: any }>>
// overload 2: runtime props w/ object
// 重载 2：使用对象的运行时 props
export function defineProps<
  PP extends ComponentObjectPropsOptions = ComponentObjectPropsOptions,
>(props: PP): Prettify<Readonly<ExtractPropTypes<PP>>>
// overload 3: typed-based declaration
// 重载 3：基于类型的声明
export function defineProps<TypeProps>(): DefineProps<
  LooseRequired<TypeProps>,
  BooleanKey<TypeProps>
>
// implementation
// 实现
export function defineProps() {
  if (__DEV__) {
    warnRuntimeUsage(`defineProps`)
  }
  return null as any
}

export type DefineProps<T, BKeys extends keyof T> = Readonly<T> & {
  readonly [K in BKeys]-?: boolean
}

type BooleanKey<T, K extends keyof T = keyof T> = K extends any
  ? T[K] extends boolean | undefined
    ? T[K] extends never | undefined
      ? never
      : K
    : never
  : never

/**
 * Vue `<script setup>` compiler macro for declaring a component's emitted
 * events. The expected argument is the same as the component `emits` option.
 *
 * Vue `<script setup>` 编译器宏，用于声明组件触发的事件。
 * 期望的参数与组件 `emits` 选项相同。
 *
 * Example runtime declaration:
 * 运行时声明示例：
 * ```js
 * const emit = defineEmits(['change', 'update'])
 * ```
 *
 * Example type-based declaration:
 * 基于类型的声明示例：
 * ```ts
 * const emit = defineEmits<{
 *   // <eventName>: <expected arguments>
 *   // <事件名>: <期望参数>
 *   change: []
 *   update: [value: number] // named tuple syntax // 命名元组语法
 * }>()
 *
 * emit('change')
 * emit('update', 1)
 * ```
 *
 * This is only usable inside `<script setup>`, is compiled away in the
 * output and should **not** be actually called at runtime.
 * 这仅在 `<script setup>` 中可用，会在输出中被编译掉，**不**应该在运行时实际调用。
 *
 * @see {@link https://vuejs.org/api/sfc-script-setup.html#defineprops-defineemits}
 */
// overload 1: runtime emits w/ array
// 重载 1：使用数组的运行时 emits
export function defineEmits<EE extends string = string>(
  emitOptions: EE[],
): EmitFn<EE[]>
// 重载 2：使用对象的运行时 emits
export function defineEmits<E extends EmitsOptions = EmitsOptions>(
  emitOptions: E,
): EmitFn<E>
// 重载 3：基于类型的声明
export function defineEmits<T extends ComponentTypeEmits>(): T extends (
  ...args: any[]
) => any
  ? T
  : ShortEmits<T>
// implementation
// 实现
export function defineEmits() {
  if (__DEV__) {
    warnRuntimeUsage(`defineEmits`)
  }
  return null as any
}

export type ComponentTypeEmits = ((...args: any[]) => any) | Record<string, any>

type RecordToUnion<T extends Record<string, any>> = T[keyof T]

type ShortEmits<T extends Record<string, any>> = UnionToIntersection<
  RecordToUnion<{
    [K in keyof T]: (evt: K, ...args: T[K]) => void
  }>
>

/**
 * Vue `<script setup>` compiler macro for declaring a component's exposed
 * instance properties when it is accessed by a parent component via template
 * refs.
 *
 * Vue `<script setup>` 编译器宏，用于声明当父组件通过模板引用访问该组件时，
 * 该组件暴露的实例属性。
 *
 * `<script setup>` components are closed by default - i.e. variables inside
 * the `<script setup>` scope is not exposed to parent unless explicitly exposed
 * via `defineExpose`.
 *
 * `<script setup>` 组件默认是关闭的 - 即 `<script setup>` 作用域内的变量
 * 不会暴露给父组件，除非通过 `defineExpose` 显式暴露。
 *
 * This is only usable inside `<script setup>`, is compiled away in the
 * output and should **not** be actually called at runtime.
 * 这仅在 `<script setup>` 中可用，会在输出中被编译掉，**不**应该在运行时实际调用。
 *
 * @see {@link https://vuejs.org/api/sfc-script-setup.html#defineexpose}
 */
export function defineExpose<
  Exposed extends Record<string, any> = Record<string, any>,
>(exposed?: Exposed): void {
  if (__DEV__) {
    warnRuntimeUsage(`defineExpose`)
  }
}

/**
 * Vue `<script setup>` compiler macro for declaring a component's additional
 * options. This should be used only for options that cannot be expressed via
 * Composition API - e.g. `inheritAttrs`.
 *
 * Vue `<script setup>` 编译器宏，用于声明组件的额外选项。
 * 这应该仅用于无法通过组合式 API 表达的选项 - 例如 `inheritAttrs`。
 *
 * @see {@link https://vuejs.org/api/sfc-script-setup.html#defineoptions}
 */
export function defineOptions<
  RawBindings = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
>(
  options?: ComponentOptionsBase<
    {},
    RawBindings,
    D,
    C,
    M,
    Mixin,
    Extends,
    {}
  > & {
    /**
     * props should be defined via defineProps().
     * props 应该通过 defineProps() 定义。
     */
    props?: never
    /**
     * emits should be defined via defineEmits().
     * emits 应该通过 defineEmits() 定义。
     */
    emits?: never
    /**
     * expose should be defined via defineExpose().
     * expose 应该通过 defineExpose() 定义。
     */
    expose?: never
    /**
     * slots should be defined via defineSlots().
     * slots 应该通过 defineSlots() 定义。
     */
    slots?: never
  },
): void {
  if (__DEV__) {
    warnRuntimeUsage(`defineOptions`)
  }
}

// 声明 slots 类型
export function defineSlots<
  S extends Record<string, any> = Record<string, any>,
>(): StrictUnwrapSlotsType<SlotsType<S>> {
  if (__DEV__) {
    warnRuntimeUsage(`defineSlots`)
  }
  return null as any
}

export type ModelRef<T, M extends PropertyKey = string, G = T, S = T> = Ref<
  G,
  S
> &
  [ModelRef<T, M, G, S>, Record<M, true | undefined>]

export type DefineModelOptions<T = any, G = T, S = T> = {
  get?: (v: T) => G
  set?: (v: S) => any
}

/**
 * Vue `<script setup>` compiler macro for declaring a
 * two-way binding prop that can be consumed via `v-model` from the parent
 * component. This will declare a prop with the same name and a corresponding
 * `update:propName` event.
 *
 * Vue `<script setup>` 编译器宏，用于声明一个双向绑定 prop，
 * 父组件可以通过 `v-model` 使用它。这将声明一个同名的 prop 和一个对应的
 * `update:propName` 事件。
 *
 * If the first argument is a string, it will be used as the prop name;
 * Otherwise the prop name will default to "modelValue". In both cases, you
 * can also pass an additional object which will be used as the prop's options.
 *
 * 如果第一个参数是字符串，它将被用作 prop 名称；
 * 否则 prop 名称默认为 "modelValue"。在这两种情况下，
 * 你还可以传递一个额外的对象作为 prop 的选项。
 *
 * The returned ref behaves differently depending on whether the parent
 * provided the corresponding v-model props or not:
 * - If yes, the returned ref's value will always be in sync with the parent
 *   prop.
 * - If not, the returned ref will behave like a normal local ref.
 *
 * 返回的 ref 的行为取决于父组件是否提供了相应的 v-model props：
 * - 如果提供了，返回的 ref 的值将始终与父组件 prop 同步。
 * - 如果没有，返回的 ref 将像普通的本地 ref 一样行为。
 *
 * @example
 * ```ts
 * // default model (consumed via `v-model`)
 * // 默认 model (通过 `v-model` 使用)
 * const modelValue = defineModel<string>()
 * modelValue.value = "hello"
 *
 * // default model with options
 * // 带选项的默认 model
 * const modelValue = defineModel<string>({ required: true })
 *
 * // with specified name (consumed via `v-model:count`)
 * // 指定名称 (通过 `v-model:count` 使用)
 * const count = defineModel<number>('count')
 * count.value++
 *
 * // with specified name and default value
 * // 指定名称和默认值
 * const count = defineModel<number>('count', { default: 0 })
 * ```
 */
export function defineModel<T, M extends PropertyKey = string, G = T, S = T>(
  options: ({ default: any } | { required: true }) &
    PropOptions<T> &
    DefineModelOptions<T, G, S>,
): ModelRef<T, M, G, S>

export function defineModel<T, M extends PropertyKey = string, G = T, S = T>(
  options?: PropOptions<T> & DefineModelOptions<T, G, S>,
): ModelRef<T | undefined, M, G | undefined, S | undefined>

export function defineModel<T, M extends PropertyKey = string, G = T, S = T>(
  name: string,
  options: ({ default: any } | { required: true }) &
    PropOptions<T> &
    DefineModelOptions<T, G, S>,
): ModelRef<T, M, G, S>

export function defineModel<T, M extends PropertyKey = string, G = T, S = T>(
  name: string,
  options?: PropOptions<T> & DefineModelOptions<T, G, S>,
): ModelRef<T | undefined, M, G | undefined, S | undefined>

export function defineModel(): any {
  if (__DEV__) {
    warnRuntimeUsage('defineModel')
  }
}

type NotUndefined<T> = T extends undefined ? never : T
type MappedOmit<T, K extends keyof any> = {
  [P in keyof T as P extends K ? never : P]: T[P]
}

type InferDefaults<T> = {
  [K in keyof T]?: InferDefault<T, T[K]>
}

type NativeType =
  | null
  | undefined
  | number
  | string
  | boolean
  | symbol
  | Function

type InferDefault<P, T> =
  | ((props: P) => T & {})
  | (T extends NativeType ? T : never)

type PropsWithDefaults<
  T,
  Defaults extends InferDefaults<T>,
  BKeys extends keyof T,
> = T extends unknown
  ? Readonly<MappedOmit<T, keyof Defaults>> & {
      readonly [K in keyof Defaults as K extends keyof T
        ? K
        : never]-?: K extends keyof T
        ? Defaults[K] extends undefined
          ? IfAny<Defaults[K], NotUndefined<T[K]>, T[K]>
          : NotUndefined<T[K]>
        : never
    } & {
      readonly [K in BKeys]-?: K extends keyof Defaults
        ? Defaults[K] extends undefined
          ? boolean | undefined
          : boolean
        : boolean
    }
  : never

/**
 * Vue `<script setup>` compiler macro for providing props default values when
 * using type-based `defineProps` declaration.
 *
 * Vue `<script setup>` 编译器宏，用于在使用基于类型的 `defineProps` 声明时提供 props 默认值。
 *
 * Example usage:
 * 使用示例：
 * ```ts
 * withDefaults(defineProps<{
 *   size?: number
 *   labels?: string[]
 * }>(), {
 *   size: 3,
 *   labels: () => ['default label']
 * })
 * ```
 *
 * This is only usable inside `<script setup>`, is compiled away in the output
 * and should **not** be actually called at runtime.
 * 这仅在 `<script setup>` 中可用，会在输出中被编译掉，**不**应该在运行时实际调用。
 *
 * @see {@link https://vuejs.org/guide/typescript/composition-api.html#typing-component-props}
 */
export function withDefaults<
  T,
  BKeys extends keyof T,
  Defaults extends InferDefaults<T>,
>(
  props: DefineProps<T, BKeys>,
  defaults: Defaults,
): PropsWithDefaults<T, Defaults, BKeys> {
  if (__DEV__) {
    warnRuntimeUsage(`withDefaults`)
  }
  return null as any
}

// 获取 slots
export function useSlots(): SetupContext['slots'] {
  return getContext('useSlots').slots
}

// 获取 attrs
export function useAttrs(): SetupContext['attrs'] {
  return getContext('useAttrs').attrs
}

// 获取当前上下文
function getContext(calledFunctionName: string): SetupContext {
  const i = getCurrentInstance()!
  if (__DEV__ && !i) {
    warn(`${calledFunctionName}() called without active instance.`)
  }
  return i.setupContext || (i.setupContext = createSetupContext(i))
}

/**
 * @internal
 */
// 标准化 props 或 emits 选项
export function normalizePropsOrEmits(
  props: ComponentPropsOptions | EmitsOptions,
): ComponentObjectPropsOptions | ObjectEmitsOptions {
  return isArray(props)
    ? props.reduce(
        (normalized, p) => ((normalized[p] = null), normalized),
        {} as ComponentObjectPropsOptions | ObjectEmitsOptions,
      )
    : props
}

/**
 * Runtime helper for merging default declarations. Imported by compiled code
 * only.
 * 运行时辅助函数，用于合并默认声明。仅由编译后的代码导入。
 * @internal
 */
export function mergeDefaults(
  raw: ComponentPropsOptions,
  defaults: Record<string, any>,
): ComponentObjectPropsOptions {
  const props = normalizePropsOrEmits(raw)
  for (const key in defaults) {
    // 跳过内部标记
    if (key.startsWith('__skip')) continue
    let opt = props[key]
    if (opt) {
      // 如果是数组或函数类型的 prop 定义，转换为对象格式
      if (isArray(opt) || isFunction(opt)) {
        opt = props[key] = { type: opt, default: defaults[key] }
      } else {
        // 否则直接设置 default
        opt.default = defaults[key]
      }
    } else if (opt === null) {
      // 如果 prop 定义为 null，初始化为对象
      opt = props[key] = { default: defaults[key] }
    } else if (__DEV__) {
      warn(`props default key "${key}" has no corresponding declaration.`)
    }
    // 处理跳过工厂函数的标记
    if (opt && defaults[`__skip_${key}`]) {
      opt.skipFactory = true
    }
  }
  return props
}

/**
 * Runtime helper for merging model declarations.
 * Imported by compiled code only.
 * 运行时辅助函数，用于合并 model 声明。
 * 仅由编译后的代码导入。
 * @internal
 */
export function mergeModels(
  a: ComponentPropsOptions | EmitsOptions,
  b: ComponentPropsOptions | EmitsOptions,
): ComponentPropsOptions | EmitsOptions {
  if (!a || !b) return a || b
  if (isArray(a) && isArray(b)) return a.concat(b)
  return extend({}, normalizePropsOrEmits(a), normalizePropsOrEmits(b))
}

/**
 * Used to create a proxy for the rest element when destructuring props with
 * defineProps().
 * 用于在 defineProps() 解构 props 时为剩余元素创建代理。
 * @internal
 */
export function createPropsRestProxy(
  props: any,
  excludedKeys: string[],
): Record<string, any> {
  const ret: Record<string, any> = {}
  for (const key in props) {
    if (!excludedKeys.includes(key)) {
      Object.defineProperty(ret, key, {
        enumerable: true,
        get: () => props[key],
      })
    }
  }
  return ret
}

/**
 * `<script setup>` helper for persisting the current instance context over
 * async/await flows.
 * `<script setup>` 辅助函数，用于在 async/await 流程中持久化当前实例上下文。
 *
 * `@vue/compiler-sfc` converts the following:
 * `@vue/compiler-sfc` 将以下内容：
 *
 * ```ts
 * const x = await foo()
 * ```
 *
 * into:
 * 转换为：
 *
 * ```ts
 * let __temp, __restore
 * const x = (([__temp, __restore] = withAsyncContext(() => foo())),__temp=await __temp,__restore(),__temp)
 * ```
 * @internal
 */
export function withAsyncContext(getAwaitable: () => any): [any, () => void] {
  const ctx = getCurrentInstance()!
  if (__DEV__ && !ctx) {
    warn(
      `withAsyncContext called without active current instance. ` +
        `This is likely a bug.`,
    )
  }
  let awaitable = getAwaitable()
  // 暂时清除当前实例，避免 await 期间的副作用影响
  unsetCurrentInstance()
  if (isPromise(awaitable)) {
    awaitable = awaitable.catch(e => {
      // 如果出错，恢复实例并抛出错误
      setCurrentInstance(ctx)
      throw e
    })
  }
  // 返回 awaitable 和恢复函数
  return [awaitable, () => setCurrentInstance(ctx)]
}
