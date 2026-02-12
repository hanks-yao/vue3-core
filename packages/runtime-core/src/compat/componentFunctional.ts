import {
  type ComponentOptions,
  type FunctionalComponent,
  getCurrentInstance,
} from '../component'
import { resolveInjections } from '../componentOptions'
import type { InternalSlots } from '../componentSlots'
import { getCompatListeners } from './instanceListeners'
import { compatH } from './renderFn'

// Cache for normalized functional components to avoid re-conversion
// 缓存已规范化的函数式组件，避免重复转换
const normalizedFunctionalComponentMap = new WeakMap<
  ComponentOptions,
  FunctionalComponent
>()

// Handler for proxying legacy slots access
// 用于代理遗留插槽访问的处理程序
export const legacySlotProxyHandlers: ProxyHandler<InternalSlots> = {
  get(target, key: string) {
    const slot = target[key]
    // In Vue 2, slots() returned an object of vnodes. In Vue 3, slots are functions.
    // This proxy invokes the slot function to return the vnodes, mimicking Vue 2 behavior.
    // 在 Vue 2 中，slots() 返回 vnodes 对象。在 Vue 3 中，插槽是函数。
    // 此代理调用插槽函数以返回 vnodes，模拟 Vue 2 的行为。
    return slot && slot()
  },
}

/**
 * Converts a legacy (Vue 2) functional component options object into a Vue 3 functional component.
 * 将遗留（Vue 2）函数式组件选项对象转换为 Vue 3 函数式组件。
 *
 * @param comp - The component options / 组件选项
 * @returns The converted functional component / 转换后的函数式组件
 */
export function convertLegacyFunctionalComponent(
  comp: ComponentOptions,
): FunctionalComponent {
  // Return cached version if already converted
  // 如果已经转换过，则返回缓存版本
  if (normalizedFunctionalComponentMap.has(comp)) {
    return normalizedFunctionalComponentMap.get(comp)!
  }

  const legacyFn = comp.render as any

  // Define the Vue 3 functional component wrapper
  // 定义 Vue 3 函数式组件包装器
  const Func: FunctionalComponent = (props, ctx) => {
    // Get current component instance
    // 获取当前组件实例
    const instance = getCurrentInstance()!

    // Mock the Vue 2 functional component context (RenderContext)
    // 模拟 Vue 2 函数式组件上下文 (RenderContext)
    const legacyCtx = {
      props,
      // In Vue 2, children were passed directly. In Vue 3, they are in vnode.children.
      // 在 Vue 2 中，children 是直接传递的。在 Vue 3 中，它们在 vnode.children 中。
      children: instance.vnode.children || [],
      // Map vnode props to data
      // 将 vnode props 映射到 data
      data: instance.vnode.props || {},
      // Vue 3 slots are equivalent to Vue 2 scopedSlots
      // Vue 3 的 slots 等同于 Vue 2 的 scopedSlots
      scopedSlots: ctx.slots,
      // Access parent component instance proxy
      // 访问父组件实例代理
      parent: instance.parent && instance.parent.proxy,
      // Mock slots() method using the proxy handler defined above
      // 使用上面定义的代理处理程序模拟 slots() 方法
      slots() {
        return new Proxy(ctx.slots, legacySlotProxyHandlers)
      },
      // Access listeners (events) in a compatible way
      // 以兼容的方式访问监听器（事件）
      get listeners() {
        return getCompatListeners(instance)
      },
      // Resolve injections if defined in component options
      // 如果组件选项中定义了 inject，则解析注入
      get injections() {
        if (comp.inject) {
          const injections = {}
          resolveInjections(comp.inject, injections)
          return injections
        }
        return {}
      },
    }
    // Call the legacy render function with compat h and context
    // 使用兼容的 h 函数和上下文调用遗留的渲染函数
    return legacyFn(compatH, legacyCtx)
  }
  
  // Copy static properties from the original component options
  // 从原始组件选项复制静态属性
  Func.props = comp.props
  Func.displayName = comp.name
  Func.compatConfig = comp.compatConfig
  // v2 functional components do not inherit attrs
  // v2 函数式组件不继承 attrs
  Func.inheritAttrs = false

  // Cache the converted component
  // 缓存转换后的组件
  normalizedFunctionalComponentMap.set(comp, Func)
  return Func
}
