import { type ElementWithTransition, vtcKey } from '../components/Transition'

// compiler should normalize class + :class bindings on the same element
// into a single binding ['staticClass', dynamic]
// 编译器应该将同一个元素上的 class + :class 绑定规范化
// 为单个绑定 ['staticClass', dynamic]
export function patchClass(
  el: Element,
  value: string | null,
  isSVG: boolean,
): void {
  // directly setting className should be faster than setAttribute in theory
  // if this is an element during a transition, take the temporary transition
  // classes into account.
  // 理论上直接设置 className 应该比 setAttribute 更快
  // 如果这是一个处于过渡期间的元素，需要考虑临时的过渡类名
  const transitionClasses = (el as ElementWithTransition)[vtcKey]
  if (transitionClasses) {
    value = (
      value ? [value, ...transitionClasses] : [...transitionClasses]
    ).join(' ')
  }
  if (value == null) {
    // 如果 value 为 null，移除 class 属性
    el.removeAttribute('class')
  } else if (isSVG) {
    // SVG 元素需要使用 setAttribute 设置 class
    el.setAttribute('class', value)
  } else {
    // 普通元素直接设置 className
    el.className = value
  }
}
