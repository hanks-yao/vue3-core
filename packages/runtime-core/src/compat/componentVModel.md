# Component V-Model Compatibility

该文件 (`packages/runtime-core/src/compat/componentVModel.ts`) 处理 Vue 2 组件 `v-model` 到 Vue 3 的兼容性转换。

## 背景

- **Vue 2**: `v-model` 默认使用 `value` prop 和 `input` 事件。组件可以通过 `model` 选项自定义 prop 和 event 名称。
- **Vue 3**: `v-model` 默认使用 `modelValue` prop 和 `update:modelValue` 事件。

为了支持从 Vue 2 迁移的项目，Vue 3 提供了兼容性构建，允许在 Vue 3 中运行的代码继续使用 Vue 2 的 `v-model` 行为。

## 核心逻辑

### 1. `convertLegacyVModelProps(vnode: VNode)`

该函数在 VNode 创建后调用，用于转换 props 以匹配 Vue 2 的行为。

- **检查**:
  - 是否为组件。
  - 是否包含 `modelValue` prop (Vue 3 编译后的默认 v-model prop)。
  - 是否启用了 `DeprecationTypes.COMPONENT_V_MODEL` 兼容性配置。

- **转换过程**:
  1.  **获取模型配置**: 从组件选项中获取 `model` 配置（包括 mixins 中的配置）。默认为 `{ prop: 'value', event: 'input' }`。
  2.  **Prop 转换**: 如果配置的 prop 不是 `modelValue`，则将 `props.modelValue` 移动到 `props[prop]`（例如 `props.value`），并删除 `props.modelValue`。
  3.  **动态 Props 更新**: 如果存在动态 props，更新其索引以指向新的 prop 名称。
  4.  **事件转换**: 将 `onUpdate:modelValue` 处理程序移动到 `onModelCompat:` 前缀加上事件名称的属性上（例如 `onModelCompat:input`）。

### 2. `compatModelEmit(instance, event, args)`

该函数用于在组件实例上触发兼容模式下的 `v-model` 事件。

- **检查**: 是否启用了 `DeprecationTypes.COMPONENT_V_MODEL` 兼容性配置。
- **查找处理程序**: 在 props 中查找以 `onModelCompat:` 开头的对应事件处理程序。
- **执行**: 如果找到处理程序，使用 `callWithErrorHandling` 调用它。

### 3. `applyModelFromMixins(model, mixins)`

辅助函数，用于递归地从 mixins 中合并 `model` 选项到组件的 model 配置中。

## 总结

这个模块通过在运行时拦截和转换 props 及事件，使得 Vue 3 能够理解并正确处理按 Vue 2 方式编写或预期的 `v-model` 逻辑，从而实现平滑迁移。
