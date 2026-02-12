import { isArray } from '@vue/shared'
import { inject } from '../apiInject'
import type { ComponentInternalInstance, Data } from '../component'
import {
  type ComponentOptions,
  resolveMergedOptions,
} from '../componentOptions'
import { DeprecationTypes, warnDeprecation } from './compatConfig'

/**
 * Create a proxy object to mock `this` context for prop default factory functions in compat mode.
 * 在兼容模式下，为 prop 默认值工厂函数创建一个代理对象来模拟 `this` 上下文。
 *
 * In Vue 2, prop default functions have access to `this` (the component instance).
 * In Vue 3, they do not. This proxy attempts to emulate the properties that were typically accessed
 * on `this` inside prop default functions (props, injections, $options).
 * 在 Vue 2 中，prop 默认函数可以访问 `this`（组件实例）。
 * 在 Vue 3 中，它们不能。这个代理尝试模拟在 prop 默认函数内部通常在 `this` 上访问的属性（props、injections、$options）。
 */
export function createPropsDefaultThis(
  instance: ComponentInternalInstance,
  rawProps: Data,
  propKey: string,
): object {
  return new Proxy(
    {},
    {
      get(_, key: string) {
        // Warn about deprecation when accessing properties on `this` inside prop default function
        // 当在 prop 默认函数内部访问 `this` 上的属性时，发出弃用警告
        __DEV__ &&
          warnDeprecation(DeprecationTypes.PROPS_DEFAULT_THIS, null, propKey)
        
        // $options
        // Handle access to $options
        // 处理对 $options 的访问
        if (key === '$options') {
          return resolveMergedOptions(instance)
        }
        
        // props
        // Handle access to other props
        // 处理对其他 props 的访问
        if (key in rawProps) {
          return rawProps[key]
        }
        
        // injections
        // Handle access to injections
        // 处理对注入（injections）的访问
        const injections = (instance.type as ComponentOptions).inject
        if (injections) {
          if (isArray(injections)) {
            if (injections.includes(key)) {
              return inject(key)
            }
          } else if (key in injections) {
            return inject(key)
          }
        }
      },
    },
  )
}
