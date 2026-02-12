import {
  type ComponentInternalInstance,
  type ComponentOptions,
  type ConcreteComponent,
  type SetupContext,
  currentInstance,
  getComponentName,
  getCurrentInstance,
} from '../component'
import {
  Comment,
  type VNode,
  type VNodeProps,
  cloneVNode,
  invokeVNodeHook,
  isSameVNodeType,
  isVNode,
} from '../vnode'
import { warn } from '../warning'
import {
  injectHook,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  onUpdated,
} from '../apiLifecycle'
import {
  ShapeFlags,
  invokeArrayFns,
  isArray,
  isRegExp,
  isString,
  remove,
} from '@vue/shared'
import { watch } from '../apiWatch'
import {
  type ElementNamespace,
  MoveType,
  type RendererElement,
  type RendererInternals,
  type RendererNode,
  invalidateMount,
  queuePostRenderEffect,
} from '../renderer'
import { setTransitionHooks } from './BaseTransition'
import type { ComponentRenderContext } from '../componentPublicInstance'
import { devtoolsComponentAdded } from '../devtools'
import { isAsyncWrapper } from '../apiAsyncComponent'
import { isSuspense } from './Suspense'
import { LifecycleHooks } from '../enums'

type MatchPattern = string | RegExp | (string | RegExp)[]

export interface KeepAliveProps {
  include?: MatchPattern
  exclude?: MatchPattern
  max?: number | string
}

type CacheKey = PropertyKey | ConcreteComponent
type Cache = Map<CacheKey, VNode>
type Keys = Set<CacheKey>

export interface KeepAliveContext extends ComponentRenderContext {
  renderer: RendererInternals
  activate: (
    vnode: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    namespace: ElementNamespace,
    optimized: boolean,
  ) => void
  deactivate: (vnode: VNode) => void
}

export const isKeepAlive = (vnode: VNode): boolean =>
  (vnode.type as any).__isKeepAlive

