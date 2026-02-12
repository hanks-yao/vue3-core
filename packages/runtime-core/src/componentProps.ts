import {
  TriggerOpTypes,
  shallowReactive,
  shallowReadonly,
  toRaw,
  trigger,
} from '@vue/reactivity'
import {
  EMPTY_ARR,
  EMPTY_OBJ,
  type IfAny,
  PatchFlags,
  camelize,
  capitalize,
  extend,
  hasOwn,
  hyphenate,
  isArray,
  isFunction,
  isObject,
  isOn,
  isReservedProp,
  isString,
  makeMap,
  toRawType,
} from '@vue/shared'
import { warn } from './warning'
import {
  type ComponentInternalInstance,
  type ComponentOptions,
  type ConcreteComponent,
  type Data,
  setCurrentInstance,
} from './component'
import { isEmitListener } from './componentEmits'
import type { AppContext } from './apiCreateApp'
import { createPropsDefaultThis } from './compat/props'
import { isCompatEnabled, softAssertCompatEnabled } from './compat/compatConfig'
import { DeprecationTypes } from './compat/compatConfig'
import { shouldSkipAttr } from './compat/attrsFallthrough'
import { createInternalObject } from './internalObject'

export type ComponentPropsOptions<P = Data> =
  | ComponentObjectPropsOptions<P>
  | string[]

export type ComponentObjectPropsOptions<P = Data> = {
  [K in keyof P]: Prop<P[K]> | null
}

export type Prop<T, D = T> = PropOptions<T, D> | PropType<T>

type DefaultFactory<T> = (props: Data) => T | null | undefined

export interface PropOptions<T = any, D = T> {
  type?: PropType<T> | true | null
  required?: boolean
  default?: D | DefaultFactory<D> | null | undefined | object
  validator?(value: unknown, props: Data): boolean
  /**
   * @internal
   */
  skipCheck?: boolean
  /**
   * @internal
   */
  skipFactory?: boolean
}

export type PropType<T> = PropConstructor<T> | (PropConstructor<T> | null)[]

type PropConstructor<T = any> =
  | { new (...args: any[]): T & {} }
  | { (): T }
  | PropMethod<T>

type PropMethod<T, TConstructor = any> = [T] extends [
  ((...args: any) => any) | undefined,
] // if is function with args, allowing non-required functions
  // 如果是带参数的函数，允许非必需的函数
  ? { new (): TConstructor; (): T; readonly prototype: TConstructor } // Create Function like constructor // 创建类似构造函数的 Function
  : never

type RequiredKeys<T> = {
  [K in keyof T]: T[K] extends
    | { required: true }
    | { default: any }
    // don't mark Boolean props as undefined
    // 不要将 Boolean props 标记为 undefined
    | BooleanConstructor
    | { type: BooleanConstructor }
    ? T[K] extends { default: undefined | (() => undefined) }
      ? never
      : K
    : never
}[keyof T]

type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>

type DefaultKeys<T> = {
  [K in keyof T]: T[K] extends
    | { default: any }
    // Boolean implicitly defaults to false
    // Boolean 隐式默认为 false
    | BooleanConstructor
    | { type: BooleanConstructor }
    ? T[K] extends { type: BooleanConstructor; required: true } // not default if Boolean is marked as required // 如果 Boolean 被标记为 required，则没有默认值
      ? never
      : K
    : never
}[keyof T]

type InferPropType<T, NullAsAny = true> = [T] extends [null]
  ? NullAsAny extends true
    ? any
    : null
  : [T] extends [{ type: null | true }]
    ? any // As TS issue https://github.com/Microsoft/TypeScript/issues/14829 // somehow `ObjectConstructor` when inferred from { (): T } becomes `any` // `BooleanConstructor` when inferred from PropConstructor(with PropMethod) becomes `Boolean`
    : [T] extends [ObjectConstructor | { type: ObjectConstructor }]
      ? Record<string, any>
      : [T] extends [BooleanConstructor | { type: BooleanConstructor }]
        ? boolean
        : [T] extends [DateConstructor | { type: DateConstructor }]
          ? Date
          : [T] extends [(infer U)[] | { type: (infer U)[] }]
            ? U extends DateConstructor
              ? Date | InferPropType<U, false>
              : InferPropType<U, false>
            : [T] extends [Prop<infer V, infer D>]
              ? unknown extends V
                ? keyof V extends never
                  ? IfAny<V, V, D>
                  : V
                : V
              : T

