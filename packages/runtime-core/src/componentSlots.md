# Component Slots (组件插槽)

该文件 `packages/runtime-core/src/componentSlots.ts` 主要负责 Vue 3 组件插槽（Slots）的初始化、规范化（Normalization）和更新逻辑。它处理了从编译器生成的插槽、手动编写的渲染函数插槽以及 JSX 插槽等多种形式，确保它们在运行时被统一处理。

## 核心类型定义

### `Slot`
插槽函数的类型定义。插槽本质上是一个函数，接收参数并返回 `VNode` 数组。
```typescript
export type Slot<T extends any = any> = (
  ...args: IfAny<T, any[], [T] | (T extends undefined ? [] : never)>
) => VNode[]
```

### `InternalSlots` & `Slots`
*   `InternalSlots`: 内部使用的插槽对象，键是插槽名，值是 `Slot` 函数或 `undefined`。
*   `Slots`: 公开给用户的只读插槽对象。

### `RawSlots`
原始插槽对象，可能包含编译器生成的优化标志。
*   `_`: 编译器生成的插槽标志 (`SlotFlags`)。
*   `_ctx`: 插槽所属的组件实例上下文。
*   `$stable`: 手动渲染函数的提示，用于跳过强制子节点更新。

## 核心流程函数

### 1. `initSlots(instance, children, optimized)`
初始化组件实例的插槽。
*   **输入**: 组件实例、子节点（可能是插槽对象或 VNode）、优化标志。
*   **逻辑**:
    *   创建 `instance.slots` 对象。
    *   根据 `ShapeFlags.SLOTS_CHILDREN` 判断子节点是否为插槽对象。
    *   如果是编译后的插槽（有 `_` 标志），直接赋值并处理优化标记。
    *   如果是普通对象插槽，调用 `normalizeObjectSlots` 进行规范化。
    *   如果不是对象（如直接传递的 VNode），调用 `normalizeVNodeSlots` 将其作为默认插槽处理。

### 2. `updateSlots(instance, children, optimized)`
更新组件实例的插槽。
*   **输入**: 组件实例、新的子节点、优化标志。
*   **逻辑**:
    *   检查是否需要更新插槽。
    *   **编译优化**:
        *   如果是 HMR 更新，强制更新。
        *   如果是稳定插槽 (`SlotFlags.STABLE`)，且处于优化模式，则跳过更新。
        *   如果是动态插槽（如 `v-if`/`v-for`），更新插槽但跳过规范化。
    *   **非编译插槽**:
        *   根据 `$stable` 标志决定是否需要检查删除过时的插槽。
        *   调用 `normalizeObjectSlots` 或 `normalizeVNodeSlots` 更新插槽。
    *   **清理**: 删除不再存在的过时插槽。

## 辅助规范化函数

### `normalizeSlot(key, rawSlot, ctx)`
将单个插槽函数规范化。
*   使用 `withCtx` 绑定正确的上下文。
*   在开发环境下检查插槽是否在渲染函数外部调用。
*   确保返回值是 `VNode` 数组。

### `normalizeObjectSlots(rawSlots, slots, instance)`
遍历插槽对象，对每个插槽调用 `normalizeSlot`。
*   过滤掉内部属性（`_`, `_ctx`, `$stable`）。
*   处理非函数类型的插槽值（将其包装为返回该值的函数）。

### `normalizeVNodeSlots(instance, children)`
处理非对象类型的子节点（即默认插槽）。
*   将子节点规范化为数组，并赋值给 `instance.slots.default`。

## 关键优化策略

1.  **编译标志 (`_`)**: Vue 编译器会为模板中生成的插槽添加标志，运行时利用这些标志来判断插槽是否稳定，从而避免不必要的更新。
2.  **上下文绑定 (`_ctx`)**: 确保插槽函数在执行时具有正确的上下文（即定义插槽的父组件实例），这对于依赖注入和生命周期等功能至关重要。
3.  **按需规范化**: 只有在需要时才对插槽进行规范化，提高性能。
