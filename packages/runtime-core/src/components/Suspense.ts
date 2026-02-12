import {
  Comment,
  type VNode,
  type VNodeProps,
  closeBlock,
  createVNode,
  currentBlock,
  isBlockTreeEnabled,
  isSameVNodeType,
  normalizeVNode,
  openBlock,
} from '../vnode'
import { ShapeFlags, isArray, isFunction, toNumber } from '@vue/shared'
import { type ComponentInternalInstance, handleSetupResult } from '../component'
import type { Slots } from '../componentSlots'
import {
  type ElementNamespace,
  MoveType,
  type RendererElement,
  type RendererInternals,
  type RendererNode,
  type SetupRenderEffectFn,
  queuePostRenderEffect,
} from '../renderer'
import { queuePostFlushCb } from '../scheduler'
import { filterSingleRoot, updateHOCHostEl } from '../componentRenderUtils'
import {
  assertNumber,
  popWarningContext,
  pushWarningContext,
  warn,
} from '../warning'
import { ErrorCodes, handleError } from '../errorHandling'
import { NULL_DYNAMIC_COMPONENT } from '../helpers/resolveAssets'

export interface SuspenseProps {
  onResolve?: () => void
  onPending?: () => void
  onFallback?: () => void
  timeout?: string | number
  /**
   * Allow suspense to be captured by parent suspense
   * 允许 suspense 被父级 suspense 捕获
   *
   * @default false
   */
  suspensible?: boolean
}

export const isSuspense = (type: any): boolean => type.__isSuspense

// incrementing unique id for every pending branch
// 每个 pending 分支的递增唯一 id
let suspenseId = 0

/**
 * For testing only
 * 仅用于测试
 */
export const resetSuspenseId = (): number => (suspenseId = 0)

// Suspense exposes a component-like API, and is treated like a component
// in the compiler, but internally it's a special built-in type that hooks
// directly into the renderer.
// Suspense 暴露了一个类似组件的 API，并且在编译器中被视为一个组件，
// 但在内部它是一个特殊的内置类型，直接挂钩到渲染器中。
export const SuspenseImpl = {
  name: 'Suspense',
  // In order to make Suspense tree-shakable, we need to avoid importing it
  // directly in the renderer. The renderer checks for the __isSuspense flag
  // on a vnode's type and calls the `process` method, passing in renderer
  // internals.
  // 为了使 Suspense 支持 tree-shaking，我们需要避免在渲染器中直接导入它。
  // 渲染器检查 vnode 类型上的 __isSuspense 标志，并调用 `process` 方法，
  // 传入渲染器内部对象。
  __isSuspense: true,
  process(
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
    slotScopeIds: string[] | null,
    optimized: boolean,
    // platform-specific impl passed from renderer
    // 从渲染器传递的平台特定实现
    rendererInternals: RendererInternals,
  ): void {
    if (n1 == null) {
      mountSuspense(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        rendererInternals,
      )
    } else {
      // #8678 if the current suspense needs to be patched and parentSuspense has
      // not been resolved. this means that both the current suspense and parentSuspense
      // need to be patched. because parentSuspense's pendingBranch includes the
      // current suspense, it will be processed twice:
      //  1. current patch
      //  2. mounting along with the pendingBranch of parentSuspense
      // it is necessary to skip the current patch to avoid multiple mounts
      // of inner components.
      // #8678 如果当前 suspense 需要被修补（patch），且 parentSuspense 尚未解决（resolve）。
      // 这意味着当前 suspense 和 parentSuspense 都需要被修补。
      // 因为 parentSuspense 的 pendingBranch 包含当前 suspense，它将被处理两次：
      //  1. 当前修补
      //  2. 随 parentSuspense 的 pendingBranch 一起挂载
      // 必须跳过当前修补以避免内部组件的多次挂载。
      if (
        parentSuspense &&
        parentSuspense.deps > 0 &&
        !n1.suspense!.isInFallback
      ) {
        n2.suspense = n1.suspense!
        n2.suspense.vnode = n2
        n2.el = n1.el
        return
      }
      patchSuspense(
        n1,
        n2,
        container,
        anchor,
        parentComponent,
        namespace,
        slotScopeIds,
        optimized,
        rendererInternals,
      )
    }
  },
  hydrate: hydrateSuspense as typeof hydrateSuspense,
  normalize: normalizeSuspenseChildren as typeof normalizeSuspenseChildren,
}

