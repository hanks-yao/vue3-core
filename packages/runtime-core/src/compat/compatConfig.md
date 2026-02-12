# Compat Config 逻辑总结

`packages/runtime-core/src/compat/compatConfig.ts` 文件是 Vue 3 迁移构建（Migration Build）的核心配置模块。它主要负责管理 Vue 2 到 Vue 3 的兼容性行为、弃用警告以及不同模式（Vue 2 vs Vue 3）下的功能切换。

## 核心逻辑

### 1. 弃用类型定义 (`DeprecationTypes`)
定义了一个枚举 `DeprecationTypes`，列出了所有被弃用或发生破坏性变更的功能点。这些类型涵盖了：
- **全局 API**: 如 `GLOBAL_MOUNT` ($mount), `GLOBAL_EXTEND` (Vue.extend) 等。
- **配置项**: 如 `CONFIG_SILENT`, `CONFIG_KEY_CODES` 等。
- **实例 API**: 如 `INSTANCE_DESTROY` ($destroy), `INSTANCE_EVENT_EMITTER` ($on/$off) 等。
- **选项 API**: 如 `OPTIONS_DATA_FN` (data 必须是函数) 等。
- **其他**: 过滤器 (`FILTERS`)，渲染函数变化 (`RENDER_FUNCTION`) 等。

### 2. 弃用数据 (`deprecationData`)
维护了一个映射表，将每个 `DeprecationTypes` 映射到具体的警告消息 (`message`) 和官方迁移文档链接 (`link`)。
- 消息可以是静态字符串，也可以是动态生成的函数。
- 这些信息用于在开发环境下向用户展示详细的警告和修复指南。

### 3. 配置管理
- **全局配置 (`globalCompatConfig`)**: 存储全局的兼容性配置，默认 `MODE` 为 2（Vue 2 兼容模式）。
- **配置函数 (`configureCompat`)**: 允许用户修改全局兼容性配置。在开发环境下会进行配置项验证 (`validateCompatConfig`)。
- **配置解析 (`getCompatConfigForKey`)**: 解析特定功能的配置。支持组件级别的配置覆盖全局配置（通过组件选项 `compatConfig`）。

### 4. 兼容性检查 (`isCompatEnabled`)
这是判断是否启用某个兼容性特性的核心函数。逻辑如下：
1. **内置组件跳过**: 默认情况下，Vue 内置组件不应用兼容性行为。
2. **模式判断 (`MODE`)**:
   - **Vue 2 模式 (`MODE: 2`)**: 默认启用所有兼容性特性，除非显式设置为 `false`。
   - **Vue 3 模式 (`MODE: 3`)**: 默认禁用所有兼容性特性，除非显式设置为 `true` 或 `'suppress-warning'`。
3. **返回值**: 返回布尔值，表示该特性是否应以兼容模式运行。

### 5. 断言与检查辅助函数
为了方便在代码中通过守卫（Guards）来处理兼容性逻辑，提供了以下辅助函数：
- **`assertCompatEnabled`**: 强断言。如果兼容性未启用，抛出错误。用于那些在 Vue 3 中完全移除且无法回退的功能。
- **`softAssertCompatEnabled`**: 软断言。发出警告并返回启用状态。用于那些旧用法可能导致运行时错误但非致命的功能。
- **`checkCompatEnabled`**: 检查互斥行为。用于 Vue 2 和 Vue 3 语法相同但行为不同的场景（如渲染函数）。仅在启用兼容性时发出警告。

### 6. 警告系统 (`warnDeprecation`)
负责发出弃用警告，具有以下特性：
- **去重**: 避免对同一组件类型的同一问题重复报错。
- **计数**: 如果同一问题在不同组件中多次出现，后续只显示计数，避免刷屏。
- **用户控制**: 检查用户配置，如果配置为 `'suppress-warning'` 则不显示警告。
- **开发环境限制**: 仅在开发环境 (`__DEV__`) 下工作。

## 总结
该文件通过灵活的配置系统，允许开发者在 Vue 3 代码库中逐步迁移 Vue 2 的遗留代码。它提供了细粒度的控制（全局或组件级），并区分了 Vue 2 默认行为和 Vue 3 默认行为，是 Vue 3 能够平滑升级的关键基础设施。
