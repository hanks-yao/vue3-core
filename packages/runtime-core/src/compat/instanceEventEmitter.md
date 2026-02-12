# Instance Event Emitter (实例事件发射器) 逻辑总结

该文件 (`packages/runtime-core/src/compat/instanceEventEmitter.ts`) 实现了 Vue 2 风格的实例事件 API (`$on`, `$off`, `$once`, `$emit`)。这些 API 在 Vue 3 中默认已被移除，但在兼容构建（Migration Build）中保留，以支持旧代码的平滑迁移。

## 核心逻辑

### 1. 事件注册表存储 (`eventRegistryMap`)

- **结构**: 使用 `WeakMap<ComponentInternalInstance, EventRegistry>` 存储。
- **键**: 组件内部实例 (`ComponentInternalInstance`)。
- **值**: `EventRegistry` 对象，这是一个键值对对象，键为事件名，值为回调函数数组 (`Function[]`)。
- **作用**: 确保事件监听器与组件实例生命周期绑定，并在组件销毁时自动回收内存。

### 2. 主要函数

#### `getRegistry(instance)`
- **功能**: 获取指定组件实例的事件注册表。
- **逻辑**: 如果实例尚未在 `eventRegistryMap` 中，则创建一个新的空对象并存入；否则直接返回现有对象。

#### `on(instance, event, fn)`
- **功能**: 注册事件监听器（对应 `$on`）。
- **逻辑**:
  - 支持数组形式的 `event`，递归调用 `on`。
  - **兼容性检查**:
    - 如果事件名以 `hook:` 开头（生命周期钩子事件），检查 `INSTANCE_EVENT_HOOKS` 兼容性配置。
    - 否则，检查 `INSTANCE_EVENT_EMITTER` 兼容性配置。
  - 将回调函数 `fn` 添加到注册表中对应事件的数组中。

#### `once(instance, event, fn)`
- **功能**: 注册一次性事件监听器（对应 `$once`）。
- **逻辑**:
  - 创建一个包装函数 `wrapped`。
  - `wrapped` 执行时，先调用 `off` 移除自身，再执行原始回调 `fn`。
  - 将原始回调 `fn` 挂载到 `wrapped.fn` 上，以便 `off` 函数能正确识别并移除它。
  - 调用 `on` 注册 `wrapped`。

#### `off(instance, event, fn)`
- **功能**: 移除事件监听器（对应 `$off`）。
- **逻辑**:
  - **无参数**: 移除该实例的所有事件监听器（重置注册表）。
  - **数组参数**: 遍历数组，递归调用 `off`。
  - **特定事件**:
    - 如果未提供 `fn`，移除该事件下的所有回调（置为 `undefined`）。
    - 如果提供了 `fn`，过滤回调数组，移除匹配的函数。
      - **匹配规则**: 检查回调本身是否等于 `fn`，或者回调的 `.fn` 属性（用于 `once` 包装）是否等于 `fn`。

#### `emit(instance, event, args)`
- **功能**: 触发事件（对应 `$emit`）。
- **逻辑**:
  - 从注册表中获取对应事件的回调数组。
  - 如果存在回调，使用 `callWithAsyncErrorHandling` 执行它们。
    - 确保回调中的 `this` 指向组件代理 (`instance.proxy`)。
    - 捕获并处理执行过程中的错误（错误码 `COMPONENT_EVENT_HANDLER`）。

## 依赖关系

- **`@vue/shared`**: 使用 `isArray` 工具函数。
- **`../component`**: 引用 `ComponentInternalInstance` 类型。
- **`../errorHandling`**: 使用 `callWithAsyncErrorHandling` 和 `ErrorCodes` 进行错误处理。
- **`./compatConfig`**: 使用 `DeprecationTypes` 和 `assertCompatEnabled` 进行兼容性特性检查。
