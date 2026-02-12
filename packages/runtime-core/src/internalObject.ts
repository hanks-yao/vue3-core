/**
 * Used during vnode props/slots normalization to check if the vnode props/slots
 * are the internal attrs / slots object of a component via
 * `Object.getPrototypeOf`. This is more performant than defining a
 * non-enumerable property. (one of the optimizations done for ssr-benchmark)
 * 
 * 在 vnode props/slots 规范化期间使用，通过 `Object.getPrototypeOf` 检查 vnode props/slots
 * 是否为组件的内部 attrs / slots 对象。这比定义不可枚举属性性能更高。
 * （这是针对 ssr-benchmark 所做的优化之一）
 */
const internalObjectProto = {}

/**
 * Create an object with internalObjectProto as prototype
 * 创建一个以 internalObjectProto 为原型的对象
 */
export const createInternalObject = (): any =>
  Object.create(internalObjectProto)

/**
 * Check if an object is an internal object by checking its prototype
 * 通过检查原型来判断一个对象是否为内部对象
 */
export const isInternalObject = (obj: object): boolean =>
  Object.getPrototypeOf(obj) === internalObjectProto
