# Component Options (组件选项)

`packages/runtime-core/src/componentOptions.ts` 文件定义了 Vue 组件的选项接口（Options API）以及处理这些选项的核心逻辑。它是 Vue 2 风格的 Options API 在 Vue 3 中的实现基础。

## 核心接口

### `ComponentOptions`
这是组件选项的完整类型定义，它结合了 `ComponentOptionsBase` 和 `ThisType`，确保在编写组件选项时 `this` 上下文能被正确推断。

### `ComponentOptionsBase`
定义了组件可以接受的所有选项，包括：
- **状态选项**：`data`, `computed`, `methods`, `watch`, `provide`, `inject`。
- **生命周期钩子**：`beforeCreate`, `created`, `mounted`, `updated`, `unmounted` 等。
- **资源选项**：`components`, `directives`, `filters` (兼容性)。
- **组合选项**：`mixins`, `extends`。
- **渲染选项**：`template`, `render`, `compilerOptions`。
- **其他**：`name`, `inheritAttrs`, `emits`, `expose` 等。

## 核心函数

### `applyOptions(instance)`
这是处理 Options API 的核心函数。它在组件初始化期间被调用，负责解析并应用组件定义的各个选项。

**初始化顺序（与 Vue 2 保持一致）：**
1.  **`beforeCreate` 钩子**：在处理其他选项之前调用。
2.  **`inject`**：解析注入的数据。
3.  **`methods`**：绑定方法到组件实例。
4.  **`data`**：调用 `data()` 函数，将其返回的对象响应式化，并代理到组件实例上。
5.  **`computed`**：初始化计算属性。
6.  **`watch`**：初始化侦听器。
7.  **`provide`**：处理提供的数据。
8.  **`created` 钩子**：在所有状态选项处理完毕后调用。
9.  **其他生命周期钩子**：注册 `mounted`, `updated` 等钩子。
10. **`expose`**：处理通过 `expose` 选项暴露的属性。
11. **资源和渲染选项**：注册组件、指令，设置渲染函数。

### `resolveMergedOptions(instance)`
负责解析并合并组件的选项。它会处理：
- 全局 Mixins (`app.mixin`)
- 组件自身的 `mixins`
- 组件的 `extends` 选项
- 组件自身的选项

合并后的结果会被缓存，以提高后续渲染的性能。

### `mergeOptions(to, from, strats, asMixin)`
执行具体的合并操作。它遍历 `from` 对象中的所有属性，并使用相应的合并策略（`strats`）将其合并到 `to` 对象中。

### `resolveInjections(injectOptions, ctx)`
处理 `inject` 选项。支持数组形式和对象形式的注入配置，解析注入的值并将其定义在组件上下文（`ctx`）中。

### `createWatcher(raw, ctx, publicThis, key)`
处理 `watch` 选项。支持字符串（方法名）、函数、对象（包含 handler 和选项）以及数组形式的侦听器配置。

## 合并策略 (`internalOptionMergeStrats`)

不同的选项有不同的合并策略：
- **`data`**：合并为一个函数，执行时返回合并后的对象。
- **生命周期钩子**（如 `created`, `mounted`）：合并为数组，依次执行。
- **对象选项**（如 `methods`, `components`, `directives`）：合并为一个对象，子组件覆盖父组件/Mixin。
- **`watch`**：合并为数组，父子组件的侦听器都会被调用。
- **`props`, `emits`**：合并并规范化。

## 总结

此文件是 Vue 3 兼容 Vue 2 Options API 的关键。它通过 `applyOptions` 将声明式的选项转换为底层的响应式状态和副作用，使得开发者可以使用熟悉的 `data`, `methods`, `mounted` 等选项来构建组件。同时，它通过精细的合并策略支持了 Mixins 和 Extends 等复用机制。
