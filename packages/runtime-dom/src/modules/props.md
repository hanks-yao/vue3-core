# `patchDOMProp` 模块逻辑总结

文件路径: `packages/runtime-dom/src/modules/props.ts`

该文件主要导出了 `patchDOMProp` 函数，主要负责在 DOM 元素上设置和更新 JavaScript 属性（properties，而不是 attributes）。相比于简单的 `setAttribute`，DOM properties 的处理需要考虑诸多边界情况和历史遗留问题，因此封装了特定的逻辑。

## 核心逻辑拆解

### 1. 处理危险属性 (`innerHTML` / `textContent`)
- 当 `key` 为 `innerHTML` 或 `textContent` 时，直接赋值给元素的对应属性。
- 对于 `innerHTML`，会使用 `unsafeToTrustedHTML` 尝试净化和保证安全，防止 XSS，因为这一属性的值可能来自于渲染函数中显式的 `v-html` 或直接传入。
- 注意：值为 `null` 的情况在进行子节点 patch 之前，已经在渲染器中提前处理过了。

### 2. 特殊处理 `value` 属性
- 由于 `value` 在不同元素（如 `<input>`、`<option>`）上的表现不一致，进行了单独判断（且跳过了 `<progress>` 和自定义元素）。
- 针对 `<option>` 标签的 `value`（如果没有显式 `value`，会回退到其文本内容）比较时，使用 `getAttribute('value')` 而不是直接读 property。
- 对于空值 (`null` 或 `undefined`)：
  - `<input type="checkbox">` 会被设置为 `'on'`。
  - 其他表单元素的 `value` 会被设置为空字符串 `''`。
- 如果新旧值不同，或者 `_value` 属性不存在于元素上，才对 DOM 上的 `value` 进行实际更新。
- 传入为 `null` 时还需调用 `removeAttribute` 清除对应的 DOM attribute。
- 最后会将原始的 `value` 缓存在 DOM 元素的 `_value` 属性中，避免非字符串值被隐式强制转换为字符串丢失精度。

### 3. 空值转换与移除标记 (`needRemove`)
当传入的值是 `''` 或者 `null`/`undefined` 时，根据 DOM 期望的数据类型进行特殊处理，并可能将其标记为“需要移除”：
- **`boolean` 类型**：针对 `<select multiple>` 编译为 `{ multiple: '' }` 等情况，会尝试转换成正确的布尔值逻辑。
- **`string` 类型**：当传入 `null` 时（例如 `<div :id="null">`），将值转换为 `''` 并标记 `needRemove = true`。
- **`number` 类型**：当传入 `null` 时（例如 `<img :width="null">`），将值转换为 `0` 并标记 `needRemove = true`。

### 4. Vue 2 向后兼容 (COMPAT)
如果处于兼容模式 (`__COMPAT__` 为 true)，对于值为 `false` 的情况，如果启用了 `ATTR_FALSE_VALUE` 的向后兼容并且元素类型是 `string` 或 `number`，将对应值转换并同样标记为需要移除（`needRemove = true`），从而模拟 Vue 2 对于 false 值的属性移除行为。

### 5. 最终赋值与属性移除
由于有些属性只有 getter 没有 setter（如 `willValidate`），或是赋值时会做严格的内部验证从而抛出异常（例如赋非预期的值给 `type`），最终直接的赋值操作被包裹在了 `try...catch` 中：
- 如果捕获到错误且在开发环境下 (`__DEV__`)，只有在不是被自动标记为需要移除（`needRemove`）的情况下，才会报出详细警告，以避免对正常隐式转换报错。
- 如果前面的逻辑中将其标记为了需要移除 (`needRemove = true`)，则调用 `el.removeAttribute` 彻底从元素上删除对应的 DOM attribute。