# Component Emits 逻辑总结

`packages/runtime-core/src/componentEmits.ts` 文件主要负责 Vue 3 组件事件的触发（`emit`）机制以及 `emits` 选项的标准化处理。

## 核心功能

### 1. `emit` 函数

`emit` 是组件实例用来触发自定义事件的核心函数。

*   **事件触发流程**：
    1.  **检查组件状态**：如果组件已卸载 (`isUnmounted`)，则直接返回。
    2.  **开发环境检查**：
        *   检查触发的事件是否在 `emits` 选项中声明。如果未声明且没有对应的 prop (如 `onEvent`)，会发出警告。
        *   如果有验证函数，执行验证逻辑。
    3.  **v-model 支持**：
        *   识别 `update:` 开头的事件（用于 `v-model`）。
        *   应用修饰符（如 `.trim`, `.number`）对参数进行处理。
    4.  **DevTools 集成**：触发 DevTools 的事件记录。
    5.  **Handler 查找与执行**：
        *   将事件名转换为 handler 名称（例如 `click` -> `onClick`）。
        *   支持 camelCase 事件名（例如 `myEvent` -> `onMyEvent`）。
        *   支持 kebab-case 事件名（主要用于 `v-model` 的 `update:xxx` 事件）。
        *   如果找到对应的 handler，使用 `callWithAsyncErrorHandling` 执行它，捕获并处理可能的错误。
    6.  **Once 修饰符**：
        *   检查是否存在 `Once` 后缀的 handler（例如 `onClickOnce`）。
        *   如果存在，确保该 handler 只被执行一次（通过 `instance.emitted` 记录状态）。

### 2. `normalizeEmitsOptions` 函数

该函数用于将组件的 `emits` 选项标准化为对象格式，并处理继承关系。

*   **缓存机制**：使用 `WeakMap` 缓存已标准化的组件 `emits` 选项，避免重复计算。
*   **格式统一**：
    *   如果 `emits` 是数组（`['click', 'submit']`），转换为对象格式（`{ click: null, submit: null }`）。
    *   如果 `emits` 已经是对象，则直接使用。
*   **Mixin 和 Extends 处理**：
    *   递归合并 `mixins` 和 `extends` 中的 `emits` 选项。
    *   确保子组件的 `emits` 声明优先级高于 mixin/extends。

### 3. `isEmitListener` 函数

用于判断一个 prop key 是否对应于已声明的 emit 事件。

*   **逻辑**：
    *   检查 key 是否以 `on` 开头。
    *   去除 `on` 前缀和可能的 `Once` 后缀。
    *   检查处理后的事件名是否存在于 `emits` 选项中（支持 camelCase、kebab-case 和原始名称的匹配）。
    *   例如：如果声明了 `emits: ['click']`，则 `onClick` 和 `onclick` 都会被识别为匹配的监听器。

## 关键类型定义

*   `ObjectEmitsOptions`: 定义 `emits` 对象的结构，键为事件名，值为验证函数或 `null`。
*   `EmitsOptions`: `ObjectEmitsOptions` 或字符串数组。
*   `EmitFn`: 定义 `emit` 函数的类型签名，支持根据 `emits` 选项进行类型推导。
