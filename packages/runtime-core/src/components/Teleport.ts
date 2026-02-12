import type { ComponentInternalInstance } from '../component'
import type { SuspenseBoundary } from './Suspense'
import {
  type ElementNamespace,
  MoveType,
  type RendererElement,
  type RendererInternals,
  type RendererNode,
  type RendererOptions,
  queuePostRenderEffect,
  traverseStaticChildren,
} from '../renderer'
import type { VNode, VNodeArrayChildren, VNodeProps } from '../vnode'
import { ShapeFlags, isString } from '@vue/shared'
import { warn } from '../warning'
import { isHmrUpdating } from '../hmr'

export type TeleportVNode = VNode<RendererNode, RendererElement, TeleportProps>

export interface TeleportProps {
  to: string | RendererElement | null | undefined
  disabled?: boolean
  defer?: boolean
}

export const TeleportEndKey: unique symbol = Symbol('_vte')

export const isTeleport = (type: any): boolean => type.__isTeleport

const isTeleportDisabled = (props: VNode['props']): boolean =>
  props && (props.disabled || props.disabled === '')

const isTeleportDeferred = (props: VNode['props']): boolean =>
  props && (props.defer || props.defer === '')

const isTargetSVG = (target: RendererElement): boolean =>
  typeof SVGElement !== 'undefined' && target instanceof SVGElement

const isTargetMathML = (target: RendererElement): boolean =>
  typeof MathMLElement === 'function' && target instanceof MathMLElement

const resolveTarget = <T = RendererElement>(
  props: TeleportProps | null,
  select: RendererOptions['querySelector'],
): T | null => {
  const targetSelector = props && props.to
  if (isString(targetSelector)) {
    if (!select) {
      __DEV__ &&
        warn(
          `Current renderer does not support string target for Teleports. ` +
            `(missing querySelector renderer option)`,
          // 当前渲染器不支持 Teleport 的字符串目标。(缺少 querySelector 渲染器选项)
        )
      return null
    } else {
      const target = select(targetSelector)
      if (__DEV__ && !target && !isTeleportDisabled(props)) {
        warn(
          `Failed to locate Teleport target with selector "${targetSelector}". ` +
            `Note the target element must exist before the component is mounted - ` +
            `i.e. the target cannot be rendered by the component itself, and ` +
            `ideally should be outside of the entire Vue component tree.`,
          // 无法通过选择器 "${targetSelector}" 找到 Teleport 目标。
          // 注意目标元素必须在组件挂载之前存在 -
          // 即目标不能由组件本身渲染，理想情况下应该在整个 Vue 组件树之外。
        )
      }
      return target as T
    }
  } else {
    if (__DEV__ && !targetSelector && !isTeleportDisabled(props)) {
      warn(`Invalid Teleport target: ${targetSelector}`) // 无效的 Teleport 目标: ${targetSelector}
    }
    return targetSelector as T
  }
}

