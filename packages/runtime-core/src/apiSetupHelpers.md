# apiSetupHelpers.ts 源码解析

`packages/runtime-core/src/apiSetupHelpers.ts` 文件主要定义了 Vue 3 `<script setup>` 语法糖中使用的**编译器宏（Compiler Macros）**和**运行时辅助函数**。

这些函数大部分是为了提供 TypeScript 类型支持和运行时开发的空实现（因为它们在编译阶段会被转换），但也包含一些实际在运行时执行的逻辑。

## 1. 编译器宏 (Compiler Macros)

这些函数主要用于 `<script setup>` 中，它们在编译阶段会被 `@vue/compiler-sfc` 处理掉，因此在最终的生产环境代码中通常不会实际调用这些函数的运行时版本。

### `defineProps`
- **作用**：声明组件的 props。
- **特点**：
  - 支持运行时声明（传入数组或对象）。
  - 支持基于类型的声明（泛型）。
  - **运行时实现**：在开发环境下会抛出警告，提示这是一个编译器宏，不应在运行时调用。实际上，编译后的代码会将 `defineProps` 的参数转换为组件的 `props` 选项。

### `defineEmits`
- **作用**：声明组件触发的事件。
- **特点**：
  - 支持运行时声明（数组或对象）。
  - 支持基于类型的声明（函数类型）。
  - **运行时实现**：同样仅用于类型推导和开发环境警告。

### `defineExpose`
- **作用**：显式暴露组件内部属性给父组件（通过模板引用）。
- **逻辑**：`<script setup>` 组件默认是关闭的（closed），即不暴露任何内部绑定。使用此宏可以指定暴露哪些属性。

### `defineOptions`
- **作用**：声明无法通过组合式 API 表达的组件选项，如 `inheritAttrs` 或 `name`。
- **版本**：Vue 3.3+ 新增。

### `defineSlots`
- **作用**：用于声明插槽的类型提示。
- **特点**：纯类型宏，运行时无实际效果。

### `defineModel`
- **作用**：简化 `v-model` 的双向绑定声明。
- **逻辑**：自动声明一个 prop 和一个对应的 `update:propName` 事件。
- **版本**：Vue 3.4+ 正式稳定。

### `withDefaults`
- **作用**：为基于类型的 `defineProps` 声明提供默认值。
- **逻辑**：由于 TypeScript 接口在运行时不存在，编译器需要此宏来生成等价的运行时 `default` 选项。

## 2. 运行时辅助函数 (Runtime Helpers)

这些函数在运行时会被实际调用，用于支持 `<script setup>` 的功能。

### `useSlots` 和 `useAttrs`
- **作用**：在 `<script setup>` 中获取 `slots` 和 `attrs` 对象。
- **实现**：
  - 通过 `getCurrentInstance()` 获取当前组件实例。
  - 访问实例上的 `setupContext`。
  - 如果没有 `setupContext`，则创建一个。

### `mergeDefaults`
- **作用**：合并 props 定义和默认值。
- **场景**：当使用 `withDefaults` 时，编译器会生成调用此函数的代码，将类型定义的 props 和传入的默认值对象合并。
- **逻辑**：
  - 遍历默认值对象。
  - 将默认值注入到 props 选项的 `default` 属性中。
  - 处理函数类型的默认值（工厂函数）。

### `mergeModels`
- **作用**：合并多个 model 定义。
- **场景**：用于处理 mixins 或 extends 中的 model 选项合并。

### `createPropsRestProxy`
- **作用**：处理 `defineProps` 的解构。
- **逻辑**：当用户解构 props（如 `const { foo, ...rest } = defineProps(...)`）时，创建一个代理对象来处理剩余属性（rest），确保响应性不丢失（虽然解构本身会丢失响应性，但 Vue 的转换机制试图通过 `toRef` 等方式保持，这里主要是辅助剩余属性的访问）。

### `withAsyncContext`
- **作用**：在 `await` 跨越时保持当前组件实例上下文。
- **背景**：Vue 的 `getCurrentInstance()` 依赖全局变量跟踪当前组件。`await` 会导致异步任务进入微任务队列，恢复执行时全局变量可能已重置或指向其他组件。
- **实现**：
  1. 在 `await` 之前捕获当前实例 `ctx`。
  2. `unsetCurrentInstance()` 清除实例（防止副作用）。
  3. 返回一个恢复函数。
  4. 在 `await` 之后（Promise resolve 后），调用恢复函数 `setCurrentInstance(ctx)` 恢复上下文。
- **编译转换**：编译器会将顶层 `await` 转换为使用此函数的结构。

## 3. 总结

`apiSetupHelpers.ts` 是 Vue 3 单文件组件体验（SFC DX）的重要基石。它通过巧妙的类型定义和运行时垫片（shims），让开发者能够在 `<script setup>` 中享受到类型安全且简洁的 API，同时配合编译器将这些宏转换为高效的运行时代码。
