/* eslint-disable no-restricted-globals */
import type { App } from './apiCreateApp'
import { Comment, Fragment, Static, Text } from './vnode'
import type { ComponentInternalInstance } from './component'

interface AppRecord {
  id: number
  app: App
  version: string
  types: Record<string, string | Symbol>
}

// Devtools 钩子事件枚举
// Enum for Devtools hook events
enum DevtoolsHooks {
  APP_INIT = 'app:init',
  APP_UNMOUNT = 'app:unmount',
  COMPONENT_UPDATED = 'component:updated',
  COMPONENT_ADDED = 'component:added',
  COMPONENT_REMOVED = 'component:removed',
  COMPONENT_EMIT = 'component:emit',
  PERFORMANCE_START = 'perf:start',
  PERFORMANCE_END = 'perf:end',
}

export interface DevtoolsHook {
  enabled?: boolean
  emit: (event: string, ...payload: any[]) => void
  on: (event: string, handler: Function) => void
  once: (event: string, handler: Function) => void
  off: (event: string, handler: Function) => void
  appRecords: AppRecord[]
  /**
   * Added at https://github.com/vuejs/devtools/commit/f2ad51eea789006ab66942e5a27c0f0986a257f9
   * Returns whether the arg was buffered or not
   * 添加于 https://github.com/vuejs/devtools/commit/f2ad51eea789006ab66942e5a27c0f0986a257f9
   * 返回参数是否被缓冲
   */
  cleanupBuffer?: (matchArg: unknown) => boolean
}

export let devtools: DevtoolsHook

// 缓冲事件队列，用于在 devtools 钩子注入前存储事件
// Buffer for events, used to store events before the devtools hook is injected
let buffer: { event: string; args: any[] }[] = []

let devtoolsNotInstalled = false

function emit(event: string, ...args: any[]) {
  if (devtools) {
    devtools.emit(event, ...args)
  } else if (!devtoolsNotInstalled) {
    buffer.push({ event, args })
  }
}

export function setDevtoolsHook(hook: DevtoolsHook, target: any): void {
  devtools = hook
  if (devtools) {
    devtools.enabled = true
    // 重放缓冲的事件
    // Replay buffered events
    buffer.forEach(({ event, args }) => devtools.emit(event, ...args))
    buffer = []
  } else if (
    // handle late devtools injection - only do this if we are in an actual
    // browser environment to avoid the timer handle stalling test runner exit
    // (#4815)
    // 处理延迟的 devtools 注入 - 仅在实际的浏览器环境中执行此操作，
    // 以避免定时器句柄阻碍测试运行器退出 (#4815)
    typeof window !== 'undefined' &&
    // some envs mock window but not fully
    // 某些环境模拟了 window 但不完整
    window.HTMLElement &&
    // also exclude jsdom
    // 同时也排除 jsdom
    // eslint-disable-next-line no-restricted-syntax
    !window.navigator?.userAgent?.includes('jsdom')
  ) {
    const replay = (target.__VUE_DEVTOOLS_HOOK_REPLAY__ =
      target.__VUE_DEVTOOLS_HOOK_REPLAY__ || [])
    replay.push((newHook: DevtoolsHook) => {
      setDevtoolsHook(newHook, target)
    })
    // clear buffer after 3s - the user probably doesn't have devtools installed
    // at all, and keeping the buffer will cause memory leaks (#4738)
    // 3秒后清除缓冲区 - 用户可能根本没有安装 devtools，
    // 保留缓冲区会导致内存泄漏 (#4738)
    setTimeout(() => {
      if (!devtools) {
        target.__VUE_DEVTOOLS_HOOK_REPLAY__ = null
        devtoolsNotInstalled = true
        buffer = []
      }
    }, 3000)
  } else {
    // non-browser env, assume not installed
    // 非浏览器环境，假设未安装
    devtoolsNotInstalled = true
    buffer = []
  }
}

export function devtoolsInitApp(app: App, version: string): void {
  emit(DevtoolsHooks.APP_INIT, app, version, {
    Fragment,
    Text,
    Comment,
    Static,
  })
}

export function devtoolsUnmountApp(app: App): void {
  emit(DevtoolsHooks.APP_UNMOUNT, app)
}

export const devtoolsComponentAdded: DevtoolsComponentHook =
  /*@__PURE__*/ createDevtoolsComponentHook(DevtoolsHooks.COMPONENT_ADDED)

export const devtoolsComponentUpdated: DevtoolsComponentHook =
  /*@__PURE__*/ createDevtoolsComponentHook(DevtoolsHooks.COMPONENT_UPDATED)

const _devtoolsComponentRemoved = /*@__PURE__*/ createDevtoolsComponentHook(
  DevtoolsHooks.COMPONENT_REMOVED,
)

export const devtoolsComponentRemoved = (
  component: ComponentInternalInstance,
): void => {
  if (
    devtools &&
    typeof devtools.cleanupBuffer === 'function' &&
    // remove the component if it wasn't buffered
    // 如果组件未被缓冲，则移除该组件
    !devtools.cleanupBuffer(component)
  ) {
    _devtoolsComponentRemoved(component)
  }
}

type DevtoolsComponentHook = (component: ComponentInternalInstance) => void

/*@__NO_SIDE_EFFECTS__*/
function createDevtoolsComponentHook(
  hook: DevtoolsHooks,
): DevtoolsComponentHook {
  return (component: ComponentInternalInstance) => {
    emit(
      hook,
      component.appContext.app,
      component.uid,
      component.parent ? component.parent.uid : undefined,
      component,
    )
  }
}

export const devtoolsPerfStart: DevtoolsPerformanceHook =
  /*@__PURE__*/ createDevtoolsPerformanceHook(DevtoolsHooks.PERFORMANCE_START)

export const devtoolsPerfEnd: DevtoolsPerformanceHook =
  /*@__PURE__*/ createDevtoolsPerformanceHook(DevtoolsHooks.PERFORMANCE_END)

type DevtoolsPerformanceHook = (
  component: ComponentInternalInstance,
  type: string,
  time: number,
) => void
function createDevtoolsPerformanceHook(
  hook: DevtoolsHooks,
): DevtoolsPerformanceHook {
  return (component: ComponentInternalInstance, type: string, time: number) => {
    emit(hook, component.appContext.app, component.uid, component, type, time)
  }
}

export function devtoolsComponentEmit(
  component: ComponentInternalInstance,
  event: string,
  params: any[],
): void {
  emit(
    DevtoolsHooks.COMPONENT_EMIT,
    component.appContext.app,
    component,
    event,
    params,
  )
}
