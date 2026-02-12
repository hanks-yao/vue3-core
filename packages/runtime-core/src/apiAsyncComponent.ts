import {
  type Component,
  type ComponentInternalInstance,
  type ComponentOptions,
  type ConcreteComponent,
  currentInstance,
  getComponentName,
  isInSSRComponentSetup,
} from './component'
import { isFunction, isObject } from '@vue/shared'
import type { ComponentPublicInstance } from './componentPublicInstance'
import { type VNode, createVNode } from './vnode'
import { defineComponent } from './apiDefineComponent'
import { warn } from './warning'
import { ref } from '@vue/reactivity'
import { ErrorCodes, handleError } from './errorHandling'
import { isKeepAlive } from './components/KeepAlive'
import { markAsyncBoundary } from './helpers/useId'
import { type HydrationStrategy, forEachElement } from './hydrationStrategies'

export type AsyncComponentResolveResult<T = Component> = T | { default: T } // es modules
// es 模块

export type AsyncComponentLoader<T = any> = () => Promise<
  AsyncComponentResolveResult<T>
>

export interface AsyncComponentOptions<T = any> {
  loader: AsyncComponentLoader<T>
  loadingComponent?: Component
  errorComponent?: Component
  delay?: number
  timeout?: number
  suspensible?: boolean
  hydrate?: HydrationStrategy
  onError?: (
    error: Error,
    retry: () => void,
    fail: () => void,
    attempts: number,
  ) => any
}

export const isAsyncWrapper = (i: ComponentInternalInstance | VNode): boolean =>
  !!(i.type as ComponentOptions).__asyncLoader

/*@__NO_SIDE_EFFECTS__*/
export function defineAsyncComponent<
  T extends Component = { new (): ComponentPublicInstance },