export const TeleportImpl = {
  name: 'Teleport',
  __isTeleport: true,
  process(
    n1: TeleportVNode | null,
    n2: TeleportVNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    namespace: ElementNamespace,
    slotScopeIds: string[] | null,
    optimized: boolean,
    internals: RendererInternals,
  ): void {
    const {
      mc: mountChildren,
      pc: patchChildren,
      pbc: patchBlockChildren,
      o: { insert, querySelector, createText, createComment },
    } = internals

    const disabled = isTeleportDisabled(n2.props)
    let { shapeFlag, children, dynamicChildren } = n2

    // #3302
    // HMR updated, force full diff
    // HMR 更新，强制全量 diff
    if (__DEV__ && isHmrUpdating) {
      optimized = false
      dynamicChildren = null
    }

    if (n1 == null) {
      // insert anchors in the main view
      // 在主视图中插入锚点
      const placeholder = (n2.el = __DEV__
        ? createComment('teleport start')
        : createText(''))
      const mainAnchor = (n2.anchor = __DEV__
        ? createComment('teleport end')
        : createText(''))
      insert(placeholder, container, anchor)
      insert(mainAnchor, container, anchor)

      const mount = (container: RendererElement, anchor: RendererNode) => {
        // Teleport *always* has Array children. This is enforced in both the
        // compiler and vnode children normalization.
        // Teleport *总是* 拥有数组子节点。这在编译器和 vnode 子节点规范化中都得到了强制执行。
        if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
          mountChildren(
            children as VNodeArrayChildren,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
          )
        }
      }

      const mountToTarget = () => {
        const target = (n2.target = resolveTarget(n2.props, querySelector))
        const targetAnchor = prepareAnchor(target, n2, createText, insert)
        if (target) {
          // #2652 we could be teleporting from a non-SVG tree into an SVG tree
          // #2652 我们可能正在从非 SVG 树 teleport 到 SVG 树中
          if (namespace !== 'svg' && isTargetSVG(target)) {
            namespace = 'svg'
          } else if (namespace !== 'mathml' && isTargetMathML(target)) {
            namespace = 'mathml'
          }

          // track CE teleport targets
          // 追踪自定义元素 (CE) 的 teleport 目标
          if (parentComponent && parentComponent.isCE) {
            ;(
              parentComponent.ce!._teleportTargets ||
              (parentComponent.ce!._teleportTargets = new Set())
            ).add(target)
          }

          if (!disabled) {
            mount(target, targetAnchor)
            updateCssVars(n2, false)
          }
        } else if (__DEV__ && !disabled) {
          warn(
            'Invalid Teleport target on mount:',
            target,
            `(${typeof target})`,
          )
        }
      }

      if (disabled) {
        mount(container, mainAnchor)
        updateCssVars(n2, true)
      }

      if (isTeleportDeferred(n2.props)) {
        n2.el!.__isMounted = false
        queuePostRenderEffect(() => {
          mountToTarget()
          delete n2.el!.__isMounted
        }, parentSuspense)
      } else {
        mountToTarget()
      }
    } else {
      if (isTeleportDeferred(n2.props) && n1.el!.__isMounted === false) {
        queuePostRenderEffect(() => {
          TeleportImpl.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals,
          )
        }, parentSuspense)
        return
      }
      // update content
      // 更新内容
      n2.el = n1.el
      n2.targetStart = n1.targetStart
      const mainAnchor = (n2.anchor = n1.anchor)!
      const target = (n2.target = n1.target)!
      const targetAnchor = (n2.targetAnchor = n1.targetAnchor)!
      const wasDisabled = isTeleportDisabled(n1.props)
      const currentContainer = wasDisabled ? container : target
      const currentAnchor = wasDisabled ? mainAnchor : targetAnchor

      if (namespace === 'svg' || isTargetSVG(target)) {
        namespace = 'svg'
      } else if (namespace === 'mathml' || isTargetMathML(target)) {
        namespace = 'mathml'
      }

      if (dynamicChildren) {
        // fast path when the teleport happens to be a block root
        // 当 teleport 恰好是块根时的快速路径
        patchBlockChildren(
          n1.dynamicChildren!,
          dynamicChildren,
          currentContainer,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
        )
        // even in block tree mode we need to make sure all root-level nodes
        // in the teleport inherit previous DOM references so that they can
        // be moved in future patches.
        // in dev mode, deep traversal is necessary for HMR
        // 即使在块树模式下，我们也需要确保 teleport 中的所有根级节点
        // 继承以前的 DOM 引用，以便它们可以在将来的补丁中移动。
        // 在开发模式下，HMR 需要深度遍历
        traverseStaticChildren(n1, n2, !__DEV__)
      } else if (!optimized) {
        patchChildren(
          n1,
          n2,
          currentContainer,
          currentAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          false,
        )
      }

      if (disabled) {
        if (!wasDisabled) {
          // enabled -> disabled
          // move into main container
          // 启用 -> 禁用
          // 移动到主容器
          moveTeleport(
            n2,
            container,
            mainAnchor,
            internals,
            TeleportMoveTypes.TOGGLE,
          )
        } else {
          // #7835
          // When `teleport` is disabled, `to` may change, making it always old,
          // to ensure the correct `to` when enabled
          // 当 `teleport` 被禁用时，`to` 可能会改变，使其总是旧的，
          // 以确保在启用时 `to` 是正确的
          if (n2.props && n1.props && n2.props.to !== n1.props.to) {
            n2.props.to = n1.props.to
          }
        }
      } else {
        // target changed
        // 目标改变
        if ((n2.props && n2.props.to) !== (n1.props && n1.props.to)) {
          const nextTarget = (n2.target = resolveTarget(
            n2.props,
            querySelector,
          ))
          if (nextTarget) {
            moveTeleport(
              n2,
              nextTarget,
              null,
              internals,
              TeleportMoveTypes.TARGET_CHANGE,
            )
          } else if (__DEV__) {
            warn(
              'Invalid Teleport target on update:',
              target,
              `(${typeof target})`,
            )
          }
        } else if (wasDisabled) {
          // disabled -> enabled
          // move into teleport target
          // 禁用 -> 启用
          // 移动到 teleport 目标
          moveTeleport(
            n2,
            target,
            targetAnchor,
            internals,
            TeleportMoveTypes.TOGGLE,
          )
        }
      }
      updateCssVars(n2, disabled)
    }
  },

  remove(
    vnode: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    { um: unmount, o: { remove: hostRemove } }: RendererInternals,
    doRemove: boolean,
  ): void {
    const {
      shapeFlag,
      children,
      anchor,
      targetStart,
      targetAnchor,
      target,
      props,
    } = vnode

    if (target) {
      hostRemove(targetStart!)
      hostRemove(targetAnchor!)
    }

    // an unmounted teleport should always unmount its children whether it's disabled or not
    // 一个卸载的 teleport 应该总是卸载它的子节点，无论它是否被禁用
    doRemove && hostRemove(anchor!)
    if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      const shouldRemove = doRemove || !isTeleportDisabled(props)
      for (let i = 0; i < (children as VNode[]).length; i++) {
        const child = (children as VNode[])[i]
        unmount(
          child,
          parentComponent,
          parentSuspense,
          shouldRemove,
          !!child.dynamicChildren,
        )
      }
    }
  },

  move: moveTeleport as typeof moveTeleport,
  hydrate: hydrateTeleport as typeof hydrateTeleport,
}

