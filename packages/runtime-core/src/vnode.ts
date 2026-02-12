import {
  EMPTY_ARR,
  PatchFlags,
  ShapeFlags,
  SlotFlags,
  extend,
  isArray,
  isFunction,
  isObject,
  isOn,
  isString,
  normalizeClass,
  normalizeStyle,
} from '@vue/shared'
import {
  type ClassComponent,
  type Component,
  type ComponentInternalInstance,
  type ConcreteComponent,
  type Data,
  isClassComponent,
} from './component'
import type { RawSlots } from './componentSlots'
import {
  type ReactiveFlags,
  type Ref,
  isProxy,
  isRef,
  toRaw,
} from '@vue/reactivity'
import type { AppContext } from './apiCreateApp'
import {
  type Suspense,
  type SuspenseBoundary,
  type SuspenseImpl,
  isSuspense,
} from './components/Suspense'
import type { DirectiveBinding } from './directives'
import {
  type TransitionHooks,
  setTransitionHooks,
} from './components/BaseTransition'
import { warn } from './warning'
import {
  type Teleport,
  type TeleportImpl,
  isTeleport,
} from './components/Teleport'
import {
  currentRenderingInstance,
  currentScopeId,
} from './componentRenderContext'
import type { RendererElement, RendererNode } from './renderer'
import { NULL_DYNAMIC_COMPONENT } from './helpers/resolveAssets'
import { hmrDirtyComponents } from './hmr'
import { convertLegacyComponent } from './compat/component'
import { convertLegacyVModelProps } from './compat/componentVModel'
import { defineLegacyVNodeProperties } from './compat/renderFn'
import { ErrorCodes, callWithAsyncErrorHandling } from './errorHandling'
import type { ComponentPublicInstance } from './componentPublicInstance'
import { isInternalObject } from './internalObject'

// Fragment 标记，用于表示片段
export const Fragment = Symbol.for('v-fgt') as any as {
  __isFragment: true
  new (): {
    $props: VNodeProps
  }
}
// Text 标记，用于表示文本节点
export const Text: unique symbol = Symbol.for('v-txt')
// Comment 标记，用于表示注释节点
export const Comment: unique symbol = Symbol.for('v-cmt')
// Static 标记，用于表示静态节点
export const Static: unique symbol = Symbol.for('v-stc')

// VNode 类型定义
export type VNodeTypes =
  | string
  | VNode
  | Component
  | typeof Text
  | typeof Static
  | typeof Comment
  | typeof Fragment
  | typeof Teleport
  | typeof TeleportImpl
  | typeof Suspense
  | typeof SuspenseImpl

// VNode 引用类型
export type VNodeRef =
  | string
  | Ref
  | ((
      ref: Element | ComponentPublicInstance | null,
      refs: Record<string, any>,
    ) => void)

// 标准化的 VNode 引用原子对象
export type VNodeNormalizedRefAtom = {
  /**
   * component instance
   * 组件实例
   */
  i: ComponentInternalInstance
  /**
   * Actual ref
   * 实际的 ref
   */
  r: VNodeRef
  /**
   * setup ref key
   * setup ref 的 key
   */
  k?: string
  /**
   * refInFor marker
   * refInFor 标记
   */
  f?: boolean
}

export type VNodeNormalizedRef =
  | VNodeNormalizedRefAtom
  | VNodeNormalizedRefAtom[]

type VNodeMountHook = (vnode: VNode) => void
type VNodeUpdateHook = (vnode: VNode, oldVNode: VNode) => void
export type VNodeHook =
  | VNodeMountHook
  | VNodeUpdateHook
  | VNodeMountHook[]
  | VNodeUpdateHook[]

