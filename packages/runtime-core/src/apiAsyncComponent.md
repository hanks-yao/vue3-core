# apiAsyncComponent.ts 逻辑总结

该文件主要实现了 Vue 3 中的异步组件功能，核心是通过 `defineAsyncComponent` 函数来定义一个异步加载的组件。

## 核心功能：defineAsyncComponent

`defineAsyncComponent` 是一个高阶函数，它接收一个加载器函数或一个配置对象，并返回一个包装组件（Wrapper Component）。

### 1. 参数处理

函数支持两种参数形式：
- **加载器函数**：`() => Promise<Component>`，直接返回一个 Promise。
- **配置对象**：
  - `loader`: 加载器函数。
  - `loadingComponent`: 加载过程中显示的组件。
  - `errorComponent`: 加载失败时显示的组件。
  - `delay`: 显示 `loadingComponent` 的延迟时间（默认 200ms）。
  - `timeout`: 加载超时时间（默认永不超时）。
  - `suspensible`: 是否支持 Suspense（默认 true）。
  - `onError`: 自定义错误处理钩子。

### 2. 加载逻辑 (load 函数)

内部定义了一个 `load` 函数，负责执行 `loader` 并处理结果：
- **缓存请求**：如果已有正在进行的请求 (`pendingRequest`)，则直接返回该请求，避免重复加载。
- **错误重试**：捕获加载错误，如果用户配置了 `onError`，则允许用户决定是否重试 (`retry`) 或失败 (`fail`)。
- **结果处理**：
  - 处理 ES 模块的默认导出 (`default`)。
  - 校验加载结果是否合法。
  - 将结果赋值给 `resolvedComp`。

### 3. 包装组件 (Wrapper Component)

返回的组件是一个特殊的组件，其 `setup` 函数包含主要逻辑：

#### A. 快速返回
如果组件已经解析过 (`resolvedComp` 存在)，直接返回渲染函数，渲染解析出的组件。

#### B. Suspense / SSR 支持
如果启用了 Suspense 且组件支持 (`suspensible: true`)，或者在 SSR 环境下：
- 直接返回 `load()` 的 Promise。
- Suspense 会捕获这个 Promise 并处理等待状态。
- 如果加载失败，渲染 `errorComponent`（如果有）。

#### C. 客户端状态管理 (普通模式)
如果不使用 Suspense，组件内部维护状态：
- `loaded`: 是否加载完成。
- `error`: 是否发生错误。
- `delayed`: 是否处于延迟显示 loading 的阶段。

**逻辑流程**：
1. 启动 `load()`。
2. 设置超时计时器（如果配置了 `timeout`），超时后设置 `error`。
3. 设置延迟计时器（如果配置了 `delay`），延迟结束后更新 `delayed` 状态。
4. `load()` 成功后，设置 `loaded = true`。
5. `load()` 失败后，设置 `error`。

**渲染逻辑**：
返回一个渲染函数，根据当前状态决定渲染内容：
- **加载成功**：渲染 `resolvedComp`。
- **加载失败**：渲染 `errorComponent`（如果有）。
- **加载中**：渲染 `loadingComponent`（如果配置了且不在延迟期内）。

### 4. 辅助功能

- **createInnerComp**: 用于创建内部组件的 VNode，并处理 ref 和自定义元素回调的传递。
- **__asyncHydrate**: 处理异步组件在 SSR 水合（Hydration）过程中的逻辑。
