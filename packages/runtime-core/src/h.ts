import {
  type Comment,
  type Fragment,
  type Text,
  type VNode,
  type VNodeArrayChildren,
  type VNodeProps,
  createVNode,
  isVNode,
  setBlockTracking,
} from './vnode'
import type { Teleport, TeleportProps } from './components/Teleport'
import type { Suspense, SuspenseProps } from './components/Suspense'
import { type IfAny, isArray, isObject } from '@vue/shared'
import type { RawSlots } from './componentSlots'
import type {
  Component,
  ComponentOptions,
  ConcreteComponent,
  FunctionalComponent,
} from './component'
import type { EmitsOptions } from './componentEmits'
import type { DefineComponent } from './apiDefineComponent'

// `h` is a more user-friendly version of `createVNode` that allows omitting the
// props when possible. It is intended for manually written render functions.
// Compiler-generated code uses `createVNode` because
// 1. it is monomorphic and avoids the extra call overhead
// 2. it allows specifying patchFlags for optimization
// `h` 是 `createVNode` 的一个更用户友好的版本，允许在可能的情况下省略 props。
// 它旨在用于手动编写的渲染函数。
// 编译器生成的代码使用 `createVNode`，因为：
// 1. 它是单态的（monomorphic），避免了额外的调用开销
// 2. 它允许指定 patchFlags 以进行优化

/*
// type only
// 仅类型
h('div')

// type + props
// 类型 + 属性
h('div', {})

// type + omit props + children
// 类型 + 省略属性 + 子节点
// Omit props does NOT support named slots
// 省略 props 不支持具名插槽
h('div', []) // array
h('div', 'foo') // text
h('div', h('br')) // vnode
h(Component, () => {}) // default slot

// type + props + children
// 类型 + 属性 + 子节点
h('div', {}, []) // array
h('div', {}, 'foo') // text
h('div', {}, h('br')) // vnode
h(Component, {}, () => {}) // default slot
h(Component, {}, {}) // named slots

// named slots without props requires explicit `null` to avoid ambiguity
// 没有 props 的具名插槽需要显式的 `null` 以避免歧义
h(Component, null, {})
**/

type RawProps = VNodeProps & {
  // used to differ from a single VNode object as children
  // 用于区分单个 VNode 对象作为子节点的情况
  __v_isVNode?: never
  // used to differ from Array children
  // 用于区分数组子节点的情况
  [Symbol.iterator]?: never
} & Record<string, any>

type RawChildren =
  | string
  | number
  | boolean
  | VNode
  | VNodeArrayChildren
  | (() => any)

// fake constructor type returned from `defineComponent`
// 从 `defineComponent` 返回的伪构造函数类型
interface Constructor<P = any> {
  __isFragment?: never
  __isTeleport?: never
  __isSuspense?: never
  new (...args: any[]): { $props: P }
}

type HTMLElementEventHandler = {
  [K in keyof HTMLElementEventMap as `on${Capitalize<K>}`]?: (
    ev: HTMLElementEventMap[K],
  ) => any
}

// The following is a series of overloads for providing props validation of
// manually written render functions.
// 以下是一系列重载，用于为手动编写的渲染函数提供 props 验证。

// element
// 元素
export function h<K extends keyof HTMLElementTagNameMap>(
  type: K,
  children?: RawChildren,
): VNode
export function h<K extends keyof HTMLElementTagNameMap>(
  type: K,
  props?: (RawProps & HTMLElementEventHandler) | null,
  children?: RawChildren | RawSlots,
): VNode

// custom element
// 自定义元素
export function h(type: string, children?: RawChildren): VNode
export function h(
  type: string,
  props?: RawProps | null,
  children?: RawChildren | RawSlots,
): VNode

// text/comment
// 文本/注释
export function h(
  type: typeof Text | typeof Comment,
  children?: string | number | boolean,
): VNode
export function h(
  type: typeof Text | typeof Comment,
  props?: null,
  children?: string | number | boolean,
): VNode
// fragment
// 片段
export function h(type: typeof Fragment, children?: VNodeArrayChildren): VNode
export function h(
  type: typeof Fragment,
  props?: RawProps | null,
  children?: VNodeArrayChildren,
): VNode

// teleport (target prop is required)
// teleport (target 属性是必须的)
export function h(
  type: typeof Teleport,
  props: RawProps & TeleportProps,
  children: RawChildren | RawSlots,
): VNode

// suspense
// suspense (悬念)
export function h(type: typeof Suspense, children?: RawChildren): VNode
export function h(
  type: typeof Suspense,
  props?: (RawProps & SuspenseProps) | null,
  children?: RawChildren | RawSlots,
): VNode

// functional component
// 函数式组件
export function h<
  P,
  E extends EmitsOptions = {},
  S extends Record<string, any> = any,
>(
  type: FunctionalComponent<P, any, S, any>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | IfAny<S, RawSlots, S>,
): VNode

// catch-all for generic component types
// 通用组件类型的兜底
export function h(type: Component, children?: RawChildren): VNode

// concrete component
// 具体组件
export function h<P>(
  type: ConcreteComponent | string,
  children?: RawChildren,
): VNode
export function h<P>(
  type: ConcreteComponent<P> | string,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren,
): VNode

// component without props
// 没有 props 的组件
export function h<P>(
  type: Component<P>,
  props?: (RawProps & P) | null,
  children?: RawChildren | RawSlots,
): VNode

// exclude `defineComponent` constructors
// 排除 `defineComponent` 构造函数
export function h<P>(
  type: ComponentOptions<P>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | RawSlots,
): VNode

// fake constructor type returned by `defineComponent` or class component
// 由 `defineComponent` 返回的伪构造函数类型或类组件
export function h(type: Constructor, children?: RawChildren): VNode
export function h<P>(
  type: Constructor<P>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | RawSlots,
): VNode

// fake constructor type returned by `defineComponent`
// 由 `defineComponent` 返回的伪构造函数类型
export function h(type: DefineComponent, children?: RawChildren): VNode
export function h<P>(
  type: DefineComponent<P>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | RawSlots,
): VNode

// catch all types
// 捕获所有类型
export function h(type: string | Component, children?: RawChildren): VNode
export function h<P>(
  type: string | Component<P>,
  props?: (RawProps & P) | ({} extends P ? null : never),
  children?: RawChildren | RawSlots,
): VNode

// Actual implementation
// 实际实现
export function h(type: any, propsOrChildren?: any, children?: any): VNode {
  try {
    // #6913 disable tracking block in h function
    // #6913 在 h 函数中禁用块跟踪
    setBlockTracking(-1)
    const l = arguments.length
    if (l === 2) {
      if (isObject(propsOrChildren) && !isArray(propsOrChildren)) {
        // single vnode without props
        // 没有 props 的单个 vnode
        if (isVNode(propsOrChildren)) {
          return createVNode(type, null, [propsOrChildren])
        }
        // props without children
        // 只有 props 没有 children
        return createVNode(type, propsOrChildren)
      } else {
        // omit props
        // 省略 props
        return createVNode(type, null, propsOrChildren)
      }
    } else {
      if (l > 3) {
        children = Array.prototype.slice.call(arguments, 2)
      } else if (l === 3 && isVNode(children)) {
        children = [children]
      }
      return createVNode(type, propsOrChildren, children)
    }
  } finally {
    setBlockTracking(1)
  }
}
