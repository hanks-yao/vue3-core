import { isOn } from '@vue/shared'
import type { ComponentInternalInstance } from '../component'
import { DeprecationTypes, isCompatEnabled } from './compatConfig'

/**
 * Check if an attribute should be skipped during attrs fallthrough.
 * This is used to mimic Vue 2 behavior where class/style and listeners
 * are not part of $attrs.
 *
 * 检查在属性透传（attrs fallthrough）过程中是否应该跳过某个属性。
 * 这用于模拟 Vue 2 的行为，在 Vue 2 中 class/style 和监听器（listeners）
 * 不属于 $attrs 的一部分。
 */
export function shouldSkipAttr(
  key: string,
  instance: ComponentInternalInstance,
): boolean {
  // Always skip 'is' attribute (dynamic component binding)
  // 始终跳过 'is' 属性（动态组件绑定）
  if (key === 'is') {
    return true
  }

  // In Vue 2, class and style are handled separately and not included in $attrs.
  // If the compatibility flag INSTANCE_ATTRS_CLASS_STYLE is enabled, we skip them here
  // to prevent them from appearing in $attrs.
  // 在 Vue 2 中，class 和 style 是单独处理的，不包含在 $attrs 中。
  // 如果启用了兼容性标志 INSTANCE_ATTRS_CLASS_STYLE，我们要在这里跳过它们，
  // 以防止它们出现在 $attrs 中。
  if (
    (key === 'class' || key === 'style') &&
    isCompatEnabled(DeprecationTypes.INSTANCE_ATTRS_CLASS_STYLE, instance)
  ) {
    return true
  }

  // In Vue 2, listeners are in $listeners, not $attrs.
  // If INSTANCE_LISTENERS compatibility is enabled, skip event listeners (keys starting with "on").
  // 在 Vue 2 中，监听器位于 $listeners 中，而不是 $attrs。
  // 如果启用了 INSTANCE_LISTENERS 兼容性，跳过事件监听器（以 "on" 开头的键）。
  if (
    isOn(key) &&
    isCompatEnabled(DeprecationTypes.INSTANCE_LISTENERS, instance)
  ) {
    return true
  }

  // vue-router internal properties
  // vue-router 内部属性
  if (key.startsWith('routerView') || key === 'registerRouteInstance') {
    return true
  }
  return false
}
