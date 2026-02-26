import { NOOP, hyphenate, isArray, isFunction } from '@vue/shared'
import {
  type ComponentInternalInstance,
  ErrorCodes,
  callWithAsyncErrorHandling,
  warn,
} from '@vue/runtime-core'

interface Invoker extends EventListener {
  value: EventValue
  attached: number
}

type EventValue = Function | Function[]

// 简单的 addEventListener 封装
export function addEventListener(
  el: Element,
  event: string,
  handler: EventListener,
  options?: EventListenerOptions,
): void {
  el.addEventListener(event, handler, options)
}

// 简单的 removeEventListener 封装
export function removeEventListener(
  el: Element,
  event: string,
  handler: EventListener,
  options?: EventListenerOptions,
): void {
  el.removeEventListener(event, handler, options)
}

// 使用 Symbol 创建一个唯一的 key，用于在元素上存储事件 invoker
const veiKey: unique symbol = Symbol('_vei')

// 核心函数：用于更新 DOM 元素的事件监听器
export function patchEvent(
  el: Element & { [veiKey]?: Record<string, Invoker | undefined> },
  rawName: string,
  prevValue: EventValue | null,
  nextValue: EventValue | unknown,
  instance: ComponentInternalInstance | null = null,
): void {
  // vei = vue event invokers
  // 获取或初始化该元素上的 invokers 对象
  const invokers = el[veiKey] || (el[veiKey] = {})
  // 尝试获取已存在的 invoker
  const existingInvoker = invokers[rawName]
  if (nextValue && existingInvoker) {
    // patch
    // 如果有新值且已有 invoker，直接更新 invoker.value，无需重新绑定 DOM 事件
    existingInvoker.value = __DEV__
      ? sanitizeEventValue(nextValue, rawName)
      : (nextValue as EventValue)
  } else {
    const [name, options] = parseName(rawName)
    if (nextValue) {
      // add
      // 如果有新值但没有 invoker，创建一个新的 invoker 并绑定 DOM 事件
      const invoker = (invokers[rawName] = createInvoker(
        __DEV__
          ? sanitizeEventValue(nextValue, rawName)
          : (nextValue as EventValue),
        instance,
      ))
      addEventListener(el, name, invoker, options)
    } else if (existingInvoker) {
      // remove
      // 如果没有新值但有旧 invoker，说明需要移除事件监听
      removeEventListener(el, name, existingInvoker, options)
      invokers[rawName] = undefined
    }
  }
}

// 匹配事件修饰符的正则：Once, Passive, Capture
const optionsModifierRE = /(?:Once|Passive|Capture)$/

// 解析事件名称，提取修饰符
function parseName(name: string): [string, EventListenerOptions | undefined] {
  let options: EventListenerOptions | undefined
  if (optionsModifierRE.test(name)) {
    options = {}
    let m
    while ((m = name.match(optionsModifierRE))) {
      name = name.slice(0, name.length - m[0].length)
      // 将修饰符转换为小写并存入 options 对象
      ;(options as any)[m[0].toLowerCase()] = true
    }
  }
  // 处理事件名，例如 onClick -> click
  const event = name[2] === ':' ? name.slice(3) : hyphenate(name.slice(2))
  return [event, options]
}

// To avoid the overhead of repeatedly calling Date.now(), we cache
// and use the same timestamp for all event listeners attached in the same tick.
// 为了避免重复调用 Date.now() 的开销，我们缓存并在同一 tick 中附加的所有事件监听器使用相同的时间戳。
let cachedNow: number = 0
const p = /*@__PURE__*/ Promise.resolve()
const getNow = () =>
  cachedNow || (p.then(() => (cachedNow = 0)), (cachedNow = Date.now()))

// 创建事件 invoker
function createInvoker(
  initialValue: EventValue,
  instance: ComponentInternalInstance | null,
) {
  const invoker: Invoker = (e: Event & { _vts?: number }) => {
    // async edge case vuejs/vue#6566
    // inner click event triggers patch, event handler
    // attached to outer element during patch, and triggered again. This
    // happens because browsers fire microtask ticks between event propagation.
    // this no longer happens for templates in Vue 3, but could still be
    // theoretically possible for hand-written render functions.
    // the solution: we save the timestamp when a handler is attached,
    // and also attach the timestamp to any event that was handled by vue
    // for the first time (to avoid inconsistent event timestamp implementations
    // or events fired from iframes, e.g. #2513)
    // The handler would only fire if the event passed to it was fired
    // AFTER it was attached.
    // 异步边缘情况 vuejs/vue#6566
    // 内部点击事件触发 patch，事件处理程序在 patch 期间附加到外部元素，并再次触发。
    // 发生这种情况是因为浏览器在事件传播之间触发微任务 tick。
    // 这在 Vue 3 的模板中不再发生，但在手写渲染函数中理论上仍然可能发生。
    // 解决方案：我们在附加处理程序时保存时间戳，并将时间戳附加到由 vue 首次处理的任何事件上
    // （以避免不一致的事件时间戳实现或从 iframe 触发的事件，例如 #2513）
    // 只有当传递给它的事件在它被附加之后触发时，处理程序才会触发。
    if (!e._vts) {
      e._vts = Date.now()
    } else if (e._vts <= invoker.attached) {
      return
    }
    // 使用 callWithAsyncErrorHandling 执行事件处理程序，捕获可能的错误
    callWithAsyncErrorHandling(
      patchStopImmediatePropagation(e, invoker.value),
      instance,
      ErrorCodes.NATIVE_EVENT_HANDLER,
      [e],
    )
  }
  invoker.value = initialValue
  invoker.attached = getNow()
  return invoker
}

// 开发环境下检查事件值的类型
function sanitizeEventValue(value: unknown, propName: string): EventValue {
  if (isFunction(value) || isArray(value)) {
    return value as EventValue
  }
  warn(
    `Wrong type passed as event handler to ${propName} - did you forget @ or : ` +
      `in front of your prop?\nExpected function or array of functions, received type ${typeof value}.`,
  )
  return NOOP
}

// 处理 stopImmediatePropagation，用于数组类型的 handler
function patchStopImmediatePropagation(
  e: Event,
  value: EventValue,
): EventValue {
  if (isArray(value)) {
    const originalStop = e.stopImmediatePropagation
    e.stopImmediatePropagation = () => {
      originalStop.call(e)
      ;(e as any)._stopped = true
    }
    // 如果是数组，返回一个新的函数数组，每个函数在执行前检查是否已停止传播
    return (value as Function[]).map(
      fn => (e: Event) => !(e as any)._stopped && fn && fn(e),
    )
  } else {
    return value
  }
}