/**
 * Extract prop types from a runtime props options object.
 * The extracted types are **internal** - i.e. the resolved props received by
 * the component.
 * - Boolean props are always present
 * - Props with default values are always present
 *
 * To extract accepted props from the parent, use {@link ExtractPublicPropTypes}.
 *
 * 从运行时 props 选项对象中提取 prop 类型。
 * 提取的类型是 **内部的** - 即组件接收到的已解析 props。
 * - Boolean props 总是存在的
 * - 具有默认值的 Props 总是存在的
 *
 * 要提取父组件接受的 props，请使用 {@link ExtractPublicPropTypes}。
 */
export type ExtractPropTypes<O> = {
  // use `keyof Pick<O, RequiredKeys<O>>` instead of `RequiredKeys<O>` to
  // support IDE features
  // 使用 `keyof Pick<O, RequiredKeys<O>>` 代替 `RequiredKeys<O>` 以支持 IDE 功能
  [K in keyof Pick<O, RequiredKeys<O>>]: O[K] extends { default: any }
    ? Exclude<InferPropType<O[K]>, undefined>
    : InferPropType<O[K]>
} & {
  // use `keyof Pick<O, OptionalKeys<O>>` instead of `OptionalKeys<O>` to
  // support IDE features
  // 使用 `keyof Pick<O, OptionalKeys<O>>` 代替 `OptionalKeys<O>` 以支持 IDE 功能
  [K in keyof Pick<O, OptionalKeys<O>>]?: InferPropType<O[K]>
}

type PublicRequiredKeys<T> = {
  [K in keyof T]: T[K] extends { required: true } ? K : never
}[keyof T]

type PublicOptionalKeys<T> = Exclude<keyof T, PublicRequiredKeys<T>>

/**
 * Extract prop types from a runtime props options object.
 * The extracted types are **public** - i.e. the expected props that can be
 * passed to component.
 *
 * 从运行时 props 选项对象中提取 prop 类型。
 * 提取的类型是 **公开的** - 即可以传递给组件的预期 props。
 */
export type ExtractPublicPropTypes<O> = {
  [K in keyof Pick<O, PublicRequiredKeys<O>>]: InferPropType<O[K]>
} & {
  [K in keyof Pick<O, PublicOptionalKeys<O>>]?: InferPropType<O[K]>
}

enum BooleanFlags {
  shouldCast,
  shouldCastTrue,
}

// extract props which defined with default from prop options
// 从 prop 选项中提取定义了默认值的 props
export type ExtractDefaultPropTypes<O> = O extends object
  ? // use `keyof Pick<O, DefaultKeys<O>>` instead of `DefaultKeys<O>` to support IDE features
    // 使用 `keyof Pick<O, DefaultKeys<O>>` 代替 `DefaultKeys<O>` 以支持 IDE 功能
    { [K in keyof Pick<O, DefaultKeys<O>>]: InferPropType<O[K]> }
  : {}

type NormalizedProp = PropOptions & {
  [BooleanFlags.shouldCast]?: boolean
  [BooleanFlags.shouldCastTrue]?: boolean
}

// normalized value is a tuple of the actual normalized options
// and an array of prop keys that need value casting (booleans and defaults)
// 规范化后的值是一个元组，包含实际的规范化选项
// 和一个需要值转换（布尔值和默认值）的 prop 键数组
export type NormalizedProps = Record<string, NormalizedProp>
export type NormalizedPropsOptions = [NormalizedProps, string[]] | []

