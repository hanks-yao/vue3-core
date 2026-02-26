import { patchClass } from './modules/class'
import { patchStyle } from './modules/style'
import { patchAttr } from './modules/attrs'
import { patchDOMProp } from './modules/props'
import { patchEvent } from './modules/events'
import {
  camelize,
  isFunction,
  isModelListener,
  isOn,
  isString,
} from '@vue/shared'
import type { RendererOptions } from '@vue/runtime-core'
import type { VueElement } from './apiCustomElement'

const isNativeOn = (key: string) =>
  key.charCodeAt(0) === 111 /* o */ &&
  key.charCodeAt(1) === 110 /* n */ &&
  // lowercase letter
  // 小写字母
  key.charCodeAt(2) > 96 &&
  key.charCodeAt(2) < 123

type DOMRendererOptions = RendererOptions<Node, Element>

// DOM 属性更新的入口函数
export const patchProp: DOMRendererOptions['patchProp'] = (
  el,
  key,
  prevValue,
  nextValue,
  namespace,
  parentComponent,
) => {
  const isSVG = namespace === 'svg'
  if (key === 'class') {
    // 处理 class
    patchClass(el, nextValue, isSVG)
  } else if (key === 'style') {
    // 处理 style
    patchStyle(el, prevValue, nextValue)
  } else if (isOn(key)) {
    // ignore v-model listeners
    // 忽略 v-model 监听器
    if (!isModelListener(key)) {
      // 处理事件监听器
      patchEvent(el, key, prevValue, nextValue, parentComponent)
    }
  } else if (
    key[0] === '.'
      ? ((key = key.slice(1)), true)
      : key[0] === '^'
        ? ((key = key.slice(1)), false)
        : shouldSetAsProp(el, key, nextValue, isSVG)
  ) {
    // 如果 key 以 . 开头，强制作为 DOM 属性处理
    // 如果 key 以 ^ 开头，强制作为 Attribute 处理
    // 否则通过 shouldSetAsProp 判断是否作为 DOM 属性处理
    patchDOMProp(el, key, nextValue, parentComponent)
    // #6007 also set form state as attributes so they work with
    // <input type="reset"> or libs / extensions that expect attributes
    // #6007 同时将表单状态设置为属性，以便它们能与 <input type="reset"> 或期望属性的库/扩展一起工作
    // #11163 custom elements may use value as an prop and set it as object
    // #11163 自定义元素可能使用 value 作为 prop 并将其设置为对象
    if (
      !el.tagName.includes('-') &&
      (key === 'value' || key === 'checked' || key === 'selected')
    ) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== 'value')
    }
  } else if (
    // #11081 force set props for possible async custom element
    // #11081 强制为可能的异步自定义元素设置 props
    (el as VueElement)._isVueCE &&
    (/[A-Z]/.test(key) || !isString(nextValue))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key)
  } else {
    // special case for <input v-model type="checkbox"> with
    // :true-value & :false-value
    // store value as dom properties since non-string values will be
    // stringified.
    // 特殊情况：带有 :true-value & :false-value 的 <input v-model type="checkbox">
    // 将值存储为 DOM 属性，因为非字符串值会被字符串化。
    if (key === 'true-value') {
      ;(el as any)._trueValue = nextValue
    } else if (key === 'false-value') {
      ;(el as any)._falseValue = nextValue
    }
    // 默认作为 Attribute 处理
    patchAttr(el, key, nextValue, isSVG, parentComponent)
  }
}

function shouldSetAsProp(
  el: Element,
  key: string,
  value: unknown,
  isSVG: boolean,
) {
  if (isSVG) {
    // most keys must be set as attribute on svg elements to work
    // ...except innerHTML & textContent
    // 大多数 key 必须作为 svg 元素上的属性设置才能工作
    // ...除了 innerHTML 和 textContent
    if (key === 'innerHTML' || key === 'textContent') {
      return true
    }
    // or native onclick with function values
    // 或者带有函数值的原生 onclick
    if (key in el && isNativeOn(key) && isFunction(value)) {
      return true
    }
    return false
  }

  // these are enumerated attrs, however their corresponding DOM properties
  // are actually booleans - this leads to setting it with a string "false"
  // value leading it to be coerced to `true`, so we need to always treat
  // them as attributes.
  // Note that `contentEditable` doesn't have this problem: its DOM
  // property is also enumerated string values.
  // 这些是枚举属性，但它们对应的 DOM 属性实际上是布尔值
  // 这导致用字符串 "false" 设置它时，会被强制转换为 `true`，
  // 所以我们需要始终将它们视为属性。
  // 注意 `contentEditable` 没有这个问题：它的 DOM 属性也是枚举字符串值。
  if (
    key === 'spellcheck' ||
    key === 'draggable' ||
    key === 'translate' ||
    key === 'autocorrect'
  ) {
    return false
  }

  // #13946 iframe.sandbox should always be set as attribute since setting
  // the property to null results in 'null' string, and setting to empty string
  // enables the most restrictive sandbox mode instead of no sandboxing.
  // #13946 iframe.sandbox 应该始终作为属性设置，因为将属性设置为 null 会导致 'null' 字符串，
  // 而设置为空字符串会启用最严格的沙箱模式，而不是没有沙箱。
  if (key === 'sandbox' && el.tagName === 'IFRAME') {
    return false
  }

  // #1787, #2840 form property on form elements is readonly and must be set as
  // attribute.
  // #1787, #2840 表单元素上的 form 属性是只读的，必须作为属性设置。
  if (key === 'form') {
    return false
  }

  // #1526 <input list> must be set as attribute
  // #1526 <input list> 必须作为属性设置
  if (key === 'list' && el.tagName === 'INPUT') {
    return false
  }

  // #2766 <textarea type> must be set as attribute
  // #2766 <textarea type> 必须作为属性设置
  if (key === 'type' && el.tagName === 'TEXTAREA') {
    return false
  }

  // #8780 the width or height of embedded tags must be set as attribute
  // #8780 嵌入标签的 width 或 height 必须作为属性设置
  if (key === 'width' || key === 'height') {
    const tag = el.tagName
    if (
      tag === 'IMG' ||
      tag === 'VIDEO' ||
      tag === 'CANVAS' ||
      tag === 'SOURCE'
    ) {
      return false
    }
  }

  // native onclick with string value, must be set as attribute
  // 带有字符串值的原生 onclick，必须作为属性设置
  if (isNativeOn(key) && isString(value)) {
    return false
  }

  return key in el
}
