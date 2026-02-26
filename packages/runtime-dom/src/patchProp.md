# patchProp 逻辑总结

`patchProp` 是 Vue 3 `runtime-dom` 模块中的核心函数，用于更新 DOM 元素的属性、样式、类名和事件监听器。它根据属性的键名（key）和值的类型，智能地选择最佳的更新策略（作为 DOM Property 设置还是作为 HTML Attribute 设置）。

## 主要逻辑流程

函数接收 `el` (元素), `key` (属性名), `prevValue` (旧值), `nextValue` (新值) 等参数，按以下优先级进行处理：

1.  **Class 处理 (`key === 'class'`)**:
    - 调用 `patchClass`。
    - Vue 3 对 class 的处理进行了优化，直接操作 `el.className` 或 `el.classList`，性能优于 `setAttribute`。

2.  **Style 处理 (`key === 'style'`)**:
    - 调用 `patchStyle`。
    - 支持对象形式的样式更新，智能处理 CSS 变量和前缀。

3.  **事件监听器 (`isOn(key)`)**:
    - 判断 key 是否以 `on` 开头（如 `onClick`）。
    - 忽略 `v-model` 相关的监听器（`onUpdate:modelValue` 等）。
    - 调用 `patchEvent` 更新事件绑定。Vue 使用单一的 invoker 缓存事件处理函数，避免频繁移除和添加事件监听器。

4.  **DOM Property vs Attribute**:
    - **强制指定**:
      - 如果 key 以 `.` 开头（如 `.prop`），强制调用 `patchDOMProp`。
      - 如果 key 以 `^` 开头（如 `^attr`），强制调用 `patchAttr`。
    - **自动判断 (`shouldSetAsProp`)**:
      - 如果 `shouldSetAsProp` 返回 `true`，调用 `patchDOMProp`。
      - **特殊修正**: 对于 `<input>`, `<select>`, `<textarea>` 等表单元素，在设置 `value`, `checked`, `selected` 等 DOM Property 后，还会根据情况调用 `patchAttr` 同步 Attribute，以确保 `input[type="reset"]` 等原生行为正常工作，或兼容需要 Attribute 的库。

5.  **自定义元素 (Custom Elements)**:
    - 对于 Vue 自定义元素 (`_isVueCE`)，如果 key 包含大写字母或值不是字符串，优先作为 DOM Property 设置。

6.  **默认处理 (Attributes)**:
    - 如果上述条件都不满足，默认调用 `patchAttr` 将其作为 HTML Attribute 设置。
    - **特殊处理**: 对于 `true-value` 和 `false-value`，会将其存储在元素对象的 `_trueValue` 和 `_falseValue` 属性上，用于 `v-model` 的 checkbox 处理。

## shouldSetAsProp 判断逻辑

`shouldSetAsProp` 函数决定了一个属性是否应该作为 DOM Property (即 `el[key] = value`) 设置。

1.  **SVG 元素**:
    - 大部分属性必须作为 Attribute 设置。
    - 例外：`innerHTML`, `textContent` 以及值为函数的原生事件（如 `onclick`）作为 DOM Property。

2.  **枚举属性 (Enumerated Attributes)**:
    - 属性如 `spellcheck`, `draggable`, `translate`, `autocorrect`。
    - 这些属性在 DOM 对象上是布尔值或枚举字符串，但直接设置布尔值可能导致意外的字符串转换（如 `false` 变为 `"false"` 进而被解析为真值）。因此，这些属性始终作为 Attribute 设置。

3.  **特殊标签的特殊属性**:
    - `form` 属性：只读，必须作为 Attribute。
    - `<input list>`: 必须作为 Attribute。
    - `<textarea type>`: 必须作为 Attribute。
    - `<iframe>` 的 `sandbox`: 必须作为 Attribute，避免设置 `null` 或空字符串时的意外行为。
    - 媒体标签 (`IMG`, `VIDEO`, `CANVAS`, `SOURCE`) 的 `width` / `height`: 必须作为 Attribute。

4.  **原生事件 (String Handler)**:
    - 如果 key 是原生事件（如 `onclick`）且值是字符串，必须作为 Attribute 设置。

5.  **默认回退**:
    - 如果 `key in el` (属性存在于元素原型上)，则作为 DOM Property，否则作为 Attribute。
