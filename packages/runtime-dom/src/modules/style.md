# Style Module (`style.ts`) 源码解析

该模块负责处理 Vue 3 中 DOM 元素的 `style` 属性更新。它处理了样式对象的 Diff、CSS 字符串的设置、浏览器前缀自动添加、CSS 变量以及 `!important` 等特殊情况。

## 核心逻辑

### 1. `patchStyle(el, prev, next)`

这是更新样式的入口函数。

- **参数**:
  - `el`: 目标 DOM 元素。
  - `prev`: 旧的样式数据（可以是对象、字符串或 null）。
  - `next`: 新的样式数据（可以是对象、字符串或 null）。

- **处理流程**:
  1.  **如果 `next` 是对象**:
      -   **清理旧样式**: 遍历 `prev`（如果是字符串则解析为键值对），如果某个属性在 `next` 中不存在，则将其设置为空字符串以移除。
      -   **设置新样式**: 遍历 `next` 对象，调用 `setStyle` 设置每个属性。
      -   **检测 display**: 标记是否显式控制了 `display` 属性。
  2.  **如果 `next` 是字符串**:
      -   **直接覆盖**: 如果 `prev` 和 `next` 不相等，直接设置 `style.cssText = next`。
      -   **保留 CSS 变量**: 如果元素上有内部使用的 CSS 变量 (`CSS_VAR_TEXT`)，会将其追加到 `next` 后面。
  3.  **如果 `next` 为空**:
      -   移除元素的 `style` 属性。
  4.  **`v-show` 兼容**:
      -   检查元素是否绑定了 `v-show`。
      -   如果 `v-show` 处于隐藏状态 (`display: none`)，确保 `style.display` 保持为 `'none'`。
      -   记录 `v-show` 显示时应该恢复的原始 `display` 值。

### 2. `setStyle(style, name, val)`

用于设置单个样式属性，封装了兼容性处理。

- **数组值处理**: 如果 `val` 是数组（例如 `display: ['-webkit-box', 'flex']`），递归调用 `setStyle` 设置每个值。这通常用于浏览器降级支持。
- **CSS 变量**: 如果属性名以 `--` 开头，直接使用 `style.setProperty(name, val)` 设置。
- **!important 支持**: 如果值中包含 `!important`，正则提取纯值，并调用 `style.setProperty(name, value, 'important')`。
- **自动前缀**: 对于普通属性，调用 `autoPrefix` 获取带前缀的属性名，然后设置 `style[prefixed] = val`。
- **开发环境警告**: 检查值末尾是否意外包含分号。

### 3. `autoPrefix(style, rawName)`

自动为样式属性添加浏览器前缀。

- **缓存**: 使用 `prefixCache` 缓存已计算过的结果，提高性能。
- **查找策略**:
  1.  检查驼峰化后的名字 (`camelize(rawName)`) 是否存在于 `style` 中。
  2.  如果不存在，遍历前缀列表 `['Webkit', 'Moz', 'ms']`，尝试 `前缀 + 首字母大写` 的组合。
  3.  如果都找不到，返回原名。

## 总结

`style.ts` 通过 `patchStyle` 实现了高效的样式更新机制。它不仅支持 Vue 模板中常见的 `:style="{ color: 'red' }"` 对象语法，也支持 `:style="'color: red'"` 字符串语法。同时，它在底层抹平了浏览器差异（自动前缀），并提供了对 CSS 变量和 `!important` 的便捷支持，确保了开发者在 Vue 中编写样式时的灵活性和兼容性。
