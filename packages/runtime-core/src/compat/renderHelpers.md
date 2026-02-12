# `packages/runtime-core/src/compat/renderHelpers.ts` 逻辑总结

该文件包含了一组用于支持 Vue 2 兼容模式（Migration Build）的渲染辅助函数。这些函数的主要目的是为了让 Vue 2 编译器生成的代码或者遵循 Vue 2 模式编写的代码，能够在 Vue 3 的运行时环境中正确执行。它弥合了 Vue 2 和 Vue 3 在底层数据结构、事件处理、插槽机制等方面的差异。

## 主要功能模块

### 1. 属性绑定兼容 (`legacyBindObjectProps`)
- **功能**: 处理 Vue 2 风格的 `v-bind="object"` 绑定。
- **逻辑**:
  - 如果输入是数组，先转换为对象。
  - 遍历对象属性：
    - **保留属性**: 直接赋值。
    - **Class/Style**: 与现有的 `class` 或 `style` 进行合并（使用 `normalizeClass`）。
    - **普通属性**: 如果 `attrs` 中不存在该属性（包括驼峰和连字符形式），则添加到 `attrs` 中。
    - **`.sync` 修饰符**: 如果启用了 `isSync`，会自动生成 `update:key` 的事件监听器，实现 Vue 2 的 `.sync` 双向绑定机制。

### 2. 事件监听器兼容 (`legacyBindObjectListeners`)
- **功能**: 处理 Vue 2 风格的 `v-on="object"` 绑定。
- **逻辑**: 使用 `toHandlers` 将对象形式的监听器转换为 Vue 3 内部使用的事件处理函数格式（例如将 `click` 转换为 `onClick`），并合并到 props 中。

### 3. 插槽渲染兼容
- **`legacyRenderSlot`**:
  - **功能**: 渲染 Vue 2 风格的插槽。
  - **逻辑**: 封装了 Vue 3 的 `renderSlot`，支持传入 `bindObject`（绑定对象）并将其合并到插槽 props 中，同时处理 fallback 内容。
- **`legacyResolveScopedSlots`**:
  - **功能**: 解析 Vue 2 风格的作用域插槽。
  - **逻辑**: 将 Vue 2 的插槽数组格式转换为 Vue 3 的插槽对象格式。它会调用 `mapKeyToName` 将插槽的 `key` 映射为 `name`（默认为 `default`），最终通过 `createSlots` 生成标准化的插槽对象。

### 4. 静态渲染函数兼容 (`legacyRenderStatic`)
- **功能**: 支持 Vue 2 的 `staticRenderFns` 静态树提升优化机制。
- **逻辑**:
  - 使用 `WeakMap` (`staticCacheMap`) 缓存组件实例的静态节点。
  - 如果缓存命中，直接返回缓存的节点。
  - 如果未命中，调用组件选项中的 `staticRenderFns` 生成节点，存入缓存并返回。

### 5. 按键修饰符兼容 (`legacyCheckKeyCodes`)
- **功能**: 支持 Vue 2 的 `keyCodes` 配置（Vue 3 已移除此功能）。
- **逻辑**:
  - 检查全局配置 `config.keyCodes`。
  - 比较事件触发的 `keyCode` 或 `key` 与配置或内置值是否匹配。
  - 支持通过 `keyCodes` 自定义按键别名。

### 6. 其他辅助函数
- **`legacyBindDynamicKeys`**: 处理动态参数绑定的兼容性，遍历键值对数组并将有效键值对绑定到 props 上。
- **`legacyPrependModifier`**: 处理修饰符前缀（如 `.`、`^` 等），用于事件或指令修饰符的兼容。
- **`legacyMarkOnce`**: `v-once` 的兼容性占位符，目前直接返回节点树。

## 总结
此文件是 Vue 3 兼容构建（`@vue/compat`）的重要组成部分，它通过提供一系列运行时辅助函数，拦截并转换 Vue 2 模式的渲染逻辑，使其能够适配 Vue 3 的虚拟 DOM 和组件模型。这使得开发者可以在迁移过程中逐步过渡，而无需一次性重写所有渲染相关的代码。