// https://github.com/microsoft/TypeScript/issues/33099
export type VNodeProps = {
  key?: PropertyKey
  ref?: VNodeRef
  ref_for?: boolean
  ref_key?: string

  // vnode hooks
  // vnode 生命周期钩子
  onVnodeBeforeMount?: VNodeMountHook | VNodeMountHook[]
  onVnodeMounted?: VNodeMountHook | VNodeMountHook[]
  onVnodeBeforeUpdate?: VNodeUpdateHook | VNodeUpdateHook[]
  onVnodeUpdated?: VNodeUpdateHook | VNodeUpdateHook[]
  onVnodeBeforeUnmount?: VNodeMountHook | VNodeMountHook[]
  onVnodeUnmounted?: VNodeMountHook | VNodeMountHook[]
}

type VNodeChildAtom =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | void

export type VNodeArrayChildren = Array<VNodeArrayChildren | VNodeChildAtom>

export type VNodeChild = VNodeChildAtom | VNodeArrayChildren

export type VNodeNormalizedChildren =
  | string
  | VNodeArrayChildren
  | RawSlots
  | null

// VNode 接口定义，包含节点的所有信息
export interface VNode<
  HostNode = RendererNode,
  HostElement = RendererElement,
  ExtraProps = { [key: string]: any },
> {
  /**
   * @internal
   * 内部属性，标识是否为 VNode
   */
  __v_isVNode: true

  /**
   * @internal
   * 内部属性，标识是否跳过响应式转换
   */
  [ReactiveFlags.SKIP]: true

  type: VNodeTypes
  props: (VNodeProps & ExtraProps) | null
  key: PropertyKey | null
  ref: VNodeNormalizedRef | null
  /**
   * SFC only. This is assigned on vnode creation using currentScopeId
   * which is set alongside currentRenderingInstance.
   * 仅 SFC。这是在 vnode 创建时使用 currentScopeId 分配的，
   * currentScopeId 与 currentRenderingInstance 一起设置。
   */
  scopeId: string | null
  /**
   * SFC only. This is assigned to:
   * - Slot fragment vnodes with :slotted SFC styles.
   * - Component vnodes (during patch/hydration) so that its root node can
   *   inherit the component's slotScopeIds
   * @internal
   * 仅 SFC。分配给：
   * - 带有 :slotted SFC 样式的插槽片段 vnode。
   * - 组件 vnode（在 patch/hydration 期间），以便其根节点可以继承组件的 slotScopeIds
   */
  slotScopeIds: string[] | null
  children: VNodeNormalizedChildren
  component: ComponentInternalInstance | null
  dirs: DirectiveBinding[] | null
  transition: TransitionHooks<HostElement> | null

  // DOM
  el: HostNode | null
  placeholder: HostNode | null // async component el placeholder (异步组件 el 占位符)
  anchor: HostNode | null // fragment anchor (片段锚点)
  target: HostElement | null // teleport target (teleport 目标)
  targetStart: HostNode | null // teleport target start anchor (teleport 目标起始锚点)
  targetAnchor: HostNode | null // teleport target anchor (teleport 目标锚点)
  /**
   * number of elements contained in a static vnode
   * @internal
   * 静态 vnode 中包含的元素数量
   */
  staticCount: number

  // suspense
  suspense: SuspenseBoundary | null
  /**
   * @internal
   * 服务端渲染内容
   */
  ssContent: VNode | null
  /**
   * @internal
   * 服务端渲染回退内容
   */
  ssFallback: VNode | null

  // optimization only
  // 仅用于优化
  shapeFlag: number
  patchFlag: number
  /**
   * @internal
   * 动态属性
   */
  dynamicProps: string[] | null
  /**
   * @internal
   * 动态子节点
   */
  dynamicChildren: (VNode[] & { hasOnce?: boolean }) | null

  // application root node only
  // 仅应用程序根节点
  appContext: AppContext | null

  /**
   * @internal lexical scope owner instance
   * @internal 词法作用域所有者实例
   */
  ctx: ComponentInternalInstance | null

  /**
   * @internal attached by v-memo
   * @internal 由 v-memo 附加
   */
  memo?: any[]
  /**
   * @internal index for cleaning v-memo cache
   * @internal 用于清理 v-memo 缓存的索引
   */
  cacheIndex?: number
  /**
   * @internal __COMPAT__ only
   * @internal 仅 __COMPAT__
   */
  isCompatRoot?: true
  /**
   * @internal custom element interception hook
   * @internal 自定义元素拦截钩子
   */
  ce?: (instance: ComponentInternalInstance) => void
}

