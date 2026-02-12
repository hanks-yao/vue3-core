# effect.ts - Vue3 响应式副作用系统

## 文件概述

`effect.ts` 是 Vue3 响应式系统的核心文件之一，负责实现副作用（Effect）的追踪、调度和执行机制。它是响应式系统中连接数据变化和视图更新的关键桥梁。

## 核心概念

### 1. 副作用（Effect）

副作用是指当响应式数据发生变化时需要自动执行的函数。在 Vue3 中，组件的渲染函数、`watch`、`watchEffect` 等都是通过副作用系统实现的。

### 2. 订阅者（Subscriber）

订阅者是追踪依赖列表的类型，它维护了一个双向链表来管理所有依赖关系。

### 3. 依赖追踪

当副作用函数执行时，会自动收集它所访问的响应式数据作为依赖。当这些数据变化时，副作用会被重新执行。

## 核心数据结构

### EffectFlags（副作用标志位）

使用位运算优化性能，定义了副作用的各种状态：

- **ACTIVE (1 << 0)**: 副作用是否激活
- **RUNNING (1 << 1)**: 正在运行中
- **TRACKING (1 << 2)**: 正在追踪依赖
- **NOTIFIED (1 << 3)**: 已被通知需要更新
- **DIRTY (1 << 4)**: 数据已变脏，需要重新计算
- **ALLOW_RECURSE (1 << 5)**: 允许递归触发
- **PAUSED (1 << 6)**: 已暂停
- **EVALUATED (1 << 7)**: 已求值（用于 computed）

### Subscriber 接口

```typescript
interface Subscriber {
  deps?: Link          // 依赖链表头节点
  depsTail?: Link      // 依赖链表尾节点
  flags: EffectFlags   // 标志位
  next?: Subscriber    // 批处理队列中的下一个订阅者
  notify(): void       // 通知更新
}
```

### ReactiveEffect 类

响应式副作用的核心实现类，主要属性和方法：

**属性：**
- `fn`: 副作用函数
- `deps/depsTail`: 依赖的双向链表
- `flags`: 状态标志位
- `scheduler`: 自定义调度器
- `cleanup`: 清理函数

**方法：**
- `run()`: 执行副作用函数
- `stop()`: 停止副作用
- `pause()/resume()`: 暂停/恢复副作用
- `trigger()`: 触发副作用执行
- `notify()`: 通知副作用需要更新

## 核心流程

### 1. 副作用创建与执行

```typescript
effect(fn, options?) → ReactiveEffectRunner
```

1. 创建 `ReactiveEffect` 实例
2. 如果存在活跃的 `effectScope`，将副作用添加到作用域中
3. 立即执行一次副作用函数（调用 `run()`）
4. 返回 runner 函数，可用于手动重新执行

### 2. 依赖追踪流程（run 方法）

```
开始执行
  ↓
设置 RUNNING 标志
  ↓
执行清理函数 (cleanupEffect)
  ↓
准备依赖追踪 (prepareDeps)
  - 将所有依赖的 version 设为 -1
  - 保存 prevActiveLink
  ↓
设置 activeSub = this
设置 shouldTrack = true
  ↓
执行副作用函数 fn()
  - 在函数执行过程中访问响应式数据
  - 响应式数据会调用 track() 收集当前副作用
  ↓
清理未使用的依赖 (cleanupDeps)
  - version 仍为 -1 的依赖会被移除
  - 更新 deps 和 depsTail
  ↓
恢复之前的 activeSub 和 shouldTrack
  ↓
清除 RUNNING 标志
```

### 3. 依赖收集机制

**prepareDeps（准备依赖追踪）：**
- 遍历所有现有依赖
- 将每个依赖的 `version` 设为 -1（标记为"可能未使用"）
- 保存 `prevActiveLink` 用于恢复

**cleanupDeps（清理未使用的依赖）：**
- 从尾部向前遍历依赖链表
- `version === -1` 的依赖表示本次执行未被访问，需要移除
- `version !== -1` 的依赖表示仍在使用，保留
- 更新链表的头尾节点

### 4. 批处理机制

Vue3 使用批处理来优化性能，避免同一帧内多次触发相同的副作用。

**关键变量：**
- `batchDepth`: 批处理深度（支持嵌套）
- `batchedSub`: 普通副作用队列
- `batchedComputed`: 计算属性队列

**流程：**