// Force-casted public typing for h and TSX props inference
// 强制转换的公共类型，用于 h 和 TSX 属性推断
export const Suspense = (__FEATURE_SUSPENSE__
  ? SuspenseImpl
  : null) as unknown as {
  __isSuspense: true
  new (): {
    $props: VNodeProps & SuspenseProps
    $slots: {
      default(): VNode[]
      fallback(): VNode[]
    }
  }
}

function triggerEvent(
  vnode: VNode,
  name: 'onResolve' | 'onPending' | 'onFallback',
) {
  const eventListener = vnode.props && vnode.props[name]
  if (isFunction(eventListener)) {
    eventListener()
  }
}

function mountSuspense(
  vnode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  namespace: ElementNamespace,
  slotScopeIds: string[] | null,
  optimized: boolean,
  rendererInternals: RendererInternals,
) {
  const {
    p: patch,
    o: { createElement },
  } = rendererInternals
  const hiddenContainer = createElement('div')
  const suspense = (vnode.suspense = createSuspenseBoundary(
    vnode,
    parentSuspense,
    parentComponent,
    container,
    hiddenContainer,
    anchor,
    namespace,
    slotScopeIds,
    optimized,
    rendererInternals,
  ))

  // start mounting the content subtree in an off-dom container
  // 开始在一个离线 DOM 容器中挂载内容子树
  patch(
    null,
    (suspense.pendingBranch = vnode.ssContent!),
    hiddenContainer,
    null,
    parentComponent,
    suspense,
    namespace,
    slotScopeIds,
  )
  // now check if we have encountered any async deps
  // 现在检查是否遇到了任何异步依赖
  if (suspense.deps > 0) {
    // has async
    // invoke @fallback event
    // 存在异步依赖
    // 触发 @fallback 事件
    triggerEvent(vnode, 'onPending')
    triggerEvent(vnode, 'onFallback')

    // mount the fallback tree
    // 挂载 fallback 树
    patch(
      null,
      vnode.ssFallback!,
      container,
      anchor,
      parentComponent,
      null, // fallback tree will not have suspense context // fallback 树不会有 suspense 上下文
      namespace,
      slotScopeIds,
    )
    setActiveBranch(suspense, vnode.ssFallback!)
  } else {
    // Suspense has no async deps. Just resolve.
    // Suspense 没有异步依赖。直接解决。
    suspense.resolve(false, true)
  }
}

