import {
  type ComponentInternalInstance,
  currentInstance,
  isInSSRComponentSetup,
  setCurrentInstance,
} from './component'
import type { ComponentPublicInstance } from './componentPublicInstance'
import { ErrorTypeStrings, callWithAsyncErrorHandling } from './errorHandling'
import { warn } from './warning'
import { toHandlerKey } from '@vue/shared'
import {
  type DebuggerEvent,
  pauseTracking,
  resetTracking,
} from '@vue/reactivity'
import { LifecycleHooks } from './enums'

export { onActivated, onDeactivated } from './components/KeepAlive'

export function injectHook(
  type: LifecycleHooks,
  hook: Function & { __weh?: Function },
  target: ComponentInternalInstance | null = currentInstance,
  prepend: boolean = false,
): Function | undefined {
  if (target) {
    const hooks = target[type] || (target[type] = [])
    // cache the error handling wrapper for injected hooks so the same hook
    // can be properly deduped by the scheduler. "__weh" stands for "with error
    // handling".
    // 缓存注入钩子的错误处理包装器，以便调度程序可以正确地对同一个钩子进行去重。
    // "__weh" 代表 "with error handling"（带有错误处理）。
    const wrappedHook =
      hook.__weh ||
      (hook.__weh = (...args: unknown[]) => {
        // disable tracking inside all lifecycle hooks
        // since they can potentially be called inside effects.
        // 在所有生命周期钩子内部禁用跟踪，
        // 因为它们可能会在 effect 内部被调用。
        pauseTracking()
        // Set currentInstance during hook invocation.
        // This assumes the hook does not synchronously trigger other hooks, which
        // can only be false when the user does something really funky.
        // 在钩子调用期间设置 currentInstance。
        // 这假设钩子不会同步触发其他钩子，只有当用户做了一些非常奇怪的事情时，这才会是假的。
        const reset = setCurrentInstance(target)
        const res = callWithAsyncErrorHandling(hook, target, type, args)
        reset()
        resetTracking()
        return res
      })
    if (prepend) {
      hooks.unshift(wrappedHook)
    } else {
      hooks.push(wrappedHook)
    }
    return wrappedHook
  } else if (__DEV__) {
    const apiName = toHandlerKey(ErrorTypeStrings[type].replace(/ hook$/, ''))
    warn(
      `${apiName} is called when there is no active component instance to be ` +
        `associated with. ` +
        `Lifecycle injection APIs can only be used during execution of setup().` +
        (__FEATURE_SUSPENSE__
          ? ` If you are using async setup(), make sure to register lifecycle ` +
            `hooks before the first await statement.`
          : ``),
    )
  }
}

const createHook =
  <T extends Function = () => any>(lifecycle: LifecycleHooks) =>
  (
    hook: T,
    target: ComponentInternalInstance | null = currentInstance,
  ): void => {
    // post-create lifecycle registrations are noops during SSR (except for serverPrefetch)
    // 在 SSR 期间，post-create 生命周期注册是无操作的（serverPrefetch 除外）
    if (
      !isInSSRComponentSetup ||
      lifecycle === LifecycleHooks.SERVER_PREFETCH
    ) {
      injectHook(lifecycle, (...args: unknown[]) => hook(...args), target)
    }
  }
type CreateHook<T = any> = (
  hook: T,
  target?: ComponentInternalInstance | null,
) => void

export const onBeforeMount: CreateHook = createHook(LifecycleHooks.BEFORE_MOUNT)
export const onMounted: CreateHook = createHook(LifecycleHooks.MOUNTED)
export const onBeforeUpdate: CreateHook = createHook(
  LifecycleHooks.BEFORE_UPDATE,
)
export const onUpdated: CreateHook = createHook(LifecycleHooks.UPDATED)
export const onBeforeUnmount: CreateHook = createHook(
  LifecycleHooks.BEFORE_UNMOUNT,
)
export const onUnmounted: CreateHook = createHook(LifecycleHooks.UNMOUNTED)
export const onServerPrefetch: CreateHook = createHook(
  LifecycleHooks.SERVER_PREFETCH,
)

export type DebuggerHook = (e: DebuggerEvent) => void
export const onRenderTriggered: CreateHook<DebuggerHook> =
  createHook<DebuggerHook>(LifecycleHooks.RENDER_TRIGGERED)
export const onRenderTracked: CreateHook<DebuggerHook> =
  createHook<DebuggerHook>(LifecycleHooks.RENDER_TRACKED)

export type ErrorCapturedHook<TError = unknown> = (
  err: TError,
  instance: ComponentPublicInstance | null,
  info: string,
) => boolean | void

export function onErrorCaptured<TError = Error>(
  hook: ErrorCapturedHook<TError>,
  target: ComponentInternalInstance | null = currentInstance,
): void {
  injectHook(LifecycleHooks.ERROR_CAPTURED, hook, target)
}
