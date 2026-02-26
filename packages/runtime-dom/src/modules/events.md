# `events.ts` 源码逻辑总结

该文件主要负责 Vue 3 中 DOM 事件的绑定、更新和移除逻辑。它通过一种称为 "Invoker" 的机制来优化事件更新的性能，并处理了一些边缘情况。

## 核心机制：Invoker

在 Vue 中，组件的更新可能会导致事件处理函数（handler）发生变化。如果每次 handler 变化都执行原生的 `removeEventListener` 和 `addEventListener`，性能开销会很大。

为了解决这个问题，Vue 使用了一个名为 `Invoker` 的包装函数作为真正的 DOM 事件监听器。

*   **结构**：`Invoker` 是一个函数，它内部持有一个 `value` 属性，指向当前实际的事件处理函数（或函数数组）。
*   **优势**：当 handler 更新时，Vue 只需要更新 `invoker.value`，而不需要重新绑定 DOM 事件。只有在首次绑定或完全移除事件时，才会调用原生的 DOM API。

## 主要函数：`patchEvent`

`patchEvent` 是该文件的入口函数，用于更新 DOM 元素的事件监听器。

### 逻辑流程

1.  **获取 Invokers**：通过 `veiKey`（一个 Symbol）从 DOM 元素上获取已缓存的 invokers 对象。
2.  **判断操作类型**：
    *   **更新 (Patch)**：如果存在新值 (`nextValue`) 且该事件已有对应的 `existingInvoker`，则直接更新 `existingInvoker.value = nextValue`。
    *   **添加 (Add)**：如果存在新值但没有 `existingInvoker`，则创建一个新的 `Invoker`，并调用 `addEventListener` 绑定到 DOM 元素上。
    *   **移除 (Remove)**：如果不存在新值但有 `existingInvoker`，则调用 `removeEventListener` 移除监听器，并清除缓存。

## 关键细节处理

### 1. 事件修饰符 (Event Modifiers)

`parseName` 函数负责解析事件名称中的修饰符。Vue 3 支持在事件名后缀中直接包含修饰符，例如 `clickOnce`、`clickPassive` 等。

*   支持的修饰符：`Once`, `Passive`, `Capture`。
*   解析逻辑：通过正则匹配后缀，将其解析为 `addEventListener` 的 `options` 参数。

### 2. 时间戳检查 (Timestamp Check)

为了解决特定的异步边缘情况（issue #6566），Vue 引入了时间戳检查机制。

*   **问题**：在某些情况下（如微任务），如果内部元素的点击事件触发了组件更新，导致父元素在冒泡阶段绑定了同一个点击事件，父元素可能会立即触发该事件，这通常是不符合预期的。
*   **解决方案**：
    *   在创建 `Invoker` 时，记录当前时间戳 `invoker.attached`。
    *   在事件触发时，记录事件的时间戳 `e.timeStamp`（或 `Date.now()`）。
    *   **判断**：如果事件的时间戳早于或等于绑定时间戳 (`e.timeStamp <= invoker.attached`)，则不执行处理函数。这确保了 handler 只处理绑定之后发生的事件。

### 3. 多事件处理器 (Multiple Handlers)

Vue 支持为一个事件绑定多个处理函数（即 `v-on="[handler1, handler2]"`）。

*   **实现**：`Invoker.value` 可以是一个函数数组。
*   **stopImmediatePropagation**：为了支持数组 handler 中的 `stopImmediatePropagation`，Vue 对其进行了封装 (`patchStopImmediatePropagation`)。如果数组中某个 handler 调用了该方法，后续的 handler 将不会被执行。

## 总结

`events.ts` 通过 `Invoker` 模式极大地优化了事件更新的性能，同时通过时间戳机制解决了复杂的 DOM 事件冒泡与更新时序问题，是 Vue 3 Runtime DOM 中非常关键的一部分。
