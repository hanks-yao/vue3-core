# packages/runtime-core/src/compat/instance.ts 逻辑总结

该文件主要负责在 Vue 3 的迁移构建（Migration Build）中实现 Vue 2 的组件实例属性和方法，以提供向后兼容性。它通过 `installCompatInstanceProperties` 函数将这些兼容性属性注入到 Vue 3 的组件实例代理（Proxy）中。

## 核心功能

### 1. 安装兼容属性 (`installCompatInstanceProperties`)

该函数接收一个 `PublicPropertiesMap` 对象，并向其中添加 Vue 2 风格的实例属性。这些属性在访问时会触发相应的逻辑，通常包括：

*   **检查兼容性配置**：使用 `assertCompatEnabled` 或 `isCompatEnabled` 检查特定的废弃特性是否已启用。
*   **发出警告**：如果使用了废弃的 API，可能会触发警告。
*   **执行逻辑**：执行模拟 Vue 2 行为的逻辑，或者直接调用 Vue 3 的对应实现。

### 2. 支持的 Vue 2 公共 API

以下 API 被添加到组件实例中以支持 Vue 2 用法：

*   **数据操作**：
    *   `$set`: 在 Vue 3 中，响应式系统基于 Proxy，通常不再需要 `$set`，但为了兼容旧代码保留。实现为直接赋值。
    *   `$delete`: 同上，实现为直接删除属性。
*   **生命周期/挂载**：
    *   `$mount`: 允许手动挂载组件。在兼容模式下，它会调用 `global.ts` 中定义的 `_compat_mount`。
    *   `$destroy`: 手动销毁组件。调用 `_compat_destroy`。
*   **事件系统**：
    *   `$on`, `$once`, `$off`: Vue 3 移除了实例上的事件方法，这里通过 `instanceEventEmitter.ts` 重新实现了它们。
*   **插槽与子组件**：
    *   `$children`: 获取子组件实例数组（Vue 3 中已移除）。通过 `getCompatChildren` 实现。
    *   `$listeners`: 获取父组件传递的事件监听器（Vue 3 中合并到了 `$attrs`）。通过 `getCompatListeners` 实现。
    *   `$scopedSlots`: Vue 2 中区分 `$slots` 和 `$scopedSlots`，Vue 3 中统一为 `$slots`。这里 `$scopedSlots` 只是 `$slots` 的别名。
    *   `$slots`: 对 `$slots` 进行了增强，如果启用了渲染函数兼容性，会返回一个 Proxy 以模拟 Vue 2 的插槽行为。
*   **选项访问**：
    *   `$options`: 增强了 `$options` 对象，注入了 `parent` 和 `propsData` 属性，以支持像 Vuex 这样的库，它们可能依赖这些 Vue 2 特有的选项属性。

### 3. 支持的 Vue 2 私有/内部 API (`privateAPIs`)

这些 API 通常由 Vue 2 模板编译器生成的渲染函数使用，或者被某些库依赖。它们被归类为 `DeprecationTypes.PRIVATE_APIS`。

*   **实例属性**：
    *   `$vnode`: 当前组件的 VNode。
    *   `_self`: 指向组件实例代理。
    *   `_uid`: 组件的唯一 ID。
    *   `_data`: 组件的数据对象。
    *   `_isMounted`, `_isDestroyed`: 组件状态标志。
*   **渲染辅助函数**（Render Helpers）：
    *   `_c`, `$createElement`: 创建 VNode (h 函数)。
    *   `_l`: 列表渲染 (`renderList`)。
    *   `_t`: 插槽渲染 (`renderSlot`)。
    *   `_s`: 文本插值 (`toDisplayString`)。
    *   `_v`: 创建文本节点。
    *   `_e`: 创建注释节点。
    *   以及其他用于处理事件修饰符、按键修饰符、过滤器等的内部函数 (`_o`, `_n`, `_q`, `_i`, `_m`, `_f`, `_k`, `_b`, `_u`, `_g`, `_d`, `_p`)。

## 逻辑流程

1.  **定义 `LegacyPublicProperties` 接口**：声明 Vue 2 实例上存在的属性类型。
2.  **定义 `installCompatInstanceProperties`**：
    *   定义 `$set` 和 `$delete` 的简单实现。
    *   使用 `extend` 将公共兼容 API 添加到 `map` 中。
    *   定义 `privateAPIs` 对象，包含所有内部辅助函数。
    *   遍历 `privateAPIs`，将其添加到 `map` 中，并在访问时检查 `PRIVATE_APIS` 兼容性标志。

## 依赖关系

*   依赖 `../componentPublicInstance` 定义公共实例接口。
*   依赖 `./compatConfig` 进行兼容性配置检查和警告。
*   依赖 `./instanceEventEmitter` 实现事件方法。
*   依赖 `./renderHelpers` 和 `../helpers` 提供具体的渲染辅助逻辑。
