# withMemo 逻辑总结

`packages/runtime-core/src/helpers/withMemo.ts` 文件主要实现了 Vue 3 中 `v-memo` 指令的运行时逻辑。它通过缓存 VNode 并比较依赖项（memo 数组）来决定是否跳过重新渲染，从而优化性能。

## 核心函数：`withMemo`

该函数是 `v-memo` 的主要入口点。

### 参数
- `memo`: `any[]` - 依赖项数组。如果数组中的值没有变化，则复用缓存。
- `render`: `() => VNode` - 渲染函数，当缓存未命中时调用以生成新的 VNode。
- `cache`: `any[]` - 组件实例上的缓存数组，用于存储 VNode。
- `index`: `number` - 当前 `v-memo` 节点在缓存数组中的索引。

### 逻辑流程
1.  **读取缓存**：根据传入的 `index` 从 `cache` 数组中尝试获取已缓存的 VNode。
2.  **比较依赖**：调用 `isMemoSame` 函数比较当前传入的 `memo` 数组和缓存 VNode 上的 `memo` 数组。
3.  **缓存命中**：
    *   如果缓存存在且依赖项未变，直接返回缓存的 VNode。
    *   这有效地跳过了该组件子树的重新创建和 diff 过程。
4.  **缓存未命中**：
    *   调用 `render()` 生成新的 VNode。
    *   将当前的 `memo` 数组（浅拷贝）存储在 VNode 的 `memo` 属性上，供下次比较使用。
    *   记录 `cacheIndex`。
    *   将新生成的 VNode 存入 `cache` 数组并返回。

## 辅助函数：`isMemoSame`

该函数用于判断依赖项是否发生变化。

### 逻辑流程
1.  **长度检查**：首先比较新旧 `memo` 数组的长度，如果长度不同直接返回 `false`。
2.  **逐项比较**：遍历数组，使用 `hasChanged`（通常是 `Object.is` 的变体）比较每一项。如果有任何一项变化，返回 `false`。
3.  **Block Tree 维护**：
    *   **关键点**：如果判定为相同（返回 `true`），说明即将复用缓存的 VNode。
    *   在 Vue 的 Block Tree 优化模式下，即使复用了旧的 VNode，它仍然需要被当前的父级 Block 收集，以保证 Patch 过程的正确性。
    *   因此，代码中检查 `isBlockTreeEnabled > 0 && currentBlock`，如果满足条件，手动将 `cached` VNode 推入 `currentBlock`。

## 总结

`withMemo` 提供了一种细粒度的手动缓存控制机制。通过 `v-memo`，开发者可以显式声明一段模板的依赖，只有当依赖变化时才重新渲染该部分，这对于长列表或大型静态内容的优化非常有用。
