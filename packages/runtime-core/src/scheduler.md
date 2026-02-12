# Scheduler 核心逻辑

`scheduler.ts` 实现了 Vue 3 的异步任务调度系统，用于管理组件更新、副作用执行和生命周期钩子的调用时机。它的核心目标是合并多次状态变更，避免不必要的重复渲染，并确保任务按正确的顺序执行。

## 核心概念

### `SchedulerJob`
调度任务对象，通常是一个函数，带有额外的属性：
- `id`: 任务 ID，用于排序。组件更新任务的 ID 通常是组件的 `uid`，确保父组件先于子组件更新。
- `flags`: 任务标志（`QUEUED`, `PRE`, `ALLOW_RECURSE`, `DISPOSED`）。
- `i`: 关联的组件实例。

### 队列
- **`queue`**: 主任务队列，主要存储组件更新任务和 watch 回调。
- **`pendingPostFlushCbs`**: 后置任务队列，存储 `mounted`, `updated` 等生命周期钩子和 `watchPostEffect`。

## 核心函数

### `queueJob(job)`
将任务添加到主队列 `queue`。
- 如果任务已经在队列中，则忽略（去重）。
- 触发 `queueFlush` 开始刷新队列。
- 使用二分查找将任务插入到正确位置（按 ID 升序），确保父组件先更新。

### `queuePostFlushCb(cb)`
将任务添加到后置队列 `pendingPostFlushCbs`。
- 支持单个回调或回调数组。
- 同样会触发 `queueFlush`。

### `queueFlush()`
触发队列刷新。
- 使用 `Promise.resolve().then(flushJobs)` 将刷新操作放入微任务队列，实现异步批量更新。

### `flushJobs()`
执行队列中的所有任务。
- 对队列进行排序（确保执行顺序）。
- 遍历队列执行任务。
- 处理递归更新限制（检测无限循环）。
- 执行完主队列后，调用 `flushPostFlushCbs` 执行后置任务。

### `flushPostFlushCbs()`
执行后置队列中的任务。
- 对后置队列进行去重和排序。
- 遍历执行。

### `nextTick(fn)`
等待下一次 DOM 更新刷新周期。
- 返回一个 Promise，该 Promise 在当前的刷新 Promise 完成后 resolve。
- 允许用户在状态变更后等待 DOM 更新完成。

## 调度策略
1. **去重**: 同一个任务在同一周期内只会被添加一次。
2. **排序**: 
    - 组件更新：父组件 ID < 子组件 ID，确保父组件先更新。
    - 如果父组件更新导致子组件卸载，子组件的更新任务会被跳过。
3. **批量执行**: 利用微任务（Microtask）机制，将多次同步的数据变更合并为一次更新周期。
