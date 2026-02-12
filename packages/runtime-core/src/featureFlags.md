# Feature Flags (特性标志)

`packages/runtime-core/src/featureFlags.ts` 文件的主要目的是在运行时初始化和检查 Vue 的特性标志（Feature Flags）。这些标志主要用于 `esm-bundler` 构建版本，以便在构建时通过 Tree-shaking 优化包的大小。

## 核心逻辑

`initFeatureFlags` 函数是该文件的核心，它在创建渲染器时（`baseCreateRenderer`）被调用。

1.  **检查标志是否定义**：函数会检查几个关键的全局变量是否已被定义为布尔值。这些变量通常由构建工具（如 Vite, Webpack, Rollup）通过 `DefinePlugin` 或类似机制注入。
2.  **设置默认值**：如果这些标志未定义，函数会为它们设置默认值，并将其挂载到全局对象（`globalThis`）上。
3.  **开发环境警告**：在开发环境下（`__DEV__` 为真），如果发现有标志未定义，会收集这些标志并在控制台输出警告，提示用户在构建配置中显式定义这些标志以获得更好的 Tree-shaking 效果。

## 主要特性标志

| 标志名称 | 默认值 | 描述 |
| :--- | :--- | :--- |
| `__VUE_OPTIONS_API__` | `true` | 是否启用 Vue 2 风格的 Options API 支持。如果你的应用只使用 Composition API，可以将其设置为 `false` 以减小包体积。 |
| `__VUE_PROD_DEVTOOLS__` | `false` | 是否在生产环境中启用 Devtools 支持。默认在生产环境中禁用。 |
| `__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` | `false` | 是否在生产环境中启用服务端渲染（SSR）水合不匹配的详细信息。默认在生产环境中禁用以减小体积。 |

## 为什么需要这样做？

在 `esm-bundler` 构建中，Vue 源码保留了对这些全局变量的引用。构建工具可以在打包时将这些变量替换为具体的布尔值（例如 `true` 或 `false`）。

-   如果替换为 `false`，构建工具的死代码消除（Dead Code Elimination）功能可以移除被该标志保护的代码块，从而减小最终产物的体积。
-   如果用户没有在构建配置中定义这些变量，`initFeatureFlags` 会在运行时提供兜底的默认值，确保代码能正常运行，但会失去 Tree-shaking 的优势，并给出警告提示优化。
