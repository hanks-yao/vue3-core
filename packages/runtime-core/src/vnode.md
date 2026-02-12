# VNode 核心逻辑总结

`packages/runtime-core/src/vnode.ts` 文件是 Vue 3 运行时核心中关于虚拟节点（Virtual Node，简称 VNode）定义和操作的核心文件。它定义了 VNode 的结构、创建方法以及相关的工具函数。

## 1. VNode 定义

VNode 是 Vue 中对 DOM 节点的抽象描述。

### 核心类型
- **`VNode` 接口**: 定义了 VNode 的所有属性，包括：
    - `type`: 节点类型（标签名、组件、片段等）。
    - `props`: 节点的属性。
    - `children`: 子节点。
    - `el`: 对应的真实 DOM 节点。
    - `shapeFlag`: 描述节点类型的位掩码（元素、组件、文本等），用于优化判断。
    - `patchFlag`: 描述节点动态特性的位掩码，用于 Diff 算法优化。
    - `component`: 如果是组件节点，指向组件实例。
    - `dirs`: 指令集合。

### 特殊节点类型
- **`Fragment`**: 片段，允许组件返回多个根节点。
- **`Text`**: 文本节点。
- **`Comment`**: 注释节点。
- **`Static`**: 静态节点，用于静态提升优化。

## 2. VNode 创建

Vue 提供了多种创建 VNode 的方法：

- **`createVNode`**: 创建 VNode 的主要入口。它会进行参数标准化、类型检查，并处理类组件、兼容模式等情况。
- **`createBaseVNode`**: `createVNode` 最终调用的底层函数，负责实际构建 VNode 对象。
- **`createElementBlock`**: 用于创建 Block 类型的 VNode（通常是元素节点），配合 Block Tree 优化。
- **`createBlock`**: 创建 Block 根节点，用于动态组件或特定结构。
- **`createTextVNode`**, **`createCommentVNode`**, **`createStaticVNode`**: 创建特定类型的 VNode。

## 3. Block Tree 优化

Vue 3 引入了 Block Tree 概念来优化 Diff 性能。

- **概念**: 将模板划分为嵌套的 Block。在 Block 内部，只有动态节点（带有 `patchFlag`）会被追踪。
- **`blockStack`**: 维护当前打开的 Block 栈。
- **`openBlock`**: 开启一个新的 Block，开始收集动态子节点。
- **`closeBlock`**: 关闭当前 Block。
- **`setupBlock`**: 将收集到的动态子节点数组赋值给 VNode 的 `dynamicChildren` 属性。
- **机制**: 当 VNode 被创建时，如果当前处于 Block 收集模式，且该 VNode 是动态的（有 `patchFlag`），它会被推入父 Block 的 `dynamicChildren` 数组中。Diff 时只需遍历 `dynamicChildren`，跳过静态节点。

## 4. 标准化 (Normalization)

为了保证 VNode 结构的统一性，Vue 提供了标准化函数：

- **`normalizeVNode`**: 将子节点标准化为 VNode。例如，将字符串/数字转换为文本 VNode，将数组转换为 Fragment。
- **`normalizeChildren`**: 标准化 VNode 的 `children` 属性。根据 `shapeFlag` 处理数组子节点、插槽对象或文本子节点。

## 5. 克隆 (Cloning)

- **`cloneVNode`**: 克隆一个现有的 VNode。常用于复用 VNode 或在保留原有属性的基础上添加新属性（如 `mergeProps`）。
- **`deepCloneVNode`**: 开发环境下用于 HMR，深拷贝 VNode 及其子节点。

## 6. 其他工具函数

- **`isVNode`**: 判断一个对象是否是 VNode。
- **`isSameVNodeType`**: 判断两个 VNode 是否是相同类型（类型相同且 key 相同），用于 Diff 算法判断是否复用节点。
- **`mergeProps`**: 合并两个 props 对象，特殊处理 `class`、`style` 和事件监听器。
