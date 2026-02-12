import { isFunction } from '@vue/shared'
import { currentInstance, getCurrentInstance } from './component'
import { currentApp } from './apiCreateApp'
import { warn } from './warning'

interface InjectionConstraint<T> {}

export type InjectionKey<T> = symbol & InjectionConstraint<T>

export function provide<T, K = InjectionKey<T> | string | number>(
  key: K,
  value: K extends InjectionKey<infer V> ? V : T,
): void {
  if (__DEV__) {
    if (!currentInstance || currentInstance.isMounted) {
      warn(`provide() can only be used inside setup().`)
    }
  }
  if (currentInstance) {
    let provides = currentInstance.provides
    // by default an instance inherits its parent's provides object
    // but when it needs to provide values of its own, it creates its
    // own provides object using parent provides object as prototype.
    // this way in `inject` we can simply look up injections from direct
    // parent and let the prototype chain do the work.
    // 默认情况下，实例继承其父级的 provides 对象
    // 但当它需要提供自己的值时，它会使用父级 provides 对象作为原型
    // 创建自己的 provides 对象。
    // 这样在 `inject` 中，我们可以简单地从直接父级查找注入，
    // 并让原型链完成工作。
    const parentProvides =
      currentInstance.parent && currentInstance.parent.provides
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides)
    }
    // TS doesn't allow symbol as index type
    // TS 不允许 symbol 作为索引类型
    provides[key as string] = value
  }
}

export function inject<T>(key: InjectionKey<T> | string): T | undefined
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: T,
  treatDefaultAsFactory?: false,
): T
export function inject<T>(
  key: InjectionKey<T> | string,
  defaultValue: T | (() => T),
  treatDefaultAsFactory: true,
): T
export function inject(
  key: InjectionKey<any> | string,
  defaultValue?: unknown,
  treatDefaultAsFactory = false,
) {
  // fallback to `currentRenderingInstance` so that this can be called in
  // a functional component
  // 回退到 `currentRenderingInstance`，以便可以在函数式组件中调用此函数
  const instance = getCurrentInstance()

  // also support looking up from app-level provides w/ `app.runWithContext()`
  // 也支持通过 `app.runWithContext()` 从应用级 provides 查找
  if (instance || currentApp) {
    // #2400
    // to support `app.use` plugins,
    // fallback to appContext's `provides` if the instance is at root
    // #11488, in a nested createApp, prioritize using the provides from currentApp
    // #13212, for custom elements we must get injected values from its appContext
    // as it already inherits the provides object from the parent element
    // #2400
    // 为了支持 `app.use` 插件，
    // 如果实例在根目录，则回退到 appContext 的 `provides`
    // #11488, 在嵌套的 createApp 中，优先使用来自 currentApp 的 provides
    // #13212, 对于自定义元素，我们必须从其 appContext 获取注入的值
    // 因为它已经从父元素继承了 provides 对象
    let provides = currentApp
      ? currentApp._context.provides
      : instance
        ? instance.parent == null || instance.ce
          ? instance.vnode.appContext && instance.vnode.appContext.provides
          : instance.parent.provides
        : undefined

    if (provides && (key as string | symbol) in provides) {
      // TS doesn't allow symbol as index type
      return provides[key as string]
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction(defaultValue)
        ? defaultValue.call(instance && instance.proxy)
        : defaultValue
    } else if (__DEV__) {
      warn(`injection "${String(key)}" not found.`)
    }
  } else if (__DEV__) {
    warn(`inject() can only be used inside setup() or functional components.`)
  }
}

/**
 * Returns true if `inject()` can be used without warning about being called in the wrong place (e.g. outside of
 * setup()). This is used by libraries that want to use `inject()` internally without triggering a warning to the end
 * user. One example is `useRoute()` in `vue-router`.
 *
 * 如果可以使用 `inject()` 而不会发出关于在错误位置调用的警告（例如在 setup() 之外），则返回 true。
 * 这由希望在内部使用 `inject()` 而不触发对最终用户的警告的库使用。
 * 一个例子是 `vue-router` 中的 `useRoute()`。
 */
export function hasInjectionContext(): boolean {
  return !!(getCurrentInstance() || currentApp)
}
