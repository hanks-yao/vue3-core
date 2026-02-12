import {
  ShapeFlags,
  extend,
  hyphenate,
  isArray,
  isObject,
  isString,
  makeMap,
  normalizeClass,
  normalizeStyle,
  toHandlerKey,
} from '@vue/shared'
import type {
  Component,
  ComponentInternalInstance,
  ComponentOptions,
  Data,
  InternalRenderFunction,
} from '../component'
import { currentRenderingInstance } from '../componentRenderContext'
import { type DirectiveArguments, withDirectives } from '../directives'
import {
  resolveDirective,
  resolveDynamicComponent,
} from '../helpers/resolveAssets'
import {
  Comment,
  type VNode,
  type VNodeArrayChildren,
  type VNodeProps,
  createVNode,
  isVNode,
  normalizeChildren,
} from '../vnode'
import {
  DeprecationTypes,
  checkCompatEnabled,
  isCompatEnabled,
} from './compatConfig'
import { compatModelEventPrefix } from './componentVModel'

export function convertLegacyRenderFn(
  instance: ComponentInternalInstance,
): void {
  const Component = instance.type as ComponentOptions
  const render = Component.render as InternalRenderFunction | undefined

  // v3 runtime compiled, or already checked / wrapped
  // v3 运行时编译的，或者已经检查/包装过的
  if (!render || render._rc || render._compatChecked || render._compatWrapped) {
    return
  }

  if (render.length >= 2) {
    // v3 pre-compiled function, since v2 render functions never need more than
    // 2 arguments, and v2 functional render functions would have already been
    // normalized into v3 functional components
    // v3 预编译函数，因为 v2 渲染函数只需要不超过 2 个参数，
    // 并且 v2 函数式渲染函数已经被规范化为 v3 函数式组件
    render._compatChecked = true
    return
  }

  // v2 render function, try to provide compat
  // v2 渲染函数，尝试提供兼容性
  if (checkCompatEnabled(DeprecationTypes.RENDER_FUNCTION, instance)) {
    const wrapped = (Component.render = function compatRender() {
      // @ts-expect-error
      return render.call(this, compatH)
    })
    // @ts-expect-error
    wrapped._compatWrapped = true
  }
}

interface LegacyVNodeProps {
  key?: string | number
  ref?: string
  refInFor?: boolean

  staticClass?: string
  class?: unknown
  staticStyle?: Record<string, unknown>
  style?: Record<string, unknown>
  attrs?: Record<string, unknown>
  domProps?: Record<string, unknown>
  on?: Record<string, Function | Function[]>
  nativeOn?: Record<string, Function | Function[]>
  directives?: LegacyVNodeDirective[]

  // component only
  props?: Record<string, unknown>
  slot?: string
  scopedSlots?: Record<string, Function>
  model?: {
    value: any
    callback: (v: any) => void
    expression: string
  }
}

interface LegacyVNodeDirective {
  name: string
  value: unknown
  arg?: string
  modifiers?: Record<string, boolean>
}

type LegacyVNodeChildren =
  | string
  | number
  | boolean
  | VNode
  | VNodeArrayChildren

export function compatH(
  type: string | Component,
  children?: LegacyVNodeChildren,
): VNode
export function compatH(
  type: string | Component,
  props?: Data & LegacyVNodeProps,
  children?: LegacyVNodeChildren,
): VNode

export function compatH(
  type: any,
  propsOrChildren?: any,
  children?: any,
): VNode {
  if (!type) {
    type = Comment
  }

  // to support v2 string component name look!up
  // 支持 v2 字符串组件名称查找
  if (typeof type === 'string') {
    const t = hyphenate(type)
    if (t === 'transition' || t === 'transition-group' || t === 'keep-alive') {
      // since transition and transition-group are runtime-dom-specific,
      // we cannot import them directly here. Instead they are registered using
      // special keys in @vue/compat entry.
      // 由于 transition 和 transition-group 是 runtime-dom 特有的，
      // 我们不能直接在这里导入它们。相反，它们在 @vue/compat 入口中使用特殊键进行注册。
      type = `__compat__${t}`
    }
    type = resolveDynamicComponent(type)
  }

  const l = arguments.length
  const is2ndArgArrayChildren = isArray(propsOrChildren)
  if (l === 2 || is2ndArgArrayChildren) {
    if (isObject(propsOrChildren) && !is2ndArgArrayChildren) {
      // single vnode without props
      // 没有 props 的单个 vnode
      if (isVNode(propsOrChildren)) {
        return convertLegacySlots(createVNode(type, null, [propsOrChildren]))
      }
      // props without children
      // 只有 props 没有 children
      return convertLegacySlots(
        convertLegacyDirectives(
          createVNode(type, convertLegacyProps(propsOrChildren, type)),
          propsOrChildren,
        ),
      )
    } else {
      // omit props
      // 省略 props
      return convertLegacySlots(createVNode(type, null, propsOrChildren))
    }
  } else {
    if (isVNode(children)) {
      children = [children]
    }
    return convertLegacySlots(
      convertLegacyDirectives(
        createVNode(type, convertLegacyProps(propsOrChildren, type), children),
        propsOrChildren,
      ),
    )
  }
}

