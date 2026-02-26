# patchClass 源码分析

`packages/runtime-dom/src/modules/class.ts` 文件主要导出了 `patchClass` 函数，用于处理 DOM 元素的 `class` 属性更新。

## 函数签名

```typescript
export function patchClass(
  el: Element,
  value: string | null,
  isSVG: boolean,
): void
```

- `el`: 需要更新 class 的 DOM 元素。
- `value`: 新的 class 字符串值，如果为 `null` 表示移除 class。
- `isSVG`: 布尔值，标识元素是否为 SVG 元素。

## 核心逻辑

1.  **处理过渡类名 (Transition Classes)**:
    - 首先检查元素是否正在进行过渡动画（通过 `vtcKey` 获取 `transitionClasses`）。
    - 如果存在过渡类名，将其与传入的 `value` 合并。这确保了在更新 class 时不会丢失正在进行的过渡效果所需的类名。

2.  **更新 DOM**:
    - **移除 class**: 如果最终的 `value` 为 `null`，则调用 `el.removeAttribute('class')` 移除 class 属性。
    - **SVG 元素**: 如果是 SVG 元素 (`isSVG` 为 true)，使用 `el.setAttribute('class', value)` 设置 class。这是因为 SVG 元素的 `className` 属性是一个 `SVGAnimatedString` 对象，而不是字符串，直接赋值无效。
    - **普通元素**: 对于普通 HTML 元素，直接设置 `el.className = value`。注释提到，理论上直接设置 `className` 比 `setAttribute` 性能更好。

## 总结

`patchClass` 是 Vue 3 Runtime DOM 中专门用于更新元素 `class` 的模块。它考虑了 Vue 的 `<Transition>` 组件产生的临时类名，并针对 SVG 元素和普通 HTML 元素采用了不同的更新策略，以确保正确性和性能。