const KeepAliveImpl: ComponentOptions = {
  name: `KeepAlive`,

  // Marker for special handling inside the renderer. We are not using a ===
  // check directly on KeepAlive in the renderer, because importing it directly
  // would prevent it from being tree-shaken.
  // 渲染器内部特殊处理的标记。我们不在渲染器中直接使用 === 检查 KeepAlive，
  // 因为直接导入它会阻止 tree-shaking。
  __isKeepAlive: true,

  props: {
    include: [String, RegExp, Array],
    exclude: [String, RegExp, Array],
    max: [String, Number],
  },

  setup(props: KeepAliveProps, { slots }: SetupContext) {
    const instance = getCurrentInstance()!
    // KeepAlive communicates with the instantiated renderer via the
    // ctx where the renderer passes in its internals,
    // and the KeepAlive instance exposes activate/deactivate implementations.
    // The whole point of this is to avoid importing KeepAlive directly in the
    // renderer to facilitate tree-shaking.
    // KeepAlive 通过 ctx 与实例化的渲染器通信，
    // 渲染器在 ctx 中传递其内部实现，
    // 而 KeepAlive 实例暴露 activate/deactivate 实现。
    // 这样做的全部目的是避免在渲染器中直接导入 KeepAlive，以促进 tree-shaking。
    const sharedContext = instance.ctx as KeepAliveContext

    // if the internal renderer is not registered, it indicates that this is server-side rendering,
    // for KeepAlive, we just need to render its children
    // 如果内部渲染器未注册，说明是服务端渲染，
    // 对于 KeepAlive，我们只需要渲染其子节点
    if (__SSR__ && !sharedContext.renderer) {
      return () => {
        const children = slots.default && slots.default()
        return children && children.length === 1 ? children[0] : children
      }
    }

    const cache: Cache = new Map()
    const keys: Keys = new Set()
    let current: VNode | null = null

    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      ;(instance as any).__v_cache = cache
    }

    const parentSuspense = instance.suspense

    const {
      renderer: {
        p: patch,
        m: move,
        um: _unmount,
        o: { createElement },
      },
    } = sharedContext
    const storageContainer = createElement('div')

    // 注入 activate 方法，当组件被激活时调用
    sharedContext.activate = (
      vnode,
      container,
      anchor,
      namespace,
      optimized,
    ) => {
      const instance = vnode.component!
      move(vnode, container, anchor, MoveType.ENTER, parentSuspense)
      // in case props have changed
      // 以防 props 发生变化
      patch(
        instance.vnode,
        vnode,
        container,
        anchor,
        instance,
        parentSuspense,
        namespace,
        vnode.slotScopeIds,
        optimized,
      )
      queuePostRenderEffect(() => {
        instance.isDeactivated = false
        if (instance.a) {
          invokeArrayFns(instance.a)
        }
        const vnodeHook = vnode.props && vnode.props.onVnodeMounted
        if (vnodeHook) {
          invokeVNodeHook(vnodeHook, instance.parent, vnode)
        }
      }, parentSuspense)

      if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
        // Update components tree
        // 更新组件树
        devtoolsComponentAdded(instance)
      }
    }

    // 注入 deactivate 方法，当组件被缓存（失活）时调用
    sharedContext.deactivate = (vnode: VNode) => {
      const instance = vnode.component!
      invalidateMount(instance.m)
      invalidateMount(instance.a)

      move(vnode, storageContainer, null, MoveType.LEAVE, parentSuspense)
      queuePostRenderEffect(() => {
        if (instance.da) {
          invokeArrayFns(instance.da)
        }
        const vnodeHook = vnode.props && vnode.props.onVnodeUnmounted
        if (vnodeHook) {
          invokeVNodeHook(vnodeHook, instance.parent, vnode)
        }
        instance.isDeactivated = true
      }, parentSuspense)

      if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
        // Update components tree
        // 更新组件树
        devtoolsComponentAdded(instance)
      }

      // for e2e test
      // 用于 e2e 测试
      if (__DEV__ && __BROWSER__) {
        ;(instance as any).__keepAliveStorageContainer = storageContainer
      }
    }

    function unmount(vnode: VNode) {
      // reset the shapeFlag so it can be properly unmounted
      // 重置 shapeFlag 以便正确卸载
      resetShapeFlag(vnode)
      _unmount(vnode, instance, parentSuspense, true)
    }

    function pruneCache(filter: (name: string) => boolean) {
      cache.forEach((vnode, key) => {
        // for async components, name check should be based in its loaded
        // inner component if available
        // 对于异步组件，名称检查应基于其加载的内部组件（如果可用）
        const name = getComponentName(
          isAsyncWrapper(vnode)
            ? (vnode.type as ComponentOptions).__asyncResolved || {}
            : (vnode.type as ConcreteComponent),
        )
        if (name && !filter(name)) {
          pruneCacheEntry(key)
        }
      })
    }

    function pruneCacheEntry(key: CacheKey) {
      const cached = cache.get(key) as VNode
      if (cached && (!current || !isSameVNodeType(cached, current))) {
        unmount(cached)
      } else if (current) {
        // current active instance should no longer be kept-alive.
        // we can't unmount it now but it might be later, so reset its flag now.
        // 当前激活的实例不应再被缓存。
        // 我们现在不能卸载它，但稍后可能会卸载，所以现在重置它的标志。
        resetShapeFlag(current)
      }
      cache.delete(key)
      keys.delete(key)
    }

    // prune cache on include/exclude prop change
    // include/exclude prop 变化时修剪缓存
    watch(
      () => [props.include, props.exclude],
      ([include, exclude]) => {
        include && pruneCache(name => matches(include, name))
        exclude && pruneCache(name => !matches(exclude, name))
      },
      // prune post-render after `current` has been updated
      // 在 `current` 更新后的 post-render 阶段修剪
      { flush: 'post', deep: true },
    )

    // cache sub tree after render
    // 渲染后缓存子树
    let pendingCacheKey: CacheKey | null = null
    const cacheSubtree = () => {
      // fix #1621, the pendingCacheKey could be 0
      // 修复 #1621，pendingCacheKey 可能为 0
      if (pendingCacheKey != null) {
        // if KeepAlive child is a Suspense, it needs to be cached after Suspense resolves
        // avoid caching vnode that not been mounted
        // 如果 KeepAlive 的子节点是 Suspense，它需要在 Suspense 解析后缓存
        // 避免缓存未挂载的 vnode
        if (isSuspense(instance.subTree.type)) {
          queuePostRenderEffect(() => {
            cache.set(pendingCacheKey!, getInnerChild(instance.subTree))
          }, instance.subTree.suspense)
        } else {
          cache.set(pendingCacheKey, getInnerChild(instance.subTree))
        }
      }
    }
    onMounted(cacheSubtree)
    onUpdated(cacheSubtree)

    onBeforeUnmount(() => {
      cache.forEach(cached => {
        const { subTree, suspense } = instance
        const vnode = getInnerChild(subTree)
        if (cached.type === vnode.type && cached.key === vnode.key) {
          // current instance will be unmounted as part of keep-alive's unmount
          // 当前实例将作为 keep-alive 卸载的一部分被卸载
          resetShapeFlag(vnode)
          // but invoke its deactivated hook here
          // 但在此处调用其 deactivated 钩子
          const da = vnode.component!.da
          da && queuePostRenderEffect(da, suspense)
          return
        }
        unmount(cached)
      })
    })

    return () => {
      pendingCacheKey = null

      if (!slots.default) {
        return (current = null)
      }

      const children = slots.default()
      const rawVNode = children[0]
      if (children.length > 1) {
        if (__DEV__) {
          warn(`KeepAlive should contain exactly one component child.`)
        }
        current = null
        return children
      } else if (
        !isVNode(rawVNode) ||
        (!(rawVNode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) &&
          !(rawVNode.shapeFlag & ShapeFlags.SUSPENSE))
      ) {
        current = null
        return rawVNode
      }

      let vnode = getInnerChild(rawVNode)
      // #6028 Suspense ssContent maybe a comment VNode, should avoid caching it
      // #6028 Suspense ssContent 可能是注释 VNode，应避免缓存它
      if (vnode.type === Comment) {
        current = null
        return vnode
      }

      const comp = vnode.type as ConcreteComponent

      // for async components, name check should be based in its loaded
      // inner component if available
      // 对于异步组件，名称检查应基于其加载的内部组件（如果可用）
      const name = getComponentName(
        isAsyncWrapper(vnode)
          ? (vnode.type as ComponentOptions).__asyncResolved || {}
          : comp,
      )

      const { include, exclude, max } = props

      if (
        (include && (!name || !matches(include, name))) ||
        (exclude && name && matches(exclude, name))
      ) {
        // #11717
        vnode.shapeFlag &= ~ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE
        current = vnode
        return rawVNode
      }

      const key = vnode.key == null ? comp : vnode.key
      const cachedVNode = cache.get(key)

      // clone vnode if it's reused because we are going to mutate it
      // 如果 vnode 被复用，则克隆它，因为我们要修改它
      if (vnode.el) {
        vnode = cloneVNode(vnode)
        if (rawVNode.shapeFlag & ShapeFlags.SUSPENSE) {
          rawVNode.ssContent = vnode
        }
      }
      // #1511 it's possible for the returned vnode to be cloned due to attr
      // fallthrough or scopeId, so the vnode here may not be the final vnode
      // that is mounted. Instead of caching it directly, we store the pending
      // key and cache `instance.subTree` (the normalized vnode) in
      // mounted/updated hooks.
      // #1511 返回的 vnode 可能因 attr fallthrough 或 scopeId 被克隆，
      // 所以这里的 vnode 可能不是最终挂载的 vnode。
      // 我们不直接缓存它，而是存储待处理的 key，
      // 并在 mounted/updated 钩子中缓存 `instance.subTree`（规范化的 vnode）。
      pendingCacheKey = key

      if (cachedVNode) {
        // copy over mounted state
        // 复制挂载状态
        vnode.el = cachedVNode.el
        vnode.component = cachedVNode.component
        if (vnode.transition) {
          // recursively update transition hooks on subTree
          // 递归更新子树上的 transition 钩子
          setTransitionHooks(vnode, vnode.transition!)
        }
        // avoid vnode being mounted as fresh
        // 避免 vnode 被当作新节点挂载
        vnode.shapeFlag |= ShapeFlags.COMPONENT_KEPT_ALIVE
        // make this key the freshest
        // 使此 key 成为最新的（LRU 更新）
        keys.delete(key)
        keys.add(key)
      } else {
        keys.add(key)
        // prune oldest entry
        // 修剪最旧的条目
        if (max && keys.size > parseInt(max as string, 10)) {
          pruneCacheEntry(keys.values().next().value!)
        }
      }
      // avoid vnode being unmounted
      // 避免 vnode 被卸载
      vnode.shapeFlag |= ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE

      current = vnode
      return isSuspense(rawVNode.type) ? rawVNode : vnode
    }
  },
}