function patchSuspense(
  n1: VNode,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  namespace: ElementNamespace,
  slotScopeIds: string[] | null,
  optimized: boolean,
  { p: patch, um: unmount, o: { createElement } }: RendererInternals,
) {
  const suspense = (n2.suspense = n1.suspense)!
  suspense.vnode = n2
  n2.el = n1.el
  const newBranch = n2.ssContent!
  const newFallback = n2.ssFallback!

  const { activeBranch, pendingBranch, isInFallback, isHydrating } = suspense
  if (pendingBranch) {
    suspense.pendingBranch = newBranch
    if (isSameVNodeType(pendingBranch, newBranch)) {
      // same root type but content may have changed.
      // 根类型相同但内容可能已更改。
      patch(
        pendingBranch,
        newBranch,
        suspense.hiddenContainer,
        null,
        parentComponent,
        suspense,
        namespace,
        slotScopeIds,
        optimized,
      )
      if (suspense.deps <= 0) {
        suspense.resolve()
      } else if (isInFallback) {
        // It's possible that the app is in hydrating state when patching the
        // suspense instance. If someone updates the dependency during component
        // setup in children of suspense boundary, that would be problemtic
        // because we aren't actually showing a fallback content when
        // patchSuspense is called. In such case, patch of fallback content
        // should be no op
        // 当修补 suspense 实例时，应用程序可能处于 hydrating 状态。
        // 如果有人在 suspense 边界的子组件 setup 期间更新了依赖项，这可能会有问题，
        // 因为当调用 patchSuspense 时，我们实际上并没有显示 fallback 内容。
        // 在这种情况下，fallback 内容的修补应该是无操作的。
        if (!isHydrating) {
          patch(
            activeBranch,
            newFallback,
            container,
            anchor,
            parentComponent,
            null, // fallback tree will not have suspense context // fallback 树不会有 suspense 上下文
            namespace,
            slotScopeIds,
            optimized,
          )
          setActiveBranch(suspense, newFallback)
        }
      }
    } else {
      // toggled before pending tree is resolved
      // increment pending ID. this is used to invalidate async callbacks
      // 在 pending 树解决之前切换
      // 增加 pending ID。这用于使异步回调无效
      suspense.pendingId = suspenseId++
      if (isHydrating) {
        // if toggled before hydration is finished, the current DOM tree is
        // no longer valid. set it as the active branch so it will be unmounted
        // when resolved
        // 如果在 hydration 完成之前切换，当前的 DOM 树不再有效。
        // 将其设置为 active branch，以便在解决时将其卸载
        suspense.isHydrating = false
        suspense.activeBranch = pendingBranch
      } else {
        unmount(pendingBranch, parentComponent, suspense)
      }
      // reset suspense state
      // 重置 suspense 状态
      suspense.deps = 0
      // discard effects from pending branch
      // 丢弃 pending 分支的副作用
      suspense.effects.length = 0
      // discard previous container
      // 丢弃以前的容器
      suspense.hiddenContainer = createElement('div')

      if (isInFallback) {
        // already in fallback state
        // 已经在 fallback 状态
        patch(
          null,
          newBranch,
          suspense.hiddenContainer,
          null,
          parentComponent,
          suspense,
          namespace,
          slotScopeIds,
          optimized,
        )
        if (suspense.deps <= 0) {
          suspense.resolve()
        } else {
          patch(
            activeBranch,
            newFallback,
            container,
            anchor,
            parentComponent,
            null, // fallback tree will not have suspense context // fallback 树不会有 suspense 上下文
            namespace,
            slotScopeIds,
            optimized,
          )
          setActiveBranch(suspense, newFallback)
        }
      } else if (activeBranch && isSameVNodeType(activeBranch, newBranch)) {
        // toggled "back" to current active branch
        // 切换“回”到当前 active 分支
        patch(
          activeBranch,
          newBranch,
          container,
          anchor,
          parentComponent,
          suspense,
          namespace,
          slotScopeIds,
          optimized,
        )
        // force resolve
        // 强制解决
        suspense.resolve(true)
      } else {
        // switched to a 3rd branch
        // 切换到第 3 个分支
        patch(
          null,
          newBranch,
          suspense.hiddenContainer,
          null,
          parentComponent,
          suspense,
          namespace,
          slotScopeIds,
          optimized,
        )
        if (suspense.deps <= 0) {
          suspense.resolve()
        }
      }
    }
  } else {
    if (activeBranch && isSameVNodeType(activeBranch, newBranch)) {
      // root did not change, just normal patch
      // 根节点没有改变，只是正常的修补
      patch(
        activeBranch,
        newBranch,
        container,
        anchor,
        parentComponent,
        suspense,
        namespace,
        slotScopeIds,
        optimized,
      )
      setActiveBranch(suspense, newBranch)
    } else {
      // root node toggled
      // invoke @pending event
      // 根节点切换
      // 触发 @pending 事件
      triggerEvent(n2, 'onPending')
      // mount pending branch in off-dom container
      // 在离线 DOM 容器中挂载 pending 分支
      suspense.pendingBranch = newBranch
      if (newBranch.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
        suspense.pendingId = newBranch.component!.suspenseId!
      } else {
        suspense.pendingId = suspenseId++
      }
      patch(
        null,
        newBranch,
        suspense.hiddenContainer,
        null,
        parentComponent,
        suspense,
        namespace,
        slotScopeIds,
        optimized,
      )
      if (suspense.deps <= 0) {
        // incoming branch has no async deps, resolve now.
        // 传入的分支没有异步依赖，立即解决。
        suspense.resolve()
      } else {
        const { timeout, pendingId } = suspense
        if (timeout > 0) {
          setTimeout(() => {
            if (suspense.pendingId === pendingId) {
              suspense.fallback(newFallback)
            }
          }, timeout)
        } else if (timeout === 0) {
          suspense.fallback(newFallback)
        }
      }
    }
  }
}

