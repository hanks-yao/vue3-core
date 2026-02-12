# `packages/runtime-core/src/compat/global.ts` 逻辑总结

该文件主要负责在 Vue 3 中模拟 Vue 2 的全局 API 和行为，以支持迁移构建（Migration Build）。它通过创建一个单例的 Vue 3 应用实例来存储全局配置，并提供了一个模拟的 Vue 2 构造函数。

## 核心逻辑

### 1. `CompatVue` 类型定义

定义了兼容 Vue 2 的构造函数类型，包含了 Vue 2 的全局静态属性和方法，如 `extend`, `mixin`, `use`, `component`, `directive`, `util` 等。其中许多方法在 Vue 3 中已被移除或改变，这里保留它们是为了兼容性。

### 2. `createCompatVue` 函数

这是文件的核心导出函数，用于创建模拟的全局 `Vue` 对象。

- **单例 App (`singletonApp`)**: 创建一个内部的 Vue 3 应用实例，作为全局配置（组件、指令、混入等）的容器。Vue 2 的全局 API 会操作这个单例。
- **Vue 构造函数**: 返回一个 `Vue` 函数，它在内部调用 `createCompatApp`。
- **全局 API 实现**:
  - `Vue.use`, `Vue.mixin`, `Vue.component`, `Vue.directive`: 将调用代理到 `singletonApp`。
  - `Vue.extend`: 模拟 Vue 2 的继承机制，创建子构造函数，并处理选项合并。
  - `Vue.set`, `Vue.delete`, `Vue.observable`: 封装 Vue 3 的响应式 API。
  - `Vue.util`: 暴露内部工具方法（如 `warn`, `extend`, `mergeOptions`, `defineReactive`），以支持依赖这些内部 API 的遗留库。

### 3. `createCompatApp` 函数

用于创建兼容的应用实例。

- **数据处理**: 兼容 Vue 2 的 `data` 选项（如果是对象则包装为函数）。
- **实例创建**: 调用 Vue 3 的 `createApp`。
- **原型继承**: 通过 `applySingletonPrototype` 将构造函数的原型属性复制到应用实例的 `globalProperties`。
- **挂载处理**: 如果提供了 `el` 选项，自动调用 `$mount`。

### 4. `installAppCompatProperties` 函数

将兼容性相关的属性和方法安装到 Vue 3 的应用实例上。

- **过滤器支持**: 安装 `installFilterMethod`。
- **选项合并**: 安装遗留的选项合并策略。
- **挂载与 API**: 调用 `installCompatMount` 和 `installLegacyAPIs`。
- **配置同步**: 调用 `applySingletonAppMutations`，将 `singletonApp`（全局 Vue）的配置（mixins, components, directives 等）复制到当前应用实例。

### 5. `installCompatMount` 函数

模拟 Vue 2 的挂载行为。

- **`app._createRoot`**: 创建根组件实例但不立即挂载。
- **`instance.ctx._compat_mount`**: 实现 `$mount` 方法。
  - 支持选择器字符串或 DOM 元素作为挂载目标。
  - 处理模板解析（如果组件没有渲染函数）。
  - 处理 HMR 重载。
  - 初始化 DevTools。
- **`instance.ctx._compat_destroy`**: 实现 `$destroy` 方法，处理生命周期钩子（`beforeDestroy`, `destroyed`）。

### 6. `defineReactive` 函数

模拟 Vue 2 的 `Vue.util.defineReactive`。虽然 Vue 3 使用 Proxy，但为了支持修改对象属性并期望响应性的遗留代码（特别是插件），这里提供了一个基于 Vue 3 `reactive` 的简化实现。

## 总结

此文件通过维护一个全局单例应用来模拟 Vue 2 的全局状态，并通过封装 Vue 3 的 API 来提供 Vue 2 风格的接口。它允许开发者在 Vue 3 环境中使用 `new Vue()`, `Vue.extend`, `Vue.component` 等旧式语法，从而平滑迁移过程。
