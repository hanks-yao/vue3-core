import { type Ref, customRef, ref } from '@vue/reactivity'
import { EMPTY_OBJ, camelize, hasChanged, hyphenate } from '@vue/shared'
import type { DefineModelOptions, ModelRef } from '../apiSetupHelpers'
import { getCurrentInstance } from '../component'
import { warn } from '../warning'
import type { NormalizedProps } from '../componentProps'
import { watchSyncEffect } from '../apiWatch'

/**
 * useModel 是一个辅助函数，用于在 Composition API 中简化 v-model 的实现。
 * 它创建了一个 ref，该 ref 的值与 prop 同步，并在修改时触发相应的 update 事件。
 */
export function useModel<
  M extends PropertyKey,
  T extends Record<string, any>,
  K extends keyof T,
  G = T[K],
  S = T[K],
>(
  props: T,
  name: K,
  options?: DefineModelOptions<T[K], G, S>,
): ModelRef<T[K], M, G, S>
export function useModel(
  props: Record<string, any>,
  name: string,
  options: DefineModelOptions = EMPTY_OBJ,
): Ref {
  const i = getCurrentInstance()!
  if (__DEV__ && !i) {
    warn(`useModel() called without active instance.`)
    return ref() as any
  }

  const camelizedName = camelize(name)
  if (__DEV__ && !(i.propsOptions[0] as NormalizedProps)[camelizedName]) {
    warn(`useModel() called with prop "${name}" which is not declared.`)
    return ref() as any
  }

  const hyphenatedName = hyphenate(name)
  const modifiers = getModelModifiers(props, camelizedName)

  // 创建一个自定义 ref 来管理 model 的值
  const res = customRef((track, trigger) => {
    let localValue: any
    let prevSetValue: any = EMPTY_OBJ
    let prevEmittedValue: any

    // 监听 prop 的变化，并同步到本地值
    watchSyncEffect(() => {
      const propValue = props[camelizedName]
      if (hasChanged(localValue, propValue)) {
        localValue = propValue
        trigger()
      }
    })

    return {
      get() {
        track()
        return options.get ? options.get(localValue) : localValue
      },

      set(value) {
        const emittedValue = options.set ? options.set(value) : value
        if (
          !hasChanged(emittedValue, localValue) &&
          !(prevSetValue !== EMPTY_OBJ && hasChanged(value, prevSetValue))
        ) {
          return
        }
        const rawProps = i.vnode!.props
        if (
          !(
            rawProps &&
            // check if parent has passed v-model
            // 检查父组件是否传递了 v-model
            (name in rawProps ||
              camelizedName in rawProps ||
              hyphenatedName in rawProps) &&
            (`onUpdate:${name}` in rawProps ||
              `onUpdate:${camelizedName}` in rawProps ||
              `onUpdate:${hyphenatedName}` in rawProps)
          )
        ) {
          // no v-model, local update
          // 没有 v-model，进行本地更新
          localValue = value
          trigger()
        }

        i.emit(`update:${name}`, emittedValue)
        // #10279: if the local value is converted via a setter but the value
        // emitted to parent was the same, the parent will not trigger any
        // updates and there will be no prop sync. However the local input state
        // may be out of sync, so we need to force an update here.
        // #10279: 如果本地值通过 setter 转换，但发送给父组件的值是相同的，
        // 父组件将不会触发任何更新，也不会有 prop 同步。
        // 然而，本地输入状态可能已经不同步，所以我们需要在这里强制更新。
        if (
          hasChanged(value, emittedValue) &&
          hasChanged(value, prevSetValue) &&
          !hasChanged(emittedValue, prevEmittedValue)
        ) {
          trigger()
        }
        prevSetValue = value
        prevEmittedValue = emittedValue
      },
    }
  })

  // @ts-expect-error
  // 使返回值可迭代，以便支持 const [model, modifiers] = useModel() 的解构用法
  res[Symbol.iterator] = () => {
    let i = 0
    return {
      next() {
        if (i < 2) {
          return { value: i++ ? modifiers || EMPTY_OBJ : res, done: false }
        } else {
          return { done: true }
        }
      },
    }
  }

  return res
}

/**
 * 获取 model 的修饰符
 */
export const getModelModifiers = (
  props: Record<string, any>,
  modelName: string,
): Record<string, boolean> | undefined => {
  return modelName === 'modelValue' || modelName === 'model-value'
    ? props.modelModifiers
    : props[`${modelName}Modifiers`] ||
        props[`${camelize(modelName)}Modifiers`] ||
        props[`${hyphenate(modelName)}Modifiers`]
}
