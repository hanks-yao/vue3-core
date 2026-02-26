import type { ObjectDirective } from '@vue/runtime-core'

// 导出用于存储原始 display 值的 symbol
export const vShowOriginalDisplay: unique symbol = Symbol('_vod')
// 导出用于标记元素是否被 v-show 隐藏的 symbol
export const vShowHidden: unique symbol = Symbol('_vsh')

export interface VShowElement extends HTMLElement {
  // _vod = vue original display
  // _vod = vue original display (vue 原始的 display 属性值)
  [vShowOriginalDisplay]: string
  [vShowHidden]: boolean
}

export const vShow: ObjectDirective<VShowElement> & { name: 'show' } = {
  // used for prop mismatch check during hydration
  // used for prop mismatch check during hydration (用于在 hydration(水合) 期间检查 prop 是否不匹配)
  name: 'show',
  // 在元素挂载前调用
  beforeMount(el, { value }, { transition }) {
    // 记录元素原始的 display 属性。如果是 'none'，则将其记录为空字符串，避免之后无法显示。
    el[vShowOriginalDisplay] =
      el.style.display === 'none' ? '' : el.style.display
    if (transition && value) {
      // 如果存在过渡动画且初始值为 true，调用 transition 的 beforeEnter 钩子
      transition.beforeEnter(el)
    } else {
      // 否则直接根据 value 的真假设置元素的 display 属性
      setDisplay(el, value)
    }
  },
  // 在元素挂载完成后调用
  mounted(el, { value }, { transition }) {
    if (transition && value) {
      // 如果存在过渡动画且初始值为 true，调用 transition 的 enter 钩子开始过渡
      transition.enter(el)
    }
  },
  // 在所在组件的 VNode 及其子 VNode 全部更新后调用
  updated(el, { value, oldValue }, { transition }) {
    // 只有当 v-show 的绑定值的布尔结果发生改变时，才执行更新逻辑
    if (!value === !oldValue) return
    if (transition) {
      if (value) {
        // 如果值变为 true，执行进入过渡
        transition.beforeEnter(el)
        setDisplay(el, true)
        transition.enter(el)
      } else {
        // 如果值变为 false，执行离开过渡，并在过渡完成后将 display 设为 'none'
        transition.leave(el, () => {
          setDisplay(el, false)
        })
      }
    } else {
      // 如果没有过渡动画，直接设置元素的 display 属性
      setDisplay(el, value)
    }
  },
  // 在元素被卸载前调用
  beforeUnmount(el, { value }) {
    // 防止带有 v-show 的元素在其对应的组件被卸载时产生状态不一致，将其恢复为当前的对应状态
    setDisplay(el, value)
  },
}

// 内部帮助函数：设置元素的 display 样式
function setDisplay(el: VShowElement, value: unknown): void {
  // 如果 value 为真，恢复元素原来的 display 值，否则设置为 'none'
  el.style.display = value ? el[vShowOriginalDisplay] : 'none'
  // 更新元素上记录是否隐藏的状态
  el[vShowHidden] = !value
}

// SSR vnode transforms, only used when user includes client-oriented render
// function in SSR
// SSR vnode transforms, only used when user includes client-oriented render
// function in SSR (SSR 的 vnode 转换，仅在用户将面向客户端的渲染函数包含进 SSR 时才使用)
export function initVShowForSSR(): void {
  vShow.getSSRProps = ({ value }) => {
    if (!value) {
      // 在服务端渲染中，如果 v-show 的值为假，直接返回内联样式 display: none
      return { style: { display: 'none' } }
    }
  }
}
