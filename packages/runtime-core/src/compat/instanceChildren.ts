import { ShapeFlags } from '@vue/shared'
import type { ComponentInternalInstance } from '../component'
import type { ComponentPublicInstance } from '../componentPublicInstance'
import type { VNode } from '../vnode'
import { DeprecationTypes, assertCompatEnabled } from './compatConfig'

/**
 * Retrieves the children component instances of a component instance.
 * This is for Vue 2 compatibility of `this.$children`.
 * 获取组件实例的子组件实例。
 * 这是为了兼容 Vue 2 的 `this.$children`。
 *
 * @param instance - The internal component instance. 组件内部实例。
 * @returns An array of public component instances. 公共组件实例数组。
 */
export function getCompatChildren(
  instance: ComponentInternalInstance,
): ComponentPublicInstance[] {
  // Check if the INSTANCE_CHILDREN deprecation warning is enabled
  // 检查是否启用了 INSTANCE_CHILDREN 弃用警告
  assertCompatEnabled(DeprecationTypes.INSTANCE_CHILDREN, instance)
  
  // The root VNode of the component's rendered tree
  // 组件渲染树的根 VNode
  const root = instance.subTree
  const children: ComponentPublicInstance[] = []
  
  if (root) {
    // Traverse the VNode tree to find child components
    // 遍历 VNode 树以查找子组件
    walk(root, children)
  }
  return children
}

/**
 * Recursively walks the VNode tree to collect component instances.
 * 递归遍历 VNode 树以收集组件实例。
 *
 * @param vnode - The current VNode to inspect. 当前要检查的 VNode。
 * @param children - The array to collect component instances into. 用于收集组件实例的数组。
 */
function walk(vnode: VNode, children: ComponentPublicInstance[]) {
  // If the VNode represents a component, add its proxy (public instance) to the list
  // 如果 VNode 代表一个组件，将其代理（公共实例）添加到列表中
  if (vnode.component) {
    children.push(vnode.component.proxy!)
  } 
  // If the VNode has array children (e.g., Fragment or element with multiple children), recurse
  // 如果 VNode 有数组子节点（例如 Fragment 或具有多个子节点的元素），则递归
  else if (vnode.shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
    const vnodes = vnode.children as VNode[]
    for (let i = 0; i < vnodes.length; i++) {
      walk(vnodes[i], children)
    }
  }
}
