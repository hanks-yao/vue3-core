# useModel.ts 逻辑总结

`useModel` 是 Vue 3.4 引入的一个辅助函数，旨在简化 Composition API 中 `v-model` 的实现。它通常作为 `defineModel` 宏的底层实现，但也可以直接使用。

## 核心功能

1.  **双向绑定封装**：创建一个 `ref`，其值与组件的 `prop` 保持同步。
2.  **自动事件触发**：当修改这个 `ref` 的值时，自动触发 `update:modelName` 事件，通知父组件更新。
3.  **本地状态回退**：如果父组件没有传递对应的 `v-model`（即没有监听 `update` 事件），则作为本地状态运行，确保组件内部逻辑正常。
4.  **修饰符支持**：支持获取和处理 `v-model` 的修饰符（如 `.trim`, `.number`）。

## 主要函数

### `useModel`

这是模块的主入口函数。

**参数**:
- `props`: 组件的 props 对象。
- `name`: model 的名称（默认为 `modelValue`）。
- `options`: 配置选项，包含 `get` 和 `set` 转换器，允许在读写时对值进行处理。

**逻辑流程**:

1.  **实例检查**: 确认当前在组件实例上下文中调用，并检查指定的 `prop` 是否已声明。
2.  **创建 CustomRef**: 使用 `customRef` 创建一个自定义的响应式对象。
    *   **Get**: 追踪依赖 (`track`)，返回本地值 `localValue`（可选经过 `options.get` 处理）。
    *   **Set**:
        1.  计算新值（可选经过 `options.set` 处理）。
        2.  检查值是否发生变化。
        3.  **检查父组件绑定**: 检查父组件是否传递了对应的 `v-model` (即是否存在对应的 prop 和 `onUpdate:` 事件监听)。
        4.  **本地更新**: 如果父组件未绑定，直接更新 `localValue` 并触发响应式更新 (`trigger`)。
        5.  **触发事件**: 调用 `emit('update:name', value)` 通知父组件。
        6.  **特殊情况处理 (#10279)**: 如果使用了 `set` 转换器导致本地值变化但 emit 的值未变（例如输入格式化），父组件可能不会更新 prop，导致本地状态不同步。此时强制触发一次本地更新。
3.  **同步 Prop**: 使用 `watchSyncEffect` 监听 `props[name]` 的变化。如果 prop 变了，更新 `localValue` 并触发 `trigger`，确保本地值始终跟随父组件。
4.  **迭代器支持**: 返回的 ref 实现了 `Symbol.iterator`，支持 `const [model, modifiers] = useModel()` 的解构语法。

### `getModelModifiers`

辅助函数，用于从 props 中提取 model 修饰符。

- 检查 `modelModifiers` (默认 model)。
- 检查 `name + "Modifiers"` (具名 model)。
- 支持 camelCase 和 hyphen-case 命名。

## 关键细节

- **优先级**: Prop 的值优先于本地值。`watchSyncEffect` 确保了只要 prop 变动，本地 ref 就会更新。
- **本地回退**: 允许组件在没有父组件 `v-model` 绑定的情况下，依然可以像普通 ref 一样工作，这对于封装可复用的 UI 组件非常有用。
- **转换器**: `options.get` 和 `options.set` 提供了类似 `computed` 的能力，可以在 model 值与内部逻辑值之间建立映射。
