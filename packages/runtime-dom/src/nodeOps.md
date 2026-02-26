# nodeOps.ts 逻辑总结

`packages/runtime-dom/src/nodeOps.ts` 文件定义了 Vue 3 在浏览器环境下操作 DOM 的具体实现。它导出一个 `nodeOps` 对象，该对象实现了 `RendererOptions` 接口中与节点操作相关的部分（不包含属性修补 `patchProp`）。

Vue 的运行时核心（`runtime-core`）是平台无关的，它通过接受一个渲染器选项对象（Renderer Options）来执行具体的 DOM 操作。`nodeOps` 就是这个选项对象在浏览器端的实现之一。

## 核心功能

`nodeOps` 对象包含了一系列封装好的原生 DOM API 调用，主要分为以下几类：

### 1. 节点创建 (Creation)
- **`createElement(tag, namespace, is, props)`**: 创建元素节点。
  - 支持普通 HTML 元素。
  - 支持 SVG (`http://www.w3.org/2000/svg`) 和 MathML (`http://www.w3.org/1998/Math/MathML`) 命名空间。
  - 支持 `is` 属性（用于 Custom Elements）。
  - 特殊处理 `<select>` 元素的 `multiple` 属性，确保在创建时就应用，以避免某些浏览器的兼容性问题。
- **`createText(text)`**: 创建文本节点 (`document.createTextNode`)。
- **`createComment(text)`**: 创建注释节点 (`document.createComment`)。

### 2. 节点操作 (Manipulation)
- **`insert(child, parent, anchor)`**: 插入节点。使用 `parent.insertBefore`，如果 `anchor` 为空则追加到末尾。
- **`remove(child)`**: 移除节点。通过 `child.parentNode.removeChild(child)` 实现。
- **`setText(node, text)`**: 更新文本节点的内容 (`node.nodeValue`)。
- **`setElementText(el, text)`**: 更新元素的文本内容 (`el.textContent`)。

### 3. 节点遍历 (Traversal)
- **`parentNode(node)`**: 获取父节点。
- **`nextSibling(node)`**: 获取下一个兄弟节点。
- **`querySelector(selector)`**: 查找元素。

### 4. 其他辅助功能
- **`setScopeId(el, id)`**: 为元素设置 Scope ID 属性，用于 Vue 的 Scoped CSS 功能。

## 关键逻辑解析

### 静态内容插入优化 (`insertStaticContent`)

这是一个用于性能优化的重要方法，主要用于处理经过编译器优化的静态提升（Static Hoisting）内容。

*   **功能**: 将一段静态的 HTML 字符串直接插入到 DOM 中，而不是通过递归创建节点的方式。
*   **缓存机制**:
    *   如果提供了 `start` 和 `end` 节点，并且满足缓存条件（如单根节点且兄弟节点信息可用），则直接克隆缓存的节点进行插入，避免重复解析 HTML。
*   **新插入逻辑**:
    *   使用 `<template>` 元素 (`templateContainer`) 来解析 HTML 字符串。
    *   对于 SVG 和 MathML，需要包裹相应的标签（`<svg>` 或 `<math>`）以确保正确解析，解析后需移除外层包装。
    *   使用 `unsafeToTrustedHTML` 处理 HTML 字符串，以兼容 Trusted Types 安全策略。
*   **返回值**: 返回插入内容的第一个和最后一个节点，供运行时追踪。

### 安全性 (Trusted Types)

文件开头包含对 [Trusted Types API](https://developer.mozilla.org/en-US/docs/Web/API/Trusted_Types_API) 的检测和支持。

*   **`policy`**: 尝试创建一个名为 `vue` 的 Trusted Type 策略。
*   **`unsafeToTrustedHTML(value)`**: 一个辅助函数。如果浏览器支持 Trusted Types，它会使用创建的策略将字符串转换为 `TrustedHTML`；否则直接返回原字符串。这主要用于 `innerHTML` 的赋值操作，防止 DOM XSS 攻击。
