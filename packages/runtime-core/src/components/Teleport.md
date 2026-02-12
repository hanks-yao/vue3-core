# Teleport 组件源码分析

`packages/runtime-core/src/components/Teleport.ts` 实现了 Vue 3 的内置组件 `<Teleport>`。该组件允许开发者将组件模板的一部分渲染到 DOM 中的另一个位置（目标容器），而不是父组件的 DOM 层次结构中。

## 核心逻辑概述

`Teleport` 的核心实现包含在 `TeleportImpl` 对象中，它是一个特殊的组件实现对象，直接被渲染器（Renderer）识别和处理。

### 1. 挂载 (Mount)

当 `Teleport` 组件首次渲染时，`process` 函数会被调用（`n1` 为 `null`）：

1.  **创建锚点**：在主视图（原位置）创建 `placeholder`（开始锚点）和 `mainAnchor`（结束锚点），用于占位。
2.  **查找目标**：使用 `resolveTarget` 函数根据 `to` 属性查找目标 DOM 元素。
3.  **处理禁用状态**：
    *   如果 `disabled` 为 `true`，内容会被挂载到主视图的锚点之间。
    *   如果 `disabled` 为 `false`（默认），内容会被挂载到目标容器中。
4.  **推迟挂载 (Defer)**：如果设置了 `defer` 属性，挂载操作会被推迟到当前渲染周期之后执行。

### 2. 更新 (Patch)

当组件更新时，`process` 函数再次被调用：

1.  **更新属性**：更新 `to` 目标和 `disabled` 状态。
2.  **处理动态子节点**：如果有动态子节点（Block Tree），走快速路径 `patchBlockChildren`；否则走常规 `patchChildren`。
3.  **处理状态变更**：
    *   **Disabled 切换**：
        *   `enabled -> disabled`：将内容从目标容器移动回主视图。
        *   `disabled -> enabled`：将内容从主视图移动到目标容器。
    *   **目标变更 (Target Change)**：如果 `to` 属性改变且未禁用，将内容移动到新的目标容器。

### 3. 移除 (Remove)

`remove` 函数负责清理工作：

1.  移除目标容器中的锚点（`targetStart`, `targetAnchor`）。
2.  移除主视图中的锚点。
3.  卸载（Unmount）所有子节点。

### 4. 移动 (Move)

`moveTeleport` 函数处理节点的移动操作，支持三种类型：

*   `TARGET_CHANGE`：目标容器改变，移动内容到新容器。
*   `TOGGLE`：启用/禁用状态切换，在主视图和目标容器之间移动内容。
*   `REORDER`：在同一容器内重新排序。

### 5. 服务端渲染注水 (Hydration)

`hydrateTeleport` 函数处理 SSR 注水逻辑：

1.  查找目标容器。
2.  如果目标容器中已经存在由 SSR 渲染的内容，尝试复用现有 DOM 节点。
3.  处理多个 `Teleport` 指向同一目标的情况，通过 `_lpa` (last teleport anchor) 属性记录上一个 Teleport 的结束位置，确保后续 Teleport 正确追加。
4.  如果 HTML 结构不匹配（例如目标容器中缺少锚点），会尝试修复（手动添加锚点）。

## 关键辅助函数

*   **`resolveTarget`**：解析 `to` 属性。支持选择器字符串（使用 `querySelector`）或直接传入 DOM 元素。如果是字符串且找不到元素，会发出警告。
*   **`isTeleportDisabled`**：检查 `disabled` prop。
*   **`prepareAnchor`**：在目标容器中创建并插入开始和结束锚点，用于标记 Teleport 内容的范围。

## 特殊处理细节

*   **SVG/MathML 支持**：自动检测目标容器是否为 SVG 或 MathML 元素，并调整命名空间。
*   **HMR 支持**：在开发环境下，HMR 更新会强制全量 Diff，并进行深度遍历以确保 DOM 引用正确更新。
*   **CSS 变量**：`updateCssVars` 函数确保在 Teleport 移动内容时，CSS 变量（`v-bind`）能正确应用到新的位置。
