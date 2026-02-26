# v-show 指令源码分析

## 1. 核心逻辑与原理
`v-show` 是 Vue 3 中一个非常常用的内置指令，用于根据表达式的真假值来切换 DOM 元素的显示和隐藏。它的核心原理是通过修改 DOM 元素的 `style.display` 属性来实现的：
- 当表达式为**真**时，恢复元素初始的 `display` 值（如 `block`、`inline-block` 或空字符串）。
- 当表达式为**假**时，将元素的 `display` 样式设为 `'none'`。

与 `v-if` 不同，`v-show` 不会操作 DOM 树节点的挂载和卸载，它只是简单地切换 CSS 样式。因此 `v-show` 更适合用于需要频繁切换显示状态的场景，因为它具有更低的切换开销。

## 2. 状态保存
在文件中定义了两个特殊的 `Symbol`，用于在 DOM 元素对象上安全地保存内部状态，防止与用户自定义的属性冲突：
- `vShowOriginalDisplay` (`_vod`)：用来记录元素在挂载前的初始 `display` 样式。这样在条件为真时，Vue 才知道要将其恢复成什么原始值。
- `vShowHidden` (`_vsh`)：一个布尔值，用于内部标记当前元素是否被 `v-show` 隐藏。

## 3. 指令钩子函数分析
`vShow` 本质上是一个对象指令 (`ObjectDirective`)，它实现了 Vue 指令生命周期的以下钩子函数：

- **`beforeMount`**（挂载前调用）：
  - 首先记录元素的初始 `display` 值，存入 `el[vShowOriginalDisplay]` 中。如果初始本身就是 `'none'`，则视为空字符串 `''` 以避免后续始终无法显示。
  - 结合 `<transition>` 过渡组件来决定如何初始化渲染：如果有过渡并且绑定值为 `true`，触发 `transition.beforeEnter`，否则直接调用内部的 `setDisplay` 函数设置元素的显示状态。
- **`mounted`**（挂载完成后调用）：
  - 主要处理过渡动画：如果有过渡组件包裹且初始值为 `true`，则调用 `transition.enter` 启动进入动画。
- **`updated`**（组件更新后调用）：
  - 核心逻辑：响应 `v-show` 绑定值的变化。
  - 利用 `!value === !oldValue` 进行短路判断，如果布尔值没有改变则直接 return，不执行任何操作。
  - 当状态改变时，检查是否存在过渡动画。如果存在，调用 `transition` 的对应钩子（`beforeEnter`, `enter`, `leave`），并在过渡期间配合修改 `display` 样式，让元素的显示/隐藏具备动画效果。
  - 如果没有动画，直接调用 `setDisplay` 修改 `display` 样式。
- **`beforeUnmount`**（卸载前调用）：
  - 重置一次 `setDisplay(el, value)`，防止带有 `v-show` 的元素在其对应的组件被卸载时产生状态不一致。

## 4. 辅助函数 setDisplay
`setDisplay` 是用于实际设置 DOM 元素 `display` 样式的内部工具函数。
它的逻辑非常简单：如果当前值 `value` 为真，将 `display` 设置为保存在 `_vod` 里的原始值，否则设置为 `'none'`。同时，它也会更新元素上的 `_vsh` 隐藏标记。

## 5. 服务端渲染 (SSR) 支持
文件底部提供了一个 `initVShowForSSR` 方法：
- 它的作用是为 `v-show` 指令对象添加 `getSSRProps` 方法。
- 当在 SSR（服务端渲染）阶段解析到 `v-show` 指令且其值为假（`false`）时，会在服务端输出时直接注入 `style="display: none;"` 的内联样式。这可以防止在客户端接管（Hydration）前发生由于 DOM 没有隐藏导致的页面闪烁（FOUC）问题。

## 总结
`v-show` 的源码通过精简而高效的方式直接操作 DOM 的 `display` 属性，实现了元素显示/隐藏的切换。不仅如此，它还完美集成了 Vue 强大的 `<transition>` 过渡系统以及对 SSR 环境的无缝兼容。