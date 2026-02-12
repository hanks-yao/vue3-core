# Suspense 组件源码解析

`Suspense` 是 Vue 3 中用于处理异步组件依赖的内置组件。它允许在组件树中等待异步依赖（如异步组件或带有 `async setup()` 的组件）解决时，渲染后备内容（fallback content）。

## 核心概念

Suspense 的核心逻辑围绕 `SuspenseBoundary` 接口展开，它管理着两个分支：
- **Active Branch**: 当前显示的内容。
- **Pending Branch**: 正在等待解决的新内容。

当一个新的异步依赖出现时，Suspense 会进入 pending 状态，显示 fallback 内容（如果配置了），直到所有依赖都解决。

## 主要结构

### SuspenseImpl

`SuspenseImpl` 是 Suspense 的内部实现对象，它定义了：
- `__isSuspense`: 标识符，让渲染器识别它。
- `process`: 处理 Suspense 的挂载和更新逻辑。
- `hydrate`: 处理服务端渲染（SSR）的注水逻辑。

### SuspenseBoundary

`SuspenseBoundary` 是一个对象，维护了 Suspense 实例的状态，包括：
- `vnode`: 关联的虚拟节点。
- `activeBranch` / `pendingBranch`: 当前和等待中的 VNode 分支。
- `deps`: 待解决的异步依赖计数。
- `resolve()`: 当所有依赖解决时调用的方法。
- `fallback()`: 切换到 fallback 内容的方法。

## 核心流程

### 1. 挂载 (Mount)

`mountSuspense` 函数负责 Suspense 的初始化挂载：
1. 创建 `SuspenseBoundary`。
2. 在一个隐藏容器（`hiddenContainer`）中挂载 `ssContent`（默认插槽内容）。
3. 检查是否有异步依赖 (`deps > 0`)：
   - 如果有，触发 `onFallback` 事件，挂载 `ssFallback`（fallback 插槽内容）到实际容器。
   - 如果没有，直接调用 `resolve()` 显示内容。

### 2. 更新 (Patch)

`patchSuspense` 处理 Suspense 的更新：
1. 检查是否有新的 `pendingBranch`。
2. 如果是同一个根节点更新，直接 patch 内容。
3. 如果根节点切换（例如 `v-if` 切换了组件）：
   - 创建新的 pending 分支。
   - 增加 `pendingId`。
   - 在隐藏容器中挂载新分支。
   - 如果新分支没有异步依赖，立即 resolve。
   - 如果有异步依赖，根据 `timeout` 设置决定是否显示 fallback。

### 3. 依赖处理 (Dependency Handling)

- **注册依赖**: 当子组件有 `async setup()` 时，会调用 `registerDep`。这会增加 `deps` 计数。
- **解决依赖**: 当异步操作完成，promise resolve 后，会减少 `deps` 计数。当 `deps` 归零时，调用 `resolve()`。

### 4. 解决 (Resolve)

`resolve()` 方法负责将 pending 分支切换为 active 分支：
1. 处理过渡效果（如果有）。
2. 将 pending 分支的内容移动到实际容器。
3. 卸载旧的 active 分支。
4. 触发 `onResolve` 事件。

## 服务端渲染 (SSR)

`hydrateSuspense` 处理 SSR 场景：
- 尝试注水（hydrate）DOM。
- 如果 SSR 内容成功渲染，它被视为 resolved。
- 如果 SSR 内容是 fallback，客户端会重新尝试挂载 content。

## 事件

Suspense 支持三个事件钩子：
- `onResolve`: 当默认插槽内容解决并显示时触发。
- `onPending`: 当进入 pending 状态时触发。
- `onFallback`: 当显示 fallback 内容时触发。
