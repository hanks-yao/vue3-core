import {
  type ComponentInternalInstance,
  type ComponentOptions,
  type SetupContext,
  getCurrentInstance,
} from '../component'
import {
  Comment,
  Fragment,
  type VNode,
  type VNodeArrayChildren,
  cloneVNode,
  isSameVNodeType,
} from '../vnode'
import { warn } from '../warning'
import { isKeepAlive } from './KeepAlive'
import { toRaw } from '@vue/reactivity'
import { ErrorCodes, callWithAsyncErrorHandling } from '../errorHandling'
import { PatchFlags, ShapeFlags, isArray, isFunction } from '@vue/shared'
import { onBeforeUnmount, onMounted } from '../apiLifecycle'
import { isTeleport } from './Teleport'
import type { RendererElement } from '../renderer'
import { SchedulerJobFlags } from '../scheduler'

type Hook<T = () => void> = T | T[]

export const leaveCbKey: unique symbol = Symbol('_leaveCb')
const enterCbKey: unique symbol = Symbol('_enterCb')

export interface BaseTransitionProps<HostElement = RendererElement> {
  mode?: 'in-out' | 'out-in' | 'default'
  appear?: boolean

  // If true, indicates this is a transition that doesn't actually insert/remove
  // the element, but toggles the show / hidden status instead.
  // The transition hooks are injected, but will be skipped by the renderer.
  // Instead, a custom directive can control the transition by calling the
  // injected hooks (e.g. v-show).
  // 如果为 true，表示这是一个实际上不插入/移除元素的过渡，
  // 而是切换显示/隐藏状态。
  // 过渡钩子会被注入，但会被渲染器跳过。
  // 相反，自定义指令可以通过调用注入的钩子来控制过渡（例如 v-show）。
  persisted?: boolean

  // Hooks. Using camel case for easier usage in render functions & JSX.
  // In templates these can be written as @before-enter="xxx" as prop names
  // are camelized.
  // 钩子。使用驼峰命名法以便在渲染函数和 JSX 中更易使用。
  // 在模板中，这些可以写成 @before-enter="xxx"，因为 prop 名称会被驼峰化。
  onBeforeEnter?: Hook<(el: HostElement) => void>
  onEnter?: Hook<(el: HostElement, done: () => void) => void>
  onAfterEnter?: Hook<(el: HostElement) => void>
  onEnterCancelled?: Hook<(el: HostElement) => void>
  // leave
  onBeforeLeave?: Hook<(el: HostElement) => void>
  onLeave?: Hook<(el: HostElement, done: () => void) => void>
  onAfterLeave?: Hook<(el: HostElement) => void>
  onLeaveCancelled?: Hook<(el: HostElement) => void> // only fired in persisted mode // 仅在持久模式下触发
  // appear
  onBeforeAppear?: Hook<(el: HostElement) => void>
  onAppear?: Hook<(el: HostElement, done: () => void) => void>
  onAfterAppear?: Hook<(el: HostElement) => void>
  onAppearCancelled?: Hook<(el: HostElement) => void>
}

export interface TransitionHooks<HostElement = RendererElement> {
  mode: BaseTransitionProps['mode']
  persisted: boolean
  beforeEnter(el: HostElement): void
  enter(el: HostElement): void
  leave(el: HostElement, remove: () => void): void
  clone(vnode: VNode): TransitionHooks<HostElement>
  // optional
  afterLeave?(): void
  delayLeave?(
    el: HostElement,
    earlyRemove: () => void,
    delayedLeave: () => void,
  ): void
  delayedLeave?(): void
}

export type TransitionHookCaller = <T extends any[] = [el: any]>(
  hook: Hook<(...args: T) => void> | undefined,
  args?: T,
) => void

export type PendingCallback = (cancelled?: boolean) => void

