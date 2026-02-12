# Component 核心逻辑

`component.ts` 是 Vue 3 运行时核心中处理组件实例创建、初始化和设置的关键文件。它定义了组件实例的内部结构 (`ComponentInternalInstance`) 以及管理组件生命周期的核心函数。

## 核心数据结构

### `ComponentInternalInstance`
这是 Vue 组件的内部实例对象，包含了组件运行所需的所有状态和属性：
- **标识与关系**: `uid`, `type` (组件定义), `parent`, `root`, `appContext`.
- **VNode**: `vnode` (当前组件的 vnode), `subTree` (组件渲染出的 vnode 树), `next` (更新时的下一个 vnode).
- **响应式系统**: `effect` (渲染副作用), `scope` (响应式作用域), `data`, `props`, `attrs`, `slots`, `refs`.
- **Setup 状态**: `setupState`, `setupContext`.
- **生命周期钩子**: 存储 `mounted`, `updated`, `unmounted` 等生命周期回调函数。
- **渲染**: `render` (渲染函数), `proxy` (公开实例代理), `ctx` (渲染上下文).

## 核心流程

### 1. `createComponentInstance(vnode, parent, suspense)`
创建组件实例对象。
- 初始化实例的基本属性（uid, vnode, type 等）。
- 继承父级或应用的上下文 (`appContext`)。
- 初始化响应式数据容器（props, slots, attrs, emit 等）。
- 设置生命周期钩子数组。
- 创建渲染上下文 (`ctx`)。

### 2. `setupComponent(instance, isSSR)`
初始化组件。
- **Props & Slots**: 调用 `initProps` 和 `initSlots` 初始化属性和插槽。
- **Stateful Component**: 如果是有状态组件（非函数式组件），调用 `setupStatefulComponent`。

### 3. `setupStatefulComponent(instance, isSSR)`
设置有状态组件。
- **Render Proxy**: 创建 `instance.proxy`，这是组件内部 `this` 的指向。
- **Call Setup**: 如果组件定义了 `setup` 函数：
    - 创建 `setupContext` (attrs, slots, emit, expose)。
    - 调用 `setup()` 函数，传入 `props` 和 `setupContext`。
    - 处理 `setup()` 的返回值：
        - 如果返回 Promise（异步 setup），处理 Suspense 逻辑。
        - 如果返回函数，作为渲染函数 (`render`)。
        - 如果返回对象，作为 `setupState`（响应式状态）。

### 4. `handleSetupResult(instance, setupResult)`
处理 `setup()` 的返回值。
- 区分返回值是渲染函数还是状态对象。
- 如果是状态对象，将其代理并赋值给 `instance.setupState`。

### 5. `finishComponentSetup(instance)`
完成组件设置。
- **Template Compilation**: 如果组件没有 `render` 函数但有 `template`，且存在编译器，则编译模板生成渲染函数。
- **Options API Support**: 兼容 Vue 2 的 Options API (`data`, `methods`, `computed` 等)，通过 `applyOptions` 应用。

## 辅助功能
- **`getCurrentInstance`**: 获取当前正在执行 setup 或生命周期的组件实例。
- **`createSetupContext`**: 创建传递给 setup 函数的上下文对象。
- **`formatComponentName`**: 格式化组件名称，用于警告和调试。
