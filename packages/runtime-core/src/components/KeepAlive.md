# KeepAlive 组件源码解析

`KeepAlive` 是 Vue 3 的内置组件，用于缓存组件实例，避免组件在切换时被销毁，从而保留组件状态。

## 1. 核心属性 (Props)

- **include**: `MatchPattern` (string | RegExp | Array) - 只有名称匹配的组件会被缓存。
- **exclude**: `MatchPattern` - 任何名称匹配的组件都不会被缓存。
- **max**: `number | string` - 缓存的最大组件实例数量。

## 2. 内部结构与状态

`KeepAlive` 组件在 `setup` 函数中维护了以下核心状态：

- **cache**: `Map<CacheKey, VNode>` - 存储缓存的 VNode。`CacheKey` 通常是组件定义对象或 key。
- **keys**: `Set<CacheKey>` - 存储缓存的 Key，用于实现 LRU (Least Recently Used) 缓存淘汰策略。
- **sharedContext**: `KeepAliveContext` - 用于与渲染器 (Renderer) 进行通信的上下文对象。

## 3. 核心逻辑流程

### 3.1 Setup 阶段

1.  **SSR 检测**：如果是服务端渲染且没有注册内部渲染器，直接返回渲染子节点的函数（SSR 不支持 KeepAlive 缓存）。
2.  **上下文通信**：通过 `instance.ctx` 获取 `sharedContext`，并向其注入 `activate` 和 `deactivate` 方法。这使得渲染器可以在适当的时候调用 KeepAlive 的逻辑，而无需直接依赖 KeepAlive 代码（利于 Tree-shaking）。
3.  **监听 Props**：使用 `watch` 监听 `include` 和 `exclude` 的变化，一旦变化，调用 `pruneCache` 清理不再匹配的缓存。
4.  **生命周期挂钩**：
    -   `onMounted` 和 `onUpdated`：调用 `cacheSubtree` 将渲染后的子树（subTree）存入缓存。
    -   `onBeforeUnmount`：遍历 `cache`，销毁所有缓存的组件实例。

### 3.2 渲染函数 (Render)

`KeepAlive` 的渲染函数返回一个闭包，处理以下逻辑：

1.  **获取子节点**：`KeepAlive` 只能有一个子节点。
2.  **类型检查**：如果子节点不是有状态组件 (Stateful Component) 或 Suspense，直接返回子节点，不进行缓存。
3.  **匹配检查**：
    -   获取组件名称。
    -   检查 `include` 和 `exclude`。如果不匹配（不需要缓存），直接返回子节点，并清除 `COMPONENT_SHOULD_KEEP_ALIVE` 标志。
4.  **缓存管理**：
    -   **缓存命中**：
        -   从 `cache` 中获取 VNode。
        -   复制组件实例 (`component`) 和 DOM 元素 (`el`) 到新的 VNode。
        -   更新 `ShapeFlags` 添加 `COMPONENT_KEPT_ALIVE`，告诉渲染器这是一个被复用的组件。
        -   **LRU 更新**：先删除 key 再重新添加，使其成为最新的。
    -   **缓存未命中**：
        -   将 key 添加到 `keys` 集合。
        -   **LRU 修剪**：如果超过 `max` 限制，删除 `keys` 中最旧的（第一个）条目，并销毁对应的组件实例。
5.  **标记**：设置 `ShapeFlags` 添加 `COMPONENT_SHOULD_KEEP_ALIVE`，告诉渲染器这个组件在卸载时应该被缓存而不是销毁。
6.  **Pending Cache**：由于渲染过程中的 VNode 可能不是最终挂载的 VNode（例如因为 scopeId），真正的缓存操作推迟到 `onMounted`/`onUpdated` 中通过 `pendingCacheKey` 进行。

### 3.3 缓存修剪 (Pruning)

-   **pruneCache(filter)**: 遍历缓存，对不满足 `filter` 条件的组件调用 `pruneCacheEntry`。
-   **pruneCacheEntry(key)**:
    -   从 `cache` 和 `keys` 中移除。
    -   如果该组件不是当前激活的组件，调用 `unmount` 销毁它。
    -   如果是当前激活组件，重置其 ShapeFlag，使其在未来卸载时不再被缓存。

## 4. 与渲染器的交互

KeepAlive 通过向 `sharedContext` 注入方法来控制组件的激活与失活：

### 4.1 activate (激活)
当一个被缓存的组件再次被渲染时调用：
1.  **move**: 将组件的 DOM 元素移动到容器中。
2.  **patch**: 执行 patch 操作以更新 props 等。
3.  **Hooks**: 触发 `onVnodeMounted` 和组件的 `activated` 钩子。

### 4.2 deactivate (失活)
当一个被缓存的组件被移除时调用：
1.  **move**: 将组件的 DOM 元素移动到一个隐藏的容器 (`storageContainer`) 中，而不是将其从 DOM 中移除。
2.  **Hooks**: 触发 `onVnodeUnmounted` 和组件的 `deactivated` 钩子。
3.  **State**: 设置 `instance.isDeactivated = true`。

## 5. 生命周期钩子 (onActivated / onDeactivated)

-   这两个钩子通过 `registerKeepAliveHook` 注册。
-   不仅在当前组件注册，还会向上遍历查找所有 KeepAlive 根组件并注册，以确保嵌套 KeepAlive 场景下的正确触发。
-   包含去重逻辑和停用分支检查（`__wdc`），防止在组件树已经失活的分支上重复触发钩子。