export interface SuspenseBoundary {
  vnode: VNode<RendererNode, RendererElement, SuspenseProps>
  parent: SuspenseBoundary | null
  parentComponent: ComponentInternalInstance | null
  namespace: ElementNamespace
  container: RendererElement
  hiddenContainer: RendererElement
  activeBranch: VNode | null
  pendingBranch: VNode | null
  deps: number
  pendingId: number
  timeout: number
  isInFallback: boolean
  isHydrating: boolean
  isUnmounted: boolean
  effects: Function[]
  resolve(force?: boolean, sync?: boolean): void
  fallback(fallbackVNode: VNode): void
  move(
    container: RendererElement,
    anchor: RendererNode | null,
    type: MoveType,
  ): void
  next(): RendererNode | null
  registerDep(
    instance: ComponentInternalInstance,
    setupRenderEffect: SetupRenderEffectFn,
    optimized: boolean,
  ): void
  unmount(parentSuspense: SuspenseBoundary | null, doRemove?: boolean): void
}

let hasWarned = false

function createSuspenseBoundary(
  vnode: VNode,
  parentSuspense: SuspenseBoundary | null,
  parentComponent: ComponentInternalInstance | null,
  container: RendererElement,
  hiddenContainer: RendererElement,
  anchor: RendererNode | null,
  namespace: ElementNamespace,
  slotScopeIds: string[] | null,
  optimized: boolean,
  rendererInternals: RendererInternals,
  isHydrating = false,
): SuspenseBoundary {
  /* v8 ignore start */
  if (__DEV__ && !__TEST__ && !hasWarned) {
    hasWarned = true
    // @ts-expect-error `console.info` cannot be null error
    // eslint-disable-next-line no-console
    console[console.info ? 'info' : 'log'](
      `<Suspense> is an experimental feature and its API will likely change.`,
    )
  }
  /* v8 ignore stop */

  const {
    p: patch,
    m: move,
    um: unmount,
    n: next,
    o: { parentNode, remove },
  } = rendererInternals

  // if set `suspensible: true`, set the current suspense as a dep of parent suspense
  // 如果设置了 `suspensible: true`，将当前 suspense 设置为父级 suspense 的依赖
  let parentSuspenseId: number | undefined
  const isSuspensible = isVNodeSuspensible(vnode)
  if (isSuspensible) {
    if (parentSuspense && parentSuspense.pendingBranch) {
      parentSuspenseId = parentSuspense.pendingId
      parentSuspense.deps++
    }
  }

  const timeout = vnode.props ? toNumber(vnode.props.timeout) : undefined
  if (__DEV__) {
    assertNumber(timeout, `Suspense timeout`)
  }

  const initialAnchor = anchor
  const suspense: SuspenseBoundary = {
    vnode,
    parent: parentSuspense,
    parentComponent,
    namespace,
    container,
    hiddenContainer,
    deps: 0,
    pendingId: suspenseId++,
    timeout: typeof timeout === 'number' ? timeout : -1,
    activeBranch: null,
    pendingBranch: null,
    isInFallback: !isHydrating,
    isHydrating,
    isUnmounted: false,
    effects: [],

    resolve(resume = false, sync = false) {
      if (__DEV__) {
        if (!resume && !suspense.pendingBranch) {
          throw new Error(
            `suspense.resolve() is called without a pending branch.`,
          )
        }
        if (suspense.isUnmounted) {
          throw new Error(
            `suspense.resolve() is called on an already unmounted suspense boundary.`,
          )
        }
      }
      const {
        vnode,
        activeBranch,
        pendingBranch,
        pendingId,
        effects,
        parentComponent,
        container,
        isInFallback,
      } = suspense

      // if there's a transition happening we need to wait it to finish.
      // 如果正在进行过渡，我们需要等待它完成。
      let delayEnter: boolean | null = false
      if (suspense.isHydrating) {
        suspense.isHydrating = false
      } else if (!resume) {
        delayEnter =
          activeBranch &&
          pendingBranch!.transition &&
          pendingBranch!.transition.mode === 'out-in'
        if (delayEnter) {
          activeBranch!.transition!.afterLeave = () => {
            if (pendingId === suspense.pendingId) {
              move(
                pendingBranch!,
                container,
                anchor === initialAnchor ? next(activeBranch!) : anchor,
                MoveType.ENTER,
              )
              queuePostFlushCb(effects)
              // clear el reference from fallback vnode to allow GC after transition
              // 清除 fallback vnode 的 el 引用，以便在过渡后允许 GC
              if (isInFallback && vnode.ssFallback) {
                vnode.ssFallback.el = null
              }
            }
          }
        }
        // unmount current active tree
        // 卸载当前 active 树
        if (activeBranch) {
          // if the fallback tree was mounted, it may have been moved
          // as part of a parent suspense. get the latest anchor for insertion
          // #8105 if `delayEnter` is true, it means that the mounting of
          // `activeBranch` will be delayed. if the branch switches before
          // transition completes, both `activeBranch` and `pendingBranch` may
          // coexist in the `hiddenContainer`. This could result in
          // `next(activeBranch!)` obtaining an incorrect anchor
          // (got `pendingBranch.el`).
          // Therefore, after the mounting of activeBranch is completed,
          // it is necessary to get the latest anchor.
          // 如果 fallback 树已挂载，它可能已作为父级 suspense 的一部分被移动。
          // 获取最新的锚点以进行插入
          // #8105 如果 `delayEnter` 为 true，这意味着 `activeBranch` 的挂载将被延迟。
          // 如果在过渡完成之前分支切换，`activeBranch` 和 `pendingBranch` 可能
          // 共存于 `hiddenContainer` 中。这可能导致 `next(activeBranch!)` 获取不正确的锚点
          // （获取了 `pendingBranch.el`）。
          // 因此，在 activeBranch 的挂载完成后，有必要获取最新的锚点。
          if (parentNode(activeBranch.el!) === container) {
            anchor = next(activeBranch)
          }
          unmount(activeBranch, parentComponent, suspense, true)
          // clear el reference from fallback vnode to allow GC
          // 清除 fallback vnode 的 el 引用以允许 GC
          if (!delayEnter && isInFallback && vnode.ssFallback) {
            queuePostRenderEffect(() => (vnode.ssFallback!.el = null), suspense)
          }
        }
        if (!delayEnter) {
          // move content from off-dom container to actual container
          // 将内容从离线 DOM 容器移动到实际容器
          move(pendingBranch!, container, anchor, MoveType.ENTER)
        }
      }

      setActiveBranch(suspense, pendingBranch!)
      suspense.pendingBranch = null
      suspense.isInFallback = false

      // flush buffered effects
      // check if there is a pending parent suspense
      // 刷新缓冲的副作用
      // 检查是否存在 pending 的父级 suspense
      let parent = suspense.parent
      let hasUnresolvedAncestor = false
      while (parent) {
        if (parent.pendingBranch) {
          // found a pending parent suspense, merge buffered post jobs
          // into that parent
          // 找到一个 pending 的父级 suspense，将缓冲的后期任务合并到该父级中
          parent.effects.push(...effects)
          hasUnresolvedAncestor = true
          break
        }
        parent = parent.parent
      }
      // no pending parent suspense nor transition, flush all jobs
      // 没有 pending 的父级 suspense 也没有过渡，刷新所有任务
      if (!hasUnresolvedAncestor && !delayEnter) {
        queuePostFlushCb(effects)
      }
      suspense.effects = []

      // resolve parent suspense if all async deps are resolved
      // 如果所有异步依赖都已解决，则解决父级 suspense
      if (isSuspensible) {
        if (
          parentSuspense &&
          parentSuspense.pendingBranch &&
          parentSuspenseId === parentSuspense.pendingId
        ) {
          parentSuspense.deps--
          if (parentSuspense.deps === 0 && !sync) {
            parentSuspense.resolve()
          }
        }
      }

      // invoke @resolve event
      // 触发 @resolve 事件
      triggerEvent(vnode, 'onResolve')
    },

    fallback(fallbackVNode) {
      if (!suspense.pendingBranch) {
        return
      }

      const { vnode, activeBranch, parentComponent, container, namespace } =
        suspense

      // invoke @fallback event
      // 触发 @fallback 事件
      triggerEvent(vnode, 'onFallback')

      const anchor = next(activeBranch!)
      const mountFallback = () => {
        if (!suspense.isInFallback) {
          return
        }
        // mount the fallback tree
        // 挂载 fallback 树
        patch(
          null,
          fallbackVNode,
          container,
          anchor,
          parentComponent,
          null, // fallback tree will not have suspense context // fallback 树不会有 suspense 上下文
          namespace,
          slotScopeIds,
          optimized,
        )
        setActiveBranch(suspense, fallbackVNode)
      }

      const delayEnter =
        fallbackVNode.transition && fallbackVNode.transition.mode === 'out-in'
      if (delayEnter) {
        activeBranch!.transition!.afterLeave = mountFallback
      }
      suspense.isInFallback = true

      // unmount current active branch
      // 卸载当前 active 分支
      unmount(
        activeBranch!,
        parentComponent,
        null, // no suspense so unmount hooks fire now // 没有 suspense，所以现在触发卸载钩子
        true, // shouldRemove
      )

      if (!delayEnter) {
        mountFallback()
      }
    },

    move(container, anchor, type) {
      suspense.activeBranch &&
        move(suspense.activeBranch, container, anchor, type)
      suspense.container = container
    },

    next() {
      return suspense.activeBranch && next(suspense.activeBranch)
    },

    registerDep(instance, setupRenderEffect, optimized) {
      const isInPendingSuspense = !!suspense.pendingBranch
      if (isInPendingSuspense) {
        suspense.deps++
      }
      const hydratedEl = instance.vnode.el
      instance
        .asyncDep!.catch(err => {
          handleError(err, instance, ErrorCodes.SETUP_FUNCTION)
        })
        .then(asyncSetupResult => {
          // retry when the setup() promise resolves.
          // component may have been unmounted before resolve.
          // 当 setup() promise 解决时重试。
          // 组件可能在解决之前已被卸载。
          if (
            instance.isUnmounted ||
            suspense.isUnmounted ||
            suspense.pendingId !== instance.suspenseId
          ) {
            return
          }
          // retry from this component
          // 从此组件重试
          instance.asyncResolved = true
          const { vnode } = instance
          if (__DEV__) {
            pushWarningContext(vnode)
          }
          handleSetupResult(instance, asyncSetupResult, false)
          if (hydratedEl) {
            // vnode may have been replaced if an update happened before the
            // async dep is resolved.
            // 如果在异步依赖解决之前发生了更新，vnode 可能已被替换。
            vnode.el = hydratedEl
          }
          const placeholder = !hydratedEl && instance.subTree.el
          setupRenderEffect(
            instance,
            vnode,
            // component may have been moved before resolve.
            // if this is not a hydration, instance.subTree will be the comment
            // placeholder.
            // 组件可能在解决之前已被移动。
            // 如果这不是 hydration，instance.subTree 将是注释占位符。
            parentNode(hydratedEl || instance.subTree.el!)!,
            // anchor will not be used if this is hydration, so only need to
            // consider the comment placeholder case.
            // 如果这是 hydration，则不会使用 anchor，因此只需要考虑注释占位符的情况。
            hydratedEl ? null : next(instance.subTree),
            suspense,
            namespace,
            optimized,
          )
          if (placeholder) {
            // clean up placeholder reference
            // 清理占位符引用
            vnode.placeholder = null
            remove(placeholder)
          }
          updateHOCHostEl(instance, vnode.el)
          if (__DEV__) {
            popWarningContext()
          }
          // only decrease deps count if suspense is not already resolved
          // 仅当 suspense 尚未解决时才减少依赖计数
          if (isInPendingSuspense && --suspense.deps === 0) {
            suspense.resolve()
          }
        })
    },

    unmount(parentSuspense, doRemove) {
      suspense.isUnmounted = true
      if (suspense.activeBranch) {
        unmount(
          suspense.activeBranch,
          parentComponent,
          parentSuspense,
          doRemove,
        )
      }
      if (suspense.pendingBranch) {
        unmount(
          suspense.pendingBranch,
          parentComponent,
          parentSuspense,
          doRemove,
        )
      }
    },
  }

  return suspense
}

