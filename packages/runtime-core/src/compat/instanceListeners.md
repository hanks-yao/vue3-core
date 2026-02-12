# instanceListeners.ts 逻辑总结

此文件主要用于 Vue 3 的 **Vue 2 兼容性构建 (Migration Build)**，目的是在组件实例上模拟 Vue 2 的 `$listeners` API。

在 Vue 2 中，父组件传递给子组件的事件监听器可以通过 `this.$listeners` 访问。
在 Vue 3 中，事件监听器被视为普通的 props（以 `on` 开头），并与 `$attrs` 合并，不再有单独的 `$listeners` 对象。

为了支持依赖 `$listeners` 的 Vue 2 代码，此文件提供了 `getCompatListeners` 函数。

## 主要功能

### `getCompatListeners`

该函数接收一个组件实例 `instance`，并返回一个对象，该对象模仿了 Vue 2 的 `$listeners` 结构。

**逻辑流程：**

1.  **兼容性检查**：首先调用 `assertCompatEnabled(DeprecationTypes.INSTANCE_LISTENERS, instance)`，检查是否启用了相关的兼容性配置。如果未启用或处于非兼容模式，可能会抛出警告或错误。
2.  **获取原始 Props**：从 `instance.vnode.props` 中获取传递给组件的所有 props。
3.  **遍历与筛选**：
    *   遍历 `rawProps` 中的所有 key。
    *   使用 `isOn(key)` 判断 key 是否以 "on" 开头（Vue 3 中事件处理函数的命名约定，如 `onClick`）。
4.  **格式转换**：
    *   如果是事件监听器，将 key 转换为事件名格式。
    *   例如：将 `onClick` 转换为 `click`，将 `onCustomEvent` 转换为 `customEvent`。
    *   `key[2].toLowerCase() + key.slice(3)`：取第3个字符（索引2）转小写，加上剩余部分。
5.  **返回结果**：返回包含所有提取出的监听器的对象。

## 总结

此文件是 Vue 3 兼容层的一部分，通过从 vnode props 中提取并转换以 `on` 开头的属性，动态重构了 Vue 2 风格的 `$listeners` 对象，使得旧代码在迁移过程中仍能正常访问 `this.$listeners`。