// 初始化 Props
export function initProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  isStateful: number, // result of bitwise flag comparison // 位标志比较的结果
  isSSR = false,
): void {
  const props: Data = {}
  const attrs: Data = createInternalObject()

  // 存储 props 的默认值
  instance.propsDefaults = Object.create(null)

  // 设置完整的 props，区分 props 和 attrs
  setFullProps(instance, rawProps, props, attrs)

  // ensure all declared prop keys are present
  // 确保所有声明的 prop 键都存在
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = undefined
    }
  }

  // validation
  // 校验
  if (__DEV__) {
    validateProps(rawProps || {}, props, instance)
  }

  if (isStateful) {
    // stateful
    // 有状态组件
    instance.props = isSSR ? props : shallowReactive(props)
  } else {
    if (!instance.type.props) {
      // functional w/ optional props, props === attrs
      // 函数式组件且没有声明 props，props === attrs
      instance.props = attrs
    } else {
      // functional w/ declared props
      // 函数式组件且声明了 props
      instance.props = props
    }
  }
  instance.attrs = attrs
}

function isInHmrContext(instance: ComponentInternalInstance | null) {
  while (instance) {
    if (instance.type.__hmrId) return true
    instance = instance.parent
  }
}

export function updateProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  rawPrevProps: Data | null,
  optimized: boolean,
): void {
  const {
    props,
    attrs,
    vnode: { patchFlag },
  } = instance
  const rawCurrentProps = toRaw(props)
  const [options] = instance.propsOptions
  let hasAttrsChanged = false

  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    // 在开发环境中总是强制全量 diff
    // - #1942 如果启用了 hmr 且是 sfc 组件
    // - vite#872 sfc 组件使用的非 sfc 组件
    !(__DEV__ && isInHmrContext(instance)) &&
    (optimized || patchFlag > 0) &&
    !(patchFlag & PatchFlags.FULL_PROPS)
  ) {
    // 优化模式：只更新变化的 props
    if (patchFlag & PatchFlags.PROPS) {
      // Compiler-generated props & no keys change, just set the updated
      // the props.
      // 编译器生成的 props 且键没有变化，直接设置更新后的 props。
      const propsToUpdate = instance.vnode.dynamicProps!
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i]
        // skip if the prop key is a declared emit event listener
        // 如果 prop 键是声明的 emit 事件监听器，则跳过
        if (isEmitListener(instance.emitsOptions, key)) {
          continue
        }
        // PROPS flag guarantees rawProps to be non-null
        // PROPS 标志保证 rawProps 不为 null
        const value = rawProps![key]
        if (options) {
          // attr / props separation was done on init and will be consistent
          // in this code path, so just check if attrs have it.
          // attr / props 分离在初始化时已完成，并且在此代码路径中将保持一致，
          // 所以只需检查 attrs 是否有它。
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value
              hasAttrsChanged = true
            }
          } else {
            const camelizedKey = camelize(key)
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false /* isAbsent */,
            )
          }
        } else {
          if (__COMPAT__) {
            if (isOn(key) && key.endsWith('Native')) {
              key = key.slice(0, -6) // remove Native postfix // 移除 Native 后缀
            } else if (shouldSkipAttr(key, instance)) {
              continue
            }
          }
          if (value !== attrs[key]) {
            attrs[key] = value
            hasAttrsChanged = true
          }
        }
      }
    }
  } else {
    // full props update.
    // 全量 props 更新。
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true
    }
    // in case of dynamic props, check if we need to delete keys from
    // the props object
    // 对于动态 props，检查是否需要从 props 对象中删除键
    let kebabKey: string
    for (const key in rawCurrentProps) {
      if (
        !rawProps ||
        // for camelCase
        // 对于驼峰命名
        (!hasOwn(rawProps, key) &&
          // it's possible the original props was passed in as kebab-case
          // and converted to camelCase (#955)
          // 原始 props 可能以 kebab-case 传入并转换为 camelCase (#955)
          ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey)))
      ) {
        if (options) {
          if (
            rawPrevProps &&
            // for camelCase
            // 对于驼峰命名
            (rawPrevProps[key] !== undefined ||
              // for kebab-case
              // 对于 kebab-case
              rawPrevProps[kebabKey!] !== undefined)
          ) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              undefined,
              instance,
              true /* isAbsent */,
            )
          }
        } else {
          delete props[key]
        }
      }
    }
    // in the case of functional component w/o props declaration, props and
    // attrs point to the same object so it should already have been updated.
    // 对于没有 props 声明的函数式组件，props 和 attrs 指向同一个对象，
    // 所以它应该已经被更新了。
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (
          !rawProps ||
          (!hasOwn(rawProps, key) &&
            (!__COMPAT__ || !hasOwn(rawProps, key + 'Native')))
        ) {
          delete attrs[key]
          hasAttrsChanged = true
        }
      }
    }
  }

  // trigger updates for $attrs in case it's used in component slots
  // 触发 $attrs 的更新，以防它在组件插槽中使用
  if (hasAttrsChanged) {
    trigger(instance.attrs, TriggerOpTypes.SET, '')
  }

  if (__DEV__) {
    validateProps(rawProps || {}, props, instance)
  }
}

function setFullProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  props: Data,
  attrs: Data,
) {
  const [options, needCastKeys] = instance.propsOptions
  let hasAttrsChanged = false
  let rawCastValues: Data | undefined
  if (rawProps) {
    for (let key in rawProps) {
      // key, ref are reserved and never passed down
      // key, ref 是保留字，永远不会向下传递
      if (isReservedProp(key)) {
        continue
      }

      if (__COMPAT__) {
        if (key.startsWith('onHook:')) {
          softAssertCompatEnabled(
            DeprecationTypes.INSTANCE_EVENT_HOOKS,
            instance,
            key.slice(2).toLowerCase(),
          )
        }
        if (key === 'inline-template') {
          continue
        }
      }

      const value = rawProps[key]
      // prop option names are camelized during normalization, so to support
      // kebab -> camel conversion here we need to camelize the key.
      // prop 选项名称在规范化期间被驼峰化，所以为了支持这里的 kebab -> camel 转换，
      // 我们需要将 key 驼峰化。
      let camelKey
      if (options && hasOwn(options, (camelKey = camelize(key)))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          props[camelKey] = value
        } else {
          ;(rawCastValues || (rawCastValues = {}))[camelKey] = value
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        // Any non-declared (either as a prop or an emitted event) props are put
        // into a separate `attrs` object for spreading. Make sure to preserve
        // original key casing
        // 任何未声明（既不是 prop 也不是 emitted 事件）的 props 都放入
        // 单独的 `attrs` 对象中以供展开。确保保留原始键的大小写
        if (__COMPAT__) {
          if (isOn(key) && key.endsWith('Native')) {
            key = key.slice(0, -6) // remove Native postfix // 移除 Native 后缀
          } else if (shouldSkipAttr(key, instance)) {
            continue
          }
        }
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value
          hasAttrsChanged = true
        }
      }
    }
  }

  if (needCastKeys) {
    const rawCurrentProps = toRaw(props)
    const castValues = rawCastValues || EMPTY_OBJ
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i]
      props[key] = resolvePropValue(
        options!,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key),
      )
    }
  }

  return hasAttrsChanged
}

function resolvePropValue(
  options: NormalizedProps,
  props: Data,
  key: string,
  value: unknown,
  instance: ComponentInternalInstance,
  isAbsent: boolean,
) {
  const opt = options[key]
  if (opt != null) {
    const hasDefault = hasOwn(opt, 'default')
    // default values
    // 默认值
    if (hasDefault && value === undefined) {
      const defaultValue = opt.default
      if (
        opt.type !== Function &&
        !opt.skipFactory &&
        isFunction(defaultValue)
      ) {
        const { propsDefaults } = instance
        if (key in propsDefaults) {
          value = propsDefaults[key]
        } else {
          const reset = setCurrentInstance(instance)
          value = propsDefaults[key] = defaultValue.call(
            __COMPAT__ &&
              isCompatEnabled(DeprecationTypes.PROPS_DEFAULT_THIS, instance)
              ? createPropsDefaultThis(instance, props, key)
              : null,
            props,
          )
          reset()
        }
      } else {
        value = defaultValue
      }
      // #9006 reflect default value on custom element
      // #9006 在自定义元素上反映默认值
      if (instance.ce) {
        instance.ce._setProp(key, value)
      }
    }
    // boolean casting
    // 布尔值转换
    if (opt[BooleanFlags.shouldCast]) {
      if (isAbsent && !hasDefault) {
        value = false
      } else if (
        opt[BooleanFlags.shouldCastTrue] &&
        (value === '' || value === hyphenate(key))
      ) {
        value = true
      }
    }
  }
  return value
}

