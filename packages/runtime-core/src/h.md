# h 函数详解

`h` 函数是 Vue 3 中用于创建虚拟节点（VNode）的辅助函数。它是 `createVNode` 的一个更用户友好的封装，主要用于手动编写渲染函数。

## 核心作用

1.  **简化调用**：允许在没有 props 时省略该参数，使代码更简洁。
2.  **多态处理**：通过重载支持多种参数组合（`type` + `children`，`type` + `props` + `children` 等）。
3.  **兼容性**：处理不同类型的子节点（数组、文本、VNode 等）和组件类型。

## 参数处理逻辑

`h` 函数的实现主要处理参数的灵活性（Polymorphism）：

1.  **参数数量检测**：
    *   **2个参数** (`type`, `propsOrChildren`)：
        *   如果第二个参数是对象且不是数组：
            *   如果是 VNode：视为 `children`（包装成数组），`props` 为 `null`。
            *   否则：视为 `props`，`children` 为 `undefined`。
        *   否则（是数组或基本类型）：视为 `children`，`props` 为 `null`。
    *   **3个及以上参数**：
        *   如果参数大于 3 个：从第 3 个参数开始截取作为 `children` 数组。
        *   如果参数等于 3 个且第 3 个参数是 VNode：将其包装成数组作为 `children`。
        *   否则：直接传递。

2.  **禁用块跟踪**：
    *   在执行期间调用 `setBlockTracking(-1)` 禁用块跟踪，因为 `h` 函数通常用于手动渲染，不需要编译器优化带来的 Block Tree 结构。
    *   执行完毕后恢复 `setBlockTracking(1)`。

## 与 `createVNode` 的区别

*   **`createVNode`**：编译器生成的代码主要使用它。它是单态的（参数结构固定），性能更好，且支持传入 `patchFlags` 进行优化。
*   **`h`**：面向开发者，注重易用性和灵活性，内部最终调用 `createVNode`。

## 使用示例

```js
// 仅类型
h('div')

// 类型 + 属性
h('div', { id: 'foo' })

// 类型 + 子节点 (省略属性)
h('div', ['hello'])
h('div', 'hello')

// 类型 + 属性 + 子节点
h('div', { id: 'foo' }, 'hello')
```
