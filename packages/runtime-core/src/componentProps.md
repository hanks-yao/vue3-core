# componentProps.ts 逻辑总结

该文件主要负责 Vue 3 组件 Props 的管理，包括初始化、更新、规范化解析以及开发环境下的校验。

## 核心功能

### 1. Props 初始化 (`initProps`)

组件创建时调用，主要完成以下工作：
- **分离 Props 和 Attrs**：根据组件定义的 `props` 选项，将传入的 `rawProps` 分离为 `props`（组件声明接收的属性）和 `attrs`（未声明的属性）。
- **设置响应式**：
  - 对于有状态组件（Stateful Component），`props` 被设置为 `shallowReactive`（浅层响应式）。
  - 对于函数式组件，根据是否有声明 props 来决定 `props` 的指向。
- **默认值处理**：初始化 `propsDefaults` 缓存。
- **校验**：在开发环境下调用 `validateProps` 进行类型和规则校验。

### 2. Props 更新 (`updateProps`)

组件更新时调用，负责将新的 `rawProps` 更新到组件实例的 `props` 和 `attrs` 中。
- **优化模式**：利用 `PatchFlags` 进行优化。如果只有动态绑定的 props 发生变化（`PatchFlags.PROPS`），则只更新变化的属性，避免全量 diff。
- **全量更新**：如果没有优化标志，则进行全量 diff，处理属性的添加、更新和删除。
- **Attrs 更新**：如果 `attrs` 发生变化，触发依赖 `attrs` 的副作用（如 `$attrs` 在插槽中的使用）。

### 3. Props 规范化 (`normalizePropsOptions`)

将用户定义的各种形式的 `props` 选项（数组形式、对象形式、Mixin/Extends 中的 props）统一规范化为 `NormalizedPropsOptions` 格式。
- **缓存**：使用 `weakMap` 缓存规范化结果，避免重复计算。
- **合并**：处理 `mixins` 和 `extends`，将继承的 props 合并到当前组件。
- **格式统一**：将数组形式（`['foo', 'bar']`）转换为对象形式（`{ foo: EMPTY_OBJ, bar: EMPTY_OBJ }`）。
- **标记转换**：识别 Boolean 类型的 props，标记 `shouldCast` 和 `shouldCastTrue`，用于后续的值转换逻辑。

### 4. 值解析 (`resolvePropValue`)

根据规范化后的选项解析 Prop 的最终值，处理默认值和布尔值转换规则。
- **默认值**：
  - 如果值为 `undefined` 且定义了 `default`，则使用默认值。
  - 支持函数类型的默认值（`default: () => ...`），并处理 `this` 上下文。
- **Boolean 转换**：
  - `shouldCast`：如果 Prop 类型包含 Boolean 且未传递值，默认为 `false`。
  - `shouldCastTrue`：如果 Prop 类型包含 Boolean 且未包含 String（或者 Boolean 在 String 之前），当传递空字符串（如 `<comp disabled />`）或与 key 同名的字符串时，转换为 `true`。

### 5. Props 校验 (`validateProps`)

仅在开发环境下运行 (`__DEV__`)。
- **必填检查**：检查 `required: true` 的 prop 是否存在。
- **类型检查**：对比传入值的类型与定义的 `type` 是否匹配（支持原生构造函数如 `String`, `Number` 等）。
- **自定义校验**：执行用户定义的 `validator` 函数。

## 关键类型定义

- **`PropOptions`**: 定义单个 Prop 的选项（type, required, default, validator 等）。
- **`NormalizedProps`**: 规范化后的 Props 映射，包含布尔值转换标志。
- **`ExtractPropTypes`**: TypeScript 工具类型，用于从运行时 props 选项中推导出 Props 的类型定义。
