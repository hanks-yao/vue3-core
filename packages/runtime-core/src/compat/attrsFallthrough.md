# attrsFallthrough.ts 逻辑总结

## 概述

`packages/runtime-core/src/compat/attrsFallthrough.ts` 文件的主要目的是处理 Vue 2 到 Vue 3 的迁移兼容性问题，特别是关于组件属性（Attributes）透传（Fallthrough）的差异。

在 Vue 3 中，`$attrs` 包含了所有的属性，包括 `class`、`style` 以及事件监听器（`onEvent`）。而在 Vue 2 中：
- `class` 和 `style` 是特殊处理的，不包含在 `$attrs` 中。
- 事件监听器包含在 `$listeners` 中，不包含在 `$attrs` 中。

此文件导出的 `shouldSkipAttr` 函数用于在构建 `$attrs` 对象时，根据兼容性配置决定是否需要排除某些属性，以模拟 Vue 2 的行为。

## 核心函数：shouldSkipAttr

该函数接收属性名 `key` 和组件实例 `instance`，返回一个布尔值，指示是否应该跳过该属性。

### 逻辑流程

1.  **跳过 `is` 属性**：
    - `is` 用于动态组件，始终不应作为普通属性透传。

2.  **兼容 `class` 和 `style`**：
    - **条件**：属性名为 `class` 或 `style`，且启用了 `INSTANCE_ATTRS_CLASS_STYLE` 兼容性标志。
    - **行为**：返回 `true`（跳过）。这确保了在兼容模式下，`$attrs` 不包含 `class` 和 `style`，与 Vue 2 保持一致。

3.  **兼容事件监听器**：
    - **条件**：属性名符合事件格式（`isOn(key)`，即以 `on` 开头），且启用了 `INSTANCE_LISTENERS` 兼容性标志。
    - **行为**：返回 `true`（跳过）。这确保了在兼容模式下，事件监听器不会出现在 `$attrs` 中（而是应该通过模拟的 `$listeners` 访问）。

4.  **过滤 Vue Router 内部属性**：
    - **条件**：属性名以 `routerView` 开头或等于 `registerRouteInstance`。
    - **行为**：返回 `true`（跳过）。这些是 Vue Router 的内部实现细节，不应暴露给用户或透传。

## 总结

此文件是 Vue 3 兼容性构建（Migration Build）的一部分，它通过有条件地过滤 `$attrs` 中的内容，帮助开发者平滑地从 Vue 2 迁移到 Vue 3，避免因属性透传机制的变化导致应用行为异常。
