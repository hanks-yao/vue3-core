# `packages/runtime-core/src/compat/globalConfig.ts` 逻辑总结

该文件主要负责 Vue 3 中对 Vue 2 全局配置的兼容性处理。它通过拦截对废弃配置项的访问并发出警告，以及提供旧版选项合并策略的兼容支持，帮助开发者平滑迁移。

## 主要功能

### 1. 废弃配置项警告 (`LegacyConfig` & `installLegacyConfigWarnings`)

定义了 `LegacyConfig` 类型，列出了在 Vue 3 中已废弃的全局配置项：
- `silent`: 已移除。
- `devtools`: 建议使用编译时标志 `__VUE_PROD_DEVTOOLS__`。
- `ignoredElements`: 建议使用 `config.isCustomElement`。
- `keyCodes`: 已移除，不再支持自定义按键修饰符。
- `productionTip`: 已移除。

`installLegacyConfigWarnings` 函数用于在开发环境下安装这些警告：
- **映射关系**：将配置项名称映射到对应的 `DeprecationTypes`。
- **拦截机制**：遍历废弃配置项，使用 `Object.defineProperty` 在 `config` 对象上定义这些属性。
- **警告触发**：在 `set` 访问器中，如果不是在复制配置（`!isCopyingConfig`），则调用 `warnDeprecation` 发出警告。

### 2. 旧版选项合并策略兼容 (`installLegacyOptionMergeStrats`)

该函数用于兼容 Vue 2 的选项合并策略（`optionMergeStrategies`）。

- **代理机制**：将 `config.optionMergeStrategies` 设置为一个 `Proxy` 对象。
- **拦截逻辑**：在 `get` 陷阱中拦截属性访问。
    1. **优先自身**：如果 `target` 中存在该策略，直接返回。
    2. **兼容检查**：如果该策略存在于 `internalOptionMergeStrats`（内部定义的旧版策略）中，并且通过 `softAssertCompatEnabled` 检查启用了兼容模式，则返回内部策略。

## 关键技术点

- **`Object.defineProperty`**：用于精确控制属性的读写行为，实现对废弃属性赋值操作的拦截和警告。
- **`Proxy`**：用于动态拦截对象属性的访问，实现对不存在属性的动态查找和兼容性回退。
- **兼容性标志**：结合 `compatConfig` 模块，根据用户的兼容性配置决定是否启用特定的兼容行为。
