# Component Compatibility (组件兼容性)

`packages/runtime-core/src/compat/component.ts` 文件的主要作用是处理 Vue 2.x 风格的组件定义，将其转换为 Vue 3 可以理解的组件格式。这主要用于迁移构建（Migration Build）中，以支持旧代码的平滑过渡。

## 主要逻辑

`convertLegacyComponent` 函数接收一个组件定义（可能是 Vue 2.x 的构造函数、对象或异步组件工厂函数）和一个当前的组件实例，返回一个标准化的 Vue 3 组件对象。

### 1. 内置组件检查
首先检查组件是否标记为 `__isBuiltIn`，如果是，则直接返回，不做转换。

### 2. Vue 2.x 构造函数 (Constructor)
如果传入的是一个函数且具有 `cid` 属性（Vue 2.x `Vue.extend` 创建的构造函数的特征）：
- 将构造函数的 `options` 属性作为组件定义。
- 处理从 SFC (单文件组件) 编译而来的特殊属性（如 `render` 函数、`__file`、`__hmrId`、`__scopeId`），将其复制到 `options` 中。
- 最终返回 `options` 对象。

### 3. Vue 2.x 异步组件 (Async Component)
如果传入的是一个函数，并且启用了 `COMPONENT_ASYNC` 兼容性选项：
- 调用 `convertLegacyAsyncComponent` 将旧版异步组件格式转换为 Vue 3 的异步组件格式。
- 注意：这里不使用 `softAssertCompatEnabled` 而是使用 `checkCompatEnabled`，因为禁用此兼容性选项后，普通函数仍然可能是有效的 Vue 3 函数式组件，不应报错。

### 4. Vue 2.x 函数式组件 (Functional Component)
如果传入的是一个对象，且具有 `functional: true` 属性，并且启用了 `COMPONENT_FUNCTIONAL` 兼容性选项：
- 调用 `convertLegacyFunctionalComponent` 将旧版函数式组件转换为 Vue 3 格式。
- 这里使用了 `softAssertCompatEnabled`，如果启用但检测到旧版用法，会发出警告。

### 5. 默认行为
如果以上情况都不满足，则直接返回原组件定义，假设它已经是 Vue 3 兼容的格式。