const decorate = (t: typeof KeepAliveImpl) => {
  t.__isBuiltIn = true
  return t
}

// export the public type for h/tsx inference
// also to avoid inline import() in generated d.ts files
// 导出公共类型以供 h/tsx 推断
// 也为了避免在生成的 d.ts 文件中使用内联 import()
export const KeepAlive = (__COMPAT__
  ? /*@__PURE__*/ decorate(KeepAliveImpl)
  : KeepAliveImpl) as any as {
  __isKeepAlive: true
  new (): {
    $props: VNodeProps & KeepAliveProps
    $slots: {
      default(): VNode[]
    }
  }
}

function matches(pattern: MatchPattern, name: string): boolean {
  if (isArray(pattern)) {
    return pattern.some((p: string | RegExp) => matches(p, name))
  } else if (isString(pattern)) {
    return pattern.split(',').includes(name)
  } else if (isRegExp(pattern)) {
    pattern.lastIndex = 0
    return pattern.test(name)
  }
  /* v8 ignore next */
  return false
}

export function onActivated(
  hook: Function,
  target?: ComponentInternalInstance | null,
): void {
  registerKeepAliveHook(hook, LifecycleHooks.ACTIVATED, target)
}

export function onDeactivated(
  hook: Function,
  target?: ComponentInternalInstance | null,
): void {
  registerKeepAliveHook(hook, LifecycleHooks.DEACTIVATED, target)
}

