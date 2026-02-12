# Enums 模块总结 (`packages/runtime-core/src/enums.ts`)

该文件主要定义了 Vue 3 运行时核心模块中使用的枚举类型，目前仅包含生命周期钩子的定义。这些枚举值通常使用简短的字符串缩写，用于内部标识和处理，有助于减小代码体积。

## 核心枚举

### `LifecycleHooks`

定义了 Vue 组件生命周期的各个阶段。这些钩子涵盖了组件从创建、挂载、更新到卸载的完整过程，以及调试和错误处理相关的钩子。

| 枚举成员 | 值 | 对应的生命周期钩子 | 描述 |
| :--- | :--- | :--- | :--- |
| `BEFORE_CREATE` | `'bc'` | `beforeCreate` | 在实例初始化之后、数据观测 (data observer) 和 event/watcher 事件配置之前被调用。 |
| `CREATED` | `'c'` | `created` | 在实例创建完成后被立即调用。在这一步，实例已完成以下的配置：数据观测 (data observer)，属性和方法的运算，watch/event 事件回调。 |
| `BEFORE_MOUNT` | `'bm'` | `beforeMount` | 在挂载开始之前被调用：相关的 `render` 函数首次被调用。 |
| `MOUNTED` | `'m'` | `mounted` | 实例被挂载后调用，这时 `el` 被新创建的 `vm.$el` 替换了。 |
| `BEFORE_UPDATE` | `'bu'` | `beforeUpdate` | 数据更新时调用，发生在虚拟 DOM 打补丁之前。 |
| `UPDATED` | `'u'` | `updated` | 由于数据更改导致的虚拟 DOM 重新渲染和打补丁，在这之后会调用该钩子。 |
| `BEFORE_UNMOUNT` | `'bum'` | `beforeUnmount` | 在卸载组件实例之前调用。在这个阶段，实例仍然是完全正常的。 |
| `UNMOUNTED` | `'um'` | `unmounted` | 卸载组件实例后调用。调用此钩子时，组件实例的所有指令已被解除绑定，所有事件监听器已被移除，所有子组件实例也已被卸载。 |
| `DEACTIVATED` | `'da'` | `deactivated` | 被 `keep-alive` 缓存的组件失活时调用。 |
| `ACTIVATED` | `'a'` | `activated` | 被 `keep-alive` 缓存的组件激活时调用。 |
| `RENDER_TRIGGERED` | `'rtg'` | `renderTriggered` | **调试钩子**。当虚拟 DOM 重新渲染被触发时调用。 |
| `RENDER_TRACKED` | `'rtc'` | `renderTracked` | **调试钩子**。当虚拟 DOM 重新渲染被跟踪时调用。 |
| `ERROR_CAPTURED` | `'ec'` | `errorCaptured` | 当捕获一个来自子孙组件的错误时被调用。 |
| `SERVER_PREFETCH` | `'sp'` | `serverPrefetch` | **SSR 专用**。在组件实例在服务器上被渲染前调用。 |