// Since v-if and v-for are the two possible ways node structure can dynamically
// change, once we consider v-if branches and each v-for fragment a block, we
// can divide a template into nested blocks, and within each block the node
// structure would be stable. This allows us to skip most children diffing
// and only worry about the dynamic nodes (indicated by patch flags).
// 由于 v-if 和 v-for 是节点结构可能动态改变的两种方式，一旦我们将 v-if 分支和每个 v-for 片段视为一个 block，
// 我们就可以将模板划分为嵌套的 block，并且在每个 block 内部，节点结构将是稳定的。
// 这允许我们跳过大多数子节点的 diff，只关心动态节点（由 patch flags 指示）。
export const blockStack: VNode['dynamicChildren'][] = []
export let currentBlock: VNode['dynamicChildren'] = null

/**
 * Open a block.
 * This must be called before `createBlock`. It cannot be part of `createBlock`
 * because the children of the block are evaluated before `createBlock` itself
 * is called. The generated code typically looks like this:
 *
 * ```js
 * function render() {
 *   return (openBlock(),createBlock('div', null, [...]))
 * }
 * ```
 * disableTracking is true when creating a v-for fragment block, since a v-for
 * fragment always diffs its children.
 *
 * @private
 * 开启一个 block。
 * 必须在 `createBlock` 之前调用。它不能是 `createBlock` 的一部分，
 * 因为 block 的子节点在 `createBlock` 本身被调用之前就已经被求值了。
 * 生成的代码通常如下所示：
 * ...
 * 当创建 v-for 片段 block 时，disableTracking 为 true，因为 v-for 片段总是 diff 它的子节点。
 */
export function openBlock(disableTracking = false): void {
  blockStack.push((currentBlock = disableTracking ? null : []))
}

// 关闭当前 block
export function closeBlock(): void {
  blockStack.pop()
  currentBlock = blockStack[blockStack.length - 1] || null
}

// Whether we should be tracking dynamic child nodes inside a block.
// Only tracks when this value is > 0
// We are not using a simple boolean because this value may need to be
// incremented/decremented by nested usage of v-once (see below)
// 我们是否应该在 block 内部跟踪动态子节点。
// 仅当此值 > 0 时跟踪。
// 我们不使用简单的布尔值，因为此值可能需要通过嵌套使用 v-once 来增加/减少（见下文）
export let isBlockTreeEnabled = 1

/**
 * Block tracking sometimes needs to be disabled, for example during the
 * creation of a tree that needs to be cached by v-once. The compiler generates
 * code like this:
 *
 * ``` js
 * _cache[1] || (
 *   setBlockTracking(-1, true),
 *   _cache[1] = createVNode(...),
 *   setBlockTracking(1),
 *   _cache[1]
 * )
 * ```
 *
 * @private
 * Block 跟踪有时需要被禁用，例如在创建需要被 v-once 缓存的树期间。
 */
export function setBlockTracking(value: number, inVOnce = false): void {
  isBlockTreeEnabled += value
  if (value < 0 && currentBlock && inVOnce) {
    // mark current block so it doesn't take fast path and skip possible
    // nested components during unmount
    // 标记当前 block，使其不走快速路径，并在卸载期间跳过可能的嵌套组件
    currentBlock.hasOnce = true
  }
}

