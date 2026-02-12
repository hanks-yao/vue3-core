# Vue 3 Runtime Core - Error Handling 逻辑总结

`packages/runtime-core/src/errorHandling.ts` 文件实现了 Vue 3 运行时的核心错误处理机制。它提供了一套统一的 API 来执行用户提供的代码，并捕获执行过程中可能发生的错误。

## 1. 错误类型 (Error Types)

Vue 定义了多种错误源，涵盖了组件生命周期的各个阶段和用户代码执行的上下文：

- **生命周期钩子 (Lifecycle Hooks)**: 如 `created`, `mounted`, `unmounted` 等。
- **渲染与设置**: `setup` 函数, `render` 函数。
- **侦听器 (Watchers)**: getter, callback, cleanup (注：部分定义在 reactivity 包中)。
- **事件处理器**: 原生 DOM 事件, 组件自定义事件。
- **其他**: 指令钩子, Transition 钩子, 异步组件加载器, 调度器 (Scheduler) 等。

`ErrorCodes` 枚举定义了这些非生命周期钩子的错误代码，而 `ErrorTypeStrings` 映射提供了用于开发环境警告的可读字符串。

## 2. 核心 API

### 2.1 `callWithErrorHandling`

用于执行**同步**函数并捕获错误。

- **输入**: 函数 `fn`，组件实例 `instance`，错误类型 `type`，参数 `args`。
- **逻辑**: 使用 `try...catch` 包裹函数调用。如果捕获到错误，调用 `handleError`。

### 2.2 `callWithAsyncErrorHandling`

用于执行可能返回 Promise 的函数（或函数数组）并捕获**异步**错误。

- **输入**: 函数或函数数组 `fn`。
- **逻辑**:
  - 如果是单个函数：调用 `callWithErrorHandling`。如果返回值是 Promise，则通过 `.catch()` 捕获异步错误并调用 `handleError`。
  - 如果是函数数组：遍历数组，递归调用 `callWithAsyncErrorHandling`。

### 2.3 `handleError`

这是核心的错误处理入口，实现了 Vue 的错误冒泡和捕获机制。

**处理流程**:
1. **组件链冒泡**:
   - 从当前组件实例的父组件开始，向上遍历组件树。
   - 检查每个组件是否定义了 `errorCaptured` 钩子。
   - 如果存在 `errorCaptured` 钩子，则调用它。
   - **关键**: 如果 `errorCaptured` 钩子返回 `false`，则**停止传播**，错误被认为已处理。
2. **应用级处理**:
   - 如果错误冒泡到根组件仍未被拦截（或没有父组件），则检查应用上下文 (`appContext`) 中是否配置了全局 `errorHandler`。
   - 如果存在，调用全局 `errorHandler`。
3. **默认日志**:
   - 如果以上步骤都未处理错误，调用 `logError` 进行默认处理。

### 2.4 `logError`

负责将错误输出到控制台或抛出。

- **开发环境 (`__DEV__`)**:
  - 发出警告 (`warn`)。
  - 默认情况下抛出错误（`throwInDev = true`），以便开发者能注意到。
  - 如果在测试环境 (`__TEST__`) 之外且不抛出，则使用 `console.error` 打印。
- **生产环境**:
  - 默认使用 `console.error` 打印错误，以避免应用崩溃（"recover in prod"）。
  - 如果配置了 `throwUnhandledErrorInProduction` 或参数 `throwInProd` 为 true，则抛出错误。

## 3. 总结

Vue 3 的错误处理机制设计得非常健壮：
- **统一入口**: 所有用户代码的执行都应通过 `callWithErrorHandling` 或 `callWithAsyncErrorHandling` 包装。
- **层级捕获**: 允许父组件通过 `errorCaptured` 捕获子组件的错误，类似于 React 的 Error Boundary。
- **全局兜底**: 提供 `app.config.errorHandler` 作为最后的错误处理防线。
- **环境区分**: 开发环境倾向于暴露错误（抛出异常），生产环境倾向于记录日志并恢复执行，保证应用稳定性。
