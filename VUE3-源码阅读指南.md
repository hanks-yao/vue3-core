# Vue 3 源码阅读指南

> Vue 3.5.27 源码完整分析指南

## 📋 目录

- [一、项目整体结构](#一项目整体结构)
- [二、核心包详细说明](#二核心包详细说明)
- [三、源码阅读顺序](#三源码阅读顺序)
- [四、关键知识点](#四关键知识点)
- [五、各模块核心文件说明](#五各模块核心文件说明)

---

## 一、项目整体结构

### 1.1 顶层目录结构

```
vue3-core/
├── .github/                    # GitHub 配置文件
│   ├── workflows/             # CI/CD 工作流配置
│   └── ISSUE_TEMPLATE/        # Issue 模板
├── .vscode/                   # VSCode 编辑器配置
├── changelogs/                # 历史版本变更日志
├── packages/                  # 核心源码包（重点）
├── packages-private/          # 私有包（测试和工具）
├── scripts/                   # 构建和发布脚本
├── package.json              # 项目配置
├── pnpm-workspace.yaml       # pnpm 工作区配置
├── rollup.config.js          # Rollup 打包配置
├── tsconfig.json             # TypeScript 配置
└── vitest.config.ts          # 测试配置
```

### 1.2 核心 packages 目录

```
packages/
├── reactivity/               # 响应式系统 ⭐⭐⭐
├── runtime-core/             # 运行时核心 ⭐⭐⭐
├── runtime-dom/              # 浏览器运行时 ⭐⭐⭐
├── compiler-core/            # 编译器核心 ⭐⭐⭐
├── compiler-dom/             # DOM 编译器 ⭐⭐
├── compiler-sfc/             # 单文件组件编译器 ⭐⭐
├── compiler-ssr/             # SSR 编译器 ⭐
├── server-renderer/          # 服务端渲染 ⭐
├── shared/                   # 共享工具函数 ⭐⭐
├── vue/                      # 完整构建入口 ⭐
├── vue-compat/               # Vue 2 兼容层
└── runtime-test/             # 测试运行时
```

---

## 二、核心包详细说明

### 2.1 @vue/reactivity（响应式系统）

**核心功能：** 实现 Vue 3 的响应式系统，基于 Proxy 实现

**核心文件：**

```
reactivity/src/
├── reactive.ts               # reactive() API 实现
├── ref.ts                    # ref() API 实现
├── computed.ts               # computed() API 实现
├── effect.ts                 # 副作用函数和依赖收集核心
├── dep.ts                    # 依赖（Dep）类实现
├── effectScope.ts            # effectScope API
├── watch.ts                  # watch/watchEffect API
├── baseHandlers.ts           # 基础类型的 Proxy handlers
├── collectionHandlers.ts     # Map/Set/WeakMap/WeakSet 的 handlers
├── arrayInstrumentations.ts  # 数组方法的特殊处理
└── index.ts                  # 导出所有 API
```

**关键概念：**
- 响应式原理：Proxy + Reflect
- 依赖收集：track()
- 触发更新：trigger()
- 响应式对象：reactive、readonly、shallowReactive
- 响应式引用：ref、shallowRef、toRef、toRefs

### 2.2 @vue/runtime-core（运行时核心）

**核心功能：** 平台无关的运行时核心，包括虚拟 DOM、组件、生命周期等

**核心文件：**

```
runtime-core/src/
├── renderer.ts               # 核心渲染器实现（最重要）⭐⭐⭐
├── vnode.ts                  # 虚拟节点定义和创建
├── component.ts              # 组件实例和生命周期
├── componentProps.ts         # 组件 props 处理
├── componentEmits.ts         # 组件事件处理
├── componentSlots.ts         # 组件插槽处理
├── componentOptions.ts       # Options API 支持
├── apiCreateApp.ts           # createApp API
├── apiDefineComponent.ts     # defineComponent API
├── apiLifecycle.ts           # 生命周期钩子
├── apiWatch.ts               # watch API
├── apiInject.ts              # provide/inject API
├── apiSetupHelpers.ts        # setup 辅助函数
├── scheduler.ts              # 调度器（异步更新队列）
├── h.ts                      # h() 函数
├── hydration.ts              # 客户端激活（SSR）
├── directives.ts             # 指令系统
├── errorHandling.ts          # 错误处理
└── components/               # 内置组件
    ├── KeepAlive.ts          # KeepAlive 组件
    ├── Teleport.ts           # Teleport 组件
    ├── Suspense.ts           # Suspense 组件
    └── BaseTransition.ts     # Transition 基类
```

**关键概念：**
- 虚拟 DOM（VNode）
- 组件系统
- Diff 算法
- 渲染器（Renderer）
- 调度器（Scheduler）
- 生命周期

### 2.3 @vue/runtime-dom（浏览器运行时）

**核心功能：** DOM 特定的运行时，将 runtime-core 适配到浏览器环境

**核心文件：**

```
runtime-dom/src/
├── index.ts                  # 导出 DOM 相关 API
├── nodeOps.ts                # DOM 节点操作
├── patchProp.ts              # DOM 属性更新
├── modules/                  # DOM 属性处理模块
│   ├── attrs.ts              # 普通属性
│   ├── class.ts              # class 处理
│   ├── style.ts              # style 处理
│   └── events.ts             # 事件处理
└── directives/               # 内置指令
    ├── vModel.ts             # v-model 指令
    ├── vShow.ts              # v-show 指令
    └── ...
```

**关键概念：**
- DOM API 封装
- 属性 patch 策略
- 事件系统
- 内置指令

### 2.4 @vue/compiler-core（编译器核心）

**核心功能：** 平台无关的编译器核心，将模板编译为 render 函数

**核心文件：**

```
compiler-core/src/
├── compile.ts                # 编译入口
├── parser.ts                 # 模板解析器（Parse）
├── tokenizer.ts              # 词法分析器
├── transform.ts              # AST 转换（Transform）
├── codegen.ts                # 代码生成（Generate）
├── ast.ts                    # AST 节点定义
├── options.ts                # 编译选项
├── errors.ts                 # 错误处理
└── transforms/               # 转换插件
    ├── transformElement.ts   # 元素转换
    ├── transformText.ts      # 文本转换
    ├── transformExpression.ts # 表达式转换
    ├── vIf.ts                # v-if 指令
    ├── vFor.ts               # v-for 指令
    ├── vOn.ts                # v-on 指令
    ├── vBind.ts              # v-bind 指令
    ├── vSlot.ts              # v-slot 指令
    └── vModel.ts             # v-model 指令
```

**关键概念：**
- 编译流程：Parse → Transform → Generate
- 抽象语法树（AST）
- 静态提升（hoisting）
- Block Tree（区块树优化）

### 2.5 @vue/compiler-dom（DOM 编译器）

**核心功能：** 扩展 compiler-core，处理 DOM 特定的编译逻辑

**核心文件：**

```
compiler-dom/src/
├── index.ts                  # DOM 编译器入口
├── parserOptions.ts          # DOM 解析选项
├── transforms/               # DOM 特定转换
│   ├── transformStyle.ts     # style 绑定转换
│   ├── vHtml.ts              # v-html 指令
│   ├── vText.ts              # v-text 指令
│   ├── vModel.ts             # DOM v-model 实现
│   └── vOn.ts                # DOM 事件处理
└── runtimeHelpers.ts         # 运行时辅助函数
```

### 2.6 @vue/compiler-sfc（单文件组件编译器）

**核心功能：** 编译 .vue 单文件组件

**核心文件：**

```
compiler-sfc/src/
├── parse.ts                  # 解析 .vue 文件
├── compileScript.ts          # 编译 <script> 和 <script setup>
├── compileTemplate.ts        # 编译 <template>
├── compileStyle.ts           # 编译 <style>
├── rewriteDefault.ts         # 重写默认导出
└── script/                   # script setup 相关
    ├── defineProps.ts        # defineProps 宏
    ├── defineEmits.ts        # defineEmits 宏
    ├── defineExpose.ts       # defineExpose 宏
    ├── defineModel.ts        # defineModel 宏
    ├── defineOptions.ts      # defineOptions 宏
    ├── defineSlots.ts        # defineSlots 宏
    └── resolveType.ts        # 类型解析
```

**关键概念：**
- SFC 解析（Descriptor）
- script setup 语法糖
- 编译时宏
- CSS Scoped
- CSS Modules

### 2.7 @vue/server-renderer（服务端渲染）

**核心功能：** 服务端渲染（SSR）支持

**核心文件：**

```
server-renderer/src/
├── renderToString.ts         # 渲染为字符串
├── renderToStream.ts         # 渲染为流
├── render.ts                 # SSR 渲染核心
└── helpers/                  # SSR 辅助函数
    ├── ssrRenderComponent.ts # 渲染组件
    ├── ssrRenderSlot.ts      # 渲染插槽
    ├── ssrRenderList.ts      # 渲染列表
    └── ...
```

### 2.8 @vue/shared（共享工具）

**核心功能：** 所有包共享的工具函数和常量

**核心文件：**

```
shared/src/
├── general.ts                # 通用工具函数
├── makeMap.ts                # 创建 Map
├── patchFlags.ts             # Patch 标记
├── shapeFlags.ts             # VNode 类型标记
├── slotFlags.ts              # 插槽标记
├── domTagConfig.ts           # DOM 标签配置
├── domAttrConfig.ts          # DOM 属性配置
└── index.ts                  # 导出所有工具
```

### 2.9 @vue/vue（完整构建）

**核心功能：** 组合所有包，提供完整的 Vue 功能

**文件结构：**

```
vue/src/
├── index.ts                  # 完整版（含编译器）
├── runtime.ts                # 运行时版（不含编译器）
└── dev.ts                    # 开发版特性
```

---

## 三、源码阅读顺序

### 🎯 推荐阅读路线

#### 第一阶段：基础工具和响应式系统（2-3天）

**目标：** 理解 Vue 3 响应式原理

1. **@vue/shared**
   ```
   packages/shared/src/
   ├── general.ts             # 先看基础工具函数
   ├── makeMap.ts
   ├── patchFlags.ts          # 理解 patch 标记
   └── shapeFlags.ts          # 理解 VNode 类型
   ```

2. **@vue/reactivity**（核心）
   ```
   按顺序阅读：
   ① dep.ts                   # 依赖类
   ② effect.ts                # 副作用和依赖收集（重点）
   ③ reactive.ts              # reactive 实现
   ④ baseHandlers.ts          # Proxy handlers（重点）
   ⑤ ref.ts                   # ref 实现
   ⑥ computed.ts              # computed 实现
   ⑦ watch.ts                 # watch 实现
   ⑧ effectScope.ts           # effect 作用域
   ⑨ collectionHandlers.ts    # 集合类型处理
   ⑩ arrayInstrumentations.ts # 数组特殊处理
   ```

   **学习要点：**
   - Proxy 和 Reflect 的使用
   - 依赖收集机制（track）
   - 触发更新机制（trigger）
   - 响应式对象的创建和管理
   - ref 和 reactive 的区别

#### 第二阶段：运行时核心（4-5天）

**目标：** 理解虚拟 DOM、渲染器和组件系统

3. **@vue/runtime-core**（最核心，需要反复阅读）
   ```
   第一轮 - 虚拟 DOM：
   ① vnode.ts                 # VNode 结构（重点）
   ② h.ts                     # h() 函数
   
   第二轮 - 组件系统：
   ③ component.ts             # 组件实例（重点）
   ④ componentProps.ts        # Props 处理
   ⑤ componentEmits.ts        # 事件处理
   ⑥ componentSlots.ts        # 插槽处理
   ⑦ apiDefineComponent.ts    # defineComponent
   
   第三轮 - 渲染器核心（最重要）：
   ⑧ renderer.ts              # 渲染器（重点，需要多看几遍）
   ⑨ scheduler.ts             # 调度器（重点）
   
   第四轮 - 生命周期和 API：
   ⑩ apiLifecycle.ts          # 生命周期钩子
   ⑪ apiCreateApp.ts          # createApp
   ⑫ apiWatch.ts              # watch API
   ⑬ apiInject.ts             # provide/inject
   
   第五轮 - 内置组件：
   ⑭ components/KeepAlive.ts  # KeepAlive 实现
   ⑮ components/Teleport.ts   # Teleport 实现
   ⑯ components/Suspense.ts   # Suspense 实现
   ⑰ components/BaseTransition.ts # Transition 基类
   
   第六轮 - 其他重要内容：
   ⑱ directives.ts            # 指令系统
   ⑲ errorHandling.ts         # 错误处理
   ⑳ hydration.ts             # SSR 激活
   ```

   **学习要点：**
   - VNode 的类型和结构
   - Diff 算法实现（重点）
   - Patch 流程
   - 组件的创建、更新、卸载
   - 生命周期执行时机
   - 调度器的任务队列

4. **@vue/runtime-dom**
   ```
   ① nodeOps.ts               # DOM 操作 API
   ② patchProp.ts             # 属性更新
   ③ modules/class.ts         # class 处理
   ④ modules/style.ts         # style 处理
   ⑤ modules/events.ts        # 事件处理
   ⑥ directives/vModel.ts     # v-model 实现
   ⑦ directives/vShow.ts      # v-show 实现
   ```

   **学习要点：**
   - 如何将 runtime-core 适配到 DOM
   - DOM 属性的 patch 策略
   - 事件监听器的添加和移除

#### 第三阶段：编译系统（3-4天）

**目标：** 理解模板编译原理

5. **@vue/compiler-core**（编译器核心）
   ```
   第一轮 - 编译流程：
   ① ast.ts                   # AST 节点定义
   ② compile.ts               # 编译入口
   
   第二轮 - 解析阶段：
   ③ tokenizer.ts             # 词法分析
   ④ parser.ts                # 语法分析（重点）
   
   第三轮 - 转换阶段：
   ⑤ transform.ts             # AST 转换框架（重点）
   ⑥ transforms/transformElement.ts
   ⑦ transforms/transformText.ts
   ⑧ transforms/vIf.ts        # v-if 编译
   ⑨ transforms/vFor.ts       # v-for 编译
   ⑩ transforms/vOn.ts        # v-on 编译
   ⑪ transforms/vBind.ts      # v-bind 编译
   ⑫ transforms/vModel.ts     # v-model 编译
   ⑬ transforms/vSlot.ts      # v-slot 编译
   
   第四轮 - 代码生成：
   ⑭ codegen.ts               # 代码生成（重点）
   ```

   **学习要点：**
   - 编译三阶段：Parse → Transform → Generate
   - AST 结构
   - 指令的编译策略
   - 静态提升优化
   - Block Tree 优化

6. **@vue/compiler-dom**
   ```
   ① index.ts                 # DOM 编译器入口
   ② parserOptions.ts         # DOM 解析配置
   ③ transforms/vModel.ts     # DOM v-model
   ④ transforms/vOn.ts        # DOM 事件
   ```

#### 第四阶段：高级特性（2-3天）

**目标：** 理解 SFC 和 SSR

7. **@vue/compiler-sfc**（单文件组件）
   ```
   ① parse.ts                 # 解析 .vue 文件
   ② compileScript.ts         # 编译 script（重点）
   ③ compileTemplate.ts       # 编译 template
   ④ compileStyle.ts          # 编译 style
   ⑤ script/defineProps.ts    # defineProps 实现
   ⑥ script/defineEmits.ts    # defineEmits 实现
   ⑦ script/resolveType.ts    # 类型解析
   ```

   **学习要点：**
   - script setup 的编译过程
   - 编译时宏的实现
   - CSS Scoped 原理

8. **@vue/server-renderer**（SSR）
   ```
   ① render.ts                # SSR 渲染核心
   ② renderToString.ts        # 渲染为字符串
   ③ renderToStream.ts        # 流式渲染
   ④ helpers/ssrRenderComponent.ts
   ```

   **学习要点：**
   - SSR 渲染流程
   - 与客户端渲染的区别
   - 激活（Hydration）过程

---

## 四、关键知识点

### 4.1 响应式系统

#### 核心原理

```typescript
// 1. 依赖收集（track）
function track(target, type, key) {
  // 当前活跃的 effect
  const effect = activeEffect
  if (effect) {
    // targetMap: WeakMap<target, Map<key, Set<effect>>>
    let depsMap = targetMap.get(target)
    if (!depsMap) {
      targetMap.set(target, (depsMap = new Map()))
    }
    let dep = depsMap.get(key)
    if (!dep) {
      depsMap.set(key, (dep = new Set()))
    }
    dep.add(effect)
  }
}

// 2. 触发更新（trigger）
function trigger(target, type, key) {
  const depsMap = targetMap.get(target)
  if (!depsMap) return
  
  const effects = depsMap.get(key)
  if (effects) {
    effects.forEach(effect => effect.run())
  }
}

// 3. reactive 实现
function reactive(target) {
  return new Proxy(target, {
    get(target, key, receiver) {
      track(target, 'get', key)
      return Reflect.get(target, key, receiver)
    },
    set(target, key, value, receiver) {
      const result = Reflect.set(target, key, value, receiver)
      trigger(target, 'set', key)
      return result
    }
  })
}
```

#### 关键数据结构

```
WeakMap<Target, Map<Key, Set<Effect>>>
   ↓
targetMap
   ├── target1 → depsMap
   │              ├── key1 → [effect1, effect2]
   │              └── key2 → [effect3]
   └── target2 → depsMap
                  └── key1 → [effect4]
```

### 4.2 虚拟 DOM 和 Diff 算法

#### VNode 结构

```typescript
interface VNode {
  type: string | Component | Symbol  // 节点类型
  props: Record<string, any> | null  // 属性
  children: VNodeChild               // 子节点
  key: string | number | null        // key
  shapeFlag: number                  // 类型标记
  patchFlag: number                  // 优化标记
  // ...
}
```

#### Diff 算法核心

**快速 Diff 算法（Vue 3）：**

```
旧: [a, b, c, d, e]
新: [a, b, f, c, g, e]

步骤：
1. 从头部开始比较（相同前缀）
   a === a ✓
   b === b ✓
   
2. 从尾部开始比较（相同后缀）
   e === e ✓
   
3. 处理中间部分
   旧: [c, d]
   新: [f, c, g]
   
4. 构建最长递增子序列
   找到可以复用的节点位置
   
5. 移动/新增/删除节点
```

#### Patch 类型

```typescript
// patchFlags 标记
const PatchFlags = {
  TEXT: 1,           // 动态文本
  CLASS: 2,          // 动态 class
  STYLE: 4,          // 动态 style
  PROPS: 8,          // 动态属性
  FULL_PROPS: 16,    // 完整 props
  HYDRATE_EVENTS: 32, // 需要绑定事件
  STABLE_FRAGMENT: 64, // 稳定的 fragment
  KEYED_FRAGMENT: 128, // 带 key 的 fragment
  UNKEYED_FRAGMENT: 256, // 不带 key 的 fragment
  NEED_PATCH: 512,   // 需要 patch
  DYNAMIC_SLOTS: 1024, // 动态插槽
  HOISTED: -1,       // 静态提升
  BAIL: -2           // 不优化
}
```

### 4.3 组件系统

#### 组件实例结构

```typescript
interface ComponentInternalInstance {
  type: Component          // 组件定义
  parent: ComponentInternalInstance | null
  appContext: AppContext   // 应用上下文
  vnode: VNode            // 组件 VNode
  subTree: VNode          // 渲染的 VNode 树
  props: Record<string, any>
  emit: EmitFn
  slots: Slots
  setupState: Record<string, any>  // setup 返回值
  ctx: ComponentPublicInstance     // 渲染上下文
  data: Record<string, any>        // data 选项
  // 生命周期钩子
  bc: LifecycleHook[]     // beforeCreate
  c: LifecycleHook[]      // created
  bm: LifecycleHook[]     // beforeMount
  m: LifecycleHook[]      // mounted
  bu: LifecycleHook[]     // beforeUpdate
  u: LifecycleHook[]      // updated
  bum: LifecycleHook[]    // beforeUnmount
  um: LifecycleHook[]     // unmounted
  // ...
}
```

#### 组件生命周期

```
创建阶段：
setup() → beforeCreate → created

挂载阶段：
beforeMount → render → patch → mounted

更新阶段：
beforeUpdate → render → patch → updated

卸载阶段：
beforeUnmount → unmount → unmounted
```

### 4.4 编译优化

#### 静态提升（Static Hoisting）

```vue
<template>
  <div>
    <span>静态文本</span>
    <span>{{ dynamic }}</span>
  </div>
</template>

<!-- 编译后 -->
```

```javascript
// 静态节点被提升到 render 函数外部
const _hoisted_1 = createVNode("span", null, "静态文本")

function render() {
  return createVNode("div", null, [
    _hoisted_1,  // 复用静态节点
    createVNode("span", null, dynamic)
  ])
}
```

#### Block Tree 优化

```vue
<template>
  <div>
    <span>静态</span>
    <span>{{ msg }}</span>
    <span>静态</span>
  </div>
</template>
```

```javascript
// 编译后，只追踪动态节点
function render() {
  return (openBlock(), createBlock("div", null, [
    _hoisted_1,
    createVNode("span", null, msg, PatchFlags.TEXT),  // 标记为动态文本
    _hoisted_2
  ]))
}
// Block 会收集所有动态子节点，diff 时只比较动态节点
```

#### PatchFlag 优化

```vue
<div :class="cls" :style="sty">{{ msg }}</div>

<!-- 编译后 -->
```

```javascript
createVNode("div", {
  class: cls,
  style: sty
}, msg, PatchFlags.TEXT | PatchFlags.CLASS | PatchFlags.STYLE)
// Patch 时只更新文本、class 和 style，不检查其他属性
```

### 4.5 调度器（Scheduler）

#### 异步更新队列

```typescript
// 调度器核心逻辑
const queue: SchedulerJob[] = []
let isFlushing = false
let isFlushPending = false

function queueJob(job: SchedulerJob) {
  // 去重：同一个 job 只添加一次
  if (!queue.includes(job)) {
    queue.push(job)
    queueFlush()
  }
}

function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true
    // 使用 Promise.then 将更新推迟到微任务
    Promise.resolve().then(flushJobs)
  }
}

function flushJobs() {
  isFlushPending = false
  isFlushing = true
  
  // 排序：父组件先于子组件更新
  queue.sort((a, b) => a.id - b.id)
  
  // 执行所有任务
  for (let i = 0; i < queue.length; i++) {
    queue[i]()
  }
  
  queue.length = 0
  isFlushing = false
}
```

**更新时机：**

```
同步代码执行
  ↓
收集多个响应式变更
  ↓
queueJob（去重）
  ↓
queueFlush（微任务）
  ↓
flushJobs（批量更新）
  ↓
DOM 更新
```

### 4.6 指令系统

#### 指令生命周期

```typescript
interface Directive {
  created(el, binding, vnode, prevVNode) {}    // 元素创建后
  beforeMount(el, binding, vnode, prevVNode) {} // 挂载前
  mounted(el, binding, vnode, prevVNode) {}     // 挂载后
  beforeUpdate(el, binding, vnode, prevVNode) {} // 更新前
  updated(el, binding, vnode, prevVNode) {}      // 更新后
  beforeUnmount(el, binding, vnode, prevVNode) {} // 卸载前
  unmounted(el, binding, vnode, prevVNode) {}    // 卸载后
}
```

#### v-model 实现原理

```vue
<!-- 模板 -->
<input v-model="msg" />

<!-- 编译为 -->
<input
  :value="msg"
  @input="msg = $event.target.value"
/>
```

### 4.7 编译流程

```
源码（Template）
    ↓
Parse（解析）
    ↓
AST（抽象语法树）
    ↓
Transform（转换）
    ↓
优化后的 AST
    ↓
Generate（生成）
    ↓
Render Function（渲染函数）
```

#### Parse 阶段

```html
<div id="app">
  <span>{{ msg }}</span>
</div>
```

```javascript
// 生成 AST
{
  type: NodeTypes.ELEMENT,
  tag: 'div',
  props: [{ name: 'id', value: 'app' }],
  children: [
    {
      type: NodeTypes.ELEMENT,
      tag: 'span',
      children: [
        {
          type: NodeTypes.INTERPOLATION,
          content: { type: NodeTypes.SIMPLE_EXPRESSION, content: 'msg' }
        }
      ]
    }
  ]
}
```

#### Transform 阶段

- 静态节点提升
- 添加 patchFlag
- 转换指令
- 优化 Block

#### Generate 阶段

```javascript
// 生成的渲染函数
function render(_ctx) {
  return (_openBlock(), _createElementBlock("div", { id: "app" }, [
    _createElementVNode("span", null, _toDisplayString(_ctx.msg), 1 /* TEXT */)
  ]))
}
```

---

## 五、各模块核心文件说明

### 5.1 reactivity 模块

| 文件 | 功能 | 重要度 |
|------|------|--------|
| `effect.ts` | 副作用函数、依赖收集、触发更新的核心实现 | ⭐⭐⭐ |
| `reactive.ts` | reactive、readonly、shallowReactive 等 API | ⭐⭐⭐ |
| `ref.ts` | ref、shallowRef、toRef、toRefs 等 API | ⭐⭐⭐ |
| `baseHandlers.ts` | 对象和数组的 Proxy handlers | ⭐⭐⭐ |
| `computed.ts` | computed API 实现 | ⭐⭐ |
| `watch.ts` | watch 和 watchEffect API | ⭐⭐ |
| `dep.ts` | Dep 类（依赖集合） | ⭐⭐ |
| `effectScope.ts` | effectScope API | ⭐⭐ |
| `collectionHandlers.ts` | Map/Set 的 Proxy handlers | ⭐ |
| `arrayInstrumentations.ts` | 数组方法的特殊处理 | ⭐ |

### 5.2 runtime-core 模块

| 文件 | 功能 | 重要度 |
|------|------|--------|
| `renderer.ts` | 渲染器核心，包含 Diff 算法和 Patch 逻辑 | ⭐⭐⭐ |
| `vnode.ts` | VNode 的创建和类型定义 | ⭐⭐⭐ |
| `component.ts` | 组件实例的创建和管理 | ⭐⭐⭐ |
| `scheduler.ts` | 异步更新队列和调度器 | ⭐⭐⭐ |
| `componentProps.ts` | 组件 props 的初始化和更新 | ⭐⭐ |
| `componentSlots.ts` | 插槽的处理 | ⭐⭐ |
| `apiLifecycle.ts` | 生命周期钩子 API | ⭐⭐ |
| `apiCreateApp.ts` | createApp API | ⭐⭐ |
| `apiWatch.ts` | watch 和 watchEffect API | ⭐⭐ |
| `h.ts` | h() 函数 | ⭐⭐ |
| `hydration.ts` | SSR 客户端激活 | ⭐ |
| `components/KeepAlive.ts` | KeepAlive 组件实现 | ⭐ |
| `components/Teleport.ts` | Teleport 组件实现 | ⭐ |
| `components/Suspense.ts` | Suspense 组件实现 | ⭐ |

### 5.3 compiler-core 模块

| 文件 | 功能 | 重要度 |
|------|------|--------|
| `parser.ts` | 模板解析器，将模板转换为 AST | ⭐⭐⭐ |
| `transform.ts` | AST 转换框架 | ⭐⭐⭐ |
| `codegen.ts` | 代码生成器，将 AST 转换为渲染函数 | ⭐⭐⭐ |
| `compile.ts` | 编译入口，串联 parse、transform、generate | ⭐⭐ |
| `ast.ts` | AST 节点类型定义 | ⭐⭐ |
| `transforms/transformElement.ts` | 元素节点转换 | ⭐⭐ |
| `transforms/vIf.ts` | v-if 指令编译 | ⭐⭐ |
| `transforms/vFor.ts` | v-for 指令编译 | ⭐⭐ |
| `transforms/vOn.ts` | v-on 指令编译 | ⭐ |
| `transforms/vBind.ts` | v-bind 指令编译 | ⭐ |

### 5.4 compiler-sfc 模块

| 文件 | 功能 | 重要度 |
|------|------|--------|
| `parse.ts` | 解析 .vue 文件，生成 SFC Descriptor | ⭐⭐⭐ |
| `compileScript.ts` | 编译 `<script>` 和 `<script setup>` | ⭐⭐⭐ |
| `compileTemplate.ts` | 编译 `<template>` | ⭐⭐ |
| `compileStyle.ts` | 编译 `<style>` | ⭐⭐ |
| `script/defineProps.ts` | defineProps 宏实现 | ⭐ |
| `script/defineEmits.ts` | defineEmits 宏实现 | ⭐ |
| `script/resolveType.ts` | TypeScript 类型解析 | ⭐ |

---

## 六、学习建议

### 6.1 前置知识

在阅读 Vue 3 源码前，建议先掌握：

1. **JavaScript 基础**
   - ES6+ 语法
   - Promise、async/await
   - Proxy 和 Reflect
   - WeakMap、WeakSet

2. **TypeScript**
   - 类型系统
   - 泛型
   - 类型推导

3. **Vue 3 使用经验**
   - Composition API
   - setup 语法
   - 生命周期
   - 响应式 API

### 6.2 学习方法

1. **边看边调试**
   - 克隆源码到本地
   - 使用 `pnpm install` 安装依赖
   - 使用 `pnpm dev` 启动开发模式
   - 在关键位置打断点调试

2. **写测试用例**
   - 查看 `__tests__` 目录下的测试
   - 自己写测试用例验证理解

3. **绘制流程图**
   - 画出核心流程的流程图
   - 理清数据流转

4. **写注释和总结**
   - 在源码中添加自己的注释
   - 每读完一个模块写总结

5. **对比 Vue 2**
   - 理解 Vue 3 的改进点
   - 思考设计决策的原因

### 6.3 调试技巧

#### 启动开发模式

```bash
# 启动开发服务器（监听文件变化）
pnpm dev

# 指定包和格式
pnpm dev reactivity -f global

# 构建所有包
pnpm build

# 运行测试
pnpm test
```

#### 调试源码

1. 在 `packages/vue/examples` 中创建测试 HTML
2. 使用 `debugger` 语句或浏览器断点
3. 查看调用栈和变量值

#### VSCode 调试配置

项目已包含 `.vscode/launch.json`，可以直接使用：

- 按 F5 启动调试
- 在源码中设置断点
- 逐步执行查看流程

### 6.4 常见问题

**Q: 源码太复杂，看不懂怎么办？**
A: 先从简单的部分开始，比如工具函数（shared）。不要试图一次性全部理解，先建立整体框架，再逐步深入。

**Q: 需要全部看完吗？**
A: 不需要。根据兴趣和工作需要选择重点模块。建议至少完整阅读 reactivity 和 runtime-core 的核心部分。

**Q: 如何验证自己的理解？**
A: 
1. 尝试实现一个迷你版 Vue
2. 回答社区中的技术问题
3. 写技术博客总结
4. 为 Vue 贡献代码

**Q: 版本更新后怎么办？**
A: Vue 3 核心架构已经稳定，主要是细节优化。理解了核心原理，看新版本的变化会很快。

---

## 七、相关资源

### 官方资源

- [Vue 3 官方文档](https://cn.vuejs.org/)
- [Vue 3 GitHub 仓库](https://github.com/vuejs/core)
- [Vue 3 RFCs](https://github.com/vuejs/rfcs)
- [Vue 3 迁移指南](https://v3-migration.vuejs.org/)

### 社区资源

- [Vue Mastery](https://www.vuemastery.com/)
- [Vue School](https://vueschool.io/)
- [Vue.js 技术揭秘](https://ustbhuangyi.github.io/vue-analysis/)

### 推荐文章

- 尤雨溪在 Vue 3 设计文档中的说明
- Vue 3 响应式原理深度解析
- Vue 3 编译优化原理
- Vue 3 Diff 算法详解

### 工具

- [Vue Devtools](https://devtools.vuejs.org/)
- [Vite](https://vitejs.dev/)
- [@vue/test-utils](https://test-utils.vuejs.org/)

---

## 八、总结

### 核心设计思想

1. **响应式系统**：基于 Proxy 的自动依赖收集
2. **组件化**：组件是 Vue 应用的基本单元
3. **虚拟 DOM**：通过 VNode 抽象真实 DOM，实现跨平台
4. **编译优化**：静态提升、Block Tree、PatchFlag 等优化策略
5. **可扩展性**：插件系统、自定义渲染器、指令系统

### Vue 3 vs Vue 2 主要改进

1. **性能提升**
   - 更快的响应式系统（Proxy vs Object.defineProperty）
   - 更高效的虚拟 DOM（Block Tree、PatchFlag）
   - Tree-shaking 支持更好

2. **API 设计**
   - Composition API（更好的逻辑复用）
   - script setup（更简洁的语法）
   - 更好的 TypeScript 支持

3. **体积优化**
   - 更小的包体积
   - 按需引入

4. **开发体验**
   - 更好的 IDE 支持
   - 更清晰的警告信息
   - 更完善的错误处理

### 学习收获

通过阅读 Vue 3 源码，你将学会：

1. **设计模式**
   - 观察者模式（响应式系统）
   - 策略模式（编译器插件）
   - 工厂模式（组件创建）

2. **算法和数据结构**
   - Diff 算法
   - 最长递增子序列
   - 树的遍历

3. **工程化**
   - Monorepo 管理
   - TypeScript 工程实践
   - 测试策略

4. **性能优化**
   - 编译时优化
   - 运行时优化
   - 内存管理

---

**祝你学习愉快！源码阅读是一个循序渐进的过程，不要着急，慢慢来，相信你会有很大收获！** 🚀
