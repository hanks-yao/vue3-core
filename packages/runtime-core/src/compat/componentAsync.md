# packages/runtime-core/src/compat/componentAsync.ts 逻辑总结

该文件主要负责处理 Vue 2 风格的异步组件，将其转换为 Vue 3 兼容的组件格式。这是 Vue 3 兼容性构建（Migration Build）的一部分，允许开发者在 Vue 3 中继续使用 Vue 2 的异步组件写法。

## 核心功能

### `convertLegacyAsyncComponent` 函数

这是该文件的核心导出函数，用于执行转换逻辑。

**输入**：
- `comp`: 一个旧版（Vue 2）的异步组件工厂函数。

**输出**：
- 返回一个 Vue 3 的组件（通常是通过 `defineAsyncComponent` 创建的异步组件）。

**主要逻辑流程**：

1.  **缓存检查**：
    - 使用 `normalizedAsyncComponentMap` (WeakMap) 检查该工厂函数是否已经被转换过。
    - 如果已存在缓存，直接返回缓存的组件，避免重复转换。

2.  **执行工厂函数**：
    - 必须立即调用传入的工厂函数 `comp`。这是因为 Vue 2 的 API 只有在调用工厂函数后才会返回配置选项或 Promise，或者通过回调函数暴露结果。
    - 准备 `resolve` 和 `reject` 回调，并创建一个 `fallbackPromise`，用于处理那些不返回 Promise 而是使用回调风格的旧版组件。

3.  **结果处理与转换**：
    根据工厂函数 `comp` 的返回值 `res` 的类型，进行不同的处理：

    - **Promise (`isPromise(res)`)**:
      - 如果返回的是 Promise，说明是简单的异步组件（`() => import('./MyComp.vue')`）。
      - 直接使用 `defineAsyncComponent(() => res)` 进行包装。

    - **对象配置 (`isObject(res)`)**:
      - 如果返回的是对象（且不是 VNode 或数组），说明是 Vue 2 的高级异步组件格式（包含 `component`, `loading`, `error`, `delay`, `timeout` 等选项）。
      - 将这些选项映射到 Vue 3 `defineAsyncComponent` 的配置项中：
        - `res.component` -> `loader`
        - `res.loading` -> `loadingComponent`
        - `res.error` -> `errorComponent`
        - 其他选项直接透传。

    - **无返回值 (`res == null`)**:
      - 如果返回 `null` 或 `undefined`，说明工厂函数可能使用了传入的 `resolve` 和 `reject` 参数来异步解析组件。
      - 使用之前创建的 `fallbackPromise`，并将其传递给 `defineAsyncComponent`。

    - **其他情况**:
      - 如果返回值既不是 Promise 也不是对象，也不是空，可能是一个 Vue 3 的函数式组件或其他类型，直接将其作为结果返回。

4.  **缓存结果**：
    - 将转换后的组件存入 `normalizedAsyncComponentMap` 缓存中，并返回。

## 关键数据结构

- **`LegacyAsyncOptions`**: 定义了 Vue 2 高级异步组件的选项结构。
- **`LegacyAsyncReturnValue`**: 定义了工厂函数可能的返回值类型（Promise 或 选项对象）。
- **`LegacyAsyncComponent`**: 定义了 Vue 2 异步组件工厂函数的签名，它接受 `resolve` 和 `reject` 回调。
- **`normalizedAsyncComponentMap`**: 一个 `WeakMap`，用于存储原始工厂函数到转换后 Vue 3 组件的映射，确保单例转换。