function setupBlock(vnode: VNode) {
  // save current block children on the block vnode
  // 将当前 block 的子节点保存到 block vnode 上
  vnode.dynamicChildren =
    isBlockTreeEnabled > 0 ? currentBlock || (EMPTY_ARR as any) : null
  // close block
  // 关闭 block
  closeBlock()
  // a block is always going to be patched, so track it as a child of its
  // parent block
  // 一个 block 总是会被 patch，所以将其作为其父 block 的子节点进行跟踪
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode)
  }
  return vnode
}

/**
 * @private
 * 创建元素 block
 */
export function createElementBlock(
  type: string | typeof Fragment,
  props?: Record<string, any> | null,
  children?: any,
  patchFlag?: number,
  dynamicProps?: string[],
  shapeFlag?: number,
): VNode {
  return setupBlock(
    createBaseVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      shapeFlag,
      true /* isBlock */,
    ),
  )
}

/**
 * Create a block root vnode. Takes the same exact arguments as `createVNode`.
 * A block root keeps track of dynamic nodes within the block in the
 * `dynamicChildren` array.
 *
 * @private
 * 创建一个 block 根 vnode。接受与 `createVNode` 完全相同的参数。
 * block 根节点在 `dynamicChildren` 数组中跟踪 block 内的动态节点。
 */
export function createBlock(
  type: VNodeTypes | ClassComponent,
  props?: Record<string, any> | null,
  children?: any,
  patchFlag?: number,
  dynamicProps?: string[],
): VNode {
  return setupBlock(
    createVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      true /* isBlock: prevent a block from tracking itself (防止 block 跟踪自身) */,
    ),
  )
}

export function isVNode(value: any): value is VNode {
  return value ? value.__v_isVNode === true : false
}

export function isSameVNodeType(n1: VNode, n2: VNode): boolean {
  if (__DEV__ && n2.shapeFlag & ShapeFlags.COMPONENT && n1.component) {
    const dirtyInstances = hmrDirtyComponents.get(n2.type as ConcreteComponent)
    if (dirtyInstances && dirtyInstances.has(n1.component)) {
      // #7042, ensure the vnode being unmounted during HMR
      // bitwise operations to remove keep alive flags
      // #7042, 确保在 HMR 期间卸载的 vnode
      // 位运算移除 keep alive 标志
      n1.shapeFlag &= ~ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE
      n2.shapeFlag &= ~ShapeFlags.COMPONENT_KEPT_ALIVE
      // HMR only: if the component has been hot-updated, force a reload.
      // 仅 HMR：如果组件已被热更新，强制重新加载。
      return false
    }
  }
  return n1.type === n2.type && n1.key === n2.key
}

let vnodeArgsTransformer:
  | ((
      args: Parameters<typeof _createVNode>,
      instance: ComponentInternalInstance | null,
    ) => Parameters<typeof _createVNode>)
  | undefined

/**
 * Internal API for registering an arguments transform for createVNode
 * used for creating stubs in the test-utils
 * It is *internal* but needs to be exposed for test-utils to pick up proper
 * typings
 * 用于注册 createVNode 参数转换的内部 API
 * 用于在 test-utils 中创建存根
 * 它是 *内部的*，但需要暴露给 test-utils 以获取正确的类型
 */
export function transformVNodeArgs(
  transformer?: typeof vnodeArgsTransformer,
): void {
  vnodeArgsTransformer = transformer
}

const createVNodeWithArgsTransform = (
  ...args: Parameters<typeof _createVNode>
): VNode => {
  return _createVNode(
    ...(vnodeArgsTransformer
      ? vnodeArgsTransformer(args, currentRenderingInstance)
      : args),
  )
}

const normalizeKey = ({ key }: VNodeProps): VNode['key'] =>
  key != null ? key : null

const normalizeRef = ({
  ref,
  ref_key,
  ref_for,
}: VNodeProps): VNodeNormalizedRefAtom | null => {
  if (typeof ref === 'number') {
    ref = '' + ref
  }
  return (
    ref != null
      ? isString(ref) || isRef(ref) || isFunction(ref)
        ? { i: currentRenderingInstance, r: ref, k: ref_key, f: !!ref_for }
        : ref
      : null
  ) as any
}

