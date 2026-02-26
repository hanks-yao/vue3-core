# vModel 源码分析 (packages/runtime-dom/src/directives/vModel.ts)

## 概述
当前文件负责实现 Vue 3 在浏览器环境下的 `v-model` 指令，包括文本框（`<input type="text">`, `<textarea>`）、复选框（`<input type="checkbox">`）、单选框（`<input type="radio">`）以及下拉选择框（`<select>`）。
同时还提供了一个通用的动态 `v-model` 指令（`vModelDynamic`），通常用于 `<component>` 动态组件绑定不同表单元素的情况。

## 核心实现
`v-model` 本质上是一个指令，通过生命周期钩子（如 `created`, `mounted`, `beforeUpdate`, `updated`）监听元素的交互事件并反向修改数据，同时也负责将数据的变化同步更新回 DOM。

### 1. 基础工具方法
- **`getModelAssigner`**: 从虚拟节点 (VNode) 属性中获取负责数据更新的回调函数（一般是 `onUpdate:modelValue`）。
- **`onCompositionStart` / `onCompositionEnd`**: 监听输入法组合事件，防止在拼音输入等中间态下触发数据更新。
- **`castValue`**: 根据修饰符（`.trim`, `.number`）强制转换输入的值。
- **`getValue` / `getCheckboxValue`**: 用于提取元素绑定的原始值（处理了 `:value`, `:true-value`, `:false-value` 的绑定情况）。

### 2. 不同表单类型的 `v-model` 实现
#### **vModelText (文本类输入)**
- **事件监听**: 如果配置了 `.lazy` 修饰符，监听 `change` 事件；否则默认监听 `input` 事件。
- **输入法兼容**: 对于非 `.lazy` 绑定，通过监听 `compositionstart` 和 `compositionend` 事件来过滤中间输入态，确保拼写结束后再触发更新回调。
- **修饰符支持**: 内部包含对 `.number` 和 `.trim` 修饰符的逻辑处理。

#### **vModelCheckbox (复选框)**
- **支持的数据结构**: 除了普通布尔值，还支持绑定到 Array（数组）或 Set（集合）结构。
- **核心逻辑**: 在 `change` 事件中获取选中状态，如果是数组或集合，则相应地通过 `concat`, `splice`, `add`, `delete` 等操作增删元素。同时监听值的变化并同步到 `el.checked` 状态上。

#### **vModelRadio (单选框)**
- 逻辑最简单：在 `change` 时触发更新。绑定状态的更新基于判断模型值是否与元素指定的 `value` 严格相等（`looseEqual`）。

#### **vModelSelect (下拉选择框)**
- **多选支持**: 如果是 `<select multiple>`，遍历其选项并找出选中的 `<option>`。与 Checkbox 类似，也支持 Array 和 Set 类型绑定。
- **特殊处理**: `mounted` 和 `updated` 阶段都会调用 `setSelected`，这主要是因为 `<select>` 的选中状态依赖于其后代元素 `<option>` 的渲染状态。

### 3. 动态 v-model (`vModelDynamic`)
提供对动态标签及元素类型的支持。根据元素标签（如 `SELECT`, `TEXTAREA`）或元素的 `type` 属性，运行时动态分配对应的模型指令。

### 4. 服务端渲染 (SSR) 适配
`initVModelForSSR`：针对服务端渲染时的情况配置了各表单元素的 `getSSRProps`。当在 SSR 包含面向客户端渲染的函数时，用于生成 HTML 元素的相应属性（如 `checked`, `value`）。