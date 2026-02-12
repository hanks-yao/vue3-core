import {
  Fragment,
  Static,
  Text,
  Comment as VComment,
  type VNode,
  type VNodeHook,
  createTextVNode,
  createVNode,
  invokeVNodeHook,
  normalizeVNode,
} from './vnode'
import { flushPostFlushCbs } from './scheduler'
import type { ComponentInternalInstance, ComponentOptions } from './component'
import { invokeDirectiveHook } from './directives'
import { warn } from './warning'
import {
  PatchFlags,
  ShapeFlags,
  def,
  getEscapedCssVarName,
  includeBooleanAttr,
  isBooleanAttr,
  isKnownHtmlAttr,
  isKnownSvgAttr,
  isOn,
  isRenderableAttrValue,
  isReservedProp,
  isString,
  normalizeClass,
  normalizeCssVarValue,
  normalizeStyle,
  stringifyStyle,
} from '@vue/shared'
import { type RendererInternals, needTransition } from './renderer'
import { setRef } from './rendererTemplateRef'
import {
  type SuspenseBoundary,
  type SuspenseImpl,
  queueEffectWithSuspense,
} from './components/Suspense'
import type { TeleportImpl, TeleportVNode } from './components/Teleport'
import { isAsyncWrapper } from './apiAsyncComponent'
import { isReactive } from '@vue/reactivity'
import { updateHOCHostEl } from './componentRenderUtils'

export type RootHydrateFunction = (
  vnode: VNode<Node, Element>,
  container: (Element | ShadowRoot) & { _vnode?: VNode },
) => void

export enum DOMNodeTypes {
  ELEMENT = 1,
  TEXT = 3,
  COMMENT = 8,
}

let hasLoggedMismatchError = false
const logMismatchError = () => {
  if (__TEST__ || hasLoggedMismatchError) {
    return
  }
  // this error should show up in production
  // 这个错误应该在生产环境中显示
  console.error('Hydration completed but contains mismatches.')
  hasLoggedMismatchError = true
}

const isSVGContainer = (container: Element) =>
  container.namespaceURI!.includes('svg') &&
  container.tagName !== 'foreignObject'

const isMathMLContainer = (container: Element) =>
  container.namespaceURI!.includes('MathML')

const getContainerType = (
  container: Element | ShadowRoot,
): 'svg' | 'mathml' | undefined => {
  if (container.nodeType !== DOMNodeTypes.ELEMENT) return undefined
  if (isSVGContainer(container as Element)) return 'svg'
  if (isMathMLContainer(container as Element)) return 'mathml'
  return undefined
}

export const isComment = (node: Node): node is Comment =>
  node.nodeType === DOMNodeTypes.COMMENT