// 创建基础 VNode 的核心函数
function createBaseVNode(
  type: VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT,
  props: (Data & VNodeProps) | null = null,
  children: unknown = null,
  patchFlag = 0,
  dynamicProps: string[] | null = null,
  shapeFlag: number = type === Fragment ? 0 : ShapeFlags.ELEMENT,
  isBlockNode = false,
  needFullChildrenNormalization = false,
): VNode {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    ctx: currentRenderingInstance,
  } as VNode

  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children)
    // normalize suspense children
    // 标准化 suspense 子节点
    if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
      ;(type as typeof SuspenseImpl).normalize(vnode)
    }
  } else if (children) {
    // compiled element vnode - if children is passed, only possible types are
    // string or Array.
    // 编译后的元素 vnode - 如果传递了 children，唯一可能的类型是 string 或 Array。
    vnode.shapeFlag |= isString(children)
      ? ShapeFlags.TEXT_CHILDREN
      : ShapeFlags.ARRAY_CHILDREN
  }

  // validate key
  // 验证 key
  if (__DEV__ && vnode.key !== vnode.key) {
    warn(`VNode created with invalid key (NaN). VNode type:`, vnode.type)
  }

  // track vnode for block tree
  // 跟踪 block tree 的 vnode
  if (
    isBlockTreeEnabled > 0 &&
    // avoid a block node from tracking itself
    // 避免 block 节点跟踪自身
    !isBlockNode &&
    // has current parent block
    // 有当前父 block
    currentBlock &&
    // presence of a patch flag indicates this node needs patching on updates.
    // component nodes also should always be patched, because even if the
    // component doesn't need to update, it needs to persist the instance on to
    // the next vnode so that it can be properly unmounted later.
    // patch flag 的存在表明此节点需要在更新时进行 patch。
    // 组件节点也应该始终被 patch，因为即使组件不需要更新，
    // 它也需要将实例持久化到下一个 vnode，以便稍后可以正确卸载。
    (vnode.patchFlag > 0 || shapeFlag & ShapeFlags.COMPONENT) &&
    // the EVENTS flag is only for hydration and if it is the only flag, the
    // vnode should not be considered dynamic due to handler caching.
    // EVENTS 标志仅用于 hydration，如果它是唯一的标志，
    // 由于处理程序缓存，vnode 不应被视为动态的。
    vnode.patchFlag !== PatchFlags.NEED_HYDRATION
  ) {
    currentBlock.push(vnode)
  }

  if (__COMPAT__) {
    convertLegacyVModelProps(vnode)
    defineLegacyVNodeProperties(vnode)
  }

  return vnode
}

export { createBaseVNode as createElementVNode }

export const createVNode = (
  __DEV__ ? createVNodeWithArgsTransform : _createVNode
) as typeof _createVNode

