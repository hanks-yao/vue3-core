import { type ShallowRef, readonly, shallowRef } from '@vue/reactivity'
import { getCurrentInstance } from '../component'
import { warn } from '../warning'
import { EMPTY_OBJ } from '@vue/shared'

// 存储已知的模板引用，用于开发环境检查
// Store known template refs for dev check
export const knownTemplateRefs: WeakSet<ShallowRef> = new WeakSet()

// 模板引用类型定义，只读的 ShallowRef，可能为 null
// Template ref type definition, readonly ShallowRef, can be null
export type TemplateRef<T = unknown> = Readonly<ShallowRef<T | null>>

/**
 * 获取模板引用的钩子函数
 * Hook function to get template ref
 * 
 * @param key - 模板中 ref 属性的名称 / The name of the ref attribute in the template
 * @returns Readonly<ShallowRef<T | null>>
 */
export function useTemplateRef<T = unknown, Keys extends string = string>(
  key: Keys,
): TemplateRef<T> {
  // 获取当前组件实例
  // Get current component instance
  const i = getCurrentInstance()
  // 创建一个初始值为 null 的 shallowRef
  // Create a shallowRef with initial value null
  const r = shallowRef(null)
  
  if (i) {
    // 确保实例的 refs 对象存在，如果为空对象则初始化为空对象
    // Ensure instance refs object exists, initialize to empty object if it's the shared empty object
    const refs = i.refs === EMPTY_OBJ ? (i.refs = {}) : i.refs
    let desc: PropertyDescriptor | undefined
    
    // 开发环境下检查 key 是否已存在且不可配置
    // Check if key already exists and is not configurable in dev environment
    if (
      __DEV__ &&
      (desc = Object.getOwnPropertyDescriptor(refs, key)) &&
      !desc.configurable
    ) {
      warn(`useTemplateRef('${key}') already exists.`)
    } else {
      // 在 refs 对象上定义属性，将模板引用绑定到 shallowRef 上
      // 这样当 Vue 运行时设置 refs[key] 时，实际上是更新了 r.value
      // Define property on refs object, binding template ref to the shallowRef
      // So when Vue runtime sets refs[key], it actually updates r.value
      Object.defineProperty(refs, key, {
        enumerable: true,
        get: () => r.value,
        set: val => (r.value = val),
      })
    }
  } else if (__DEV__) {
    // 如果没有当前组件实例，发出警告
    // Warn if there is no active component instance
    warn(
      `useTemplateRef() is called when there is no active component ` +
        `instance to be associated with.`,
    )
  }
  
  // 在开发环境下返回只读的 ref，生产环境下直接返回 ref
  // Return readonly ref in dev, direct ref in prod
  const ret = __DEV__ ? readonly(r) : r
  
  if (__DEV__) {
    // 记录已知的模板引用
    // Record known template refs
    knownTemplateRefs.add(ret)
  }
  return ret
}
