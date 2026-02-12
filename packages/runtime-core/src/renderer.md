# Renderer (渲染器)

`packages/runtime-core/src/renderer.ts` 是 Vue 3 运行时核心中最关键的文件，它实现了平台无关的渲染逻辑。通过 `createRenderer` API，可以将 Vue 的运行时能力扩展到不同的平台（如 DOM、Canvas、终端等）。

## 核心职责

1.  **创建渲染器**: 提供 `createRenderer` 和 `createHydrationRenderer`，接收平台特定的节点操作（`nodeOps`）和属性操作（`patchProp`）。
2.  **虚拟 DOM Diff (Patching)**: 实现了核心的 `patch` 函数，用于比较新旧 VNode，并更新宿主环境的视图。
3.  **组件生命周期管理**: 管理组件的挂载、更新和卸载，以及生命周期钩子的调用。
4.  **调度与副作用**: 结合响应式系统，建立组件的渲染副作用（Render Effect），并在数据变化时触发更新。

## 主要流程

### 1. 渲染入口 (`render`)

`render` 函数是渲染器的入口，它接收一个 VNode 和一个容器（Container）。
-   如果 VNode 为空且容器中有旧 VNode，则执行卸载（`unmount`）。
-   否则，调用 `patch` 进行挂载或更新。

### 2. Patch (Diff 核心)

`patch` 函数根据 VNode 的类型（`type`）和形状（`shapeFlag`）分发处理逻辑：
-   **Text/Comment/Static**: 处理文本、注释和静态节点。
-   **Fragment**: 处理片段（多个根节点），通常涉及 `mountChildren` 或 `patchChildren`。
-   **Element**: 处理原生元素（如 `<div>`）。
    -   **挂载 (`mountElement`)**: 创建元素，处理 Props，挂载子节点。
    -   **更新 (`patchElement`)**: 对比 Props，更新子节点（Diff）。
-   **Component**: 处理组件。
    -   **挂载 (`mountComponent`)**: 创建组件实例，设置响应式副作用。
    -   **更新 (`updateComponent`)**: 检查是否需要更新，触发组件的副作用重新运行。
-   **Teleport/Suspense**: 处理内置特殊组件。

### 3. 组件挂载与更新 (`setupRenderEffect`)

组件的挂载过程会创建一个 `ReactiveEffect`（响应式副作用）：
-   **Render**: 调用组件的 `render` 函数生成子树 VNode (`subTree`)。
-   **Patch**: 将 `subTree` 传递给 `patch` 函数，递归处理。
-   **依赖收集**: 在 `render` 执行期间，访问的响应式数据会被收集为依赖。
-   **触发更新**: 当依赖数据变化时，调度器（Scheduler）会触发副作用重新执行，重新 `render` 并 `patch`。

### 4. Diff 算法 (`patchKeyedChildren`)

当新旧子节点都是数组且有 Key 时，采用快速 Diff 算法，分为 5 步：
1.  **前序同步**: 从头部开始对比，跳过相同的节点。
2.  **后序同步**: 从尾部开始对比，跳过相同的节点。
3.  **新增**: 如果旧节点遍历完，新节点还有剩余，则挂载新节点。
4.  **删除**: 如果新节点遍历完，旧节点还有剩余，则卸载旧节点。
5.  **乱序处理**:
    -   构建新节点的 Key-Index 映射。
    -   遍历旧节点，尝试在新节点中找到对应项（通过 Key 或类型）。
    -   移动和复用节点，删除不存在的节点。
    -   使用 **最长递增子序列 (LIS)** 算法计算最小移动次数，优化 DOM 操作。

### 5. Block Tree 优化

Vue 3 引入了 Block Tree 概念，通过编译器生成的 `PatchFlags` 和 `dynamicChildren`，在更新时可以跳过静态节点的比对，只追踪动态节点，将 Diff 复杂度从树的大小降低到动态节点的数量。
