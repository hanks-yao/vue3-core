# Data Compatibility (数据兼容性)

该文件 (`packages/runtime-core/src/compat/data.ts`) 包含 `deepMergeData` 函数，用于处理 Vue 2 到 Vue 3 迁移过程中涉及的数据合并兼容性问题。

## 主要逻辑

### `deepMergeData`

此函数用于深度合并两个数据对象 (`to` 和 `from`)。

1.  **遍历源对象 (`from`)**：
    - 遍历 `from` 对象的所有键 (`key`)。

2.  **检查合并条件**：
    - 如果 `key` 同时也存在于目标对象 (`to`) 中。
    - 并且 `to[key]` 和 `from[key]` 都是普通对象 (`isPlainObject`)。

3.  **递归合并与警告**：
    - 如果满足上述条件，触发 `OPTIONS_DATA_MERGE` 弃用警告 (`warnDeprecation`)。这是因为 Vue 3 的数据合并策略可能与 Vue 2 不同（Vue 2 mixin/extends 的 data 合并是递归的，Vue 3 主要是浅层合并，但在某些情况下仍保留深层合并行为，此处主要用于兼容性构建中的特殊处理或警告）。
    - 递归调用 `deepMergeData(toVal, fromVal)` 进行深度合并。

4.  **直接覆盖**：
    - 如果不满足递归合并条件，直接将 `from` 中的值赋给 `to`，覆盖原有值。

5.  **返回结果**：
    - 返回合并后的 `to` 对象。

## 总结

`deepMergeData` 提供了一种深度合并策略，主要用于处理 Vue 2 风格的 `data` 选项合并逻辑，并在兼容模式下发出警告，提示开发者注意数据合并行为的潜在差异。