// Note: hydration is DOM-specific
// But we have to place it in core due to tight coupling with core - splitting
// it out creates a ton of unnecessary complexity.
// Hydration also depends on some renderer internal logic which needs to be
// passed in via arguments.
// 注意：hydration（激活）是特定于 DOM 的
// 但我们必须将其放在 core 中，因为它与 core 紧密耦合 - 将其拆分出去会产生大量不必要的复杂性。
// Hydration 还依赖于一些渲染器内部逻辑，这些逻辑需要通过参数传递进来。
export function createHydrationFunctions(
  rendererInternals: RendererInternals<Node, Element>,
): [
  RootHydrateFunction,
  (
    node: Node,
    vnode: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    slotScopeIds: string[] | null,
    optimized?: boolean,
  ) => Node | null,
] {
  const {
    mt: mountComponent,
    p: patch,
    o: {
      patchProp,
      createText,
      nextSibling,
      parentNode,
      remove,
      insert,
      createComment,
    },
  } = rendererInternals

  const hydrate: RootHydrateFunction = (vnode, container) => {
    if (!container.hasChildNodes()) {
      ;(__DEV__ || __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__) &&
        warn(
          `Attempting to hydrate existing markup but container is empty. ` +
            `Performing full mount instead.`,
          // 尝试激活现有标记但容器为空。改为执行完整挂载。
        )
      patch(null, vnode, container)
      flushPostFlushCbs()
      container._vnode = vnode
      return
    }

    hydrateNode(container.firstChild!, vnode, null, null, null)
    flushPostFlushCbs()
    container._vnode = vnode
  }

  const hydrateNode = (
    node: Node,
    vnode: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    slotScopeIds: string[] | null,
    optimized = false,
  ): Node | null => {
    optimized = optimized || !!vnode.dynamicChildren
    const isFragmentStart = isComment(node) && node.data === '['
    const onMismatch = () =>
      handleMismatch(
        node,
        vnode,
        parentComponent,
        parentSuspense,
        slotScopeIds,
        isFragmentStart,
      )

    const { type, ref, shapeFlag, patchFlag } = vnode
    let domType = node.nodeType
    vnode.el = node

    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      def(node, '__vnode', vnode, true)
      def(node, '__vueParentComponent', parentComponent, true)
    }

    if (patchFlag === PatchFlags.BAIL) {
      optimized = false
      vnode.dynamicChildren = null
    }

    let nextNode: Node | null = null
    switch (type) {
      case Text:
        if (domType !== DOMNodeTypes.TEXT) {
          // #5728 empty text node inside a slot can cause hydration failure
          // because the server rendered HTML won't contain a text node
          // #5728 插槽内的空文本节点可能导致 hydration 失败
          // 因为服务器渲染的 HTML 不会包含文本节点
          if (vnode.children === '') {
            insert((vnode.el = createText('')), parentNode(node)!, node)
            nextNode = node
          } else {
            nextNode = onMismatch()
          }
        } else {
          if ((node as Text).data !== vnode.children) {
            ;(__DEV__ || __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__) &&
              warn(
                `Hydration text mismatch in`,
                node.parentNode,
                `\n  - rendered on server: ${JSON.stringify(
                  (node as Text).data,
                )}` +
                  `\n  - expected on client: ${JSON.stringify(vnode.children)}`,
              )
            logMismatchError()
            ;(node as Text).data = vnode.children as string
          }
          nextNode = nextSibling(node)
        }
        break
      case VComment:
        if (isTemplateNode(node)) {
          nextNode = nextSibling(node)
          // wrapped <transition appear>
          // replace <template> node with inner child
          // 包裹了 <transition appear>
          // 用内部子节点替换 <template> 节点
          replaceNode(
            (vnode.el = node.content.firstChild!),
            node,
            parentComponent,
          )
        } else if (domType !== DOMNodeTypes.COMMENT || isFragmentStart) {
          nextNode = onMismatch()
        } else {
          nextNode = nextSibling(node)
        }
        break
      case Static:
        if (isFragmentStart) {
          // entire template is static but SSRed as a fragment
          // 整个模板是静态的，但在 SSR 中作为片段渲染
          node = nextSibling(node)!
          domType = node.nodeType
        }
        if (domType === DOMNodeTypes.ELEMENT || domType === DOMNodeTypes.TEXT) {
          // determine anchor, adopt content
          nextNode = node
          // if the static vnode has its content stripped during build,
          // adopt it from the server-rendered HTML.
          // 如果静态 vnode 的内容在构建期间被剥离，
          // 则从服务器渲染的 HTML 中采用它。
          const needToAdoptContent = !(vnode.children as string).length
          for (let i = 0; i < vnode.staticCount!; i++) {
            if (needToAdoptContent)
              vnode.children +=
                nextNode.nodeType === DOMNodeTypes.ELEMENT
                  ? (nextNode as Element).outerHTML
                  : (nextNode as Text).data
            if (i === vnode.staticCount! - 1) {
              vnode.anchor = nextNode
            }
            nextNode = nextSibling(nextNode)!
          }
          return isFragmentStart ? nextSibling(nextNode) : nextNode
        } else {
          onMismatch()
        }
        break
      case Fragment:
        if (!isFragmentStart) {
          nextNode = onMismatch()
        } else {
          nextNode = hydrateFragment(
            node as Comment,
            vnode,
            parentComponent,
            parentSuspense,
            slotScopeIds,
            optimized,
          )
        }
        break
      default:
        if (shapeFlag & ShapeFlags.ELEMENT) {
          if (
            (domType !== DOMNodeTypes.ELEMENT ||
              (vnode.type as string).toLowerCase() !==
                (node as Element).tagName.toLowerCase()) &&
            !isTemplateNode(node)
          ) {
            nextNode = onMismatch()
          } else {
            nextNode = hydrateElement(
              node as Element,
              vnode,
              parentComponent,
              parentSuspense,
              slotScopeIds,
              optimized,
            )
          }
        } else if (shapeFlag & ShapeFlags.COMPONENT) {
          // when setting up the render effect, if the initial vnode already
          // has .el set, the component will perform hydration instead of mount
          // on its sub-tree.
          // 设置渲染副作用时，如果初始 vnode 已经设置了 .el，
          // 组件将在其子树上执行 hydration 而不是挂载。
          vnode.slotScopeIds = slotScopeIds
          const container = parentNode(node)!

          // Locate the next node.
          if (isFragmentStart) {
            // If it's a fragment: since components may be async, we cannot rely
            // on component's rendered output to determine the end of the
            // fragment. Instead, we do a lookahead to find the end anchor node.
            // 如果是片段：由于组件可能是异步的，我们不能依赖组件的渲染输出来确定片段的结束。
            // 相反，我们要向前查找以找到结束锚点节点。
            nextNode = locateClosingAnchor(node)
          } else if (isComment(node) && node.data === 'teleport start') {
            // #4293 #6152
            // If a teleport is at component root, look ahead for teleport end.
            // #4293 #6152
            // 如果 teleport 位于组件根部，则向前查找 teleport 结束标记。
            nextNode = locateClosingAnchor(node, node.data, 'teleport end')
          } else {
            nextNode = nextSibling(node)
          }

          mountComponent(
            vnode,
            container,
            null,
            parentComponent,
            parentSuspense,
            getContainerType(container),
            optimized,
          )

          // #3787
          // if component is async, it may get moved / unmounted before its
          // inner component is loaded, so we need to give it a placeholder
          // vnode that matches its adopted DOM.
          // #3787
          // 如果组件是异步的，它可能会在内部组件加载之前被移动/卸载，
          // 所以我们需要给它一个与其采用的 DOM 匹配的占位符 vnode。
          if (
            isAsyncWrapper(vnode) &&
            !(vnode.type as ComponentOptions).__asyncResolved
          ) {
            let subTree
            if (isFragmentStart) {
              subTree = createVNode(Fragment)
              subTree.anchor = nextNode
                ? nextNode.previousSibling
                : container.lastChild
            } else {
              subTree =
                node.nodeType === 3 ? createTextVNode('') : createVNode('div')
            }
            subTree.el = node
            vnode.component!.subTree = subTree
          }
        } else if (shapeFlag & ShapeFlags.TELEPORT) {
          if (domType !== DOMNodeTypes.COMMENT) {
            nextNode = onMismatch()
          } else {
            nextNode = (vnode.type as typeof TeleportImpl).hydrate(
              node,
              vnode as TeleportVNode,
              parentComponent,
              parentSuspense,
              slotScopeIds,
              optimized,
              rendererInternals,
              hydrateChildren,
            )
          }
        } else if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
          nextNode = (vnode.type as typeof SuspenseImpl).hydrate(
            node,
            vnode,
            parentComponent,
            parentSuspense,
            getContainerType(parentNode(node)!),
            slotScopeIds,
            optimized,
            rendererInternals,
            hydrateNode,
          )
        } else if (__DEV__ || __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__) {
          warn('Invalid HostVNode type:', type, `(${typeof type})`)
        }
    }

    if (ref != null) {
      setRef(ref, null, parentSuspense, vnode)
    }

    return nextNode
  }

  const hydrateElement = (
    el: Element,
    vnode: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => {
    optimized = optimized || !!vnode.dynamicChildren
    const { type, props, patchFlag, shapeFlag, dirs, transition } = vnode
    // #4006 for form elements with non-string v-model value bindings
    // e.g. <option :value="obj">, <input type="checkbox" :true-value="1">
    // #7476 <input indeterminate>
    // #4006 对于具有非字符串 v-model 值绑定的表单元素
    // 例如 <option :value="obj">, <input type="checkbox" :true-value="1">
    // #7476 <input indeterminate>
    const forcePatch = type === 'input' || type === 'option'
    // skip props & children if this is hoisted static nodes
    // #5405 in dev, always hydrate children for HMR
    // 如果这是提升的静态节点，则跳过 props 和 children
    // #5405 在开发模式下，始终为 HMR 激活 children
    if (__DEV__ || forcePatch || patchFlag !== PatchFlags.CACHED) {
      if (dirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'created')
      }

      // handle appear transition
      let needCallTransitionHooks = false
      if (isTemplateNode(el)) {
        needCallTransitionHooks =
          needTransition(
            null, // no need check parentSuspense in hydration
            transition,
          ) &&
          parentComponent &&
          parentComponent.vnode.props &&
          parentComponent.vnode.props.appear

        const content = (el as HTMLTemplateElement).content
          .firstChild as Element & { $cls?: string }

        if (needCallTransitionHooks) {
          const cls = content.getAttribute('class')
          if (cls) content.$cls = cls
          transition!.beforeEnter(content)
        }

        // replace <template> node with inner children
        replaceNode(content, el, parentComponent)
        vnode.el = el = content
      }

      // children
      if (
        shapeFlag & ShapeFlags.ARRAY_CHILDREN &&
        // skip if element has innerHTML / textContent
        // 如果元素有 innerHTML / textContent 则跳过
        !(props && (props.innerHTML || props.textContent))
      ) {
        let next = hydrateChildren(
          el.firstChild,
          vnode,
          el,
          parentComponent,
          parentSuspense,
          slotScopeIds,
          optimized,
        )
        let hasWarned = false
        while (next) {
          if (!isMismatchAllowed(el, MismatchTypes.CHILDREN)) {
            if (
              (__DEV__ || __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__) &&
              !hasWarned
            ) {
              warn(
                `Hydration children mismatch on`,
                el,
                `\nServer rendered element contains more child nodes than client vdom.`,
              )
              hasWarned = true
            }
            logMismatchError()
          }

          // The SSRed DOM contains more nodes than it should. Remove them.
          // SSR 的 DOM 包含的节点比预期的多。移除它们。
          const cur = next
          next = next.nextSibling
          remove(cur)
        }
      } else if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
        // #11873 the HTML parser will "eat" the first newline when parsing
        // <pre> and <textarea>, so if the client value starts with a newline,
        // we need to remove it before comparing
        // #11873 HTML 解析器在解析 <pre> 和 <textarea> 时会“吃掉”第一个换行符，
        // 所以如果客户端值以换行符开头，我们需要在比较之前将其删除
        let clientText = vnode.children as string
        if (
          clientText[0] === '\n' &&
          (el.tagName === 'PRE' || el.tagName === 'TEXTAREA')
        ) {
          clientText = clientText.slice(1)
        }
        const { textContent } = el
        if (
          textContent !== clientText &&
          // innerHTML normalize \r\n or \r into a single \n in the DOM
          // innerHTML 将 \r\n 或 \r 规范化为 DOM 中的单个 \n
          textContent !== clientText.replace(/\r\n|\r/g, '\n')
        ) {
          if (!isMismatchAllowed(el, MismatchTypes.TEXT)) {
            ;(__DEV__ || __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__) &&
              warn(
                `Hydration text content mismatch on`,
                el,
                `\n  - rendered on server: ${textContent}` +
                  `\n  - expected on client: ${clientText}`,
              )
            logMismatchError()
          }
          el.textContent = vnode.children as string
        }
      }

      // props
      if (props) {
        if (
          __DEV__ ||
          __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__ ||
          forcePatch ||
          !optimized ||
          patchFlag & (PatchFlags.FULL_PROPS | PatchFlags.NEED_HYDRATION)
        ) {
          const isCustomElement = el.tagName.includes('-')
          for (const key in props) {
            // check hydration mismatch
            if (
              (__DEV__ || __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__) &&
              // #11189 skip if this node has directives that have created hooks
              // as it could have mutated the DOM in any possible way
              // #11189 如果此节点具有已创建钩子的指令，则跳过
              // 因为它可能以任何可能的方式改变了 DOM
              !(dirs && dirs.some(d => d.dir.created)) &&
              propHasMismatch(el, key, props[key], vnode, parentComponent)
            ) {
              logMismatchError()
            }
            if (
              (forcePatch &&
                (key.endsWith('value') || key === 'indeterminate')) ||
              (isOn(key) && !isReservedProp(key)) ||
              // force hydrate v-bind with .prop modifiers
              // 强制激活带有 .prop 修饰符的 v-bind
              key[0] === '.' ||
              (isCustomElement && !isReservedProp(key))
            ) {
              patchProp(el, key, null, props[key], undefined, parentComponent)
            }
          }
        } else if (props.onClick) {
          // Fast path for click listeners (which is most often) to avoid
          // iterating through props.
          // 点击监听器的快速路径（这是最常见的情况），以避免遍历 props。
          patchProp(
            el,
            'onClick',
            null,
            props.onClick,
            undefined,
            parentComponent,
          )
        } else if (patchFlag & PatchFlags.STYLE && isReactive(props.style)) {
          // #11372: object style values are iterated during patch instead of
          // render/normalization phase, but style patch is skipped during
          // hydration, so we need to force iterate the object to track deps
          // #11372: 对象样式值在 patch 期间而不是渲染/规范化阶段进行迭代，
          // 但是在 hydration 期间跳过了样式 patch，所以我们需要强制迭代对象以跟踪依赖关系
          for (const key in props.style) props.style[key]
        }
      }

      // vnode / directive hooks
      let vnodeHooks: VNodeHook | null | undefined
      if ((vnodeHooks = props && props.onVnodeBeforeMount)) {
        invokeVNodeHook(vnodeHooks, parentComponent, vnode)
      }
      if (dirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount')
      }
      if (
        (vnodeHooks = props && props.onVnodeMounted) ||
        dirs ||
        needCallTransitionHooks
      ) {
        queueEffectWithSuspense(() => {
          vnodeHooks && invokeVNodeHook(vnodeHooks, parentComponent, vnode)
          needCallTransitionHooks && transition!.enter(el)
          dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted')
        }, parentSuspense)
      }
    }

    return el.nextSibling
  }

  const hydrateChildren = (
    node: Node | null,
    parentVNode: VNode,
    container: Element,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ): Node | null => {
    optimized = optimized || !!parentVNode.dynamicChildren
    const children = parentVNode.children as VNode[]
    const l = children.length
    let hasWarned = false
    for (let i = 0; i < l; i++) {
      const vnode = optimized
        ? children[i]
        : (children[i] = normalizeVNode(children[i]))
      const isText = vnode.type === Text
      if (node) {
        if (isText && !optimized) {
          // #7285 possible consecutive text vnodes from manual render fns or
          // JSX-compiled fns, but on the client the browser parses only 1 text
          // node.
          // look ahead for next possible text vnode
          // #7285 来自手动渲染函数或 JSX 编译函数的可能连续文本 vnode，
          // 但在客户端，浏览器仅解析 1 个文本节点。
          // 向前查找下一个可能的文本 vnode
          if (i + 1 < l && normalizeVNode(children[i + 1]).type === Text) {
            // create an extra TextNode on the client for the next vnode to
            // adopt
            // 在客户端创建一个额外的 TextNode 供下一个 vnode 采用
            insert(
              createText(
                (node as Text).data.slice((vnode.children as string).length),
              ),
              container,
              nextSibling(node),
            )
            ;(node as Text).data = vnode.children as string
          }
        }
        node = hydrateNode(
          node,
          vnode,
          parentComponent,
          parentSuspense,
          slotScopeIds,
          optimized,
        )
      } else if (isText && !vnode.children) {
        // #7215 create a TextNode for empty text node
        // because server rendered HTML won't contain a text node
        // #7215 为空文本节点创建一个 TextNode
        // 因为服务器渲染的 HTML 不会包含文本节点
        insert((vnode.el = createText('')), container)
      } else {
        if (!isMismatchAllowed(container, MismatchTypes.CHILDREN)) {
          if (
            (__DEV__ || __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__) &&
            !hasWarned
          ) {
            warn(
              `Hydration children mismatch on`,
              container,
              `\nServer rendered element contains fewer child nodes than client vdom.`,
            )
            hasWarned = true
          }
          logMismatchError()
        }

        // the SSRed DOM didn't contain enough nodes. Mount the missing ones.
        // SSR 的 DOM 没有包含足够的节点。挂载缺失的节点。
        patch(
          null,
          vnode,
          container,
          null,
          parentComponent,
          parentSuspense,
          getContainerType(container),
          slotScopeIds,
        )
      }
    }
    return node
  }

  const hydrateFragment = (
    node: Comment,
    vnode: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    slotScopeIds: string[] | null,
    optimized: boolean,
  ) => {
    const { slotScopeIds: fragmentSlotScopeIds } = vnode
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds
        ? slotScopeIds.concat(fragmentSlotScopeIds)
        : fragmentSlotScopeIds
    }

    const container = parentNode(node)!
    const next = hydrateChildren(
      nextSibling(node)!,
      vnode,
      container,
      parentComponent,
      parentSuspense,
      slotScopeIds,
      optimized,
    )
    if (next && isComment(next) && next.data === ']') {
      return nextSibling((vnode.anchor = next))
    } else {
      // fragment didn't hydrate successfully, since we didn't get a end anchor
      // back. This should have led to node/children mismatch warnings.
      // 片段未成功激活，因为我们没有取回结束锚点。
      // 这应该会导致节点/子节点不匹配警告。
      logMismatchError()

      // since the anchor is missing, we need to create one and insert it
      // 由于锚点丢失，我们需要创建一个并插入它
      insert((vnode.anchor = createComment(`]`)), container, next)
      return next
    }
  }

  const handleMismatch = (
    node: Node,
    vnode: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    slotScopeIds: string[] | null,
    isFragment: boolean,
  ): Node | null => {
    if (!isMismatchAllowed(node.parentElement!, MismatchTypes.CHILDREN)) {
      ;(__DEV__ || __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__) &&
        warn(
          `Hydration node mismatch:\n- rendered on server:`,
          node,
          node.nodeType === DOMNodeTypes.TEXT
            ? `(text)`
            : isComment(node) && node.data === '['
              ? `(start of fragment)`
              : ``,
          `\n- expected on client:`,
          vnode.type,
        )
      logMismatchError()
    }

    vnode.el = null

    if (isFragment) {
      // remove excessive fragment nodes
    // 移除多余的片段节点
      const end = locateClosingAnchor(node)
      while (true) {
        const next = nextSibling(node)
        if (next && next !== end) {
          remove(next)
        } else {
          break
        }
      }
    }

    const next = nextSibling(node)
    const container = parentNode(node)!
    remove(node)

    patch(
      null,
      vnode,
      container,
      next,
      parentComponent,
      parentSuspense,
      getContainerType(container),
      slotScopeIds,
    )
    // the component vnode's el should be updated when a mismatch occurs.
    // 当发生不匹配时，组件 vnode 的 el 应该被更新。
    if (parentComponent) {
      parentComponent.vnode.el = vnode.el
      updateHOCHostEl(parentComponent, vnode.el)
    }
    return next
  }

  // looks ahead for a start and closing comment node
  // 向前查找开始和结束注释节点
  const locateClosingAnchor = (
    node: Node | null,
    open = '[',
    close = ']',
  ): Node | null => {
    let match = 0
    while (node) {
      node = nextSibling(node)
      if (node && isComment(node)) {
        if (node.data === open) match++
        if (node.data === close) {
          if (match === 0) {
            return nextSibling(node)
          } else {
            match--
          }
        }
      }
    }
    return node
  }

  const replaceNode = (
    newNode: Node,
    oldNode: Node,
    parentComponent: ComponentInternalInstance | null,
  ): void => {
    // replace node
    // 替换节点
    const parentNode = oldNode.parentNode
    if (parentNode) {
      parentNode.replaceChild(newNode, oldNode)
    }

    // update vnode
    // 更新 vnode
    let parent = parentComponent
    while (parent) {
      if (parent.vnode.el === oldNode) {
        parent.vnode.el = parent.subTree.el = newNode
      }
      parent = parent.parent
    }
  }

  const isTemplateNode = (node: Node): node is HTMLTemplateElement => {
    return (
      node.nodeType === DOMNodeTypes.ELEMENT &&
      (node as Element).tagName === 'TEMPLATE'
    )
  }

  return [hydrate, hydrateNode]
}