function registerKeepAliveHook(
  hook: Function & { __wdc?: Function },
  type: LifecycleHooks,
  target: ComponentInternalInstance | null = currentInstance,
) {
  // cache the deactivate branch check wrapper for injected hooks so the same
  // hook can be properly deduped by the scheduler. "__wdc" stands for "with
  // deactivation check".
  // 缓存注入钩子的 deactivate 分支检查包装器，以便调度器可以正确地去重。
  // "__wdc" 代表 "with deactivation check"（带停用检查）。
  const wrappedHook =
    hook.__wdc ||
    (hook.__wdc = () => {
      // only fire the hook if the target instance is NOT in a deactivated branch.
      // 仅当目标实例不在 deactivated 分支中时才触发钩子。
      let current: ComponentInternalInstance | null = target
      while (current) {
        if (current.isDeactivated) {
          return
        }
        current = current.parent
      }
      return hook()
    })
  injectHook(type, wrappedHook, target)
  // In addition to registering it on the target instance, we walk up the parent
  // chain and register it on all ancestor instances that are keep-alive roots.
  // This avoids the need to walk the entire component tree when invoking these
  // hooks, and more importantly, avoids the need to track child components in
  // arrays.
  // 除了在目标实例上注册外，我们还向上遍历父链，并在所有是 keep-alive 根的祖先实例上注册它。
  // 这避免了在调用这些钩子时遍历整个组件树，更重要的是，避免了在数组中跟踪子组件。
  if (target) {
    let current = target.parent
    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type, target, current)
      }
      current = current.parent
    }
  }
}

function injectToKeepAliveRoot(
  hook: Function & { __weh?: Function },
  type: LifecycleHooks,
  target: ComponentInternalInstance,
  keepAliveRoot: ComponentInternalInstance,
) {
  // injectHook wraps the original for error handling, so make sure to remove
  // the wrapped version.
  // injectHook 包装了原始函数以进行错误处理，因此请确保移除包装后的版本。
  const injected = injectHook(type, hook, keepAliveRoot, true /* prepend */)
  onUnmounted(() => {
    remove(keepAliveRoot[type]!, injected)
  }, target)
}

function resetShapeFlag(vnode: VNode) {
  // bitwise operations to remove keep alive flags
  // 位运算移除 keep alive 标志
  vnode.shapeFlag &= ~ShapeFlags.COMPONENT_SHOULD_KEEP_ALIVE
  vnode.shapeFlag &= ~ShapeFlags.COMPONENT_KEPT_ALIVE
}

function getInnerChild(vnode: VNode) {
  return vnode.shapeFlag & ShapeFlags.SUSPENSE ? vnode.ssContent! : vnode
}