>(source: AsyncComponentLoader<T> | AsyncComponentOptions<T>): T {
  // 规范化参数，如果传入的是函数，则将其作为 loader 属性
  if (isFunction(source)) {
    source = { loader: source }
  }

  const {
    loader,
    loadingComponent,
    errorComponent,
    delay = 200,
    hydrate: hydrateStrategy,
    timeout, // undefined = never times out
    // undefined = 永不超时
    suspensible = true,
    onError: userOnError,
  } = source

  let pendingRequest: Promise<ConcreteComponent> | null = null
  let resolvedComp: ConcreteComponent | undefined

  let retries = 0
  const retry = () => {
    retries++
    pendingRequest = null
    return load()
  }

  const load = (): Promise<ConcreteComponent> => {
    let thisRequest: Promise<ConcreteComponent>
    return (
      // 如果有正在进行的请求，直接返回
      pendingRequest ||
      (thisRequest = pendingRequest =
        loader()
          .catch(err => {
            err = err instanceof Error ? err : new Error(String(err))
            if (userOnError) {
              return new Promise((resolve, reject) => {
                const userRetry = () => resolve(retry())
                const userFail = () => reject(err)
                userOnError(err, userRetry, userFail, retries + 1)
              })
            } else {
              throw err
            }
          })
          .then((comp: any) => {
            if (thisRequest !== pendingRequest && pendingRequest) {
              return pendingRequest
            }
            if (__DEV__ && !comp) {
              warn(
                `Async component loader resolved to undefined. ` +
                  `If you are using retry(), make sure to return its return value.`,
              )
            }
            // interop module default
            // 处理模块默认导出
            if (
              comp &&
              (comp.__esModule || comp[Symbol.toStringTag] === 'Module')
            ) {
              comp = comp.default
            }
            if (__DEV__ && comp && !isObject(comp) && !isFunction(comp)) {
              throw new Error(`Invalid async component load result: ${comp}`)
            }
            resolvedComp = comp
            return comp
          }))
    )
  }

  return defineComponent({
    name: 'AsyncComponentWrapper',

    __asyncLoader: load,

    __asyncHydrate(el, instance, hydrate) {
      let patched = false
      ;(instance.bu || (instance.bu = [])).push(() => (patched = true))
      const performHydrate = () => {
        // skip hydration if the component has been patched
        // 如果组件已被修补，则跳过水合
        if (patched) {
          if (__DEV__) {
            warn(
              `Skipping lazy hydration for component '${getComponentName(resolvedComp!) || resolvedComp!.__file}': ` +
                `it was updated before lazy hydration performed.`,
            )
          }
          return
        }
        hydrate()
      }
      const doHydrate = hydrateStrategy
        ? () => {
            const teardown = hydrateStrategy(performHydrate, cb =>
              forEachElement(el, cb),
            )
            if (teardown) {
              ;(instance.bum || (instance.bum = [])).push(teardown)
            }
          }
        : performHydrate
      if (resolvedComp) {
        doHydrate()
      } else {
        load().then(() => !instance.isUnmounted && doHydrate())
      }
    },

    get __asyncResolved() {
      return resolvedComp
    },

    setup() {
      const instance = currentInstance!
      markAsyncBoundary(instance)

      // already resolved
      // 已经解析
      if (resolvedComp) {
        return () => createInnerComp(resolvedComp!, instance)
      }

      const onError = (err: Error) => {
        pendingRequest = null
        handleError(
          err,
          instance,
          ErrorCodes.ASYNC_COMPONENT_LOADER,
          !errorComponent /* 如果用户提供了错误组件，则在开发环境中不抛出错误 */,
        )
      }

      // suspense-controlled or SSR.
      // suspense 控制或 SSR。
      if (
        (__FEATURE_SUSPENSE__ && suspensible && instance.suspense) ||
        (__SSR__ && isInSSRComponentSetup)
      ) {
        return load()
          .then(comp => {
            return () => createInnerComp(comp, instance)
          })
          .catch(err => {
            onError(err)
            return () =>
              errorComponent
                ? createVNode(errorComponent as ConcreteComponent, {
                    error: err,
                  })
                : null
          })
      }

      // 普通异步组件逻辑（非 Suspense/SSR）
      const loaded = ref(false)
      const error = ref()
      const delayed = ref(!!delay)

      if (delay) {
        setTimeout(() => {
          delayed.value = false
        }, delay)
      }

      if (timeout != null) {
        setTimeout(() => {
          if (!loaded.value && !error.value) {
            const err = new Error(
              `Async component timed out after ${timeout}ms.`,
            )
            onError(err)
            error.value = err
          }
        }, timeout)
      }

      load()
        .then(() => {
          loaded.value = true
          if (instance.parent && isKeepAlive(instance.parent.vnode)) {
            // parent is keep-alive, force update so the loaded component's
            // name is taken into account
            // 父组件是 keep-alive，强制更新以便考虑加载组件的名称
            instance.parent.update()
          }
        })
        .catch(err => {
          onError(err)
          error.value = err
        })

      return () => {
        if (loaded.value && resolvedComp) {
          return createInnerComp(resolvedComp, instance)
        } else if (error.value && errorComponent) {
          return createVNode(errorComponent, {
            error: error.value,
          })
        } else if (loadingComponent && !delayed.value) {
          return createInnerComp(
            loadingComponent as ConcreteComponent,
            instance,
          )
        }
      }
    },
  }) as T
}

function createInnerComp(
  comp: ConcreteComponent,
  parent: ComponentInternalInstance,
) {
  const { ref, props, children, ce } = parent.vnode
  const vnode = createVNode(comp, props, children)
  // ensure inner component inherits the async wrapper's ref owner
  // 确保内部组件继承异步包装器的 ref 所有者
  vnode.ref = ref
  // pass the custom element callback on to the inner comp
  // and remove it from the async wrapper
  // 将自定义元素回调传递给内部组件，并从异步包装器中移除它
  vnode.ce = ce
  delete parent.vnode.ce

  return vnode
}
