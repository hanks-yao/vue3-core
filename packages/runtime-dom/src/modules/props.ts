import { DeprecationTypes, compatUtils, warn } from '@vue/runtime-core'
import { includeBooleanAttr } from '@vue/shared'
import { unsafeToTrustedHTML } from '../nodeOps'

// functions. The user is responsible for using them with only trusted content.
// 函数。用户有责任仅对受信任的内容使用它们。
export function patchDOMProp(
  el: any,
  key: string,
  value: any,
  parentComponent: any,
  attrName?: string,
): void {
  // __UNSAFE__
  // Reason: potentially setting innerHTML.
  // This can come from explicit usage of v-html or innerHTML as a prop in render
  // __不安全__
  // 原因：可能会设置 innerHTML。
  // 这可能来自于渲染中显式使用 v-html 或将 innerHTML 作为 prop
  if (key === 'innerHTML' || key === 'textContent') {
    // null value case is handled in renderer patchElement before patching
    // children
    // null 值的情况在 patch 子节点之前，已经在渲染器的 patchElement 中处理了
    if (value != null) {
      el[key] = key === 'innerHTML' ? unsafeToTrustedHTML(value) : value
    }
    return
  }

  const tag = el.tagName

  // 处理 value 属性的特殊情况
  if (
    key === 'value' &&
    tag !== 'PROGRESS' &&
    // custom elements may use _value internally
    // 自定义元素内部可能会使用 _value
    !tag.includes('-')
  ) {
    // #4956: <option> value will fallback to its text content so we need to
    // compare against its attribute value instead.
    // #4956: <option> 的 value 会回退到其文本内容，因此我们需要与它的属性（attribute）值进行比较。
    const oldValue =
      tag === 'OPTION' ? el.getAttribute('value') || '' : el.value
    const newValue =
      value == null
        ? // #11647: value should be set as empty string for null and undefined,
          // but <input type="checkbox"> should be set as 'on'.
          // #11647: 对于 null 和 undefined，value 应设置为空字符串，
          // 但 <input type="checkbox"> 应设置为 'on'。
          el.type === 'checkbox'
          ? 'on'
          : ''
        : String(value)
    // 只有当新旧值不同，或者元素上不存在 _value 属性时，才去更新元素的 value
    if (oldValue !== newValue || !('_value' in el)) {
      el.value = newValue
    }
    // 如果传入值为 null 或 undefined，则移除该属性
    if (value == null) {
      el.removeAttribute(key)
    }
    // store value as _value as well since
    // non-string values will be stringified.
    // 将 value 同样存储为 _value，因为非字符串的 value 会被转换为字符串。
    el._value = value
    return
  }

  let needRemove = false
  // 处理值为空字符串或 null/undefined 的情况，对特定类型的属性进行类型转换或移除标记
  if (value === '' || value == null) {
    const type = typeof el[key]
    if (type === 'boolean') {
      // e.g. <select multiple> compiles to { multiple: '' }
      // 例如：<select multiple> 会编译为 { multiple: '' }
      value = includeBooleanAttr(value)
    } else if (value == null && type === 'string') {
      // e.g. <div :id="null">
      // 例如：<div :id="null">
      value = ''
      needRemove = true
    } else if (type === 'number') {
      // e.g. <img :width="null">
      // 例如：<img :width="null">
      value = 0
      needRemove = true
    }
  } else {
    // 处理 Vue 2 向后兼容的行为：ATTR_FALSE_VALUE
    if (
      __COMPAT__ &&
      value === false &&
      compatUtils.isCompatEnabled(
        DeprecationTypes.ATTR_FALSE_VALUE,
        parentComponent,
      )
    ) {
      const type = typeof el[key]
      if (type === 'string' || type === 'number') {
        __DEV__ &&
          compatUtils.warnDeprecation(
            DeprecationTypes.ATTR_FALSE_VALUE,
            parentComponent,
            key,
          )
        value = type === 'number' ? 0 : ''
        needRemove = true
      }
    }
  }

  // some properties perform value validation and throw,
  // some properties has getter, no setter, will error in 'use strict'
  // eg. <select :type="null"></select> <select :willValidate="null"></select>
  // 一些属性会执行值验证并抛出错误，
  // 一些属性只有 getter 没有 setter，在 'use strict' 严格模式下会报错
  // 例如：<select :type="null"></select> <select :willValidate="null"></select>
  try {
    el[key] = value
  } catch (e: any) {
    // do not warn if value is auto-coerced from nullish values
    // 如果值是从 nullish（null 或 undefined）值自动强制转换而来的，则不要发出警告
    if (__DEV__ && !needRemove) {
      warn(
        `Failed setting prop "${key}" on <${tag.toLowerCase()}>: ` +
          `value ${value} is invalid.`,
        e,
      )
    }
  }
  // 如果标记为需要移除，则调用 removeAttribute 移除该属性
  needRemove && el.removeAttribute(attrName || key)
}
