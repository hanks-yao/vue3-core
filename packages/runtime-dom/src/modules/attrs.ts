import {
  NOOP,
  includeBooleanAttr,
  isSpecialBooleanAttr,
  isSymbol,
  makeMap,
} from '@vue/shared'
import {
  type ComponentInternalInstance,
  DeprecationTypes,
  compatUtils,
} from '@vue/runtime-core'

export const xlinkNS = 'http://www.w3.org/1999/xlink'

/**
 * 更新元素的 attribute
 * @param el 目标元素
 * @param key attribute 键名
 * @param value attribute 键值
 * @param isSVG 是否为 SVG 元素
 * @param instance 组件实例
 * @param isBoolean 是否为特殊的布尔类型 attribute
 */
export function patchAttr(
  el: Element,
  key: string,
  value: any,
  isSVG: boolean,
  instance?: ComponentInternalInstance | null,
  isBoolean: boolean = isSpecialBooleanAttr(key),
): void {
  // 处理 SVG 的 xlink 属性
  if (isSVG && key.startsWith('xlink:')) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length))
    } else {
      el.setAttributeNS(xlinkNS, key, value)
    }
  } else {
    // 兼容 Vue 2 的 attribute 强制转换逻辑
    if (__COMPAT__ && compatCoerceAttr(el, key, value, instance)) {
      return
    }

    // note we are only checking boolean attributes that don't have a
    // corresponding dom prop of the same name here.
    // 注意：这里我们只检查没有同名对应 DOM prop 的布尔属性。
    if (value == null || (isBoolean && !includeBooleanAttr(value))) {
      // 如果值为 null/undefined，或者布尔属性的值为 false，则移除该属性
      el.removeAttribute(key)
    } else {
      // attribute value is a string https://html.spec.whatwg.org/multipage/dom.html#attributes
      // attribute 的值必须是字符串 https://html.spec.whatwg.org/multipage/dom.html#attributes
      el.setAttribute(
        key,
        // 如果是布尔属性则设为空字符串，如果是 Symbol 则转为字符串，否则直接使用
        isBoolean ? '' : isSymbol(value) ? String(value) : value,
      )
    }
  }
}

// 2.x compat
// Vue 2.x 兼容性
const isEnumeratedAttr = __COMPAT__
  ? /*@__PURE__*/ makeMap('contenteditable,draggable,spellcheck')
  : NOOP

/**
 * 兼容 Vue 2 的 attribute 强制转换逻辑
 * @param el 目标元素
 * @param key attribute 键名
 * @param value attribute 键值
 * @param instance 组件实例
 * @returns 是否已经处理了兼容性逻辑
 */
export function compatCoerceAttr(
  el: Element,
  key: string,
  value: unknown,
  instance: ComponentInternalInstance | null = null,
): boolean {
  // 处理枚举类型的 attribute (如 contenteditable, draggable, spellcheck)
  if (isEnumeratedAttr(key)) {
    const v2CoercedValue =
      value === undefined
        ? null
        : value === null || value === false || value === 'false'
          ? 'false'
          : 'true'
    if (
      v2CoercedValue &&
      compatUtils.softAssertCompatEnabled(
        DeprecationTypes.ATTR_ENUMERATED_COERCION,
        instance,
        key,
        value,
        v2CoercedValue,
      )
    ) {
      el.setAttribute(key, v2CoercedValue)
      return true
    }
  } else if (
    // 处理 Vue 2 中普通 attribute 值为 false 时移除 attribute 的逻辑
    value === false &&
    !(el.tagName === 'INPUT' && key === 'value') &&
    !isSpecialBooleanAttr(key) &&
    compatUtils.isCompatEnabled(DeprecationTypes.ATTR_FALSE_VALUE, instance)
  ) {
    compatUtils.warnDeprecation(
      DeprecationTypes.ATTR_FALSE_VALUE,
      instance,
      key,
    )
    el.removeAttribute(key)
    return true
  }
  return false
}
