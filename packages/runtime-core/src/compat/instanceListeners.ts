import { isOn } from '@vue/shared'
import type { ComponentInternalInstance } from '../component'
import { DeprecationTypes, assertCompatEnabled } from './compatConfig'

/**
 * Retrieves the listeners object for Vue 2 compatibility.
 * In Vue 2, listeners were exposed via `this.$listeners`.
 * In Vue 3, they are part of `$attrs`.
 * This function reconstructs the `$listeners` object from vnode props.
 *
 * 获取用于 Vue 2 兼容性的 listeners 对象。
 * 在 Vue 2 中，监听器通过 `this.$listeners` 暴露。
 * 在 Vue 3 中，它们是 `$attrs` 的一部分。
 * 此函数从 vnode props 重构 `$listeners` 对象。
 */
export function getCompatListeners(
  instance: ComponentInternalInstance,
): Record<string, Function | Function[]> {
  // Check if the INSTANCE_LISTENERS deprecation warning/compat mode is enabled
  // 检查是否启用了 INSTANCE_LISTENERS 弃用警告/兼容模式
  assertCompatEnabled(DeprecationTypes.INSTANCE_LISTENERS, instance)

  const listeners: Record<string, Function | Function[]> = {}
  const rawProps = instance.vnode.props
  if (!rawProps) {
    return listeners
  }
  for (const key in rawProps) {
    // Check if the prop key starts with "on" (indicating an event listener)
    // 检查 prop key 是否以 "on" 开头（表示事件监听器）
    if (isOn(key)) {
      // Convert "onClick" -> "click", "onMyEvent" -> "myEvent"
      // 转换 "onClick" -> "click", "onMyEvent" -> "myEvent"
      listeners[key[2].toLowerCase() + key.slice(3)] = rawProps[key]
    }
  }
  return listeners
}
