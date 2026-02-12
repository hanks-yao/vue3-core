# resolveAssets.ts 逻辑总结

该文件主要负责在 Vue 3 运行时解析组件、指令和过滤器（兼容模式）。它提供了一组工具函数，用于在当前组件实例的上下文中查找注册的资源。

## 核心功能

### 1. 资源类型定义

定义了三种资源类型常量：
- `COMPONENTS` ('components'): 组件
- `DIRECTIVES` ('directives'): 指令
- `FILTERS` ('filters'): 过滤器（仅 Vue 2 兼容模式）

### 2. 核心解析函数 `resolveAsset`

这是所有解析函数的底层实现。它的解析逻辑遵循特定的优先级顺序：

1.  **显式自引用 (Explicit Self-Reference)**:
    - 如果查找的是组件 (`COMPONENTS`)，首先检查组件自身的名称（`name` 选项）。
    - 如果名称匹配（支持原名、驼峰、帕斯卡命名），直接返回当前组件类型。

2.  **局部注册 (Local Registration)**:
    - 检查当前组件实例上的 `instance[type]` 或组件选项上的 `[type]` 属性。
    - 这通常对应于 Options API 中的 `components`、`directives` 选项。

3.  **全局注册 (Global Registration)**:
    - 如果局部未找到，检查 `instance.appContext[type]`。
    - 这对应于通过 `app.component()` 或 `app.directive()` 注册的资源。

4.  **隐式自引用 (Implicit Self-Reference)**:
    - 如果都未找到，且允许自引用 (`maybeSelfReference` 为真)，则回退到当前组件自身。
    - 这常用于递归组件，即使没有显式命名，文件名推断出的名称也可能匹配。

### 3. 命名匹配规则

在 `resolve` 辅助函数中实现，支持多种命名风格的自动匹配：
1.  **原名匹配**: `registry[name]`
2.  **驼峰匹配 (camelCase)**: `registry[camelize(name)]`
3.  **帕斯卡匹配 (PascalCase)**: `registry[capitalize(camelize(name))]`

例如，查找 `<my-component>` 时，会依次尝试匹配 `my-component`、`myComponent` 和 `MyComponent`。

## 导出的 API

- **`resolveComponent(name, maybeSelfReference)`**:
  - 用于解析组件。
  - 如果解析失败，返回原始字符串 `name`（可能是原生 HTML 标签）。

- **`resolveDynamicComponent(component)`**:
  - 用于解析 `<component :is="...">`。
  - 如果 `component` 是字符串，尝试将其解析为注册的组件；否则视为原生标签。
  - 如果 `component` 不是字符串（如对象），直接返回该对象。

- **`resolveDirective(name)`**:
  - 用于解析指令（如 `v-my-directive`）。

- **`resolveFilter(name)`**:
  - 仅用于 Vue 2 兼容模式，解析过滤器。

## 错误处理

- 如果在非渲染上下文（不在 `render` 或 `setup` 中）调用这些函数，会在开发环境下发出警告。
- 如果资源解析失败且开启了警告（`warnMissing`），会发出警告。对于组件，还会提示检查是否为原生自定义元素（Native Custom Element）。
