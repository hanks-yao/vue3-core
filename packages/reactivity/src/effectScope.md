# EffectScope 逻辑总结

`EffectScope` 是 Vue 3 响应式系统中的一个高级 API，用于统一收集和管理副作用（Effect）的生命周期。它允许开发者创建一个作用域，在该作用域内创建的所有响应式副作用（如 `computed`、`watch`、`watchEffect` 等）都会被自动捕获，并可以通过调用作用域的 `stop()` 方法一次性停止。

## 核心作用

1.  **批量管理副作用**：避免手动追踪和停止每个副作用。
2.  **组件卸载清理**：Vue 组件内部使用 `EffectScope` 来管理组件内的所有副作用，当组件卸载时，自动停止该作用域。
3.  **高级库开发**：为库作者提供一种机制，在独立的作用域中创建和销毁响应式状态。

## 核心结构 (`EffectScope` 类)

### 关键属性

*   **`active`**: 布尔值，表示当前作用域是否处于激活状态。
*   **`effects`**: `ReactiveEffect[]`，存储在该作用域内创建的所有响应式副作用。
*   **`cleanups`**: `(() => void)[]`，存储通过 `onScopeDispose` 注册的清理回调函数。
*   **`scopes`**: `EffectScope[]`，存储在该作用域内创建的子作用域（非分离模式）。
*   **`parent`**: 指向父级作用域。
*   **`detached`**: 布尔值，标记是否为分离模式。分离模式下的作用域不会被父级作用域收集。

### 核心方法

#### `run<T>(fn: () => T): T | undefined`
*   **作用**：在当前 `EffectScope` 的上下文中执行传入的函数 `fn`。
*   **逻辑**：
    1.  保存当前的 `activeEffectScope`。
    2.  将 `activeEffectScope` 设置为 `this`（当前实例）。
    3.  执行 `fn()`。
    4.  恢复之前的 `activeEffectScope`。
*   **结果**：在 `fn` 执行期间创建的所有副作用都会被收集到 `this.effects` 中。

#### `stop(fromParent?: boolean)`
*   **作用**：停止当前作用域，清理所有资源。
*   **逻辑**：
    1.  将 `_active` 标记为 `false`。
    2.  遍历并调用 `effects` 数组中所有副作用的 `stop()` 方法。
    3.  遍历并调用 `cleanups` 数组中的所有清理回调。
    4.  遍历并调用 `scopes` 数组中所有子作用域的 `stop(true)` 方法。
    5.  如果不是分离模式且有父级，从父级的 `scopes` 数组中移除当前作用域（使用优化的 O(1) 删除算法）。

#### `on()` / `off()`
*   **作用**：手动激活或退出当前作用域。
*   **场景**：主要用于组件初始化等场景，允许在不立即执行函数的情况下切换活跃作用域。
*   **逻辑**：
    *   `on()`: 增加计数器 `_on`，将 `activeEffectScope` 切换为当前实例。
    *   `off()`: 减少计数器 `_on`，当计数归零时，恢复之前的 `activeEffectScope`。

#### `pause()` / `resume()`
*   **作用**：暂停或恢复作用域及其子作用域和副作用。
*   **逻辑**：递归地调用子作用域和副作用的 `pause()` / `resume()` 方法。

## 辅助函数

### `effectScope(detached?: boolean)`
*   工厂函数，用于创建 `EffectScope` 实例。
*   如果 `detached` 为 `true`，创建的作用域不会被父级作用域收集。

### `getCurrentScope()`
*   返回当前全局变量 `activeEffectScope` 指向的作用域。

### `onScopeDispose(fn: () => void)`
*   在当前活跃的作用域上注册一个清理回调。
*   当作用域被 `stop()` 时，这些回调会被执行。
*   类似于组件的 `onUnmounted`，但用于任意 `EffectScope`。

## 父子作用域管理与优化

`EffectScope` 自动维护父子关系：
*   当创建一个新的非分离 `EffectScope` 时，它会自动将自己添加到当前 `activeEffectScope` 的 `scopes` 数组中。
*   **O(1) 删除优化**：为了在 `stop()` 时高效地从父级数组中移除自己，`EffectScope` 记录了自己在父级数组中的索引 `index`。移除时，将数组末尾元素移动到当前元素的位置，并更新末尾元素的索引，从而避免了 `Array.prototype.splice` 的 O(n) 开销。