/**
 * Dev only
 */
function propHasMismatch(
  el: Element & { $cls?: string },
  key: string,
  clientValue: any,
  vnode: VNode,
  instance: ComponentInternalInstance | null,
): boolean {
  let mismatchType: MismatchTypes | undefined
  let mismatchKey: string | undefined
  let actual: string | boolean | null | undefined
  let expected: string | boolean | null | undefined
  if (key === 'class') {
    // classes might be in different order, but that doesn't affect cascade
    // so we just need to check if the class lists contain the same classes.
    // 类可能顺序不同，但这不影响层叠
    // 所以我们只需要检查类列表是否包含相同的类。
    if (el.$cls) {
      actual = el.$cls
      delete el.$cls
    } else {
      actual = el.getAttribute('class')
    }
    expected = normalizeClass(clientValue)
    if (!isSetEqual(toClassSet(actual || ''), toClassSet(expected))) {
      mismatchType = MismatchTypes.CLASS
      mismatchKey = `class`
    }
  } else if (key === 'style') {
    // style might be in different order, but that doesn't affect cascade
    // 样式可能顺序不同，但这不影响层叠
    actual = el.getAttribute('style') || ''
    expected = isString(clientValue)
      ? clientValue
      : stringifyStyle(normalizeStyle(clientValue))
    const actualMap = toStyleMap(actual)
    const expectedMap = toStyleMap(expected)
    // If `v-show=false`, `display: 'none'` should be added to expected
    // 如果 `v-show=false`，则应将 `display: 'none'` 添加到预期值中
    if (vnode.dirs) {
      for (const { dir, value } of vnode.dirs) {
        // @ts-expect-error only vShow has this internal name
        if (dir.name === 'show' && !value) {
          expectedMap.set('display', 'none')
        }
      }
    }

    if (instance) {
      resolveCssVars(instance, vnode, expectedMap)
    }

    if (!isMapEqual(actualMap, expectedMap)) {
      mismatchType = MismatchTypes.STYLE
      mismatchKey = 'style'
    }
  } else if (
    (el instanceof SVGElement && isKnownSvgAttr(key)) ||
    (el instanceof HTMLElement && (isBooleanAttr(key) || isKnownHtmlAttr(key)))
  ) {
    if (isBooleanAttr(key)) {
      actual = el.hasAttribute(key)
      expected = includeBooleanAttr(clientValue)
    } else if (clientValue == null) {
      actual = el.hasAttribute(key)
      expected = false
    } else {
      if (el.hasAttribute(key)) {
        actual = el.getAttribute(key)
      } else if (key === 'value' && el.tagName === 'TEXTAREA') {
        // #10000 textarea.value can't be retrieved by `hasAttribute`
        // #10000 textarea.value 无法通过 `hasAttribute` 检索
        actual = (el as HTMLTextAreaElement).value
      } else {
        actual = false
      }
      expected = isRenderableAttrValue(clientValue)
        ? String(clientValue)
        : false
    }
    if (actual !== expected) {
      mismatchType = MismatchTypes.ATTRIBUTE
      mismatchKey = key
    }
  }

  if (mismatchType != null && !isMismatchAllowed(el, mismatchType)) {
    const format = (v: any) =>
      v === false ? `(not rendered)` : `${mismatchKey}="${v}"`
    const preSegment = `Hydration ${MismatchTypeString[mismatchType]} mismatch on`
    const postSegment =
      `\n  - rendered on server: ${format(actual)}` +
      `\n  - expected on client: ${format(expected)}` +
      `\n  Note: this mismatch is check-only. The DOM will not be rectified ` +
      `in production due to performance overhead.` +
      `\n  You should fix the source of the mismatch.`
    if (__TEST__) {
      // during tests, log the full message in one single string for easier
      // debugging.
      // 在测试期间，将完整消息记录在一个字符串中，以便于调试。
      warn(`${preSegment} ${el.tagName}${postSegment}`)
    } else {
      warn(preSegment, el, postSegment)
    }
    return true
  }
  return false
}