```
startBatch()
  ↓
batchDepth++
  ↓
修改响应式数据
  ↓
触发 notify()
  ↓
加入批处理队列 (batch)
  - computed 加入 batchedComputed
  - effect 加入 batchedSub
  ↓
endBatch()
  ↓
batchDepth--
  ↓
如果 batchDepth === 0:
  1. 清空 batchedComputed 队列（只清标志）
  2. 执行 batchedSub 队列中的副作用
  3. 如果有错误，执行完所有副作用后抛出
```

### 5. 脏检查机制（isDirty）

判断副作用是否需要重新执行：

1. 遍历所有依赖
2. 检查依赖的 `version` 是否与记录的 `version` 不一致
3. 如果依赖是 `computed`，递归检查 computed 是否脏
4. 任何一个依赖变脏，整个副作用就是脏的

### 6. Computed 刷新机制（refreshComputed）

```
检查是否需要刷新
  ↓
快速路径：globalVersion 未变化 → 直接返回
  ↓
SSR 特殊处理
  ↓
非 SSR 且已求值且不脏 → 直接返回
  ↓
设置 RUNNING 标志
  ↓
prepareDeps
  ↓
执行 computed 函数
  ↓
如果值变化：
  - 更新 _value
  - dep.version++
  - 设置 EVALUATED 标志
  ↓
cleanupDeps
  ↓
清除 RUNNING 标志
```

## 关键函数说明

### effect()

创建并立即执行一个响应式副作用。

**参数：**
- `fn`: 副作用函数
- `options`: 可选配置
  - `scheduler`: 自定义调度器
  - `allowRecurse`: 是否允许递归
  - `onStop`: 停止时的回调
  - `onTrack/onTrigger`: 调试钩子

**返回：**
- `ReactiveEffectRunner`: 可以手动调用重新执行的函数

### stop()

停止一个副作用的追踪和执行。

### pauseTracking() / enableTracking() / resetTracking()

控制依赖追踪的开关，支持嵌套调用。

### onEffectCleanup()

为当前活跃的副作用注册清理函数，会在下次执行前或停止时调用。

### batch() / startBatch() / endBatch()

批处理相关函数，用于优化多个数据变化时的副作用执行。

## 双向链表结构

副作用系统使用双向链表来管理依赖关系：

### 依赖链表（Dep List）

```
Effect.deps → Link1 ⇄ Link2 ⇄ Link3 ← Effect.depsTail
```

每个 `Link` 包含：
- `dep`: 指向依赖对象
- `prevDep/nextDep`: 前后依赖节点
- `prevSub/nextSub`: 前后订阅者节点
- `version`: 依赖版本号

### 订阅者链表（Subscriber List）

```
Dep.subs → Link3 ⇄ Link2 ⇄ Link1 ← Dep.subsHead
```

同一个 `Link` 同时存在于两个链表中，实现了副作用和依赖的双向关联。

## 性能优化

1. **位运算标志位**: 使用位运算管理多个布尔状态，节省内存
2. **批处理**: 避免同一帧内重复执行副作用
3. **双向链表**: O(1) 时间复杂度的插入和删除
4. **版本号机制**: 快速判断依赖是否变化
5. **惰性清理**: 只在需要时清理未使用的依赖
6. **全局版本号**: computed 的快速路径优化

## 调试支持

提供了 `DebuggerOptions` 接口：

- `onTrack`: 依赖被追踪时的回调
- `onTrigger`: 依赖触发更新时的回调

这些钩子可以用于调试响应式系统的行为。

## 与其他模块的关系

- **dep.ts**: 提供 `Link` 和依赖管理
- **reactive.ts**: 响应式对象的创建
- **computed.ts**: 计算属性的实现
- **effectScope.ts**: 副作用作用域管理
- **baseHandlers.ts**: Proxy 处理器，调用 track/trigger

## 典型使用场景

1. **组件渲染**: 组件的 render 函数作为副作用执行
2. **watch/watchEffect**: 监听响应式数据变化
3. **computed**: 计算属性的依赖追踪
4. **自定义副作用**: 用户自定义的响应式逻辑

## 注意事项

1. 副作用函数应该是幂等的（多次执行结果一致）
2. 避免在副作用中进行异步操作后修改响应式数据
3. 使用 `allowRecurse` 时要小心避免无限循环
4. 清理函数应该清理所有副作用产生的资源
5. 在 SSR 环境中，computed 的行为略有不同

## 总结

`effect.ts` 实现了 Vue3 响应式系统的核心机制：

- ✅ 自动依赖追踪
- ✅ 智能依赖清理
- ✅ 批处理优化
- ✅ 灵活的调度机制
- ✅ 完善的生命周期管理
- ✅ 高性能的数据结构

这个文件是理解 Vue3 响应式原理的关键，它展示了如何通过精巧的设计实现高效、可靠的响应式系统。
