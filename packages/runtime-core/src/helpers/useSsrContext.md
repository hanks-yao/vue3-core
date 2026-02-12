# useSSRContext 逻辑总结

`packages/runtime-core/src/helpers/useSsrContext.ts` 文件主要提供了在组件中获取服务端渲染（SSR）上下文的工具函数。

## 核心导出

### `ssrContextKey`
- **类型**: `unique symbol`
- **值**: `Symbol.for('v-scx')`
- **作用**: 作为一个唯一的键，用于在 Vue 的依赖注入系统（Provide/Inject）中存储和检索 SSR 上下文对象。

### `useSSRContext`
- **类型**: `<T = Record<string, any>>(): T | undefined`
- **作用**: 允许在 `setup()` 或其他组合式 API 中获取当前的 SSR 上下文。

## 逻辑流程

1.  **环境检查**:
    -   首先检查是否处于 **非全局构建** 环境 (`!__GLOBAL__`)。这通常意味着是在使用构建工具（如 Webpack, Vite）的项目中，这是 SSR 的典型场景。
    -   如果是 **全局构建** 环境（如直接在 HTML 中引入 Vue 的 script 标签），则不支持 SSR 上下文获取。

2.  **获取上下文 (非全局构建)**:
    -   调用 `inject(ssrContextKey)` 尝试从当前的组件实例或其父级链中注入 SSR 上下文。
    -   **结果检查**:
        -   如果成功获取到 `ctx`，直接返回。
        -   如果未获取到 `ctx`（`!ctx`），且处于 **开发模式** (`__DEV__`)，则发出警告：提示用户未提供 SSR 上下文，并建议仅在服务器端构建中有条件地调用此函数。

3.  **错误处理 (全局构建)**:
    -   如果处于全局构建环境且在开发模式下，直接发出警告：`useSSRContext()` 不支持在全局构建中使用。

## 使用场景

-   **服务端数据预取**: 在 SSR 期间，组件可能需要访问请求对象（`req`）或响应对象（`res`）来读取 Cookie、设置头部等。
-   **状态注入**: 将服务端获取的数据或状态注入到渲染上下文中，以便在客户端激活（Hydration）时使用。
-   **样式收集**: CSS-in-JS 库可能会利用此上下文来收集渲染过程中生成的样式。
