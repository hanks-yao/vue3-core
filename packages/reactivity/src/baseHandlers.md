# baseHandlers.ts 逻辑总结

该文件主要定义了 Vue 3 响应式系统中用于 `Proxy` 的处理器（Handlers）。这些处理器决定了当访问、修改、删除响应式对象的属性时会发生什么。

## 核心类

### 1. BaseReactiveHandler
这是所有响应式处理器的基类，主要实现了 `get` 陷阱（trap）。

**主要逻辑 (`get`):**
*   **特殊标志处理**: 处理 `IS_REACTIVE`, `IS_READONLY`, `IS_SHALLOW`, `RAW` 等内部标志，用于判断对象状态或获取原始对象。
*   **数组特殊处理**: 如果目标是数组，并且访问的是特定方法（如 `push`, `pop` 等），会使用 `arrayInstrumentations` 进行拦截，以确保正确的依赖收集和更新触发。
*   **Reflect.get**: 调用原始对象的属性访问。
*   **依赖收集 (`track`)**: 如果不是只读的，且 key 不是内置 Symbol 或不可追踪的 key，则调用 `track` 进行依赖收集。
*   **Ref 解包**: 如果返回值是 `ref` 对象，且不是数组的整数索引访问，则自动解包（返回 `.value`）。
*   **深层响应式 (Lazy Access)**: 如果返回值是对象，则递归地将其转换为响应式对象（`reactive` 或 `readonly`）。这是懒执行的，只有在访问属性时才会转换，从而提升性能。

### 2. MutableReactiveHandler
继承自 `BaseReactiveHandler`，用于可变（非只读）的响应式对象。

**主要逻辑:**
*   **set**:
    *   获取旧值。
    *   **Ref 自动赋值**: 如果旧值是 `ref` 且新值不是 `ref`，则直接更新 `ref.value`。
    *   **Reflect.set**: 执行原始对象的属性设置。
    *   **触发更新 (`trigger`)**:
        *   区分 **新增属性** (`ADD`) 和 **修改属性** (`SET`)。
        *   检查值是否发生变化 (`hasChanged`)，只有变化时才触发更新。
        *   屏蔽原型链引起的重复触发。
*   **deleteProperty**:
    *   调用 `Reflect.deleteProperty` 删除属性。
    *   如果删除成功且属性存在，触发 `DELETE` 更新。
*   **has**:
    *   调用 `Reflect.has`。
    *   调用 `track` 进行依赖收集。
*   **ownKeys**:
    *   调用 `track` 进行依赖收集（`ITERATE` 操作）。
    *   调用 `Reflect.ownKeys`。

### 3. ReadonlyReactiveHandler
继承自 `BaseReactiveHandler`，用于只读的响应式对象。

**主要逻辑:**
*   **set**: 拦截设置操作，在开发模式下发出警告，并返回 `true`（表示操作“成功”但不生效）。
*   **deleteProperty**: 拦截删除操作，在开发模式下发出警告。

## 导出的处理器

文件导出了四种预定义的处理器，分别对应不同的响应式 API：

1.  **`mutableHandlers`**: 用于 `reactive()`。
    *   支持读写。
    *   深层响应式。
2.  **`readonlyHandlers`**: 用于 `readonly()`。
    *   只读。
    *   深层只读。
3.  **`shallowReactiveHandlers`**: 用于 `shallowReactive()`。
    *   支持读写。
    *   **浅层响应式**: `get` 中不进行递归转换，`set` 中按原样设置。
4.  **`shallowReadonlyHandlers`**: 用于 `shallowReadonly()`（通常用于 props）。
    *   只读。
    *   **浅层只读**: 不解包顶层 refs，但保留对象的响应性。

## 关键辅助函数

*   **`hasOwnProperty`**: 重写了 `Object.prototype.hasOwnProperty`，确保在检查属性存在时也能进行依赖收集。
*   **`builtInSymbols`**: 过滤掉 `Symbol` 上的 `arguments` 和 `caller` 属性，避免访问时报错。
