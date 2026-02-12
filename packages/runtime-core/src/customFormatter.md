# customFormatter.ts 逻辑总结

该文件 (`packages/runtime-core/src/customFormatter.ts`) 的主要目的是为 Chrome DevTools 提供自定义的对象格式化器，以便在开发环境下更直观地查看 Vue 的响应式对象和组件实例。

## 主要功能

核心函数是 `initCustomFormatter`，它会在开发环境下（且 `window` 对象存在时）执行。

### 1. 样式定义
定义了一组用于控制台输出的样式对象：
- `vueStyle`: Vue 相关的绿色。
- `numberStyle`: 数字的蓝色。
- `stringStyle`: 字符串的红色。
- `keywordStyle`: 关键字（如布尔值、键名）的粉色。

### 2. 格式化器对象 (`formatter`)
这是符合 Chrome DevTools Custom Formatters 规范的对象，包含以下方法：

- **`header(obj)`**:
  - 负责生成对象在控制台摘要视图（未展开时）的显示内容。
  - 处理 `VueInstance`（组件实例）。
  - 处理 `Ref` 对象：显示为 `Ref<value>`，并区分 `ShallowRef` 和 `ComputedRef`。在访问 `value` 时会暂停依赖追踪，避免副作用。
  - 处理 `Reactive` 对象：显示为 `Reactive<value>`，区分 `ShallowReactive`。
  - 处理 `Readonly` 对象：显示为 `Readonly<value>`，区分 `ShallowReadonly`。

- **`hasBody(obj)`**:
  - 判断对象是否可以展开显示详细信息。
  - 目前仅对 Vue 组件实例 (`__isVue` 为 true) 返回 `true`。

- **`body(obj)`**:
  - 生成对象展开后的详细视图。
  - 对于 Vue 组件实例，调用 `formatInstance` 来展示其内部状态。

### 3. 辅助函数

- **`formatInstance(instance)`**:
  - 收集并格式化组件实例的各个部分：
    - `props`: 组件属性。
    - `setup`: `setup()` 函数返回的状态。
    - `data`: `data()` 选项返回的数据。
    - `computed`: 计算属性。
    - `injected`: 注入的数据。
    - `$ (internal)`: 原始组件实例对象。

- **`createInstanceBlock(type, target)`**:
  - 为上述每个部分创建一个可视化的块，包含标题和键值对列表。

- **`formatValue(v, asRaw)`**:
  - 根据值的类型（数字、字符串、布尔值、对象）应用相应的样式。
  - 对于对象，可以选择是否转换为原始对象 (`toRaw`) 显示。

- **`extractKeys(instance, type)`**:
  - 从组件实例的上下文中提取指定类型（如 `computed`, `inject`）的属性。

- **`isKeyOfType(Comp, key, type)`**:
  - 递归检查（考虑 `extends` 和 `mixins`）某个键是否在组件选项的指定类型定义中。

- **`genRefFlag(v)`**:
  - 根据 Ref 的特性返回具体的标签字符串 (`Ref`, `ShallowRef`, `ComputedRef`)。

### 4. 注册
最后，将定义的 `formatter` 对象添加到 `window.devtoolsFormatters` 数组中，完成注册。