function toClassSet(str: string): Set<string> {
  return new Set(str.trim().split(/\s+/))
}

function isSetEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const s of a) {
    if (!b.has(s)) {
      return false
    }
  }
  return true
}

function toStyleMap(str: string): Map<string, string> {
  const styleMap: Map<string, string> = new Map()
  for (const item of str.split(';')) {
    let [key, value] = item.split(':')
    key = key.trim()
    value = value && value.trim()
    if (key && value) {
      styleMap.set(key, value)
    }
  }
  return styleMap
}

function isMapEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) {
    return false
  }
  for (const [key, value] of a) {
    if (value !== b.get(key)) {
      return false
    }
  }
  return true
}

function resolveCssVars(
  instance: ComponentInternalInstance,
  vnode: VNode,
  expectedMap: Map<string, string>,
) {
  const root = instance.subTree
  if (
    instance.getCssVars &&
    (vnode === root ||
      (root &&
        root.type === Fragment &&
        (root.children as VNode[]).includes(vnode)))
  ) {
    const cssVars = instance.getCssVars()
    for (const key in cssVars) {
      const value = normalizeCssVarValue(cssVars[key])
      expectedMap.set(`--${getEscapedCssVarName(key, false)}`, value)
    }
  }
  if (vnode === root && instance.parent) {
    resolveCssVars(instance.parent, instance.vnode, expectedMap)
  }
}

