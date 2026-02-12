# Vue 3 HMR (Hot Module Replacement) Runtime

`packages/runtime-core/src/hmr.ts` 文件实现了 Vue 3 的热模块替换（HMR）运行时逻辑。它允许在开发过程中替换组件的定义或模板，而无需刷新整个页面。

## 核心变量

- **`isHmrUpdating`**: 一个布尔标志，用于指示当前是否正在进行 HMR 更新。这有助于在更新过程中控制某些副作用或行为。
- **`hmrDirtyComponents`**: 一个 `Map`，用于存储在 HMR 过程中被标记为“脏”（dirty）的组件定义及其实例集合。这用于在 `reload` 过程中跟踪需要更新的组件。
- **`map`**: 一个私有的 `Map`，用于存储 HMR ID 到组件记录的映射。每个记录包含：
  - `initialDef`: 组件的初始定义（在导入时记录）。
  - `instances`: 该组件的所有活跃实例集合 (`Set<ComponentInternalInstance>`)。

## 核心接口

- **`HMRRuntime`**: 定义了暴露给全局的 HMR 运行时接口，包含 `createRecord`、`rerender` 和 `reload` 方法。

## 主要函数

### 1. `registerHMR(instance)`
- **作用**: 将一个新的组件实例注册到 HMR 系统中。
- **逻辑**: 根据组件的 `__hmrId` 获取或创建记录，并将实例添加到记录的 `instances` 集合中。

### 2. `unregisterHMR(instance)`
- **作用**: 从 HMR 系统中移除组件实例。
- **逻辑**: 从对应的记录中删除该实例。通常在组件卸载时调用。

### 3. `createRecord(id, initialDef)`
- **作用**: 为给定的 HMR ID 创建一个新的记录。
- **逻辑**: 如果 ID 已存在则返回 false，否则创建包含初始定义和空实例集合的新记录。

### 4. `rerender(id, newRender?)`
- **作用**: 处理组件的**模板更新**。
- **逻辑**:
  - 更新记录中的初始定义 `render` 函数。
  - 遍历所有实例：
    - 更新实例的 `render` 函数。
    - 清空 `renderCache`。
    - 设置 `isHmrUpdating` 为 true。
    - 调用 `instance.update()` 强制重新渲染。
    - 恢复 `isHmrUpdating` 为 false。

### 5. `reload(id, newComp)`
- **作用**: 处理组件的**脚本或样式更新**（即组件定义变更）。
- **逻辑**:
  - 更新初始组件定义。
  - 遍历所有实例：
    - 将旧组件定义标记为 dirty，存入 `hmrDirtyComponents`。
    - 清除实例的选项缓存（props, emits, options）。
    - **执行更新**:
      - 对于自定义元素 (`ceReload`)，直接调用重载方法。
      - 对于普通组件，通过 `queueJob` 强制**父组件**重新渲染。这会导致子组件（当前更新的组件）被卸载并使用新定义重新挂载。
      - 对于根实例，调用 `appContext.reload()` 或强制页面刷新。
  - 使用 `queuePostFlushCb` 在更新完成后清理 `hmrDirtyComponents`。

### 6. `updateComponentDef(oldComp, newComp)`
- **作用**: 辅助函数，用于将新组件定义的属性合并到旧组件定义中。
- **逻辑**: 复制新属性，删除旧属性（除了 `__file`）。

## 全局暴露

在开发环境 (`__DEV__`) 下，HMR 运行时通过 `__VUE_HMR_RUNTIME__` 暴露在全局对象 (`window` 或 `global`) 上。这使得构建工具（如 `vue-loader`, `vite-plugin-vue`）可以生成代码来调用这些方法，实现 HMR 功能。
