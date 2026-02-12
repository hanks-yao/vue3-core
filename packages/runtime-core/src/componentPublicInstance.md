# ComponentPublicInstance 源码解析

`packages/runtime-core/src/componentPublicInstance.ts` 文件主要负责定义 Vue 组件的**公共实例（Public Instance）**及其**代理（Proxy）行为**。

简单来说，当我们在 Vue 组件的 `render` 函数或模板中使用 `this` 时，访问的就是这个文件定义的代理对象。它负责将对 `this.xxx` 的访问路由到正确的数据源（如 `props`、`data`、`setupState`、全局属性等）。

## 核心目标

1.  **统一访问入口**：将 `data`、`props`、`setup()` 返回值、计算属性、方法等统一暴露在 `this` 上。
2.  **性能优化**：使用 `AccessTypes` 和 `accessCache` 缓存属性访问路径，减少重复的查找开销。
3.  **类型支持**：提供 `ComponentPublicInstance` 等类型定义，确保 TypeScript 能正确推断组件实例的类型。

## 核心类型

### `ComponentPublicInstance`
这是组件实例的公共接口类型。它定义了我们在组件实例上能访问到的所有属性，包括：
-   `$` 开头的内置属性（如 `$el`, `$data`, `$props`, `$emit` 等）。
-   用户定义的 `props`、`data`、`setup` 返回值、`methods`、`computed`。
-   通过 `ComponentCustomProperties` 扩展的全局属性（如 `$router`, `$store`）。

### `ComponentCustomProperties`
这是一个空接口，利用 TypeScript 的**模块扩展（Module Augmentation）**特性，允许用户或插件向组件实例添加自定义属性类型。

## 核心逻辑：代理处理器 (`PublicInstanceProxyHandlers`)

这是文件最关键的部分，定义了 `Proxy` 的 `get`、`set` 和 `has` 拦截器。

### 1. 属性读取 (`get`)

当访问 `this.key` 时，查找顺序如下：

1.  **快速路径（缓存）**：检查 `accessCache`，如果命中缓存，直接从对应的数据源（`setupState`, `data`, `ctx`, `props`）获取。
2.  **首次访问（建立缓存）**：
    -   检查 `setupState`（`setup()` 返回值）。
    -   检查 `data`。
    -   检查 `props`。
    -   检查 `ctx`（上下文对象）。
    -   如果找到，将结果存入 `accessCache`，以便下次快速访问。
3.  **公共属性**：检查 `publicPropertiesMap`（如 `$el`, `$attrs` 等）。
4.  **CSS Modules**：检查是否注入了 CSS Modules。
5.  **全局属性**：检查 `appContext.config.globalProperties`。

> **性能优化**：`accessCache` 是一个以 `null` 为原型的对象，用于存储属性键与其来源类型（`AccessTypes`）的映射。这避免了每次访问都调用昂贵的 `hasOwn` 检查。

### 2. 属性设置 (`set`)

当执行 `this.key = value` 时：

1.  **Setup State**：如果是 `setup()` 返回的可变属性，允许修改。
2.  **Data**：如果是 `data()` 返回的属性，允许修改。
3.  **Props**：如果是 `props`，**禁止修改**（并发出警告）。
4.  **公共属性**：如果是 `$` 开头的保留属性，**禁止修改**（并发出警告）。
5.  **其他**：写入 `ctx`（上下文对象）。

### 3. 属性存在性检查 (`has`)

当执行 `'key' in this` 时，检查该键是否存在于：
-   `accessCache`
-   `data`
-   `setupState`
-   `props`
-   `ctx`
-   `publicPropertiesMap`
-   全局属性

## 内置公共属性 (`publicPropertiesMap`)

定义了所有以 `$` 开头的内置属性的 getter 实现：

| 属性 | 描述 |
| :--- | :--- |
| `$` | 组件内部实例引用 |
| `$el` | 组件根 DOM 元素 |
| `$data` | 响应式数据对象 |
| `$props` | 组件 props 对象 |
| `$attrs` | 透传属性（非 prop 的 attribute） |
| `$slots` | 插槽对象 |
| `$refs` | 模板引用对象 |
| `$parent` | 父组件公共实例 |
| `$root` | 根组件公共实例 |
| `$emit` | 事件触发函数 |
| `$options` | 解析后的组件选项 |
| `$forceUpdate` | 强制更新函数 |
| `$nextTick` | 下一次 DOM 更新回调 |
| `$watch` | 侦听器 API |

## 开发环境辅助

### `createDevRenderContext`
在开发模式下，为了方便在浏览器控制台检查组件实例，Vue 会创建一个包含所有代理属性的真实对象。这样在控制台打印 `this` 时，可以看到所有可用的属性，而不仅仅是一个空的 Proxy 对象。
