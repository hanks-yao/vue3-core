# BaseTransition 核心逻辑总结

`BaseTransition` 是 Vue 3 中 `<transition>` 组件的基础实现。它本身不渲染任何 DOM 元素，而是处理过渡逻辑，并将过渡钩子（hooks）附加到子节点的 VNode 上，供渲染器在插入、更新和移除元素时调用。

## 1. 核心功能

`BaseTransition` 的主要职责是：
-   读取并验证 props（如 `mode`, `appear`, 生命周期钩子）。
-   维护过渡状态（`TransitionState`）。
-   解析并生成 `TransitionHooks` 对象。
-   将 `TransitionHooks` 附加到子 VNode 上。
-   处理过渡模式（`out-in`, `in-out`）。

## 2. Props 定义

`BaseTransitionProps` 定义了组件接受的属性：
-   **mode**: 过渡模式，可选值 `'in-out' | 'out-in' | 'default'`。
-   **appear**: 是否在初次渲染时应用过渡。
-   **persisted**: 是否为持久化过渡（如 `v-show`），这种情况下元素不会被移除，而是切换显示状态。
-   **生命周期钩子**:
    -   `onBeforeEnter`, `onEnter`, `onAfterEnter`, `onEnterCancelled`
    -   `onBeforeLeave`, `onLeave`, `onAfterLeave`, `onLeaveCancelled`
    -   `onBeforeAppear`, `onAppear`, `onAfterAppear`, `onAppearCancelled`

## 3. 状态管理 (`TransitionState`)

使用 `useTransitionState` 维护组件内部状态：
-   `isMounted`: 组件是否已挂载。
-   `isLeaving`: 是否正在进行离开过渡。
-   `isUnmounting`: 组件是否正在卸载。
-   `leavingVNodes`: 跟踪正在离开的 VNode，用于处理相同 key 的元素快速切换的情况。

## 4. 钩子解析 (`resolveTransitionHooks`)

这是核心函数，它根据 props 和当前状态生成 `TransitionHooks` 对象。这个对象包含：
-   `beforeEnter`: 进入前调用。处理 `appear` 逻辑，取消正在进行的离开回调。
-   `enter`: 进入时调用。执行 `onEnter` 钩子，并在完成后调用 `onAfterEnter`。
-   `leave`: 离开时调用。执行 `onLeave` 钩子，并在完成后调用 `onAfterLeave` 并移除元素。
-   `clone`: 用于克隆钩子对象（例如在 Suspense 或组件更新时）。

## 5. 过渡模式处理

在 `setup` 函数中处理不同的过渡模式：

-   **default**: 新元素进入和旧元素离开同时进行。
-   **out-in**: 旧元素先离开，离开完成后新元素再进入。
    -   实现方式：当检测到 `out-in` 模式时，返回一个空占位符，并设置 `afterLeave` 钩子，在旧元素离开后触发更新以渲染新元素。
-   **in-out**: 新元素先进入，进入完成后旧元素再离开。
    -   实现方式：设置 `delayLeave` 钩子，将旧元素的离开推迟到新元素进入完成之后。

## 6. 子节点处理

-   **findNonCommentChild**: 确保 `<transition>` 只有一个非注释的根子节点（除非使用 `<transition-group>`）。
-   **getTransitionRawChildren**: 处理子节点列表，特别是处理 `Fragment`（如 `v-for`）和注释节点。它会扁平化 `Fragment` 并处理 key 的继承。
-   **getInnerChild**: 获取真实的子 VNode，处理 `KeepAlive` 和 `Teleport` 的情况。

## 7. 特殊情况处理

-   **KeepAlive**: 对于 `KeepAlive` 组件，在离开阶段会返回一个空的 `KeepAlive` 占位符，以防止 `KeepAlive` 实例被意外卸载。
-   **Persisted (v-show)**: 对于持久化过渡，钩子会被注入但渲染器会跳过常规的插入/移除逻辑，而是由指令（如 `v-show`）调用这些钩子。

## 8. 流程概览

1.  **Setup**: 初始化状态，获取当前实例。
2.  **Render**:
    -   获取子节点。
    -   检查是否处于 `isLeaving` 状态（`out-in` 模式下）。
    -   获取内部子节点（处理 `KeepAlive` 等）。
    -   解析当前子节点的 `enterHooks` 并附加。
    -   获取旧的子节点（`oldInnerChild`）。
    -   如果存在旧子节点且与新子节点不同：
        -   解析旧子节点的 `leavingHooks` 并附加。
        -   根据 `mode` (`out-in`, `in-out`) 调整钩子执行顺序或返回占位符。
    -   返回处理后的子节点。
