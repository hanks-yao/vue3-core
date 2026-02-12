# App API 核心逻辑

`apiCreateApp.ts` 实现了 Vue 3 的应用实例创建 API，即 `createApp`。它是 Vue 应用的入口点，负责配置应用上下文、注册插件、组件和指令，以及挂载应用。

## 核心接口

### `App`
应用实例接口，提供了以下方法和属性：
- **`mount(rootContainer)`**: 将应用挂载到容器上。
- **`unmount()`**: 卸载应用。
- **`use(plugin)`**: 安装插件。
- **`mixin(mixin)`**: 全局混入（仅 Options API）。
- **`component(name, component)`**: 注册全局组件。
- **`directive(name, directive)`**: 注册全局指令。
- **`provide(key, value)`**: 全局依赖注入。
- **`config`**: 应用配置对象（`errorHandler`, `globalProperties` 等）。
- **`version`**: Vue 版本号。

### `AppContext`
应用上下文对象，存储了应用的全局状态：
- **`app`**: 指向应用实例。
- **`config`**: 应用配置。
- **`mixins`**: 全局混入列表。
- **`components`**: 全局组件注册表。
- **`directives`**: 全局指令注册表。
- **`provides`**: 全局提供的依赖。

## 核心函数

### `createAppAPI(render, hydrate)`
这是一个工厂函数，用于创建 `createApp` 函数。它接收渲染器 (`render`) 和可选的 hydration 函数 (`hydrate`) 作为参数。这使得 `createApp` 可以与特定的渲染器（如 DOM 渲染器）解耦。

### `createApp(rootComponent, rootProps)`
实际创建应用实例的函数。
1.  **参数处理**: 验证根组件和根属性。
2.  **创建上下文**: 调用 `createAppContext()` 初始化应用上下文。
3.  **创建 App 对象**: 构建并返回 `App` 对象，实现上述接口方法。
4.  **`mount` 实现**:
    - 检查是否已挂载。
    - 创建根组件的 VNode (`createVNode`)。
    - 将应用上下文 (`context`) 赋值给根 VNode。
    - 调用渲染器 (`render` 或 `hydrate`) 将 VNode 渲染到 `rootContainer`。
    - 初始化 DevTools。
    - 返回根组件的公开实例。

## 插件机制
`app.use(plugin)` 支持两种形式的插件：
- **对象形式**: 必须包含 `install` 方法。
- **函数形式**: 函数本身即为安装方法。
插件安装时会接收 `app` 实例作为第一个参数。

## 依赖注入
`app.provide` 将值存储在 `context.provides` 对象中。组件在创建时，其 `provides` 对象会继承自父组件（如果是根组件，则继承自 `appContext.provides`），从而实现跨层级的依赖注入。
