# Inject API 核心逻辑

`apiInject.ts` 实现了 Vue 3 的依赖注入系统 (`provide`, `inject`)，允许祖先组件向其所有后代组件注入依赖，而无需通过 props 逐层传递。

## 核心函数

### `provide(key, value)`
提供一个值，可以被后代组件注入。
- **参数**:
    - `key`: 注入键（字符串、Symbol 或 `InjectionKey`）。
    - `value`: 提供的值。
- **逻辑**:
    1.  **获取实例**: 确保在 `setup()` 中调用。
    2.  **原型链继承**:
        - 默认情况下，组件实例的 `provides` 对象指向父组件的 `provides` 对象。
        - 当组件第一次调用 `provide` 时，它会创建一个新的 `provides` 对象，并将父组件的 `provides` 对象作为原型 (`Object.create(parentProvides)`)。
        - 这样，组件可以覆盖父组件提供的同名值，同时通过原型链访问父组件提供的其他值。
    3.  **存储**: 将值存储在当前实例的 `provides` 对象中。

### `inject(key, defaultValue, treatDefaultAsFactory)`
注入一个由祖先组件提供的值。
- **参数**:
    - `key`: 注入键。
    - `defaultValue`: 默认值（可选）。
    - `treatDefaultAsFactory`: 是否将默认值视为工厂函数（可选）。
- **逻辑**:
    1.  **查找来源**:
        - 首先尝试从当前组件实例的父组件 (`instance.parent`) 获取 `provides`。
        - 如果是根组件，回退到应用上下文 (`appContext`) 的 `provides`。
        - 支持 `app.runWithContext` 提供的应用级注入。
    2.  **查找值**: 检查 `provides` 对象中是否存在该 `key`。
        - 如果存在，返回对应的值。
        - 利用原型链机制，如果父组件没有，会自动向上查找。
    3.  **默认值**: 如果找不到且提供了默认值：
        - 如果 `treatDefaultAsFactory` 为真且默认值是函数，调用该函数。
        - 否则直接返回默认值。
    4.  **警告**: 如果找不到且没有默认值，在开发环境下发出警告。

## 关键点
- **原型链设计**: 利用 JavaScript 的原型链实现层级查找，既高效又简洁。
- **跨层级**: 可以跨越任意深度的组件层级。
- **应用级 Provide**: `app.provide()` 提供的值可以被应用内的任何组件注入。
