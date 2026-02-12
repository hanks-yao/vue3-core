import { isArray } from '@vue/shared'
import type { ComponentInternalInstance } from '../component'
import { ErrorCodes, callWithAsyncErrorHandling } from '../errorHandling'
import { DeprecationTypes, assertCompatEnabled } from './compatConfig'
import type { ComponentPublicInstance } from '../componentPublicInstance'

interface EventRegistry {
  [event: string]: Function[] | undefined
}

// Map to store event registries for each component instance
// 用于存储每个组件实例的事件注册表的 Map
const eventRegistryMap = /*@__PURE__*/ new WeakMap<
  ComponentInternalInstance,
  EventRegistry
>()

/**
 * Get the event registry for a component instance.
 * 获取组件实例的事件注册表。
 *
 * @param instance - The component instance. 组件实例。
 * @returns The event registry. 事件注册表。
 */
export function getRegistry(
  instance: ComponentInternalInstance,
): EventRegistry {
  let events = eventRegistryMap.get(instance)
  if (!events) {
    // If no registry exists, create a new one and store it
    // 如果注册表不存在，创建一个新的并存储
    eventRegistryMap.set(instance, (events = Object.create(null)))
  }
  return events!
}

/**
 * Register an event listener on the instance.
 * 在实例上注册事件监听器。
 *
 * @param instance - The component instance. 组件实例。
 * @param event - The event name or array of event names. 事件名称或事件名称数组。
 * @param fn - The callback function. 回调函数。
 * @returns The component proxy. 组件代理。
 */
export function on(
  instance: ComponentInternalInstance,
  event: string | string[],
  fn: Function,
): ComponentPublicInstance | null {
  if (isArray(event)) {
    // Handle array of events recursively
    // 递归处理事件数组
    event.forEach(e => on(instance, e, fn))
  } else {
    // Check for compatibility mode for hooks or standard events
    // 检查钩子或标准事件的兼容模式
    if (event.startsWith('hook:')) {
      assertCompatEnabled(
        DeprecationTypes.INSTANCE_EVENT_HOOKS,
        instance,
        event,
      )
    } else {
      assertCompatEnabled(DeprecationTypes.INSTANCE_EVENT_EMITTER, instance)
    }
    const events = getRegistry(instance)
    // Add the callback to the event's list
    // 将回调添加到事件列表中
    ;(events[event] || (events[event] = [])).push(fn)
  }
  return instance.proxy
}

/**
 * Register a one-time event listener on the instance.
 * 在实例上注册一次性事件监听器。
 *
 * @param instance - The component instance. 组件实例。
 * @param event - The event name. 事件名称。
 * @param fn - The callback function. 回调函数。
 * @returns The component proxy. 组件代理。
 */
export function once(
  instance: ComponentInternalInstance,
  event: string,
  fn: Function,
): ComponentPublicInstance | null {
  // Wrap the function to off itself after execution
  // 包装函数，以便在执行后注销自身
  const wrapped = (...args: any[]) => {
    off(instance, event, wrapped)
    fn.apply(instance.proxy, args)
  }
  // Store the original function for removal comparison
  // 存储原始函数用于移除时的比较
  wrapped.fn = fn
  on(instance, event, wrapped)
  return instance.proxy
}

/**
 * Remove event listener(s) from the instance.
 * 从实例中移除事件监听器。
 *
 * @param instance - The component instance. 组件实例。
 * @param event - The event name(s) to remove. Optional. 要移除的事件名称。可选。
 * @param fn - The specific callback to remove. Optional. 要移除的特定回调。可选。
 * @returns The component proxy. 组件代理。
 */
export function off(
  instance: ComponentInternalInstance,
  event?: string | string[],
  fn?: Function,
): ComponentPublicInstance | null {
  assertCompatEnabled(DeprecationTypes.INSTANCE_EVENT_EMITTER, instance)
  const vm = instance.proxy
  // all
  // 如果没有提供参数，移除所有事件监听器
  if (!event) {
    eventRegistryMap.set(instance, Object.create(null))
    return vm
  }
  // array of events
  // 处理事件数组
  if (isArray(event)) {
    event.forEach(e => off(instance, e, fn))
    return vm
  }
  // specific event
  // 处理特定事件
  const events = getRegistry(instance)
  const cbs = events[event!]
  if (!cbs) {
    return vm
  }
  // If no callback is provided, remove all listeners for the event
  // 如果没有提供回调，移除该事件的所有监听器
  if (!fn) {
    events[event!] = undefined
    return vm
  }
  // Remove the specific callback (handling wrapped 'once' functions)
  // 移除特定的回调（处理包装过的 'once' 函数）
  events[event!] = cbs.filter(cb => !(cb === fn || (cb as any).fn === fn))
  return vm
}

/**
 * Trigger an event on the instance.
 * 在实例上触发事件。
 *
 * @param instance - The component instance. 组件实例。
 * @param event - The event name. 事件名称。
 * @param args - The arguments to pass to the callback. 传递给回调的参数。
 * @returns The component proxy. 组件代理。
 */
export function emit(
  instance: ComponentInternalInstance,
  event: string,
  args: any[],
): ComponentPublicInstance | null {
  const cbs = getRegistry(instance)[event]
  if (cbs) {
    // Execute callbacks with error handling
    // 使用错误处理机制执行回调
    callWithAsyncErrorHandling(
      cbs.map(cb => cb.bind(instance.proxy)),
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args,
    )
  }
  return instance.proxy
}
