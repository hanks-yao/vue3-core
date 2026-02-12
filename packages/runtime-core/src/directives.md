# Directives 模块逻辑总结

`packages/runtime-core/src/directives.ts` 文件主要负责 Vue 3 中自定义指令（Custom Directives）的运行时处理逻辑。它定义了指令的类型接口，并提供了将指令应用到 VNode 以及在适当的时机调用指令生命周期钩子的核心函数。

## 核心概念

### 1. 指令类型定义

- **`DirectiveBinding`**: 传递给指令钩子的参数对象，包含以下属性：
  - `instance`: 使用指令的组件实例。
  - `value`: 指令传递的新值。
  - `oldValue`: 指令更新前的旧值。
  - `arg`: 指令参数（例如 `v-my-directive:foo` 中的 `foo`）。
  - `modifiers`: 指令修饰符对象（例如 `v-my-directive.bar` 中的 `{ bar: true }`）。
  - `dir`: 指令定义对象本身。

- **`ObjectDirective`**: 对象形式的指令定义，包含各种生命周期钩子：
  - `created`
  - `beforeMount`
  - `mounted`
  - `beforeUpdate`
  - `updated`
  - `beforeUnmount`
  - `unmounted`
  - `getSSRProps`: SSR 特有的钩子。
  - `deep`: 是否深度监听。

- **`FunctionDirective`**: 函数形式的指令定义。如果指令只是一个函数，它会被同时用作 `mounted` 和 `updated` 钩子。

### 2. `withDirectives` 函数

这是编译器生成的渲染函数中使用的辅助函数，用于将指令绑定到 VNode 上。

- **输入**:
  - `vnode`: 目标 VNode。
  - `directives`: 指令参数数组，每个元素是一个数组 `[dir, value, arg, modifiers]`。
- **逻辑**:
  1. 检查是否在渲染函数内部调用。
  2. 获取当前组件实例。
  3. 初始化或获取 `vnode.dirs` 数组。
  4. 遍历传入的指令数组：
     - 如果指令是函数，将其转换为对象形式（`mounted` 和 `updated`）。
     - 如果指令标记为 `deep`，遍历 `value` 以触发响应式依赖收集。
     - 创建 `DirectiveBinding` 对象并推入 `vnode.dirs`。
- **输出**: 返回绑定了指令信息的 VNode。

### 3. `invokeDirectiveHook` 函数

该函数负责在组件生命周期的不同阶段触发 VNode 上所有指令的对应钩子。

- **输入**:
  - `vnode`: 当前 VNode。
  - `prevVNode`: 上一次渲染的 VNode（用于获取 `oldValue`）。
  - `instance`: 组件实例。
  - `name`: 要调用的钩子名称（如 `mounted`, `updated` 等）。
- **逻辑**:
  1. 获取 `vnode.dirs` 中的所有指令绑定。
  2. 如果存在 `prevVNode`，更新绑定对象中的 `oldValue`。
  3. 获取指令定义中对应 `name` 的钩子函数。
  4. 如果存在钩子函数：
     - **暂停响应式追踪** (`pauseTracking`)：防止钩子内部的操作意外触发响应式更新或依赖收集。
     - **调用钩子**：使用 `callWithAsyncErrorHandling` 安全地执行钩子，捕获可能的错误。
     - **恢复响应式追踪** (`resetTracking`)。

## 总结

这个模块是 Vue 指令系统的运行时核心，连接了编译后的代码（通过 `withDirectives`）和组件的生命周期（通过 `invokeDirectiveHook`）。它确保了指令能够正确地接收参数、值和修饰符，并在 DOM 元素挂载、更新或卸载时执行用户定义的逻辑。