export enum TeleportMoveTypes {
  TARGET_CHANGE,
  TOGGLE, // enable / disable // 启用 / 禁用
  REORDER, // moved in the main view // 在主视图中移动
}

function moveTeleport(
  vnode: VNode,
  container: RendererElement,
  parentAnchor: RendererNode | null,
  { o: { insert }, m: move }: RendererInternals,
  moveType: TeleportMoveTypes = TeleportMoveTypes.REORDER,
): void {
  // move target anchor if this is a target change.
  // 如果这是目标改变，移动目标锚点。
  if (moveType === TeleportMoveTypes.TARGET_CHANGE) {
    insert(vnode.targetAnchor!, container, parentAnchor)
  }
  const { el, anchor, shapeFlag, children, props } = vnode
  const isReorder = moveType === TeleportMoveTypes.REORDER
  // move main view anchor if this is a re-order.
  // 如果这是重新排序，移动主视图锚点。
  if (isReorder) {
    insert(el!, container, parentAnchor)
  }
  // if this is a re-order and teleport is enabled (content is in target)
  // do not move children. So the opposite is: only move children if this
  // is not a reorder, or the teleport is disabled
  // 如果这是重新排序并且 teleport 是启用的（内容在目标中）
  // 不要移动子节点。所以反过来说：只有在这不是重新排序，或者 teleport 是禁用的时候才移动子节点
  if (!isReorder || isTeleportDisabled(props)) {
    // Teleport has either Array children or no children.
    // Teleport 要么有数组子节点，要么没有子节点。
    if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      for (let i = 0; i < (children as VNode[]).length; i++) {
        move(
          (children as VNode[])[i],
          container,
          parentAnchor,
          MoveType.REORDER,
        )
      }
    }
  }
  // move main view anchor if this is a re-order.
  // 如果这是重新排序，移动主视图锚点。
  if (isReorder) {
    insert(anchor!, container, parentAnchor)
  }
}

interface TeleportTargetElement extends Element {
  // last teleport target
  // 上一个 teleport 目标
  _lpa?: Node | null
}