export interface TransitionState {
  isMounted: boolean
  isLeaving: boolean
  isUnmounting: boolean
  // Track pending leave callbacks for children of the same key.
  // This is used to force remove leaving a child when a new copy is entering.
  // 跟踪具有相同 key 的子节点的待处理离开回调。
  // 这用于在通过新副本进入时强制移除正在离开的子节点。
  leavingVNodes: Map<any, Record<string, VNode>>
}

export interface TransitionElement {
  // in persisted mode (e.g. v-show), the same element is toggled, so the
  // pending enter/leave callbacks may need to be cancelled if the state is toggled
  // before it finishes.
  // 在持久模式（例如 v-show）中，同一个元素被切换，
  // 因此如果在完成之前状态被切换，可能需要取消待处理的进入/离开回调。
  [enterCbKey]?: PendingCallback
  [leaveCbKey]?: PendingCallback
}

export function useTransitionState(): TransitionState {
  const state: TransitionState = {
    isMounted: false,
    isLeaving: false,
    isUnmounting: false,
    leavingVNodes: new Map(),
  }
  onMounted(() => {
    state.isMounted = true
  })
  onBeforeUnmount(() => {
    state.isUnmounting = true
  })
  return state
}

const TransitionHookValidator = [Function, Array]

export const BaseTransitionPropsValidators: Record<string, any> = {
  mode: String,
  appear: Boolean,
  persisted: Boolean,
  // enter
  onBeforeEnter: TransitionHookValidator,
  onEnter: TransitionHookValidator,
  onAfterEnter: TransitionHookValidator,
  onEnterCancelled: TransitionHookValidator,
  // leave
  onBeforeLeave: TransitionHookValidator,
  onLeave: TransitionHookValidator,
  onAfterLeave: TransitionHookValidator,
  onLeaveCancelled: TransitionHookValidator,
  // appear
  onBeforeAppear: TransitionHookValidator,
  onAppear: TransitionHookValidator,
  onAfterAppear: TransitionHookValidator,
  onAppearCancelled: TransitionHookValidator,
}

const recursiveGetSubtree = (instance: ComponentInternalInstance): VNode => {
  const subTree = instance.subTree
  return subTree.component ? recursiveGetSubtree(subTree.component) : subTree
}

