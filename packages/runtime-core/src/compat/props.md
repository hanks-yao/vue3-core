# packages/runtime-core/src/compat/props.ts 文件逻辑总结

该文件主要负责处理 Vue 3 中对 Vue 2 组件 `props` 默认值函数的兼容性支持。

## 主要功能

在 Vue 2 中，`props` 的 `default` 工厂函数可以通过 `this` 访问组件实例上下文（如访问其他 props、injections 或 `$options`）。而在 Vue 3 中，`props` 的初始化发生在组件实例创建之前，因此 `default` 函数无法访问 `this`。

为了支持迁移构建（Migration Build）中的兼容性，该文件导出了 `createPropsDefaultThis` 函数，用于创建一个模拟的 `this` 上下文。

## 核心逻辑：`createPropsDefaultThis`

该函数接收组件实例、原始 props 数据和当前 prop 的键名，返回一个 `Proxy` 对象。这个代理对象拦截属性访问，模拟 Vue 2 的行为。

### 1. 弃用警告
- 当用户尝试访问代理对象上的任何属性时，会触发 `get` 拦截器。
- 在开发环境下，会调用 `warnDeprecation(DeprecationTypes.PROPS_DEFAULT_THIS, ...)` 发出警告，提示用户这种用法已被弃用。

### 2. 属性访问代理
代理对象支持以下几种属性的访问：

- **`$options`**:
  - 如果访问的是 `$options`，则调用 `resolveMergedOptions(instance)` 返回当前组件实例的合并选项。

- **Props**:
  - 如果访问的键存在于 `rawProps`（原始 props 数据）中，则直接返回对应的 prop 值。这允许一个 prop 的默认值依赖于另一个 prop。

- **Injections (依赖注入)**:
  - 检查组件定义的 `inject` 选项。
  - 支持数组形式（`['foo', 'bar']`）和对象形式（`{ foo: ... }`）的 `inject` 配置。
  - 如果访问的键在 `inject` 定义中，则调用 Vue 3 的 `inject(key)` API 来获取注入的值。

## 总结
这个文件是一个典型的兼容层实现，通过 `Proxy` 技术在 Vue 3 的架构限制下，尽可能还原 Vue 2 的开发体验，帮助用户平滑迁移，同时通过警告机制引导用户进行代码重构。
