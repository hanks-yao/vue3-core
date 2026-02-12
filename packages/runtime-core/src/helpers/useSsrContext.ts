import { inject } from '../apiInject'
import { warn } from '../warning'

// Key for the SSR context injection
// 用于 SSR 上下文注入的 Key
export const ssrContextKey: unique symbol = Symbol.for('v-scx')

// Hook to retrieve the SSR context
// 用于获取 SSR 上下文的 Hook
export const useSSRContext = <T = Record<string, any>>(): T | undefined => {
  // If not in the global build (i.e. bundler build)
  // 如果不在全局构建中（即打包构建）
  if (!__GLOBAL__) {
    // Attempt to inject the context provided by the server renderer
    // 尝试注入服务器渲染器提供的上下文
    const ctx = inject<T>(ssrContextKey)
    if (!ctx) {
      // Warn if context is not found in development mode
      // 如果在开发模式下未找到上下文，则发出警告
      __DEV__ &&
        warn(
          `Server rendering context not provided. Make sure to only call ` +
            `useSSRContext() conditionally in the server build.`,
          // 未提供服务器渲染上下文。请确保仅在服务器构建中有条件地调用 useSSRContext()。
        )
    }
    return ctx
  } else if (__DEV__) {
    // Warn if used in a global build (e.g. via CDN script) where SSR is not supported
    // 如果在不支持 SSR 的全局构建中（例如通过 CDN 脚本）使用，则发出警告
    warn(`useSSRContext() is not supported in the global build.`)
    // useSSRContext() 不支持在全局构建中使用。
  }
}
