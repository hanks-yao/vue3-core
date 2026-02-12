# watch.ts 源码解析

`packages/reactivity/src/watch.ts` 文件主要实现了 Vue 3 响应式系统中的侦听器逻辑，包括 `watch` 和 `watchEffect` API。它依赖于 `effect.ts` 中的 `ReactiveEffect` 来追踪依赖并触发副作用。

## 核心功能

该文件导出的核心函数是 `watch`，它是一个通用的工厂函数，用于创建侦听器。`watchEffect` 等其他 API 实际上是 `watch` 的特定用法封装（虽然在此文件中 `watch` 函数内部处理了 `watchEffect` 的逻辑）。

## 主要流程解析

### 1. `watch` 函数

`watch` 函数是侦听器的入口，它接收三个参数：
- `source`: 侦听的数据源（可以是 Ref、响应式对象、数组或 getter 函数）。
- `cb`: 回调函数（可选）。如果提供了 `cb`，则是 `watch` 模式；如果没有，则是 `watchEffect` 模式。
- `options`: 配置选项（如 `immediate`、`deep`、`flush` 等）。

#### 1.1 数据源规范化 (Normalization)

`watch` 首先根据 `source` 的类型将其转换为一个统一的 `getter` 函数：

- **Ref**: `getter` 返回 `source.value`。
- **Reactive Object**: `getter` 返回该对象，并根据 `deep` 选项决定是否进行深度遍历。
- **Array**: `getter` 返回一个新数组，其中包含每个元素的当前值。
- **Function**:
    - 如果有 `cb`，则该函数作为 getter 执行。
    - 如果没有 `cb`（即 `watchEffect`），则该函数作为副作用函数执行，并处理清理逻辑。

#### 1.2 深度侦听 (Deep Watch)

如果 `deep` 选项为 `true`，或者侦听的是一个响应式对象且未显式设置 `deep: false`，`watch` 会使用 `traverse` 函数递归访问对象的所有属性，从而收集所有嵌套属性的依赖。

#### 1.3 副作用创建 (Effect Creation)

`watch` 内部创建一个 `ReactiveEffect` 实例：
```typescript
effect = new ReactiveEffect(getter)
```
这个 effect 负责执行 `getter` 并收集依赖。

#### 1.4 调度器 (Scheduler)

`watch` 定义了一个 `job` 函数作为调度器任务。当依赖发生变化时，`ReactiveEffect` 会触发这个 `job`。

- **watch 模式**:
    1. 执行 `effect.run()` 获取新值。
    2. 检查新旧值是否发生变化（或是否强制触发）。
    3. 如果变化，执行清理函数（如果有）。
    4. 执行用户提供的回调 `cb`。
    5. 更新 `oldValue`。

- **watchEffect 模式**:
    直接执行 `effect.run()`。

#### 1.5 清理机制 (Cleanup)

Vue 3 提供了 `onWatcherCleanup` (在 3.5+ 版本中引入，替代之前的 `onInvalidate`) 用于注册清理回调。
- 当侦听器重新运行或停止时，会调用之前注册的清理函数。
- `cleanupMap` 用于存储每个 effect 对应的清理函数列表。

### 2. `traverse` 函数

`traverse` 是一个辅助函数，用于递归遍历对象。它通过读取对象的属性来触发依赖收集。为了避免循环引用导致的死循环，它使用 `seen` Set 来记录已访问的对象。

## 关键类型

- **WatchSource**: 定义了合法的侦听源类型。
- **WatchCallback**: 定义了侦听器回调函数的签名。
- **WatchOptions**: 定义了侦听器的配置选项，如 `immediate`、`deep` 等。
- **OnCleanup**: 定义了清理函数的注册接口。

## 总结

`watch.ts` 通过复用 `ReactiveEffect` 实现了灵活的侦听逻辑。它不仅支持单一数据源，还支持数组（多源侦听），并精细地处理了深度侦听、立即执行和副作用清理等场景。