const skipLegacyRootLevelProps = /*@__PURE__*/ makeMap(
  'staticStyle,staticClass,directives,model,hook',
)

function convertLegacyProps(
  legacyProps: LegacyVNodeProps | undefined,
  type: any,
): (Data & VNodeProps) | null {
  if (!legacyProps) {
    return null
  }

  const converted: Data & VNodeProps = {}

  for (const key in legacyProps) {
    if (key === 'attrs' || key === 'domProps' || key === 'props') {
      extend(converted, legacyProps[key])
    } else if (key === 'on' || key === 'nativeOn') {
      const listeners = legacyProps[key]
      for (const event in listeners) {
        let handlerKey = convertLegacyEventKey(event)
        if (key === 'nativeOn') handlerKey += `Native`
        const existing = converted[handlerKey]
        const incoming = listeners[event]
        if (existing !== incoming) {
          if (existing) {
            converted[handlerKey] = [].concat(existing as any, incoming as any)
          } else {
            converted[handlerKey] = incoming
          }
        }
      }
    } else if (!skipLegacyRootLevelProps(key)) {
      converted[key] = legacyProps[key as keyof LegacyVNodeProps]
    }
  }

  if (legacyProps.staticClass) {
    converted.class = normalizeClass([legacyProps.staticClass, converted.class])
  }
  if (legacyProps.staticStyle) {
    converted.style = normalizeStyle([legacyProps.staticStyle, converted.style])
  }

  if (legacyProps.model && isObject(type)) {
    // v2 compiled component v-model
    // v2 编译组件 v-model
    const { prop = 'value', event = 'input' } = (type as any).model || {}
    converted[prop] = legacyProps.model.value
    converted[compatModelEventPrefix + event] = legacyProps.model.callback
  }

  return converted
}

function convertLegacyEventKey(event: string): string {
  // normalize v2 event prefixes
  // 规范化 v2 事件前缀
  if (event[0] === '&') {
    event = event.slice(1) + 'Passive'
  }
  if (event[0] === '~') {
    event = event.slice(1) + 'Once'
  }
  if (event[0] === '!') {
    event = event.slice(1) + 'Capture'
  }
  return toHandlerKey(event)
}

function convertLegacyDirectives(
  vnode: VNode,
  props?: LegacyVNodeProps,
): VNode {
  if (props && props.directives) {
    return withDirectives(
      vnode,
      props.directives.map(({ name, value, arg, modifiers }) => {
        return [
          resolveDirective(name)!,
          value,
          arg,
          modifiers,
        ] as DirectiveArguments[number]
      }),
    )
  }
  return vnode
}

function convertLegacySlots(vnode: VNode): VNode {
  const { props, children } = vnode

  let slots: Record<string, any> | undefined

  if (vnode.shapeFlag & ShapeFlags.COMPONENT && isArray(children)) {
    slots = {}
    // check "slot" property on vnodes and turn them into v3 function slots
    // 检查 vnode 上的 "slot" 属性并将其转换为 v3 函数式插槽
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const slotName =
        (isVNode(child) && child.props && child.props.slot) || 'default'
      const slot = slots[slotName] || (slots[slotName] = [] as any[])
      if (isVNode(child) && child.type === 'template') {
        slot.push(child.children)
      } else {
        slot.push(child)
      }
    }
    if (slots) {
      for (const key in slots) {
        const slotChildren = slots[key]
        slots[key] = () => slotChildren
        slots[key]._ns = true /* non-scoped slot */ /* 非作用域插槽 */
      }
    }
  }

  const scopedSlots = props && props.scopedSlots
  if (scopedSlots) {
    delete props!.scopedSlots
    if (slots) {
      extend(slots, scopedSlots)
    } else {
      slots = scopedSlots
    }
  }

  if (slots) {
    normalizeChildren(vnode, slots)
  }

  return vnode
}

export function defineLegacyVNodeProperties(vnode: VNode): void {
  /* v8 ignore start */
  if (
    isCompatEnabled(
      DeprecationTypes.RENDER_FUNCTION,
      currentRenderingInstance,
      true /* enable for built-ins */ /* 为内置组件启用 */,
    ) &&
    isCompatEnabled(
      DeprecationTypes.PRIVATE_APIS,
      currentRenderingInstance,
      true /* enable for built-ins */ /* 为内置组件启用 */,
    )
  ) {
    const context = currentRenderingInstance
    const getInstance = () => vnode.component && vnode.component.proxy
    let componentOptions: any
    Object.defineProperties(vnode, {
      tag: { get: () => vnode.type },
      data: { get: () => vnode.props || {}, set: p => (vnode.props = p) },
      elm: { get: () => vnode.el },
      componentInstance: { get: getInstance },
      child: { get: getInstance },
      text: { get: () => (isString(vnode.children) ? vnode.children : null) },
      context: { get: () => context && context.proxy },
      componentOptions: {
        get: () => {
          if (vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT) {
            if (componentOptions) {
              return componentOptions
            }
            return (componentOptions = {
              Ctor: vnode.type,
              propsData: vnode.props,
              children: vnode.children,
            })
          }
        },
      },
    })
  }
  /* v8 ignore stop */
}
