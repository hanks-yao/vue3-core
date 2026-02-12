# dep.ts 源码解析

`packages/reactivity/src/dep.ts` 是 Vue 3 响应式系统中最核心的文件之一，主要负责**依赖收集（Tracking）**和**触发更新（Triggering）**的底层机制。它定义了 `Dep` 类和 `Link` 类，以及全局的 `targetMap`，构建了响应式数据与副作用函数（Effect）之间的多对多关系。

## 核心概念

### 1. Dep (Dependency)
`Dep` 类代表一个依赖源。每个响应式对象的属性（key）通常对应一个 `Dep` 实例。
- **作用**：维护订阅了该属性的所有副作用（Subscriber）。
- **结构**：
    - `subs`: 指向订阅者链表的尾部（Link 节点）。
    - `subsHead`: 指向订阅者链表的头部（仅用于开发环境，保证触发顺序）。
    - `version`: 版本号，用于优化计算属性的更新检查。

### 2. Link
`Link` 类是连接 `Dep` 和 `Subscriber`（如 Effect 或 Computed）的桥梁。
- **双向链表节点**：`Link` 同时存在于两个双向链表中：
    1. **Dep 的订阅者链表**：连接同一个 `Dep` 的所有 `Subscriber`。
    2. **Subscriber 的依赖链表**：连接同一个 `Subscriber` 依赖的所有 `Dep`。
- **作用**：这种设计允许高效地添加、删除依赖，以及在 Effect 重新运行时复用连接。

### 3. targetMap
`targetMap` 是一个全局的 `WeakMap`，存储了所有响应式对象的依赖关系。
- **结构**：`WeakMap<Target, Map<Key, Dep>>`
    - Key: 响应式对象（Target）。
    - Value: 一个 `Map`，将对象的属性名（Key）映射到对应的 `Dep` 实例。

## 主要流程

### 依赖收集 (track)
当访问响应式属性时，会调用 `track` 函数：
1. **检查状态**：确认当前是否有活跃的副作用（`activeSub`）且允许收集（`shouldTrack`）。
2. **获取/创建 Dep**：从 `targetMap` 中找到对应属性的 `Dep`，如果不存在则创建。
3. **建立连接**：调用 `dep.track()`。
    - 创建或复用 `Link` 节点，将当前 `activeSub` 添加到 `Dep` 的订阅者列表中。
    - 如果是复用旧的 Link，会将其移动到链表尾部，确保依赖顺序正确。

### 触发更新 (trigger)
当修改响应式属性时，会调用 `trigger` 函数：
1. **查找 Dep**：根据修改的对象和属性，从 `targetMap` 中找到相关的 `Dep`。
2. **处理特殊情况**：
    - 数组长度变化 (`length`)。
    - 数组索引变化。
    - 集合类型的迭代器变化 (`ITERATE_KEY`, `MAP_KEY_ITERATE_KEY`)。
3. **调度执行**：
    - 遍历 `Dep` 中的订阅者。
    - 调用 `dep.notify()` 或 `dep.trigger()`。
    - 使用 `startBatch()` 和 `endBatch()` 进行批处理，优化性能。
    - 触发副作用的 `notify()` 方法（对于计算属性）或调度执行（对于 Effect）。

## 优化机制

- **版本控制 (`globalVersion` & `dep.version`)**：用于计算属性的快速路径检查。如果依赖的版本号没有变化，计算属性可以跳过重新计算。
- **双向链表**：相比于使用 `Set` 存储依赖，双向链表在频繁添加和移除依赖时性能更好，且更容易维护依赖的顺序。
- **Link 复用**：Effect 重新运行时，会尝试复用已有的 `Link` 对象，减少垃圾回收压力。