function hydrateTeleport(
  node: Node,
  vnode: TeleportVNode,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  slotScopeIds: string[] | null,
  optimized: boolean,
  {
    o: { nextSibling, parentNode, querySelector, insert, createText },
  }: RendererInternals<Node, Element>,
  hydrateChildren: (
    node: Node | null,
    vnode: VNode,
    container: Element,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => Node | null,
): Node | null {
  function hydrateDisabledTeleport(
    node: Node,
    vnode: VNode,
    targetStart: Node | null,
    targetAnchor: Node | null,
  ) {
    vnode.anchor = hydrateChildren(
      nextSibling(node),
      vnode,
      parentNode(node)!,
      parentComponent,
      parentSuspense,
      slotScopeIds,
      optimized,
    )
    vnode.targetStart = targetStart
    vnode.targetAnchor = targetAnchor
  }

  const target = (vnode.target = resolveTarget<Element>(
    vnode.props,
    querySelector,
  ))
  const disabled = isTeleportDisabled(vnode.props)
  if (target) {
    // if multiple teleports rendered to the same target element, we need to
    // pick up from where the last teleport finished instead of the first node
    // 如果多个 teleport 渲染到同一个目标元素，我们需要
    // 从上一个 teleport 结束的地方开始，而不是第一个节点
    const targetNode =
      (target as TeleportTargetElement)._lpa || target.firstChild
    if (vnode.shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      if (disabled) {
        hydrateDisabledTeleport(
          node,
          vnode,
          targetNode,
          targetNode && nextSibling(targetNode),
        )
      } else {
        vnode.anchor = nextSibling(node)

        // lookahead until we find the target anchor
        // we cannot rely on return value of hydrateChildren() because there
        // could be nested teleports
        // 向前查找直到找到目标锚点
        // 我们不能依赖 hydrateChildren() 的返回值，因为可能存在嵌套的 teleport
        let targetAnchor = targetNode
        while (targetAnchor) {
          if (targetAnchor && targetAnchor.nodeType === 8) {
            if ((targetAnchor as Comment).data === 'teleport start anchor') {
              vnode.targetStart = targetAnchor
            } else if ((targetAnchor as Comment).data === 'teleport anchor') {
              vnode.targetAnchor = targetAnchor
              ;(target as TeleportTargetElement)._lpa =
                vnode.targetAnchor && nextSibling(vnode.targetAnchor as Node)
              break
            }
          }
          targetAnchor = nextSibling(targetAnchor)
        }

        // #11400 if the HTML corresponding to Teleport is not embedded in the
        // correct position on the final page during SSR. the targetAnchor will
        // always be null, we need to manually add targetAnchor to ensure
        // Teleport it can properly unmount or move
        // #11400 如果对应于 Teleport 的 HTML 在 SSR 期间没有嵌入到
        // 最终页面上的正确位置。targetAnchor 将始终为 null，
        // 我们需要手动添加 targetAnchor 以确保 Teleport 可以正确卸载或移动
        if (!vnode.targetAnchor) {
          prepareAnchor(target, vnode, createText, insert)
        }

        hydrateChildren(
          targetNode && nextSibling(targetNode),
          vnode,
          target,
          parentComponent,
          parentSuspense,
          slotScopeIds,
          optimized,
        )
      }
    }
    updateCssVars(vnode, disabled)
  } else if (disabled) {
    if (vnode.shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      hydrateDisabledTeleport(node, vnode, node, nextSibling(node))
    }
  }
  return vnode.anchor && nextSibling(vnode.anchor as Node)
}

// Force-casted public typing for h and TSX props inference
// 强制转换的公共类型，用于 h 和 TSX props 推断
export const Teleport = TeleportImpl as unknown as {
  __isTeleport: true
  new (): {
    $props: VNodeProps & TeleportProps
    $slots: {
      default(): VNode[]
    }
  }
}

function updateCssVars(vnode: VNode, isDisabled: boolean) {
  // presence of .ut method indicates owner component uses css vars.
  // code path here can assume browser environment.
  // .ut 方法的存在表明所有者组件使用了 css 变量。
  // 这里的代码路径可以假设是浏览器环境。
  const ctx = vnode.ctx
  if (ctx && ctx.ut) {
    let node, anchor
    if (isDisabled) {
      node = vnode.el
      anchor = vnode.anchor
    } else {
      node = vnode.targetStart
      anchor = vnode.targetAnchor
    }
    while (node && node !== anchor) {
      if (node.nodeType === 1) node.setAttribute('data-v-owner', ctx.uid)
      node = node.nextSibling
    }
    ctx.ut()
  }
}

function prepareAnchor(
  target: RendererElement | null,
  vnode: TeleportVNode,
  createText: RendererOptions['createText'],
  insert: RendererOptions['insert'],
) {
  const targetStart = (vnode.targetStart = createText(''))
  const targetAnchor = (vnode.targetAnchor = createText(''))

  // attach a special property, so we can skip teleported content in
  // renderer's nextSibling search
  // 附加一个特殊属性，这样我们就可以在渲染器的 nextSibling 搜索中跳过 teleport 的内容
  targetStart[TeleportEndKey] = targetAnchor

  if (target) {
    insert(targetStart, target)
    insert(targetAnchor, target)
  }

  return targetAnchor
}
