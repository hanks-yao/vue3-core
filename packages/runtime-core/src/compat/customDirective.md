# CustomDirective 兼容性处理逻辑

该文件 (`packages/runtime-core/src/compat/customDirective.ts`) 主要负责处理 Vue 2 自定义指令生命周期钩子到 Vue 3 的兼容映射。它允许在 Vue 3 的兼容构建中继续使用 Vue 2 风格的指令钩子，并会在使用时发出迁移警告。

## 核心逻辑

### 1. 定义 Vue 2 指令接口 (`LegacyDirective`)

定义了 Vue 2 中支持的指令生命周期钩子：
- `bind`: 只调用一次，指令第一次绑定到元素时调用。
- `inserted`: 被绑定元素插入父节点时调用。
- `update`: 所在组件的 VNode 更新时调用。
- `componentUpdated`: 指令所在组件的 VNode 及其子 VNode 全部更新后调用。
- `unbind`: 只调用一次，指令与元素解绑时调用。

### 2. 钩子映射表 (`legacyDirectiveHookMap`)

建立 Vue 3 新版钩子到 Vue 2 旧版钩子的映射关系：

| Vue 3 Hook    | Vue 2 Hook(s)               | 说明                                                                 |
| :------------ | :-------------------------- | :------------------------------------------------------------------- |
| `beforeMount` | `bind`                      | Vue 3 的挂载前对应 Vue 2 的绑定时                                    |
| `mounted`     | `inserted`                  | Vue 3 的挂载后对应 Vue 2 的插入后                                    |
| `updated`     | `['update', 'componentUpdated']` | Vue 3 的更新钩子合并了 Vue 2 的 `update` 和 `componentUpdated` 两个阶段 |
| `unmounted`   | `unbind`                    | Vue 3 的卸载对应 Vue 2 的解绑                                        |

### 3. 兼容性解析函数 (`mapCompatDirectiveHook`)

该函数用于在运行时解析并返回对应的旧版钩子函数。

**处理流程：**
1.  接收 Vue 3 的钩子名称 (`name`)、指令对象 (`dir`) 和组件实例 (`instance`)。
2.  根据 `legacyDirectiveHookMap` 查找对应的 Vue 2 钩子名称。
3.  **如果是数组映射** (针对 `updated`)：
    -   遍历数组（`update`, `componentUpdated`）。
    -   检查指令对象中是否定义了这些旧版钩子。
    -   如果定义了，调用 `softAssertCompatEnabled` 发出 `CUSTOM_DIR` 类型的弃用警告。
    -   收集所有存在的钩子并返回数组。
4.  **如果是单值映射** (其他钩子)：
    -   检查指令对象中是否定义了对应的旧版钩子。
    -   如果定义了，同样发出弃用警告。
    -   直接返回该钩子函数。

## 总结

此模块是 Vue 3 迁移策略的一部分，确保开发者在升级过程中，旧有的自定义指令代码（使用 `bind`, `inserted` 等）在开启兼容模式下仍能正常工作，同时通过警告提示开发者尽快迁移到新的生命周期钩子（`beforeMount`, `mounted` 等）。
