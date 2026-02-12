# useId 逻辑总结

`packages/runtime-core/src/helpers/useId.ts` 文件主要实现了 Vue 3 中的 `useId` 辅助函数，用于生成在客户端和服务端渲染（SSR）中保持一致的唯一 ID。这对于构建无障碍（accessibility）属性（如 `aria-describedby`）非常重要。

## 核心功能

### 1. `useId()`

该函数用于在组件 setup 中生成唯一的字符串 ID。

- **获取实例**：首先尝试获取当前的组件实例 (`getCurrentInstance()`)。
- **生成 ID**：
  - 如果存在组件实例，ID 的格式为：`{前缀}-{基础ID}{序列号}`。
  - **前缀 (`prefix`)**：来自应用配置 `appContext.config.idPrefix`，默认为 `'v'`。
  - **基础ID (`ids[0]`)**：当前组件在 ID 生成树中的路径标识。
  - **序列号 (`ids[1]`)**：当前组件实例内部调用 `useId` 的次数，每次调用后自增。
- **错误处理**：如果在没有活动组件实例的情况下调用（例如在组件外部），在开发环境下会发出警告，并返回空字符串。

### 2. `markAsyncBoundary(instance)`

该函数用于处理异步边界，确保在异步组件、`async setup()` 或 `serverPrefetch` 场景下 ID 的生成依然是确定性的。

- **异步边界类型**：
  - 异步组件
  - 带有 `async setup()` 的组件
  - 带有 `serverPrefetch` 的组件
- **逻辑**：
  - 当遇到异步边界时，会更新组件实例的 `ids` 状态。
  - 它将当前的“异步计数”（`ids[2]`）追加到“基础ID”（`ids[0]`）后面，形成新的层级前缀。
  - 重置“调用计数”（`ids[1]`）和新的“异步计数”（`ids[2]`）为 0。
  - 这样做的目的是为了在异步加载顺序可能不确定的情况下，通过层级结构保证 ID 的唯一性和一致性。

## 数据结构

组件实例上的 `ids` 属性是一个元组（数组），结构如下：

```typescript
// instance.ids 类型推断
[
  string, // ids[0]: baseId - 当前 ID 生成的基础字符串（前缀路径）
  number, // ids[1]: callCount - 当前层级内 useId() 被调用的次数
  number  // ids[2]: asyncCount - 当前层级内遇到的异步边界数量
]
```

这种设计允许 Vue 在组件树的深层嵌套和异步加载混合的情况下，依然能够生成稳定的、可预测的 ID，这对于 SSR 水合（Hydration）至关重要，防止客户端生成的 ID 与服务端生成的 ID 不匹配。