const BaseTransitionImpl: ComponentOptions = {
  name: `BaseTransition`,

  props: BaseTransitionPropsValidators,

  setup(props: BaseTransitionProps, { slots }: SetupContext) {
    const instance = getCurrentInstance()!
    const state = useTransitionState()

    return () => {
      const children =
        slots.default && getTransitionRawChildren(slots.default(), true)
      if (!children || !children.length) {
        return
      }

      const child: VNode = findNonCommentChild(children)
      // there's no need to track reactivity for these props so use the raw
      // props for a bit better perf
      // 不需要跟踪这些 props 的响应性，所以使用原始 props 以获得更好的性能
      const rawProps = toRaw(props)
      const { mode } = rawProps
      // check mode
      if (
        __DEV__ &&
        mode &&
        mode !== 'in-out' &&
        mode !== 'out-in' &&
        mode !== 'default'
      ) {
        warn(`invalid <transition> mode: ${mode}`)
      }

      if (state.isLeaving) {
        return emptyPlaceholder(child)
      }

      // in the case of <transition><keep-alive/></transition>, we need to
      // compare the type of the kept-alive children.
      // 在 <transition><keep-alive/></transition> 的情况下，我们需要
      // 比较 keep-alive 子节点的类型。
      const innerChild = getInnerChild(child)
      if (!innerChild) {
        return emptyPlaceholder(child)
      }

      let enterHooks = resolveTransitionHooks(
        innerChild,
        rawProps,
        state,
        instance,
        // #11061, ensure enterHooks is fresh after clone
        // #11061, 确保克隆后 enterHooks 是新鲜的
        hooks => (enterHooks = hooks),
      )

      if (innerChild.type !== Comment) {
        setTransitionHooks(innerChild, enterHooks)
      }

      let oldInnerChild = instance.subTree && getInnerChild(instance.subTree)

      // handle mode
      if (
        oldInnerChild &&
        oldInnerChild.type !== Comment &&
        !isSameVNodeType(oldInnerChild, innerChild) &&
        recursiveGetSubtree(instance).type !== Comment
      ) {
        let leavingHooks = resolveTransitionHooks(
          oldInnerChild,
          rawProps,
          state,
          instance,
        )
        // update old tree's hooks in case of dynamic transition
        // 更新旧树的钩子以防动态过渡
        setTransitionHooks(oldInnerChild, leavingHooks)
        // switching between different views
        // 在不同视图之间切换
        if (mode === 'out-in' && innerChild.type !== Comment) {
          state.isLeaving = true
          // return placeholder node and queue update when leave finishes
          // 返回占位符节点并在离开完成时排队更新
          leavingHooks.afterLeave = () => {
            state.isLeaving = false
            // #6835
            // it also needs to be updated when active is undefined
            // #6835
            // 当 active 为 undefined 时也需要更新
            if (!(instance.job.flags! & SchedulerJobFlags.DISPOSED)) {
              instance.update()
            }
            delete leavingHooks.afterLeave
            oldInnerChild = undefined
          }
          return emptyPlaceholder(child)
        } else if (mode === 'in-out' && innerChild.type !== Comment) {
          leavingHooks.delayLeave = (
            el: TransitionElement,
            earlyRemove,
            delayedLeave,
          ) => {
            const leavingVNodesCache = getLeavingNodesForType(
              state,
              oldInnerChild!,
            )
            leavingVNodesCache[String(oldInnerChild!.key)] = oldInnerChild!
            // early removal callback
            // 提前移除回调
            el[leaveCbKey] = () => {
              earlyRemove()
              el[leaveCbKey] = undefined
              delete enterHooks.delayedLeave
              oldInnerChild = undefined
            }
            enterHooks.delayedLeave = () => {
              delayedLeave()
              delete enterHooks.delayedLeave
              oldInnerChild = undefined
            }
          }
        } else {
          oldInnerChild = undefined
        }
      } else if (oldInnerChild) {
        oldInnerChild = undefined
      }

      return child
    }
  },
}

if (__COMPAT__) {
  BaseTransitionImpl.__isBuiltIn = true
}

function findNonCommentChild(children: VNode[]): VNode {
  let child: VNode = children[0]
  if (children.length > 1) {
    let hasFound = false
    // locate first non-comment child
    // 定位第一个非注释子节点
    for (const c of children) {
      if (c.type !== Comment) {
        if (__DEV__ && hasFound) {
          // warn more than one non-comment child
          // 警告超过一个非注释子节点
          warn(
            '<transition> can only be used on a single element or component. ' +
              'Use <transition-group> for lists.',
          )
          break
        }
        child = c
        hasFound = true
        if (!__DEV__) break
      }
    }
  }
  return child
}

// export the public type for h/tsx inference
// also to avoid inline import() in generated d.ts files
// 导出公共类型用于 h/tsx 推断
// 也为了避免在生成的 d.ts 文件中使用内联 import()
export const BaseTransition = BaseTransitionImpl as unknown as {
  new (): {
    $props: BaseTransitionProps<any>
    $slots: {
      default(): VNode[]
    }
  }
}

function getLeavingNodesForType(
  state: TransitionState,
  vnode: VNode,
): Record<string, VNode> {
  const { leavingVNodes } = state
  let leavingVNodesCache = leavingVNodes.get(vnode.type)!
  if (!leavingVNodesCache) {
    leavingVNodesCache = Object.create(null)
    leavingVNodes.set(vnode.type, leavingVNodesCache)
  }
  return leavingVNodesCache
}