const allowMismatchAttr = 'data-allow-mismatch'

enum MismatchTypes {
  TEXT = 0,
  CHILDREN = 1,
  CLASS = 2,
  STYLE = 3,
  ATTRIBUTE = 4,
}

const MismatchTypeString: Record<MismatchTypes, string> = {
  [MismatchTypes.TEXT]: 'text',
  [MismatchTypes.CHILDREN]: 'children',
  [MismatchTypes.CLASS]: 'class',
  [MismatchTypes.STYLE]: 'style',
  [MismatchTypes.ATTRIBUTE]: 'attribute',
} as const

function isMismatchAllowed(
  el: Element | null,
  allowedType: MismatchTypes,
): boolean {
  if (
    allowedType === MismatchTypes.TEXT ||
    allowedType === MismatchTypes.CHILDREN
  ) {
    while (el && !el.hasAttribute(allowMismatchAttr)) {
      el = el.parentElement
    }
  }
  const allowedAttr = el && el.getAttribute(allowMismatchAttr)
  if (allowedAttr == null) {
    return false
  } else if (allowedAttr === '') {
    return true
  } else {
    const list = allowedAttr.split(',')
    // text is a subset of children
    // 文本是子节点的子集
    if (allowedType === MismatchTypes.TEXT && list.includes('children')) {
      return true
    }
    return list.includes(MismatchTypeString[allowedType])
  }
}
