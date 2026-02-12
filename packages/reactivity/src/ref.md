# Ref 模块源码分析

`packages/reactivity/src/ref.ts` 是 Vue 3 响应式系统中处理基本数据类型响应式的核心模块。它定义了 `ref` 及其相关工具函数。

## 核心概念

### 1. Ref 接口

`Ref` 是一个标准化的接口，规定了响应式引用必须包含一个 `.value` 属性。

- **RefSymbol**: 一个唯一的 Symbol，用于在类型层面区分 Ref 对象和其他对象。

### 2. RefImpl 类

这是 `ref()` 返回的对象的实际实现类。

- **原理**: 使用 `get` 和 `set` 拦截对 `.value` 的访问。
- **依赖收集 (`track`)**: 在 `get value()` 中调用 `dep.track()`，将当前活动的副作用（Effect）添加到依赖列表中。
- **触发更新 (`trigger`)**: 在 `set value()` 中，如果新值与旧值不同，更新内部值并调用 `dep.trigger()`，通知所有依赖更新。
- **深层响应**: 如果传入的值是对象，`RefImpl` 默认会通过 `toReactive` 将其转换为响应式代理。

### 3. 依赖管理 (Dep)

每个 `RefImpl` 实例都有一个 `dep` 属性（`Dep` 类的实例），专门用于管理该 Ref 的依赖关系。

## 主要 API

### `ref(value)`

- **功能**: 创建一个响应式引用。
- **逻辑**:
  - 如果传入的已经是 Ref，直接返回。
  - 否则，创建并返回一个新的 `RefImpl` 实例。

### `shallowRef(value)`

- **功能**: 创建一个浅层响应式引用。
- **区别**: `RefImpl` 在构造时接收 `shallow` 标志。如果是浅层，`.value` 存储原始值，不会调用 `toReactive` 进行深层转换。只有 `.value` 本身被替换时才会触发更新，修改 `.value` 内部对象的属性不会触发。

### `triggerRef(ref)`

- **功能**: 强制触发 Ref 的更新。
- **场景**: 主要配合 `shallowRef` 使用，当修改了浅层 Ref 内部对象的属性后，手动通知依赖更新。

### `customRef(factory)`

- **功能**: 创建自定义 Ref。
- **逻辑**: 允许用户传入一个工厂函数，显式控制依赖收集 (`track`) 和触发更新 (`trigger`) 的时机。返回 `CustomRefImpl` 实例。

### `toRef(source, key?)`

- **功能**: 将值、Getter 或对象的某个属性转换为 Ref。
- **实现**:
  - 如果是函数，创建 `GetterRefImpl`（只读）。
  - 如果是对象属性，创建 `ObjectRefImpl`。`ObjectRefImpl` 不存储实际值，而是代理访问源对象的属性，保持引用的同步。

### `toRefs(object)`

- **功能**: 将响应式对象转换为普通对象，其中每个属性都是指向源对象对应属性的 Ref。
- **场景**: 常用于解构响应式对象（如 `props` 或 `setup` 返回值）而不丢失响应性。

### `unref(ref)`

- **功能**: 语法糖，如果参数是 Ref 则返回 `.value`，否则返回参数本身。

### `proxyRefs(object)`

- **功能**: 创建一个代理，自动解包对象中的 Ref 属性。
- **场景**: Vue 组件的 `setup()` 返回的对象在模板中使用时，不需要写 `.value`，就是通过这个函数处理的。

## 辅助类

- **ObjectRefImpl**: `toRef` 对对象属性的实现。它没有自己的 `dep`，而是直接访问源对象的属性，从而利用源对象的响应式系统。
- **GetterRefImpl**: `toRef` 对 Getter 函数的实现。只读，每次访问 `.value` 时执行 Getter。

## 总结

`ref.ts` 通过包装器模式（Wrapper Pattern），解决了 JavaScript 基本数据类型无法被 Proxy 代理的问题。它与 `reactive` 模块互补，共同构成了 Vue 3 灵活的响应式 API。
