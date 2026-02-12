# Hydration (激活) 逻辑总结

`packages/runtime-core/src/hydration.ts` 文件实现了 Vue 3 的客户端激活（Hydration）逻辑。Hydration 是指将服务器端渲染（SSR）生成的静态 HTML 标记转换为完全动态的客户端应用程序的过程。

## 核心概念

Hydration 的主要目标是复用现有的 DOM 结构，而不是重新创建它。它通过遍历现有的 DOM 树，并将其与客户端生成的虚拟 DOM（VNode）树进行匹配来实现这一点。

如果 DOM 结构与 VNode 匹配，Vue 将“激活”这些节点（例如，附加事件监听器）。如果不匹配，Vue 将尝试修复 DOM 或在开发模式下发出警告。

## 主要函数

### `createHydrationFunctions(rendererInternals)`

这是一个工厂函数，用于创建 hydration 相关的函数。它接收渲染器的内部方法（如 `patch`, `mountComponent` 等）作为参数，因为 hydration 逻辑与渲染器紧密耦合且依赖于 DOM 操作。

它返回两个函数：
1.  `hydrate`: 根 hydration 函数。
2.  `hydrateNode`: 用于递归激活单个节点的内部函数。

### `hydrate(vnode, container)`

这是 hydration 的入口点。
-   检查容器是否为空。如果为空，则回退到普通的挂载（Mount）过程。
-   如果不为空，调用 `hydrateNode` 从容器的第一个子节点开始激活。
-   激活完成后，刷新后置回调（post-flush callbacks）。

### `hydrateNode(node, vnode, ...)`

这是核心的递归函数，负责根据 VNode 的类型处理当前的 DOM 节点。它返回下一个待处理的兄弟节点。

主要逻辑根据 `vnode.type` 分发：
-   **Text (文本节点)**: 检查 DOM 节点是否为文本节点，内容是否匹配。如果不匹配，修正 DOM 内容。
-   **VComment (注释节点)**: 处理注释节点，包括 `<transition appear>` 的特殊情况。
-   **Static (静态节点)**: 处理静态提升的节点。如果内容被剥离，则从 DOM 中采用内容。
-   **Fragment (片段)**: 调用 `hydrateFragment` 处理片段。
-   **Element (元素)**: 调用 `hydrateElement` 处理普通元素。
-   **Component (组件)**: 初始化组件，并根据组件是否为异步组件进行特殊处理。
-   **Teleport / Suspense**: 调用各自实现的 `hydrate` 方法。

### `hydrateElement(el, vnode, ...)`

专门处理元素节点的激活：
1.  **Props (属性)**: 检查属性是否匹配（仅在开发/测试模式或特定情况下）。对于某些属性（如事件监听器、`.prop` 修饰符），强制执行 patch。
2.  **Children (子节点)**:
    -   如果是数组子节点，调用 `hydrateChildren`。
    -   如果是文本子节点，检查 `textContent` 是否匹配。
3.  **Hooks (钩子)**: 调度 `onVnodeBeforeMount`, `onVnodeMounted` 等生命周期钩子。

### `hydrateChildren(node, parentVNode, ...)`

遍历 VNode 的子节点数组，并与 DOM 中的子节点一一对应进行激活。
-   如果 DOM 节点多于 VNode 子节点，移除多余的 DOM 节点。
-   如果 DOM 节点少于 VNode 子节点，挂载缺失的 VNode。

### `handleMismatch(node, vnode, ...)`

当检测到 DOM 结构与 VNode 不匹配时调用。
-   在开发模式下，发出警告，详细说明预期值与实际值的差异。
-   尝试通过替换或修补 DOM 来从不匹配中恢复。

## 关键处理细节

-   **不匹配检测**: 使用 `propHasMismatch` 等函数在开发模式下严格检查属性、样式、类名等是否一致。
-   **空白处理**: HTML 解析器可能会在某些标签（如 `<pre>`, `<textarea>`）中处理换行符，hydration 逻辑考虑了这些差异。
-   **异步组件**: 异步组件在 hydration 期间可能尚未解析，需要创建占位符节点。
-   **Fragment 锚点**: 对于 Fragment，由于没有单一的根元素，需要通过查找特定的注释节点（如 `[` 和 `]`) 来确定片段的范围。

## MismatchTypes (不匹配类型)

定义了可能发生不匹配的几种类型：
-   `TEXT`: 文本内容不匹配。
-   `CHILDREN`: 子节点数量或结构不匹配。
-   `CLASS`: 类名不匹配。
-   `STYLE`: 样式不匹配。
-   `ATTRIBUTE`: 属性不匹配。

可以通过 `data-allow-mismatch` 属性来抑制特定元素的不匹配警告。