// 创建 VNode 的实现
function _createVNode(
  type: VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT,
  props: (Data & VNodeProps) | null = null,
  children: unknown = null,
  patchFlag: number = 0,
  dynamicProps: string[] | null = null,
  isBlockNode = false,
): VNode {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    if (__DEV__ && !type) {
      warn(`Invalid vnode type when creating vnode: ${type}.`)
    }
    type = Comment
  }

  if (isVNode(type)) {
    // createVNode receiving an existing vnode. This happens in cases like
    // <component :is="vnode"/>
    // #2078 make sure to merge refs during the clone instead of overwriting it
    // createVNode 接收一个现有的 vnode。这发生在像 <component :is="vnode"/> 这样的情况下
    // #2078 确保在克隆期间合并 refs 而不是覆盖它
    const cloned = cloneVNode(type, props, true /* mergeRef: true */)
    if (children) {
      normalizeChildren(cloned, children)
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & ShapeFlags.COMPONENT) {
        currentBlock[currentBlock.indexOf(type)] = cloned
      } else {
        currentBlock.push(cloned)
      }
    }
    cloned.patchFlag = PatchFlags.BAIL
    return cloned
  }

  // class component normalization.
  // 类组件标准化
  if (isClassComponent(type)) {
    type = type.__vccOpts
  }

  // 2.x async/functional component compat
  // 2.x 异步/函数式组件兼容
  if (__COMPAT__) {
    type = convertLegacyComponent(type, currentRenderingInstance)
  }

  // class & style normalization.
  // class 和 style 标准化
  if (props) {
    // for reactive or proxy objects, we need to clone it to enable mutation.
    // 对于响应式或代理对象，我们需要克隆它以启用突变。
    props = guardReactiveProps(props)!
    let { class: klass, style } = props
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass)
    }
    if (isObject(style)) {
      // reactive state objects need to be cloned since they are likely to be
      // mutated
      // 响应式状态对象需要被克隆，因为它们很可能会被突变
      if (isProxy(style) && !isArray(style)) {
        style = extend({}, style)
      }
      props.style = normalizeStyle(style)
    }
  }

  // encode the vnode type information into a bitmap
  // 将 vnode 类型信息编码到位图中 (ShapeFlags)
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : __FEATURE_SUSPENSE__ && isSuspense(type)
      ? ShapeFlags.SUSPENSE
      : isTeleport(type)
        ? ShapeFlags.TELEPORT
        : isObject(type)
          ? ShapeFlags.STATEFUL_COMPONENT
          : isFunction(type)
            ? ShapeFlags.FUNCTIONAL_COMPONENT
            : 0

  if (__DEV__ && shapeFlag & ShapeFlags.STATEFUL_COMPONENT && isProxy(type)) {
    type = toRaw(type)
    warn(
      `Vue received a Component that was made a reactive object. This can ` +
        `lead to unnecessary performance overhead and should be avoided by ` +
        `marking the component with \`markRaw\` or using \`shallowRef\` ` +
        `instead of \`ref\`.`,
      `\nComponent that was made reactive: `,
      type,
    )
  }

  return createBaseVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true,
  )
}

export function guardReactiveProps(
  props: (Data & VNodeProps) | null,
): (Data & VNodeProps) | null {
  if (!props) return null
  return isProxy(props) || isInternalObject(props) ? extend({}, props) : props
}

export function cloneVNode<T, U>(
  vnode: VNode<T, U>,
  extraProps?: (Data & VNodeProps) | null,
  mergeRef = false,
  cloneTransition = false,
): VNode<T, U> {
  // This is intentionally NOT using spread or extend to avoid the runtime
  // key enumeration cost.
  // 这里故意不使用 spread 或 extend 以避免运行时键枚举成本。
  const { props, ref, patchFlag, children, transition } = vnode
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props
  const cloned: VNode<T, U> = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref:
      extraProps && extraProps.ref
        ? // #2078 in the case of <component :is="vnode" ref="extra"/>
          // if the vnode itself already has a ref, cloneVNode will need to merge
          // the refs so the single vnode can be set on multiple refs
          // #2078 在 <component :is="vnode" ref="extra"/> 的情况下
          // 如果 vnode 本身已经有一个 ref，cloneVNode 将需要合并 refs，
          // 以便单个 vnode 可以设置在多个 refs 上
          mergeRef && ref
          ? isArray(ref)
            ? ref.concat(normalizeRef(extraProps)!)
            : [ref, normalizeRef(extraProps)!]
          : normalizeRef(extraProps)
        : ref,
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children:
      __DEV__ && patchFlag === PatchFlags.CACHED && isArray(children)
        ? (children as VNode[]).map(deepCloneVNode)
        : children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    // 如果 vnode 是用额外的 props 克隆的，我们不能再假设其现有的 patch flag 是可靠的，
    // 需要添加 FULL_PROPS 标志。
    // 注意：保留片段的标志，因为它们仅将标志用于子节点快速路径。
    patchFlag:
      extraProps && vnode.type !== Fragment
        ? patchFlag === PatchFlags.CACHED // hoisted node
          ? PatchFlags.FULL_PROPS
          : patchFlag | PatchFlags.FULL_PROPS
        : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition,

    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    // 从技术上讲，这些应该仅在已挂载的 VNode 上为非空。但是，
    // 对于 kept-alive vnodes，它们 *应该* 被复制。所以我们总是复制它们，
    // 因为它们在挂载期间为非空不会影响逻辑，因为它们会被简单地覆盖。
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    placeholder: vnode.placeholder,

    el: vnode.el,
    anchor: vnode.anchor,
    ctx: vnode.ctx,
    ce: vnode.ce,
  }

  // if the vnode will be replaced by the cloned one, it is necessary
  // to clone the transition to ensure that the vnode referenced within
  // the transition hooks is fresh.
  // 如果 vnode 将被克隆的 vnode 替换，则必须克隆 transition，
  // 以确保 transition 钩子中引用的 vnode 是新鲜的。
  if (transition && cloneTransition) {
    setTransitionHooks(
      cloned as VNode,
      transition.clone(cloned as VNode) as TransitionHooks,
    )
  }

  if (__COMPAT__) {
    defineLegacyVNodeProperties(cloned as VNode)
  }

  return cloned
}

