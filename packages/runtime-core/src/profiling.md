# Profiling (性能分析)

`packages/runtime-core/src/profiling.ts` 文件主要负责 Vue 3 核心运行时中的性能分析功能。它利用浏览器的 `Performance` API 来测量组件生命周期各个阶段的耗时，并将数据集成到浏览器的性能面板 (Performance panel) 和 Vue DevTools 中。

## 主要功能

该模块主要包含两个核心函数：`startMeasure` 和 `endMeasure`，用于标记性能测量的开始和结束。

### 1. 性能测量 (`startMeasure` / `endMeasure`)

这两个函数成对使用，用于测量特定操作（如组件初始化、渲染、更新等）的耗时。

- **`startMeasure(instance, type)`**:
    - **作用**: 标记性能测量的起点。
    - **逻辑**:
        1.  检查应用配置 `appContext.config.performance` 是否开启，且浏览器是否支持 `Performance` API。
        2.  如果支持，使用 `performance.mark()` 创建一个标记，标记名称格式为 `vue-<type>-<uid>`。
        3.  在开发环境或启用了生产环境 DevTools 时，调用 `devtoolsPerfStart` 通知 DevTools 开始记录。

- **`endMeasure(instance, type)`**:
    - **作用**: 标记性能测量的终点，并计算耗时。
    - **逻辑**:
        1.  同样检查配置和浏览器支持情况。
        2.  生成结束标记名称 (`startTag + ':end'`)。
        3.  使用 `performance.mark()` 标记结束点。
        4.  使用 `performance.measure()` 计算开始标记和结束标记之间的时间差，测量名称包含组件名称和操作类型（例如 `<MyComponent> render`）。
        5.  **清理**: 调用 `clearMeasures` 和 `clearMarks` 清除相关的测量数据和标记，保持性能面板整洁。
        6.  在开发环境或启用了生产环境 DevTools 时，调用 `devtoolsPerfEnd` 通知 DevTools 结束记录。

### 2. 环境检测 (`isSupported`)

- **作用**: 检测当前运行环境是否支持标准的 `window.performance` API。
- **逻辑**:
    - 懒加载检测结果，首次调用后缓存结果 (`supported` 变量)。
    - 检查 `window` 对象和 `window.performance` 是否存在。

## 关键依赖

- **`Performance` API**: 浏览器原生 API，用于高精度时间测量。
- **`devtoolsPerfStart` / `devtoolsPerfEnd`**: 来自 `./devtools` 模块，用于与 Vue DevTools 通信。
- **`formatComponentName`**: 用于生成易读的组件名称，方便在性能面板中识别。

## 总结

`profiling.ts` 提供了一个轻量级的性能埋点机制。它不仅支持通过浏览器原生的 Performance 面板查看 Vue 组件的性能开销（如渲染耗时），还与 Vue DevTools 紧密集成，帮助开发者分析和优化应用性能。这些功能通常只在开发模式下或显式开启 `app.config.performance` 时才会激活。