const mixinPropsCache = new WeakMap<ConcreteComponent, NormalizedPropsOptions>()

export function normalizePropsOptions(
  comp: ConcreteComponent,
  appContext: AppContext,
  asMixin = false,
): NormalizedPropsOptions {
  const cache =
    __FEATURE_OPTIONS_API__ && asMixin ? mixinPropsCache : appContext.propsCache
  const cached = cache.get(comp)
  if (cached) {
    return cached
  }

  const raw = comp.props
  const normalized: NormalizedPropsOptions[0] = {}
  const needCastKeys: NormalizedPropsOptions[1] = []

  // apply mixin/extends props
  // 应用 mixin/extends props
  let hasExtends = false
  if (__FEATURE_OPTIONS_API__ && !isFunction(comp)) {
    const extendProps = (raw: ComponentOptions) => {
      if (__COMPAT__ && isFunction(raw)) {
        raw = raw.options
      }
      hasExtends = true
      const [props, keys] = normalizePropsOptions(raw, appContext, true)
      extend(normalized, props)
      if (keys) needCastKeys.push(...keys)
    }
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps)
    }
    if (comp.extends) {
      extendProps(comp.extends)
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps)
    }
  }

  if (!raw && !hasExtends) {
    if (isObject(comp)) {
      cache.set(comp, EMPTY_ARR as any)
    }
    return EMPTY_ARR as any
  }

  if (isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      if (__DEV__ && !isString(raw[i])) {
        warn(`props must be strings when using array syntax.`, raw[i])
      }
      const normalizedKey = camelize(raw[i])
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ
      }
    }
  } else if (raw) {
    if (__DEV__ && !isObject(raw)) {
      warn(`invalid props options`, raw)
    }
    for (const key in raw) {
      const normalizedKey = camelize(key)
      if (validatePropName(normalizedKey)) {
        const opt = raw[key]
        const prop: NormalizedProp = (normalized[normalizedKey] =
          isArray(opt) || isFunction(opt) ? { type: opt } : extend({}, opt))
        const propType = prop.type
        let shouldCast = false
        let shouldCastTrue = true

        if (isArray(propType)) {
          for (let index = 0; index < propType.length; ++index) {
            const type = propType[index]
            const typeName = isFunction(type) && type.name

            if (typeName === 'Boolean') {
              shouldCast = true
              break
            } else if (typeName === 'String') {
              // If we find `String` before `Boolean`, e.g. `[String, Boolean]`,
              // we need to handle the casting slightly differently. Props
              // passed as `<Comp checked="">` or `<Comp checked="checked">`
              // will either be treated as strings or converted to a boolean
              // `true`, depending on the order of the types.
              // 如果我们在 `Boolean` 之前找到 `String`，例如 `[String, Boolean]`，
              // 我们需要稍微不同地处理转换。作为 `<Comp checked="">` 或 `<Comp checked="checked">`
              // 传递的 Props 将被视为字符串或转换为布尔值 `true`，
              // 这取决于类型的顺序。
              shouldCastTrue = false
            }
          }
        } else {
          shouldCast = isFunction(propType) && propType.name === 'Boolean'
        }

        prop[BooleanFlags.shouldCast] = shouldCast
        prop[BooleanFlags.shouldCastTrue] = shouldCastTrue
        // if the prop needs boolean casting or default value
        // 如果 prop 需要布尔值转换或默认值
        if (shouldCast || hasOwn(prop, 'default')) {
          needCastKeys.push(normalizedKey)
        }
      }
    }
  }

  const res: NormalizedPropsOptions = [normalized, needCastKeys]
  if (isObject(comp)) {
    cache.set(comp, res)
  }
  return res
}

function validatePropName(key: string) {
  if (key[0] !== '$' && !isReservedProp(key)) {
    return true
  } else if (__DEV__) {
    warn(`Invalid prop name: "${key}" is a reserved property.`)
  }
  return false
}