// The transition hooks are attached to the vnode as vnode.transition
// and will be called at appropriate timing in the renderer.
// 过渡钩子作为 vnode.transition 附加到 vnode 上
// 并且将在渲染器的适当时机被调用。
export function resolveTransitionHooks(
  vnode: VNode,
  props: BaseTransitionProps<any>,
  state: TransitionState,
  instance: ComponentInternalInstance,
  postClone?: (hooks: TransitionHooks) => void,
): TransitionHooks {
  const {
    appear,
    mode,
    persisted = false,
    onBeforeEnter,
    onEnter,
    onAfterEnter,
    onEnterCancelled,
    onBeforeLeave,
    onLeave,
    onAfterLeave,
    onLeaveCancelled,
    onBeforeAppear,
    onAppear,
    onAfterAppear,
    onAppearCancelled,
  } = props
  const key = String(vnode.key)
  const leavingVNodesCache = getLeavingNodesForType(state, vnode)

  const callHook: TransitionHookCaller = (hook, args) => {
    hook &&
      callWithAsyncErrorHandling(
        hook,
        instance,
        ErrorCodes.TRANSITION_HOOK,
        args,
      )
  }

  const callAsyncHook = (
    hook: Hook<(el: any, done: () => void) => void>,
    args: [TransitionElement, () => void],
  ) => {
    const done = args[1]
    callHook(hook, args)
    if (isArray(hook)) {
      if (hook.every(hook => hook.length <= 1)) done()
    } else if (hook.length <= 1) {
      done()
    }
  }

  const hooks: TransitionHooks<TransitionElement> = {
    mode,
    persisted,
    beforeEnter(el) {
      let hook = onBeforeEnter
      if (!state.isMounted) {
        if (appear) {
          hook = onBeforeAppear || onBeforeEnter
        } else {
          return
        }
      }
      // for same element (v-show)
      // 对于同一个元素 (v-show)
      if (el[leaveCbKey]) {
        el[leaveCbKey](true /* cancelled */)
      }
      // for toggled element with same key (v-if)
      // 对于具有相同 key 的切换元素 (v-if)
      const leavingVNode = leavingVNodesCache[key]
      if (
        leavingVNode &&
        isSameVNodeType(vnode, leavingVNode) &&
        (leavingVNode.el as TransitionElement)[leaveCbKey]
      ) {
        // force early removal (not cancelled)
        // 强制提前移除 (未取消)
        ;(leavingVNode.el as TransitionElement)[leaveCbKey]!()
      }
      callHook(hook, [el])
    },

    enter(el) {
      let hook = onEnter
      let afterHook = onAfterEnter
      let cancelHook = onEnterCancelled
      if (!state.isMounted) {
        if (appear) {
          hook = onAppear || onEnter
          afterHook = onAfterAppear || onAfterEnter
          cancelHook = onAppearCancelled || onEnterCancelled
        } else {
          return
        }
      }
      let called = false
      const done = (el[enterCbKey] = (cancelled?) => {
        if (called) return
        called = true
        if (cancelled) {
          callHook(cancelHook, [el])
        } else {
          callHook(afterHook, [el])
        }
        if (hooks.delayedLeave) {
          hooks.delayedLeave()
        }
        el[enterCbKey] = undefined
      })
      if (hook) {
        callAsyncHook(hook, [el, done])
      } else {
        done()
      }
    },

    leave(el, remove) {
      const key = String(vnode.key)
      if (el[enterCbKey]) {
        el[enterCbKey](true /* cancelled */) // 取消
      }
      if (state.isUnmounting) {
        return remove()
      }
      callHook(onBeforeLeave, [el])
      let called = false
      const done = (el[leaveCbKey] = (cancelled?) => {
        if (called) return
        called = true
        remove()
        if (cancelled) {
          callHook(onLeaveCancelled, [el])
        } else {
          callHook(onAfterLeave, [el])
        }
        el[leaveCbKey] = undefined
        if (leavingVNodesCache[key] === vnode) {
          delete leavingVNodesCache[key]
        }
      })
      leavingVNodesCache[key] = vnode
      if (onLeave) {
        callAsyncHook(onLeave, [el, done])
      } else {
        done()
      }
    },

    clone(vnode) {
      const hooks = resolveTransitionHooks(
        vnode,
        props,
        state,
        instance,
        postClone,
      )
      if (postClone) postClone(hooks)
      return hooks
    },
  }

  return hooks
}

