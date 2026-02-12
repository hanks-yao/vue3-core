# renderFn.ts 逻辑总结

该文件主要用于处理 Vue 2 到 Vue 3 的渲染函数（Render Function）兼容性问题，旨在让 Vue 2 风格的渲染函数和 VNode 属性能够在 Vue 3 的运行时环境中正常工作。

## 主要功能模块

### 1. `convertLegacyRenderFn(instance)`

**功能**：检测并转换组件实例上的旧版渲染函数。

**逻辑**：
- 检查渲染函数是否已经被标记为 V3 兼容或已处理。
- 如果渲染函数参数个数大于等于 2（Vue 2 的 `h` 函数通常作为参数传入，或者函数式组件），则认为是 V3 预编译函数或已兼容，直接返回。
- 否则，将其包装在一个兼容层函数中，该兼容层函数会将 `compatH` 作为参数（即 Vue 2 的 `h`）传递给原始渲染函数。

### 2. `compatH(type, propsOrChildren, children)`

**功能**：Vue 2 `createElement` (通常简写为 `h`) 的兼容实现。

**逻辑**：
- **参数处理**：处理 Vue 2 `h` 函数灵活的参数签名（`type`, `props`, `children`）。
- **组件名称查找**：支持字符串类型的组件名称查找，并特殊处理 `transition`、`transition-group` 和 `keep-alive`。
- **Props 规范化**：调用 `convertLegacyProps` 将 Vue 2 风格的 props 转换为 Vue 3 格式。
- **VNode 创建**：调用 Vue 3 的 `createVNode` 创建 VNode。
- **后续处理**：
    - `convertLegacyDirectives`：处理指令。
    - `convertLegacySlots`：处理插槽。

### 3. `convertLegacyProps(legacyProps, type)`

**功能**：将 Vue 2 的 VNode 数据对象（data object）转换为 Vue 3 的 props 对象。

**逻辑**：
- **属性映射**：
    - `attrs`, `domProps`, `props` -> 直接合并到结果中。
    - `on`, `nativeOn` -> 转换事件名称（处理修饰符前缀），合并同名事件监听器。
    - 其他属性（如 `key`, `ref` 等） -> 直接复制。
- **Class 和 Style**：规范化 `staticClass` 和 `staticStyle`。
- **v-model**：处理组件上的 `model` 选项，将其转换为 `modelValue` (或自定义 prop) 和 `update:modelValue` (或自定义 event)。

### 4. `convertLegacyEventKey(event)`

**功能**：将 Vue 2 的事件修饰符前缀转换为 Vue 3 的事件名格式。

**逻辑**：
- `&` -> `Passive`
- `~` -> `Once`
- `!` -> `Capture`
- 最后调用 `toHandlerKey` 生成 `onEvent` 格式的键名。

### 5. `convertLegacySlots(vnode)`

**功能**：将 Vue 2 的子节点插槽转换为 Vue 3 的函数式插槽。

**逻辑**：
- 遍历子节点，检查 `slot` 属性。
- 将具有相同 `slot` 属性的子节点收集到对应的插槽数组中。
- 将插槽数组转换为返回该数组的函数（Vue 3 的 slot 格式）。
- 处理 `scopedSlots`，将其与普通插槽合并。
- 最后调用 `normalizeChildren` 更新 VNode 的 children。

### 6. `defineLegacyVNodeProperties(vnode)`

**功能**：在 Vue 3 的 VNode 上定义兼容 Vue 2 的属性，以便旧代码可以通过 VNode 访问这些属性。

**逻辑**：
- 仅在启用了 `RENDER_FUNCTION` 和 `PRIVATE_APIS` 兼容性选项时执行。
- 使用 `Object.defineProperties` 定义以下属性的 getter/setter：
    - `tag`: 映射到 `vnode.type`
    - `data`: 映射到 `vnode.props`
    - `elm`: 映射到 `vnode.el`
    - `componentInstance`: 获取组件实例代理
    - `child`: 同 `componentInstance`
    - `text`: 获取文本子节点
    - `context`: 获取渲染上下文
    - `componentOptions`: 模拟 Vue 2 的组件选项对象（包含 `Ctor`, `propsData`, `children`）
