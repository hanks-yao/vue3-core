# componentFunctional.ts 逻辑总结

该文件主要负责将 Vue 2 风格的函数式组件（Legacy Functional Component）转换为 Vue 3 的函数式组件，以实现向后兼容。

## 核心功能

### 1. `convertLegacyFunctionalComponent` 函数

这是文件的主入口，用于转换组件。

- **输入**：Vue 2 格式的组件选项对象 (`ComponentOptions`)。
- **输出**：Vue 3 格式的函数式组件 (`FunctionalComponent`)。

**主要逻辑流程：**

1.  **缓存检查**：
    - 使用 `normalizedFunctionalComponentMap` (WeakMap) 检查该组件选项是否已经被转换过。
    - 如果存在缓存，直接返回，避免重复创建。

2.  **创建包装组件 (`Func`)**：
    - 创建一个新的 Vue 3 函数式组件闭包。
    - **获取实例**：在渲染时调用 `getCurrentInstance()` 获取当前组件实例。
    - **构建遗留上下文 (`legacyCtx`)**：
        - 模拟 Vue 2 函数式组件 `render` 函数的第二个参数 `context`。
        - `props`: 直接使用 Vue 3 传入的 props。
        - `children`: 映射自 `instance.vnode.children`。
        - `data`: 映射自 `instance.vnode.props`。
        - `scopedSlots`: 直接映射 Vue 3 的 `ctx.slots`。
        - `parent`: 获取父组件的代理对象。
        - `slots()`: **关键适配**。Vue 2 的 `slots()` 返回的是 VNode 数组对象，而 Vue 3 的 slots 是返回 VNode 的函数。这里使用 `Proxy` (`legacySlotProxyHandlers`) 拦截属性访问，当访问某个插槽时，自动执行对应的 Vue 3 插槽函数并返回结果。
        - `listeners`: 通过 `getCompatListeners` 获取兼容的事件监听器。
        - `injections`: 如果定义了 `inject`，则手动调用 `resolveInjections` 解析注入的数据。

3.  **执行渲染**：
    - 调用原始组件的 `render` 函数。
    - 参数 1：`compatH` (兼容 Vue 2 语法的 `h` 函数)。
    - 参数 2：构造好的 `legacyCtx`。

4.  **元数据复制**：
    - 将原始组件的 `props`, `name` (作为 `displayName`), `compatConfig` 复制到新的函数式组件上。
    - 显式设置 `inheritAttrs = false`，因为 Vue 2 的函数式组件默认不继承属性。

5.  **缓存并返回**：
    - 将生成的 `Func` 存入 `normalizedFunctionalComponentMap`。
    - 返回 `Func`。

### 2. `legacySlotProxyHandlers`

- 一个 `ProxyHandler` 对象。
- **用途**：用于拦截对 `legacyCtx.slots()` 返回对象的属性访问。
- **行为**：当访问 `target[key]` 时，如果该 key 对应的插槽存在（在 Vue 3 中是函数），则立即调用该函数 (`slot()`) 并返回结果（VNodes），从而模拟 Vue 2 中直接获取 VNodes 的行为。

## 依赖关系

- **`../component`**: 获取组件实例和类型定义。
- **`../componentOptions`**: 用于解析 `inject` 选项。
- **`./instanceListeners`**: 获取兼容的事件监听器。
- **`./renderFn`**: 获取兼容版本的 `h` 函数 (`compatH`)。
