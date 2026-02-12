import {
  type ComponentOptions,
  type ConcreteComponent,
  currentInstance,
  getComponentName,
} from '../component'
import { currentRenderingInstance } from '../componentRenderContext'
import type { Directive } from '../directives'
import { camelize, capitalize, isString } from '@vue/shared'
import { warn } from '../warning'
import type { VNodeTypes } from '../vnode'

export const COMPONENTS = 'components'
export const DIRECTIVES = 'directives'
export const FILTERS = 'filters'

export type AssetTypes = typeof COMPONENTS | typeof DIRECTIVES | typeof FILTERS

/**
 * @private
 * 私有 API
 */
export function resolveComponent(
  name: string,
  maybeSelfReference?: boolean,
): ConcreteComponent | string {
  return resolveAsset(COMPONENTS, name, true, maybeSelfReference) || name
}

export const NULL_DYNAMIC_COMPONENT: unique symbol = Symbol.for('v-ndc')

/**
 * @private
 * 私有 API
 *
 * Resolve a dynamic component.
 * 解析动态组件。
 */
export function resolveDynamicComponent(component: unknown): VNodeTypes {
  if (isString(component)) {
    return resolveAsset(COMPONENTS, component, false) || component
  } else {
    // invalid types will fallthrough to createVNode and raise warning
    // 无效类型将回退到 createVNode 并引发警告
    return (component || NULL_DYNAMIC_COMPONENT) as any
  }
}

/**
 * @private
 * 私有 API
 */
export function resolveDirective(name: string): Directive | undefined {
  return resolveAsset(DIRECTIVES, name)
}

/**
 * v2 compat only
 * 仅 v2 兼容模式
 * @internal
 */
export function resolveFilter(name: string): Function | undefined {
  return resolveAsset(FILTERS, name)
}

/**
 * @private
 * overload 1: components
 * 重载 1：组件
 */
function resolveAsset(
  type: typeof COMPONENTS,
  name: string,
  warnMissing?: boolean,
  maybeSelfReference?: boolean,
): ConcreteComponent | undefined
// overload 2: directives
// 重载 2：指令
function resolveAsset(
  type: typeof DIRECTIVES,
  name: string,
): Directive | undefined
// implementation
// overload 3: filters (compat only)
// 重载 3：过滤器（仅兼容模式）
function resolveAsset(type: typeof FILTERS, name: string): Function | undefined
// implementation
// 实现
function resolveAsset(
  type: AssetTypes,
  name: string,
  warnMissing = true,
  maybeSelfReference = false,
) {
  // 获取当前渲染实例或当前实例
  const instance = currentRenderingInstance || currentInstance
  if (instance) {
    const Component = instance.type

    // explicit self name has highest priority
    // 显式自名称具有最高优先级
    if (type === COMPONENTS) {
      const selfName = getComponentName(
        Component,
        false /* do not include inferred name to avoid breaking existing code */ /* 不包含推断名称以避免破坏现有代码 */,
      )
      if (
        selfName &&
        (selfName === name ||
          selfName === camelize(name) ||
          selfName === capitalize(camelize(name)))
      ) {
        return Component
      }
    }

    const res =
      // local registration
      // 局部注册
      // check instance[type] first which is resolved for options API
      // 首先检查 instance[type]，这是为选项 API 解析的
      resolve(instance[type] || (Component as ComponentOptions)[type], name) ||
      // global registration
      // 全局注册
      resolve(instance.appContext[type], name)

    if (!res && maybeSelfReference) {
      // fallback to implicit self-reference
      // 回退到隐式自引用
      return Component
    }

    if (__DEV__ && warnMissing && !res) {
      const extra =
        type === COMPONENTS
          ? `\nIf this is a native custom element, make sure to exclude it from ` +
            `component resolution via compilerOptions.isCustomElement.`
            /* 如果这是一个原生自定义元素，请确保通过 compilerOptions.isCustomElement 将其从组件解析中排除。 */
          : ``
      warn(`Failed to resolve ${type.slice(0, -1)}: ${name}${extra}`)
    }

    return res
  } else if (__DEV__) {
    warn(
      `resolve${capitalize(type.slice(0, -1))} ` +
        `can only be used in render() or setup().`,
        /* resolveXXX 只能在 render() 或 setup() 中使用。 */
    )
  }
}

/**
 * Helper to resolve an asset from a registry.
 * 从注册表中解析资源的辅助函数。
 *
 * @param registry - The registry to search in. 搜索的注册表。
 * @param name - The name of the asset. 资源名称。
 */
function resolve(registry: Record<string, any> | undefined, name: string) {
  return (
    registry &&
    (registry[name] ||
      registry[camelize(name)] ||
      registry[capitalize(camelize(name))])
  )
}