// the placeholder really only handles one special case: KeepAlive
// in the case of a KeepAlive in a leave phase we need to return a KeepAlive
// placeholder with empty content to avoid the KeepAlive instance from being
// unmounted.
// 占位符实际上只处理一种特殊情况：KeepAlive
// 在 KeepAlive 处于离开阶段的情况下，我们需要返回一个内容为空的 KeepAlive
// 占位符，以避免 KeepAlive 实例被卸载。
function emptyPlaceholder(vnode: VNode): VNode | undefined {
  if (isKeepAlive(vnode)) {
    vnode = cloneVNode(vnode)
    vnode.children = null
    return vnode
  }
}

function getInnerChild(vnode: VNode): VNode | undefined {
  if (!isKeepAlive(vnode)) {
    if (isTeleport(vnode.type) && vnode.children) {
      return findNonCommentChild(vnode.children as VNode[])
    }

    return vnode
  }
  // #7121,#12465 get the component subtree if it's been mounted
  // #7121,#12465 如果组件子树已挂载，则获取它
  if (vnode.component) {
    return vnode.component.subTree
  }

  const { shapeFlag, children } = vnode

  if (children) {
    if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      return (children as VNodeArrayChildren)[0] as VNode
    }

    if (
      shapeFlag & ShapeFlags.SLOTS_CHILDREN &&
      isFunction((children as any).default)
    ) {
      return (children as any).default()
    }
  }
}

export function setTransitionHooks(vnode: VNode, hooks: TransitionHooks): void {
  if (vnode.shapeFlag & ShapeFlags.COMPONENT && vnode.component) {
    vnode.transition = hooks
    setTransitionHooks(vnode.component.subTree, hooks)
  } else if (__FEATURE_SUSPENSE__ && vnode.shapeFlag & ShapeFlags.SUSPENSE) {
    vnode.ssContent!.transition = hooks.clone(vnode.ssContent!)
    vnode.ssFallback!.transition = hooks.clone(vnode.ssFallback!)
  } else {
    vnode.transition = hooks
  }
}

export function getTransitionRawChildren(
  children: VNode[],
  keepComment: boolean = false,
  parentKey?: VNode['key'],
): VNode[] {
  let ret: VNode[] = []
  let keyedFragmentCount = 0
  for (let i = 0; i < children.length; i++) {
    let child = children[i]
    // #5360 inherit parent key in case of <template v-for>
    // #5360 在 <template v-for> 的情况下继承父 key
    const key =
      parentKey == null
        ? child.key
        : String(parentKey) + String(child.key != null ? child.key : i)
    // handle fragment children case, e.g. v-for
    // 处理片段子节点的情况，例如 v-for
    if (child.type === Fragment) {
      if (child.patchFlag & PatchFlags.KEYED_FRAGMENT) keyedFragmentCount++
      ret = ret.concat(
        getTransitionRawChildren(child.children as VNode[], keepComment, key),
      )
    }
    // comment placeholders should be skipped, e.g. v-if
    // 应跳过注释占位符，例如 v-if
    else if (keepComment || child.type !== Comment) {
      ret.push(key != null ? cloneVNode(child, { key }) : child)
    }
  }
  // #1126 if a transition children list contains multiple sub fragments, these
  // fragments will be merged into a flat children array. Since each v-for
  // fragment may contain different static bindings inside, we need to de-op
  // these children to force full diffs to ensure correct behavior.
  // #1126 如果过渡子节点列表包含多个子片段，这些
  // 片段将被合并为一个扁平的子节点数组。由于每个 v-for
  // 片段内部可能包含不同的静态绑定，我们需要取消优化
  // 这些子节点以强制进行完整 diff，从而确保正确的行为。
  if (keyedFragmentCount > 1) {
    for (let i = 0; i < ret.length; i++) {
      ret[i].patchFlag = PatchFlags.BAIL
    }
  }
  return ret
}
