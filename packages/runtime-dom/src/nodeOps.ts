import { warn } from '@vue/runtime-core'
import type { RendererOptions } from '@vue/runtime-core'
import type {
  TrustedHTML,
  TrustedTypePolicy,
  TrustedTypesWindow,
} from 'trusted-types/lib'

let policy: Pick<TrustedTypePolicy, 'name' | 'createHTML'> | undefined =
  undefined

const tt =
  typeof window !== 'undefined' &&
  (window as unknown as TrustedTypesWindow).trustedTypes

if (tt) {
  try {
    policy = /*@__PURE__*/ tt.createPolicy('vue', {
      createHTML: val => val,
    })
  } catch (e: unknown) {
    // `createPolicy` throws a TypeError if the name is a duplicate
    // and the CSP trusted-types directive is not using `allow-duplicates`.
    // So we have to catch that error.
    // `createPolicy` 如果名称重复且 CSP trusted-types 指令未使用 `allow-duplicates`，
    // 则会抛出 TypeError。所以我们必须捕获该错误。
    __DEV__ && warn(`Error creating trusted types policy: ${e}`)
  }
}

// __UNSAFE__
// Reason: potentially setting innerHTML.
// This function merely perform a type-level trusted type conversion
// for use in `innerHTML` assignment, etc.
// Be careful of whatever value passed to this function.
// __不安全__
// 原因：可能会设置 innerHTML。
// 此函数仅执行类型级别的可信类型转换，用于 `innerHTML` 赋值等。
// 请小心传递给此函数的任何值。
export const unsafeToTrustedHTML: (value: string) => TrustedHTML | string =
  policy ? val => policy.createHTML(val) : val => val

export const svgNS = 'http://www.w3.org/2000/svg'
export const mathmlNS = 'http://www.w3.org/1998/Math/MathML'

const doc = (typeof document !== 'undefined' ? document : null) as Document

const templateContainer = doc && /*@__PURE__*/ doc.createElement('template')

export const nodeOps: Omit<RendererOptions<Node, Element>, 'patchProp'> = {
  // 插入节点
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null)
  },

  // 移除节点
  remove: child => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },

  // 创建元素
  createElement: (tag, namespace, is, props): Element => {
    const el =
      namespace === 'svg'
        ? doc.createElementNS(svgNS, tag)
        : namespace === 'mathml'
          ? doc.createElementNS(mathmlNS, tag)
          : is
            ? doc.createElement(tag, { is })
            : doc.createElement(tag)

    if (tag === 'select' && props && props.multiple != null) {
      ;(el as HTMLSelectElement).setAttribute('multiple', props.multiple)
    }

    return el
  },

  // 创建文本节点
  createText: text => doc.createTextNode(text),

  // 创建注释节点
  createComment: text => doc.createComment(text),

  // 设置文本节点内容
  setText: (node, text) => {
    node.nodeValue = text
  },

  // 设置元素文本内容
  setElementText: (el, text) => {
    el.textContent = text
  },

  // 获取父节点
  parentNode: node => node.parentNode as Element | null,

  // 获取下一个兄弟节点
  nextSibling: node => node.nextSibling,

  // 查询选择器
  querySelector: selector => doc.querySelector(selector),

  // 设置 Scope ID (用于 Scoped CSS)
  setScopeId(el, id) {
    el.setAttribute(id, '')
  },

  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  // __不安全__
  // 原因：innerHTML。
  // 这里的静态内容只能来自编译后的模板。
  // 只要用户只使用受信任的模板，这就是安全的。
  insertStaticContent(content, parent, anchor, namespace, start, end) {
    // <parent> before | first ... last | anchor </parent>
    const before = anchor ? anchor.previousSibling : parent.lastChild
    // #5308 can only take cached path if:
    // - has a single root node
    // - nextSibling info is still available
    // #5308 仅在以下情况下可以使用缓存路径：
    // - 具有单个根节点
    // - nextSibling 信息仍然可用
    if (start && (start === end || start.nextSibling)) {
      // cached
      // 缓存路径
      while (true) {
        parent.insertBefore(start!.cloneNode(true), anchor)
        if (start === end || !(start = start!.nextSibling)) break
      }
    } else {
      // fresh insert
      // 新插入
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace === 'svg'
          ? `<svg>${content}</svg>`
          : namespace === 'mathml'
            ? `<math>${content}</math>`
            : content,
      ) as string

      const template = templateContainer.content
      if (namespace === 'svg' || namespace === 'mathml') {
        // remove outer svg/math wrapper
        // 移除外部 svg/math 包装器
        const wrapper = template.firstChild!
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild)
        }
        template.removeChild(wrapper)
      }
      parent.insertBefore(template, anchor)
    }
    return [
      // first
      before ? before.nextSibling! : parent.firstChild!,
      // last
      anchor ? anchor.previousSibling! : parent.lastChild!,
    ]
  },
}
