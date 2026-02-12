# Lifecycle API 核心逻辑

`apiLifecycle.ts` 实现了 Vue 3 的组合式 API 生命周期钩子（如 `onMounted`, `onUpdated` 等）。它负责将用户注册的回调函数与当前活动的组件实例关联起来。

## 核心函数

### `injectHook(type, hook, target)`
这是所有生命周期钩子的底层实现函数。
- **参数**:
    - `type`: 生命周期类型（枚举值，如 `BEFORE_MOUNT`, `MOUNTED`）。
    - `hook`: 用户传入的回调函数。
    - `target`: 目标组件实例，默认为 `currentInstance`（当前正在执行 setup 的组件）。
- **逻辑**:
    1.  **获取实例**: 确保有目标组件实例。
    2.  **包装钩子**: 将用户钩子包装在 `wrappedHook` 中。
        - **错误处理**: 使用 `callWithAsyncErrorHandling` 捕获钩子执行中的错误。
        - **上下文管理**: 在钩子执行期间，将 `currentInstance` 设置为目标实例，确保钩子内部能正确访问组件上下文。
        - **暂停追踪**: 在钩子执行期间暂停响应式追踪 (`pauseTracking`)，防止意外的依赖收集。
    3.  **注册**: 将包装后的钩子添加到组件实例对应的生命周期数组中（如 `target.m` 对应 `mounted`）。
    4.  **去重**: 利用 `__weh` (with error handling) 属性缓存包装后的钩子，避免重复包装。

### `createHook(lifecycle)`
工厂函数，用于生成具体的生命周期 API（如 `onMounted`）。
- 它返回一个函数，该函数内部调用 `injectHook`。
- **SSR 处理**: 在 SSR 组件 setup 期间，除了 `serverPrefetch` 外，其他生命周期钩子注册会被忽略（noop）。

## 导出的 API
- **`onBeforeMount`**: 挂载前。
- **`onMounted`**: 挂载后。
- **`onBeforeUpdate`**: 更新前。
- **`onUpdated`**: 更新后。
- **`onBeforeUnmount`**: 卸载前。
- **`onUnmounted`**: 卸载后。
- **`onServerPrefetch`**: 服务端预取（SSR）。
- **`onErrorCaptured`**: 捕获后代组件错误。
- **`onRenderTriggered` / `onRenderTracked`**: 调试钩子，用于追踪响应式依赖。
- **`onActivated` / `onDeactivated`**: KeepAlive 组件激活/停用（从 `components/KeepAlive` 导出）。

## 关键点
- **只能在 `setup()` 中同步调用**: 因为 `injectHook` 依赖 `currentInstance`，而 `currentInstance` 仅在 `setup()` 执行期间设置。如果在 `setup()` 之外或异步回调中调用，将无法关联到组件实例（开发环境下会报警告）。
