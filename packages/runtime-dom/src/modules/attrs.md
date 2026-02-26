# attrs.ts 逻辑总结

`packages/runtime-dom/src/modules/attrs.ts` 文件主要负责 Vue 3 中 DOM 元素的 `attribute`（属性）的更新和修补（patch）操作。它处理了普通 attribute、SVG 的 `xlink` 属性以及与 Vue 2 的向后兼容性。

## 核心方法

### 1. `patchAttr`

这是该文件的核心导出函数，用于更新 DOM 元素的 attribute。

**参数说明：**
- `el`: 需要更新 attribute 的目标 DOM 元素。
- `key`: attribute 的名称。
- `value`: attribute 的新值。
- `isSVG`: 标识当前元素是否为 SVG 元素。
- `instance`: 当前的组件内部实例（主要用于兼容性检查）。
- `isBoolean`: 标识该 attribute 是否为特殊的布尔类型 attribute（如 `disabled`, `checked` 等）。

**执行逻辑：**
1. **SVG `xlink` 属性处理**：
   - 如果是 SVG 元素且属性名以 `xlink:` 开头，会调用 `setAttributeNS` 或 `removeAttributeNS`，并使用专门的命名空间 `xlinkNS` (`http://www.w3.org/1999/xlink`) 进行处理。
2. **Vue 2 兼容性处理**：
   - 如果开启了 `__COMPAT__` 标志，会调用 `compatCoerceAttr` 尝试使用 Vue 2 的逻辑进行强制转换。如果兼容逻辑处理了该属性，则直接返回。
3. **普通/布尔 Attribute 处理**：
   - **移除属性**：如果新值为 `null` 或 `undefined`，或者该属性是布尔属性且新值不被认为是“真”（通过 `includeBooleanAttr` 判断），则调用 `el.removeAttribute(key)` 移除该属性。
   - **设置属性**：否则，调用 `el.setAttribute(key, ...)` 设置属性值。
     - 如果是布尔属性，值会被设为空字符串 `''`。
     - 如果值是 `Symbol` 类型，会将其转换为字符串。
     - 否则直接使用传入的值。

### 2. `compatCoerceAttr` (Vue 2 兼容性逻辑)

该函数仅在开启了 Vue 2 兼容模式（`__COMPAT__`）时发挥作用，用于处理 Vue 2 和 Vue 3 在 attribute 处理上的一些差异。

**执行逻辑：**
1. **枚举类型 Attribute 处理** (`contenteditable`, `draggable`, `spellcheck`)：
   - Vue 2 对这些属性有特殊的强制转换逻辑（例如将 `false` 字符串或布尔值 `false` 转换为字符串 `'false'`，其余真值转换为 `'true'`）。
   - 如果匹配这些属性，且开启了相应的兼容性标志（`ATTR_ENUMERATED_COERCION`），则使用 Vue 2 的逻辑设置属性并返回 `true`。
2. **`false` 值处理**：
   - 在 Vue 2 中，如果一个普通 attribute 的值为布尔值 `false`，Vue 会直接移除该 attribute。但在 Vue 3 中，普通 attribute 值为 `false` 会被渲染为字符串 `"false"`。
   - 该逻辑会检查如果值为 `false`，且不是特殊的布尔属性，也不是 `<input value>`，并且开启了兼容性标志（`ATTR_FALSE_VALUE`），则会触发废弃警告，并移除该 attribute，返回 `true`。

## 总结

`attrs.ts` 的主要职责是安全、准确地将 VNode 中的 attribute 映射到真实的 DOM 元素上，同时兼顾了 SVG 命名空间属性的特殊情况以及 Vue 2 升级到 Vue 3 过程中的平滑过渡（兼容性处理）。