function hydrateSuspense(
  node: Node,
  vnode: VNode,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  namespace: ElementNamespace,
  slotScopeIds: string[] | null,
  optimized: boolean,
  rendererInternals: RendererInternals,
  hydrateNode: (
    node: Node,
    vnode: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => Node | null,
): Node | null {
  const suspense = (vnode.suspense = createSuspenseBoundary(
    vnode,
    parentSuspense,
    parentComponent,
    node.parentNode!,
    // eslint-disable-next-line no-restricted-globals
    document.createElement('div'),
    null,
    namespace,
    slotScopeIds,
    optimized,
    rendererInternals,
    true /* hydrating */,
  ))
  // there are two possible scenarios for server-rendered suspense:
  // - success: ssr content should be fully resolved
  // - failure: ssr content should be the fallback branch.
  // however, on the client we don't really know if it has failed or not
  // attempt to hydrate the DOM assuming it has succeeded, but we still
  // need to construct a suspense boundary first
  // 服务器渲染的 suspense 有两种可能的情况：
  // - 成功：ssr 内容应该完全解决
  // - 失败：ssr 内容应该是 fallback 分支。
  // 然而，在客户端，我们并不真正知道它是否失败了
  // 尝试假设它已成功来 hydrate DOM，但我们仍然需要首先构建一个 suspense 边界
  const result = hydrateNode(
    node,
    (suspense.pendingBranch = vnode.ssContent!),
    parentComponent,
    suspense,
    slotScopeIds,
    optimized,
  )
  if (suspense.deps === 0) {
    suspense.resolve(false, true)
  }
  return result
}

function normalizeSuspenseChildren(vnode: VNode): void {
  const { shapeFlag, children } = vnode
  const isSlotChildren = shapeFlag & ShapeFlags.SLOTS_CHILDREN
  vnode.ssContent = normalizeSuspenseSlot(
    isSlotChildren ? (children as Slots).default : children,
  )
  vnode.ssFallback = isSlotChildren
    ? normalizeSuspenseSlot((children as Slots).fallback)
    : createVNode(Comment)
}

function normalizeSuspenseSlot(s: any) {
  let block: VNode[] | null | undefined
  if (isFunction(s)) {
    const trackBlock = isBlockTreeEnabled && s._c
    if (trackBlock) {
      // disableTracking: false
      // allow block tracking for compiled slots
      // (see ./componentRenderContext.ts)
      // disableTracking: false
      // 允许编译插槽的块跟踪
      // (参见 ./componentRenderContext.ts)
      s._d = false
      openBlock()
    }
    s = s()
    if (trackBlock) {
      s._d = true
      block = currentBlock
      closeBlock()
    }
  }
  if (isArray(s)) {
    const singleChild = filterSingleRoot(s)
    if (
      __DEV__ &&
      !singleChild &&
      s.filter(child => child !== NULL_DYNAMIC_COMPONENT).length > 0
    ) {
      warn(`<Suspense> slots expect a single root node.`)
    }
    s = singleChild
  }
  s = normalizeVNode(s)
  if (block && !s.dynamicChildren) {
    s.dynamicChildren = block.filter(c => c !== s)
  }
  return s
}

export function queueEffectWithSuspense(
  fn: Function | Function[],
  suspense: SuspenseBoundary | null,
): void {
  if (suspense && suspense.pendingBranch) {
    if (isArray(fn)) {
      suspense.effects.push(...fn)
    } else {
      suspense.effects.push(fn)
    }
  } else {
    queuePostFlushCb(fn)
  }
}

function setActiveBranch(suspense: SuspenseBoundary, branch: VNode) {
  suspense.activeBranch = branch
  const { vnode, parentComponent } = suspense
  let el = branch.el
  // if branch has no el after patch, it's a HOC wrapping async components
  // drill and locate the placeholder comment node
  // 如果修补后分支没有 el，则它是包装异步组件的 HOC
  // 深入并定位占位符注释节点
  while (!el && branch.component) {
    branch = branch.component.subTree
    el = branch.el
  }
  vnode.el = el
  // in case suspense is the root node of a component,
  // recursively update the HOC el
  // 如果 suspense 是组件的根节点，
  // 递归更新 HOC el
  if (parentComponent && parentComponent.subTree === vnode) {
    parentComponent.vnode.el = el
    updateHOCHostEl(parentComponent, el)
  }
}

function isVNodeSuspensible(vnode: VNode) {
  const suspensible = vnode.props && vnode.props.suspensible
  return suspensible != null && suspensible !== false
}