/**
 * Dev only, for HMR of hoisted vnodes reused in v-for
 * https://github.com/vitejs/vite/issues/2022
 * 仅开发环境，用于 v-for 中重用的提升 vnode 的 HMR
 */
function deepCloneVNode(vnode: VNode): VNode {
  const cloned = cloneVNode(vnode)
  if (isArray(vnode.children)) {
    cloned.children = (vnode.children as VNode[]).map(deepCloneVNode)
  }
  return cloned
}

/**
 * @private
 * 创建文本 VNode
 */
export function createTextVNode(text: string = ' ', flag: number = 0): VNode {
  return createVNode(Text, null, text, flag)
}

/**
 * @private
 * 创建静态 VNode
 */
export function createStaticVNode(
  content: string,
  numberOfNodes: number,
): VNode {
  // A static vnode can contain multiple stringified elements, and the number
  // of elements is necessary for hydration.
  // 一个静态 vnode 可以包含多个字符串化的元素，元素的数量对于 hydration 是必要的。
  const vnode = createVNode(Static, null, content)
  vnode.staticCount = numberOfNodes
  return vnode
}

/**
 * @private
 * 创建注释 VNode
 */
export function createCommentVNode(
  text: string = '',
  // when used as the v-else branch, the comment node must be created as a
  // block to ensure correct updates.
  // 当用作 v-else 分支时，注释节点必须创建为 block 以确保正确更新。
  asBlock: boolean = false,
): VNode {
  return asBlock
    ? (openBlock(), createBlock(Comment, null, text))
    : createVNode(Comment, null, text)
}

// 标准化 VNode
export function normalizeVNode(child: VNodeChild): VNode {
  if (child == null || typeof child === 'boolean') {
    // empty placeholder
    // 空占位符
    return createVNode(Comment)
  } else if (isArray(child)) {
    // fragment
    // 片段
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      // #3666, 避免重用 vnode 时的引用污染
      child.slice(),
    )
  } else if (isVNode(child)) {
    // already vnode, this should be the most common since compiled templates
    // always produce all-vnode children arrays
    // 已经是 vnode，这应该是最常见的情况，因为编译后的模板总是生成全 vnode 子节点数组
    return cloneIfMounted(child)
  } else {
    // strings and numbers
    // 字符串和数字
    return createVNode(Text, null, String(child))
  }
}

// optimized normalization for template-compiled render fns
// 为模板编译的渲染函数优化的标准化
export function cloneIfMounted(child: VNode): VNode {
  return (child.el === null && child.patchFlag !== PatchFlags.CACHED) ||
    child.memo
    ? child
    : cloneVNode(child)
}

