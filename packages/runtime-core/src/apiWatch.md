# Watch API 核心逻辑

`apiWatch.ts` 实现了 Vue 3 的侦听器 API (`watch`, `watchEffect`)，它是响应式系统与组件生命周期结合的关键部分。

## 核心函数

### `watch(source, cb, options)`
侦听一个或多个响应式数据源，并在数据变化时调用回调函数。
- **重载**: 支持多种参数形式（单源、多源数组、对象）。
- **实现**: 内部调用 `doWatch`。

### `watchEffect(effect, options)`
立即运行一个函数，同时响应式地追踪其依赖，并在依赖更改时重新运行。
- **实现**: 内部调用 `doWatch`，`cb` 为 `null`。

### `doWatch(source, cb, options)`
侦听器的通用实现逻辑。
1.  **参数处理**: 解析 `immediate`, `deep`, `flush` 等选项。
2.  **创建 Job**:
    - 根据 `flush` 选项（`pre`, `post`, `sync`）决定调度行为。
    - 默认 `pre`（组件更新前执行）：将任务放入调度器队列。
    - `post`（组件更新后执行）：使用 `queuePostRenderEffect`。
    - `sync`（同步执行）：直接执行。
3.  **创建 Effect**: 调用 `@vue/reactivity` 的 `baseWatch` 创建底层的响应式 effect。
4.  **生命周期绑定**:
    - 如果在组件 `setup` 中调用，侦听器会自动绑定到当前组件实例。
    - 组件卸载时，侦听器会自动停止。
5.  **SSR 处理**: 在 SSR 模式下，如果是同步或立即执行的侦听器，会执行一次；否则返回空句柄。

### `instanceWatch(source, value, options)`
Vue 2 风格的 `$watch` 实例方法的实现。
- 将 `this` 上下文绑定到组件代理。
- 支持字符串路径（如 `'a.b.c'`）作为数据源。

## 调度选项 (`flush`)
- **`pre` (默认)**: 在组件更新之前调用。此时访问 DOM 是更新前的状态。
- **`post`**: 在组件更新之后调用。此时可以访问更新后的 DOM。
- **`sync`**: 强制同步调用。效率较低，应少用。

## 关键点
- **递归触发**: 侦听器回调中修改自身依赖的数据可能导致无限循环。调度器通过 `ALLOW_RECURSE` 标志允许受控的递归。
- **清理**: `watch` 返回一个停止函数，用于手动停止侦听。
