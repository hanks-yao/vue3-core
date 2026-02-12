import { isArray, isObject, isPromise } from '@vue/shared'
import { defineAsyncComponent } from '../apiAsyncComponent'
import type { Component } from '../component'
import { isVNode } from '../vnode'

// Vue 2 legacy async component options interface
// Vue 2 旧版异步组件选项接口
interface LegacyAsyncOptions {
  component: Promise<Component>
  loading?: Component
  error?: Component
  delay?: number
  timeout?: number
}

// Return value type for legacy async component factory
// 旧版异步组件工厂函数的返回值类型
type LegacyAsyncReturnValue = Promise<Component> | LegacyAsyncOptions

// Legacy async component factory function signature
// 旧版异步组件工厂函数签名
type LegacyAsyncComponent = (
  resolve?: (res: LegacyAsyncReturnValue) => void,
  reject?: (reason?: any) => void,
) => LegacyAsyncReturnValue | undefined

// Cache for normalized async components to avoid re-conversion
// 用于缓存已规范化的异步组件，避免重复转换
const normalizedAsyncComponentMap = new WeakMap<
  LegacyAsyncComponent,
  Component
>()

/**
 * Converts a legacy (Vue 2) async component factory to a Vue 3 compatible component.
 * 将旧版 (Vue 2) 异步组件工厂函数转换为 Vue 3 兼容的组件。
 *
 * @param comp - The legacy async component factory function. (旧版异步组件工厂函数)
 * @returns The converted Vue 3 component. (转换后的 Vue 3 组件)
 */
export function convertLegacyAsyncComponent(
  comp: LegacyAsyncComponent,
): Component {
  // Check if the component has already been converted and cached
  // 检查组件是否已经被转换并缓存
  if (normalizedAsyncComponentMap.has(comp)) {
    return normalizedAsyncComponentMap.get(comp)!
  }

  // we have to call the function here due to how v2's API won't expose the
  // options until we call it
  // 我们必须在这里调用该函数，因为 Vue 2 的 API 在调用之前不会暴露选项
  let resolve: (res: LegacyAsyncReturnValue) => void
  let reject: (reason?: any) => void
  
  // Create a fallback promise to handle callback-style async components (resolve/reject)
  // 创建一个回退 Promise 来处理回调风格的异步组件 (resolve/reject)
  const fallbackPromise = new Promise<Component>((r, rj) => {
    ;((resolve = r), (reject = rj))
  })

  // Call the legacy factory function, passing resolve and reject callbacks
  // 调用旧版工厂函数，传入 resolve 和 reject 回调
  const res = comp(resolve!, reject!)

  let converted: Component
  if (isPromise(res)) {
    // Case 1: Factory returns a Promise
    // 情况 1: 工厂函数返回一个 Promise
    converted = defineAsyncComponent(() => res)
  } else if (isObject(res) && !isVNode(res) && !isArray(res)) {
    // Case 2: Factory returns an Options object (Advanced Async Component)
    // 情况 2: 工厂函数返回一个选项对象 (高级异步组件)
    converted = defineAsyncComponent({
      loader: () => res.component,
      loadingComponent: res.loading,
      errorComponent: res.error,
      delay: res.delay,
      timeout: res.timeout,
    })
  } else if (res == null) {
    // Case 3: Factory returns nothing (undefined/null), likely using resolve/reject callbacks
    // 情况 3: 工厂函数没有返回值 (undefined/null)，可能使用的是 resolve/reject 回调
    converted = defineAsyncComponent(() => fallbackPromise)
  } else {
    // Case 4: Fallback, treat as is (e.g., Vue 3 functional component)
    // 情况 4: 回退情况，直接作为组件处理 (例如 Vue 3 函数式组件)
    converted = comp as any // probably a v3 functional comp
  }
  
  // Cache the converted component
  // 缓存转换后的组件
  normalizedAsyncComponentMap.set(comp, converted)
  return converted
}
