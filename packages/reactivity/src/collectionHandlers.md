# collectionHandlers.ts 逻辑总结

该文件主要负责处理集合类型（`Map`, `Set`, `WeakMap`, `WeakSet`）的响应式代理逻辑。与普通对象的代理不同，集合类型的操作（如 `add`, `delete`, `set`）是通过方法调用进行的，而不是直接属性访问，因此需要特殊的拦截处理。

## 核心逻辑

### 1. 代理处理器 (Handlers)

文件导出了四种处理器，分别对应不同的响应式模式：

- **`mutableCollectionHandlers`**: 普通响应式集合处理器。
- **`shallowCollectionHandlers`**: 浅层响应式集合处理器。
- **`readonlyCollectionHandlers`**: 只读集合处理器。
- **`shallowReadonlyCollectionHandlers`**: 浅层只读集合处理器。

这些处理器都只定义了 `get` 拦截器，通过 `createInstrumentationGetter` 创建。

### 2. 拦截器创建 (`createInstrumentationGetter`)

`createInstrumentationGetter` 是拦截器的入口：

- **特殊 Flag 处理**: 拦截 `IS_REACTIVE`、`IS_READONLY`、`RAW` 等内部标志。
- **方法拦截**: 如果访问的 `key` 存在于 `instrumentations`（自定义的拦截方法集合）中，且该 `key` 存在于目标对象中，则返回自定义的方法；否则使用 `Reflect.get` 返回原始属性。这使得我们可以重写 `get`, `set`, `add` 等方法来实现响应式。

### 3. 方法拦截实现 (`createInstrumentations`)

`createInstrumentations` 根据是否只读 (`readonly`) 和是否浅层 (`shallow`) 创建包含重写方法的对象：

#### 读取操作 (Read Operations)

- **`get(key)`**:
  - 对 `key` 和 `rawKey`（原始键）进行依赖收集 (`track`)。
  - 返回对应值的响应式代理（如果是浅层模式则直接返回）。
  - 处理了 `readonly(reactive(Map))` 的嵌套情况。

- **`size`**:
  - 访问 `size` 属性时，进行 `ITERATE` 类型的依赖收集。

- **`has(key)`**:
  - 对 `key` 和 `rawKey` 进行依赖收集。
  - 检查原始对象中是否存在该键。

- **`forEach(callback)`**:
  - 进行 `ITERATE` 类型的依赖收集。
  - 遍历原始集合，确保回调函数中的参数（value, key）被转换为响应式对象。
  - 确保回调函数的 `this` 指向响应式代理。

#### 写入操作 (Mutation Operations)

对于非只读集合，重写了以下方法以触发更新：

- **`add(value)`** (Set):
  - 检查值是否存在。
  - 调用原始 `add`。
  - 如果是新值，调用 `trigger` 触发 `ADD` 操作的更新。

- **`set(key, value)`** (Map):
  - 检查键是否存在。
  - 调用原始 `set`。
  - 如果是新键，触发 `ADD` 更新；如果是修改现有键且值发生变化，触发 `SET` 更新。

- **`delete(key)`**:
  - 检查键是否存在。
  - 调用原始 `delete`。
  - 如果删除成功，触发 `DELETE` 更新。

- **`clear()`**:
  - 检查集合是否为空。
  - 调用原始 `clear`。
  - 如果集合被清空，触发 `CLEAR` 更新。

对于只读集合，这些方法会被拦截并发出警告（在开发模式下），且不执行实际操作。

### 4. 迭代器处理 (`createIterableMethod`)

为了支持 `for...of` 循环和展开运算符，重写了以下迭代器方法：
- `keys`
- `values`
- `entries`
- `Symbol.iterator`

**实现逻辑**:
- 获取原始集合的迭代器。
- 进行 `ITERATE` 类型的依赖收集。
- 返回一个新的迭代器对象，该对象的 `next()` 方法会返回被包装（响应式/只读）后的值。
- 这样确保了遍历集合时获取到的元素也是响应式的。

## 总结

`collectionHandlers.ts` 通过代理模式拦截了集合对象的方法调用。它不直接拦截属性设置（因为集合操作是方法调用），而是通过重写 `get`, `set`, `add`, `delete` 等方法，在执行原始操作前后分别进行依赖收集 (`track`) 和派发更新 (`trigger`)，从而实现了集合类型的响应式系统。