// dev only
// use function string name to check type constructors
// so that it works across vms / iframes.
// 仅开发环境
// 使用函数字符串名称检查类型构造函数
// 以便它在 vms / iframes 之间工作。
function getType(ctor: Prop<any> | null): string {
  // Early return for null to avoid unnecessary computations
  // 提前返回 null 以避免不必要的计算
  if (ctor === null) {
    return 'null'
  }

  // Avoid using regex for common cases by checking the type directly
  // 通过直接检查类型避免在常见情况下使用正则表达式
  if (typeof ctor === 'function') {
    // Using name property to avoid converting function to string
    // 使用 name 属性避免将函数转换为字符串
    return ctor.name || ''
  } else if (typeof ctor === 'object') {
    // Attempting to directly access constructor name if possible
    // 如果可能，尝试直接访问构造函数名称
    const name = ctor.constructor && ctor.constructor.name
    return name || ''
  }

  // Fallback for other types (though they're less likely to have meaningful names here)
  // 其他类型的回退（虽然它们在这里不太可能有有意义的名称）
  return ''
}

/**
 * dev only
 */
function validateProps(
  rawProps: Data,
  props: Data,
  instance: ComponentInternalInstance,
) {
  const resolvedValues = toRaw(props)
  const options = instance.propsOptions[0]
  const camelizePropsKey = Object.keys(rawProps).map(key => camelize(key))
  for (const key in options) {
    let opt = options[key]
    if (opt == null) continue
    validateProp(
      key,
      resolvedValues[key],
      opt,
      __DEV__ ? shallowReadonly(resolvedValues) : resolvedValues,
      !camelizePropsKey.includes(key),
    )
  }
}

/**
 * dev only
 */
function validateProp(
  name: string,
  value: unknown,
  prop: PropOptions,
  props: Data,
  isAbsent: boolean,
) {
  const { type, required, validator, skipCheck } = prop
  // required!
  // 必填项！
  if (required && isAbsent) {
    warn('Missing required prop: "' + name + '"')
    return
  }
  // missing but optional
  // 缺失但可选
  if (value == null && !required) {
    return
  }
  // type check
  // 类型检查
  if (type != null && type !== true && !skipCheck) {
    let isValid = false
    const types = isArray(type) ? type : [type]
    const expectedTypes = []
    // value is valid as long as one of the specified types match
    // 只要指定的类型之一匹配，值就是有效的
    for (let i = 0; i < types.length && !isValid; i++) {
      const { valid, expectedType } = assertType(value, types[i])
      expectedTypes.push(expectedType || '')
      isValid = valid
    }
    if (!isValid) {
      warn(getInvalidTypeMessage(name, value, expectedTypes))
      return
    }
  }
  // custom validator
  // 自定义验证器
  if (validator && !validator(value, props)) {
    warn('Invalid prop: custom validator check failed for prop "' + name + '".')
  }
}

const isSimpleType = /*@__PURE__*/ makeMap(
  'String,Number,Boolean,Function,Symbol,BigInt',
)

type AssertionResult = {
  valid: boolean
  expectedType: string
}

/**
 * dev only
 */
function assertType(
  value: unknown,
  type: PropConstructor | null,
): AssertionResult {
  let valid
  const expectedType = getType(type)
  if (expectedType === 'null') {
    valid = value === null
  } else if (isSimpleType(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    // 对于原始包装对象
    if (!valid && t === 'object') {
      valid = value instanceof (type as PropConstructor)
    }
  } else if (expectedType === 'Object') {
    valid = isObject(value)
  } else if (expectedType === 'Array') {
    valid = isArray(value)
  } else {
    valid = value instanceof (type as PropConstructor)
  }
  return {
    valid,
    expectedType,
  }
}

/**
 * dev only
 */
function getInvalidTypeMessage(
  name: string,
  value: unknown,
  expectedTypes: string[],
): string {
  if (expectedTypes.length === 0) {
    return (
      `Prop type [] for prop "${name}" won't match anything.` +
      ` Did you mean to use type Array instead?`
    )
  }
  let message =
    `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(' | ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  // 检查是否需要指定预期值
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  // 检查是否需要指定接收到的值
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

/**
 * dev only
 */
function styleValue(value: unknown, type: string): string {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

/**
 * dev only
 */
function isExplicable(type: string): boolean {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => type.toLowerCase() === elem)
}

/**
 * dev only
 */
function isBoolean(...args: string[]): boolean {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