// 标准化子节点
export function normalizeChildren(vnode: VNode, children: unknown): void {
  let type = 0
  const { shapeFlag } = vnode
  if (children == null) {
    children = null
  } else if (isArray(children)) {
    type = ShapeFlags.ARRAY_CHILDREN
  } else if (typeof children === 'object') {
    if (shapeFlag & (ShapeFlags.ELEMENT | ShapeFlags.TELEPORT)) {
      // Normalize slot to plain children for plain element and Teleport
      // 为普通元素和 Teleport 将插槽标准化为普通子节点
      const slot = (children as any).default
      if (slot) {
        // _c marker is added by withCtx() indicating this is a compiled slot
        // _c 标记由 withCtx() 添加，表示这是一个编译后的插槽
        slot._c && (slot._d = false)
        normalizeChildren(vnode, slot())
        slot._c && (slot._d = true)
      }
      return
    } else {
      type = ShapeFlags.SLOTS_CHILDREN
      const slotFlag = (children as RawSlots)._
      if (!slotFlag && !isInternalObject(children)) {
        // if slots are not normalized, attach context instance
        // (compiled / normalized slots already have context)
        // 如果插槽未标准化，则附加上下文实例
        // (编译/标准化的插槽已经有上下文)
        ;(children as RawSlots)._ctx = currentRenderingInstance
      } else if (slotFlag === SlotFlags.FORWARDED && currentRenderingInstance) {
        // a child component receives forwarded slots from the parent.
        // its slot type is determined by its parent's slot type.
        // 子组件接收来自父组件的转发插槽。
        // 其插槽类型由其父组件的插槽类型决定。
        if (
          (currentRenderingInstance.slots as RawSlots)._ === SlotFlags.STABLE
        ) {
          ;(children as RawSlots)._ = SlotFlags.STABLE
        } else {
          ;(children as RawSlots)._ = SlotFlags.DYNAMIC
          vnode.patchFlag |= PatchFlags.DYNAMIC_SLOTS
        }
      }
    }
  } else if (isFunction(children)) {
    children = { default: children, _ctx: currentRenderingInstance }
    type = ShapeFlags.SLOTS_CHILDREN
  } else {
    children = String(children)
    // force teleport children to array so it can be moved around
    // 强制 teleport 子节点为数组，以便可以移动
    if (shapeFlag & ShapeFlags.TELEPORT) {
      type = ShapeFlags.ARRAY_CHILDREN
      children = [createTextVNode(children as string)]
    } else {
      type = ShapeFlags.TEXT_CHILDREN
    }
  }
  vnode.children = children as VNodeNormalizedChildren
  vnode.shapeFlag |= type
}

// 合并 props
export function mergeProps(...args: (Data & VNodeProps)[]): Data {
  const ret: Data = {}
  for (let i = 0; i < args.length; i++) {
    const toMerge = args[i]
    for (const key in toMerge) {
      if (key === 'class') {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class])
        }
      } else if (key === 'style') {
        ret.style = normalizeStyle([ret.style, toMerge.style])
      } else if (isOn(key)) {
        const existing = ret[key]
        const incoming = toMerge[key]
        if (
          incoming &&
          existing !== incoming &&
          !(isArray(existing) && existing.includes(incoming))
        ) {
          ret[key] = existing
            ? [].concat(existing as any, incoming as any)
            : incoming
        }
      } else if (key !== '') {
        ret[key] = toMerge[key]
      }
    }
  }
  return ret
}

export function invokeVNodeHook(
  hook: VNodeHook,
  instance: ComponentInternalInstance | null,
  vnode: VNode,
  prevVNode: VNode | null = null,
): void {
  callWithAsyncErrorHandling(hook, instance, ErrorCodes.VNODE_HOOK, [
    vnode,
    prevVNode,
  ])
}
