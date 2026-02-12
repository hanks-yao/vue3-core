# Vue 3 Reactivity - reactive.ts 源码解析

`packages/reactivity/src/reactive.ts` 是 Vue 3 响应式系统的核心入口文件之一，主要负责创建和管理响应式对象（Reactive Objects）。它基于 ES6 Proxy 实现，提供了深层响应式、浅层响应式、只读代理等多种能力。

## 1. 核心概念

### 1.1 响应式代理 (Reactive Proxy)
Vue 3 使用 `Proxy` 来拦截对对象的访问和修改操作。通过 `reactive` 函数创建的对象实际上是一个 Proxy 实例。当访问属性时，会收集依赖（track）；当修改属性时，会触发依赖更新（trigger）。

### 1.2 目标对象 (Target)
被代理的原始对象。`Target` 接口定义了对象上可能存在的内部标志位：
- `ReactiveFlags.SKIP`: 标记对象不应被转换为响应式。
- `ReactiveFlags.IS_REACTIVE`: 标记对象已经是响应式代理。
- `ReactiveFlags.IS_READONLY`: 标记对象是只读代理。
- `ReactiveFlags.IS_SHALLOW`: 标记对象是浅层代理。
- `ReactiveFlags.RAW`: 存储代理对应的原始对象。

### 1.3 缓存映射 (WeakMap)
为了避免重复创建代理，Vue 使用 `WeakMap` 来缓存原始对象到代理对象的映射：
- `reactiveMap`: 存储 `reactive` 创建的代理。
- `shallowReactiveMap`: 存储 `shallowReactive` 创建的代理。
- `readonlyMap`: 存储 `readonly` 创建的代理。
- `shallowReadonlyMap`: 存储 `shallowReadonly` 创建的代理。

## 2. 核心 API

### 2.1 `reactive(target)`
- **功能**: 创建一个深层响应式代理。
- **特点**:
  - 递归地将所有嵌套属性转换为响应式。
  - 自动解包嵌套的 ref 属性（除非在集合类型如 Map 中）。
  - 如果传入的对象已经是响应式的，直接返回该对象。
  - 如果传入只读对象，直接返回该只读对象。

### 2.2 `shallowReactive(target)`
- **功能**: 创建一个浅层响应式代理。
- **特点**:
  - 只有根级别的属性是响应式的。
  - 嵌套对象保持原样（非响应式）。
  - 不会自动解包 ref 属性。

### 2.3 `readonly(target)`
- **功能**: 创建一个深层只读代理。
- **特点**:
  - 对象的任何属性（包括嵌套属性）都不可修改。
  - 尝试修改会触发警告。
  - 同样具有 ref 自动解包功能。

### 2.4 `shallowReadonly(target)`
- **功能**: 创建一个浅层只读代理。
- **特点**:
  - 只有根级别属性是只读的。
  - 嵌套对象的属性可以被修改（如果它们本身不是只读的）。

## 3. 实现原理

### 3.1 `createReactiveObject`
这是所有响应式创建函数的底层工厂函数。它的主要逻辑如下：
1. **检查类型**: 如果目标不是对象，直接返回。
2. **检查现有代理**:
   - 如果目标已经是 Proxy（且不是将响应式对象转为只读），直接返回。
   - 如果目标已经存在于缓存 Map 中，直接返回缓存的 Proxy。
3. **检查白名单**: 通过 `targetTypeMap` 判断对象类型。只有普通对象 (`Object`, `Array`) 和集合类型 (`Map`, `Set`, `WeakMap`, `WeakSet`) 可以被代理。
4. **创建 Proxy**:
   - 使用 `new Proxy(target, handlers)` 创建代理。
   - 根据对象类型选择不同的处理器 (`baseHandlers` 或 `collectionHandlers`)。
5. **缓存**: 将新创建的 Proxy 存入对应的 `WeakMap`。

### 3.2 处理器 (Handlers)
代理的行为由传入的处理器决定：
- **`baseHandlers`**: 用于普通对象和数组（来自 `./baseHandlers`）。
- **`collectionHandlers`**: 用于集合类型（来自 `./collectionHandlers`）。

## 4. 工具函数

- **`isReactive(value)`**: 检查值是否为响应式代理。
- **`isReadonly(value)`**: 检查值是否为只读代理。
- **`isProxy(value)`**: 检查值是否为任意类型的 Proxy。
- **`toRaw(observed)`**: 获取代理对象的原始对象。这是一个“逃生舱”，用于在不触发响应式追踪的情况下读取或修改数据。
- **`markRaw(value)`**: 标记一个对象，使其永远不会被转换为响应式代理。
- **`toReactive(value)`**: 如果值是对象，将其转换为响应式；否则返回原值。
- **`toReadonly(value)`**: 如果值是对象，将其转换为只读；否则返回原值。

## 5. 总结
`reactive.ts` 构建了 Vue 3 响应式系统的基础架构。它通过 Proxy 机制实现了数据的透明代理，利用 WeakMap 实现了高效的缓存策略，并提供了灵活的 API 来满足不同场景下的响应式需求（深层/浅层、读写/只读）。
