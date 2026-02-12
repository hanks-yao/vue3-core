# `instanceChildren.ts` 逻辑总结

该文件主要实现了 Vue 2 中 `this.$children` 的兼容逻辑。在 Vue 3 中，`$children` 属性已被移除，但在兼容构建（compat build）中，为了支持旧代码，需要重新实现这一功能。

## 核心功能

### `getCompatChildren`

这是该模块的主入口函数，用于获取当前组件实例的直接子组件实例列表。

1.  **兼容性检查**：首先调用 `assertCompatEnabled` 检查是否启用了 `INSTANCE_CHILDREN` 的兼容模式。如果未启用或处于警告模式，会触发相应的警告。
2.  **获取渲染树根节点**：通过 `instance.subTree` 获取当前组件渲染的 VNode 树的根节点。
3.  **遍历收集**：调用 `walk` 函数遍历 VNode 树，收集所有的子组件实例。
4.  **返回结果**：返回收集到的 `ComponentPublicInstance` 数组。

### `walk`

这是一个递归辅助函数，用于深度优先遍历 VNode 树，查找并收集子组件。

1.  **组件节点处理**：
    *   检查当前 `vnode` 是否有 `component` 属性。
    *   如果有，说明这是一个组件节点，将其公开实例（`proxy`）添加到 `children` 数组中。
    *   **注意**：一旦遇到组件节点，就不会继续遍历该组件的子树。这意味着 `$children` 只包含**直接**子组件，不包含孙子组件，这符合 Vue 2 `$children` 的行为（只包含当前模板中直接使用的组件）。

2.  **数组子节点处理**：
    *   如果当前 `vnode` 没有组件实例，但其 `shapeFlag` 标记为 `ARRAY_CHILDREN`（表示包含多个子节点，如 `<div>` 的子节点列表或 `<Fragment>`），则遍历其 `children` 数组。
    *   对每个子 VNode 递归调用 `walk`。

## 总结

此文件的逻辑通过遍历当前组件的渲染树（`subTree`），寻找第一层级的子组件实例，从而模拟 Vue 2 中 `$children` 的行为。它处理了普通元素嵌套和 Fragment 的情况，确保能正确找到嵌套在 HTML 标签内的组件。
