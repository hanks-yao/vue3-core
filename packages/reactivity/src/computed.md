# computed.ts - Vue3 计算属性

## 文件概述

`computed.ts` 是 Vue3 响应式系统中实现**计算属性（computed）**的模块。计算属性根据依赖的响应式数据惰性求值并缓存结果，依赖不变时直接返回缓存，避免重复计算；同时它本身实现 `Subscriber` 接口，作为订阅者参与依赖收集与通知链。

## 核心概念

### 1. 计算属性的双重身份

- **作为 Ref**：对外暴露 `.value`，可被 `effect` 等读取并建立“谁依赖这个 computed”的关系。
- **作为 Subscriber**：内部 getter 会访问其他响应式数据，因此会作为订阅者被这些数据的 Dep 记录；当依赖变化时通过 `notify()` 被通知，标记为脏并进入批处理队列。

### 2. 惰性求值与缓存

- 只有访问 `.value` 时才会执行 getter（由 `effect.ts` 中的 `refreshComputed()` 负责实际求值）。
- 若当前不是“脏”状态且满足快速路径条件，直接返回 `_value`，不重新执行 getter。
- 利用 `globalVersion`（来自 `dep.ts`）做快速路径：自上次刷新以来若无响应式变化，可跳过求值。

### 3. 只读与可写

- 仅传入 getter 时得到只读 `ComputedRef`，对 `.value` 赋值在开发环境会警告。
- 传入 `{ get, set }` 时得到 `WritableComputedRef`，赋值会调用 `setter`。

## 类型与接口

| 类型 / 接口 | 说明 |
|------------|------|
| `ComputedRef<T>` | 只读计算属性 Ref，`value` 只读 |
| `WritableComputedRef<T, S>` | 可写计算属性 Ref，带 setter |
| `ComputedGetter<T>` | getter 函数 `(oldValue?: T) => T` |
| `ComputedSetter<T>` | setter 函数 `(newValue: T) => void` |
| `WritableComputedOptions<T, S>` | `{ get, set }` 配置对象 |

符号 `ComputedRefSymbol` / `WritableComputedRefSymbol` 用于在类型层面区分普通 ref 与只读/可写计算属性。

## ComputedRefImpl 类

实现 `Subscriber` 接口，是计算属性的内部实现类（由 `@vue/reactivity` 私有导出给 Vue 核心使用）。

### 关键属性

| 属性 | 含义 |
|-----|------|
| `_value` | 缓存的计算结果 |
| `dep` | 收集“依赖本 computed”的订阅者（如 effect），本 computed 值更新后通过它通知 |
| `deps` / `depsTail` | 本 computed 依赖的 Dep 对应的 Link 链表（Subscriber 接口要求），用于依赖清理与追踪 |
| `flags` | 状态标志（如 `DIRTY`、`NOTIFIED`、`RUNNING`、`EVALUATED` 等），与 `effect.ts` 中一致 |
| `globalVersion` | 与全局版本比对，用于“无变化则不必重新求值”的快速路径 |
| `fn` / `setter` | getter 与可选的 setter |
| `isSSR` | 是否 SSR 环境，影响 `refreshComputed` 中的求值策略（SSR 无渲染 effect，依赖 globalVersion 等做缓存） |

### 核心方法

- **`get value()`**  
  1. 调用 `this.dep.track()` 让当前正在运行的 effect 订阅本 computed，得到 `link`。  
  2. 调用 `refreshComputed(this)`：若为脏或需更新则执行 getter，更新 `_value` 和 `dep.version`。  
  3. 若有 `link`，将 `link.version` 与 `this.dep.version` 同步，便于依赖方判断是否需要重新执行。  
  4. 返回 `this._value`。

- **`set value(newValue)`**  
  若有 `setter` 则调用；否则在开发环境警告“只读”。

- **`notify()`**  
  依赖的响应式数据变化时由 Dep 调用。将 `flags` 置为 `DIRTY`；若尚未 `NOTIFIED` 且当前 `activeSub !== this`（避免自递归），则 `batch(this, true)` 加入**计算属性专用批处理队列**（在 effect 中会先于普通 effect 执行）。

## computed() 函数

```ts
computed(getter | { get, set }, debugOptions?, isSSR?)
```

- **重载**：  
  - 只传 getter → 返回 `ComputedRef<T>`。  
  - 传 `{ get, set }` → 返回 `WritableComputedRef<T, S>`。
- **实现**：  
  - 根据入参解析出 `getter` 和可选的 `setter`。  
  - `new ComputedRefImpl(getter, setter, isSSR)` 得到实例。  
  - 开发环境且非 SSR 时，将 `debugOptions?.onTrack` / `onTrigger` 挂到实例上。  
  - 返回该实例（对外类型为 `ComputedRef` 或 `WritableComputedRef`）。

## 与 effect、dep 的协作

- **effect 读取 computed.value**：  
  effect 执行时调用 `computed.value` → `dep.track()` 记录 effect 依赖该 computed → `refreshComputed(this)` 若需要会执行 getter；getter 里访问的 ref/reactive 会把这一个 computed 当作 Subscriber 记在各自的 Dep 上。
- **依赖变化时**：  
  某个 ref/reactive 更新 → 其 Dep 通知到该 computed 的 `notify()` → 标记 DIRTY 并 `batch(this, true)` → 在 `endBatch` 时先刷新 batchedComputed 再执行普通 effect；之后 effect 再读 computed.value 时，`refreshComputed` 会重新求值并更新 `_value`。
- **refreshComputed**（在 effect.ts）：  
  负责实际执行 getter、更新 `_value`、维护 `flags` 与 `globalVersion`、依赖的收集与清理等；computed.ts 只负责在 `get value()` 里调用它并同步 link 版本。

## 小结

- **computed.ts** 定义计算属性的类型与 `ComputedRefImpl`，以及对外 API `computed()`。
- 计算属性同时是 **Ref**（提供 `.value`）和 **Subscriber**（追踪依赖、响应 `notify`），通过 **惰性求值 + 缓存 + 脏标记 + globalVersion 快速路径** 减少重复计算。
- 求值逻辑在 **effect.ts** 的 `refreshComputed()` 中；与 **dep.ts** 的 `Dep`/`Link`/`globalVersion` 配合完成依赖收集与批量更新。
