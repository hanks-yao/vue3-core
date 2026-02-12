import { getGlobalThis, isString } from '@vue/shared'
import { DOMNodeTypes, isComment } from './hydration'

// Polyfills for Safari support
// Safari 支持的 Polyfill
// see https://caniuse.com/requestidlecallback
const requestIdleCallback: Window['requestIdleCallback'] =
  getGlobalThis().requestIdleCallback || (cb => setTimeout(cb, 1))
const cancelIdleCallback: Window['cancelIdleCallback'] =
  getGlobalThis().cancelIdleCallback || (id => clearTimeout(id))

/**
 * A lazy hydration strategy for async components.
 * 异步组件的懒加载激活（hydration）策略。
 * @param hydrate - call this to perform the actual hydration.
 * @param hydrate - 调用此函数以执行实际的激活操作。
 * @param forEachElement - iterate through the root elements of the component's
 *                         non-hydrated DOM, accounting for possible fragments.
 * @param forEachElement - 遍历组件未激活 DOM 的根元素，考虑到可能的片段（fragments）。
 * @returns a teardown function to be called if the async component is unmounted
 *          before it is hydrated. This can be used to e.g. remove DOM event
 *          listeners.
 * @returns 如果异步组件在激活之前被卸载，则调用此清理函数。这可用于例如移除 DOM 事件监听器。
 */
export type HydrationStrategy = (
  hydrate: () => void,
  forEachElement: (cb: (el: Element) => any) => void,
) => (() => void) | void

export type HydrationStrategyFactory<Options> = (
  options?: Options,
) => HydrationStrategy

// Strategy: Hydrate when the browser is idle
// 策略：当浏览器空闲时进行激活
export const hydrateOnIdle: HydrationStrategyFactory<number> =
  (timeout = 10000) =>
  hydrate => {
    // Use requestIdleCallback to schedule hydration
    // 使用 requestIdleCallback 调度激活
    const id = requestIdleCallback(hydrate, { timeout })
    return () => cancelIdleCallback(id)
  }

// Check if an element is currently visible in the viewport
// 检查元素当前是否在视口中可见
function elementIsVisibleInViewport(el: Element) {
  const { top, left, bottom, right } = el.getBoundingClientRect()
  // eslint-disable-next-line no-restricted-globals
  const { innerHeight, innerWidth } = window
  return (
    ((top > 0 && top < innerHeight) || (bottom > 0 && bottom < innerHeight)) &&
    ((left > 0 && left < innerWidth) || (right > 0 && right < innerWidth))
  )
}

// Strategy: Hydrate when the element becomes visible
// 策略：当元素变得可见时进行激活
export const hydrateOnVisible: HydrationStrategyFactory<
  IntersectionObserverInit
> = opts => (hydrate, forEach) => {
  // Use IntersectionObserver to watch for visibility changes
  // 使用 IntersectionObserver 监听可见性变化
  const ob = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      ob.disconnect()
      hydrate()
      break
    }
  }, opts)
  forEach(el => {
    if (!(el instanceof Element)) return
    // If already visible, hydrate immediately
    // 如果已经可见，立即激活
    if (elementIsVisibleInViewport(el)) {
      hydrate()
      ob.disconnect()
      return false
    }
    ob.observe(el)
  })
  return () => ob.disconnect()
}

// Strategy: Hydrate when a media query matches
// 策略：当媒体查询匹配时进行激活
export const hydrateOnMediaQuery: HydrationStrategyFactory<string> =
  query => hydrate => {
    if (query) {
      const mql = matchMedia(query)
      if (mql.matches) {
        hydrate()
      } else {
        // Listen for media query changes
        // 监听媒体查询变化
        mql.addEventListener('change', hydrate, { once: true })
        return () => mql.removeEventListener('change', hydrate)
      }
    }
  }

// Strategy: Hydrate on user interaction (e.g., click, mouseover)
// 策略：在用户交互（如点击、鼠标悬停）时进行激活
export const hydrateOnInteraction: HydrationStrategyFactory<
  keyof HTMLElementEventMap | Array<keyof HTMLElementEventMap>
> =
  (interactions = []) =>
  (hydrate, forEach) => {
    if (isString(interactions)) interactions = [interactions]
    let hasHydrated = false
    // Handler for the interaction event
    // 交互事件的处理程序
    const doHydrate = (e: Event) => {
      if (!hasHydrated) {
        hasHydrated = true
        teardown()
        hydrate()
        // replay event
        // 重放事件，确保用户的操作在激活后被正确处理
        e.target!.dispatchEvent(new (e.constructor as any)(e.type, e))
      }
    }
    const teardown = () => {
      forEach(el => {
        for (const i of interactions) {
          el.removeEventListener(i, doHydrate)
        }
      })
    }
    // Attach event listeners to all root elements
    // 将事件监听器附加到所有根元素
    forEach(el => {
      for (const i of interactions) {
        el.addEventListener(i, doHydrate, { once: true })
      }
    })
    return teardown
  }

// Helper: Iterate through DOM elements, handling fragments
// 辅助函数：遍历 DOM 元素，处理片段（fragments）
export function forEachElement(
  node: Node,
  cb: (el: Element) => void | false,
): void {
  // fragment
  // 处理片段：如果节点是注释且内容为 '['，则表示片段开始
  if (isComment(node) && node.data === '[') {
    let depth = 1
    let next = node.nextSibling
    while (next) {
      if (next.nodeType === DOMNodeTypes.ELEMENT) {
        const result = cb(next as Element)
        if (result === false) {
          break
        }
      } else if (isComment(next)) {
        // Handle nested fragments
        // 处理嵌套片段
        if (next.data === ']') {
          if (--depth === 0) break
        } else if (next.data === '[') {
          depth++
        }
      }
      next = next.nextSibling
    }
  } else {
    cb(node as Element)
  }
}
