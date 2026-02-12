import { ShapeFlags, extend } from '@vue/shared'
import type { ComponentInternalInstance, ComponentOptions } from '../component'
import { createAppContext } from '../apiCreateApp'
import { ErrorCodes, callWithErrorHandling } from '../errorHandling'
import type { VNode } from '../vnode'
import { popWarningContext, pushWarningContext } from '../warning'
import {
  DeprecationTypes,
  isCompatEnabled,
  warnDeprecation,
} from './compatConfig'

export const compatModelEventPrefix = `onModelCompat:`

const warnedTypes = new WeakSet()

export function convertLegacyVModelProps(vnode: VNode): void {
  const { type, shapeFlag, props, dynamicProps } = vnode
  const comp = type as ComponentOptions
  // Check if it's a component and has 'modelValue' prop (Vue 3 default v-model prop)
  // 检查是否为组件且具有 'modelValue' prop（Vue 3 默认 v-model prop）
  if (shapeFlag & ShapeFlags.COMPONENT && props && 'modelValue' in props) {
    if (
      !isCompatEnabled(
        DeprecationTypes.COMPONENT_V_MODEL,
        // this is a special case where we want to use the vnode component's
        // compat config instead of the current rendering instance (which is the
        // parent of the component that exposes v-model)
        // 这是一个特殊情况，我们希望使用 vnode 组件的兼容配置，
        // 而不是当前渲染实例（即暴露 v-model 的组件的父组件）
        { type } as any,
      )
    ) {
      return
    }

    if (__DEV__ && !warnedTypes.has(comp)) {
      pushWarningContext(vnode)
      // Warn about the usage of legacy v-model behavior
      // 警告使用了旧版 v-model 行为
      warnDeprecation(
        DeprecationTypes.COMPONENT_V_MODEL,
        {
          type,
          appContext: (vnode.ctx && vnode.ctx.appContext) || createAppContext(),
        } as any,
        comp,
      )
      popWarningContext()
      warnedTypes.add(comp)
    }

    // v3 compiled model code -> v2 compat props
    // v3 编译的模型代码 -> v2 兼容 props
    // modelValue -> value
    // onUpdate:modelValue -> onModelCompat:input
    const model = comp.model || {}
    applyModelFromMixins(model, comp.mixins)
    const { prop = 'value', event = 'input' } = model
    if (prop !== 'modelValue') {
      props[prop] = props.modelValue
      delete props.modelValue
    }
    // important: update dynamic props
    // 重要：更新动态 props
    if (dynamicProps) {
      dynamicProps[dynamicProps.indexOf('modelValue')] = prop
    }
    // Handle the event handler mapping
    // 处理事件处理程序的映射
    props[compatModelEventPrefix + event] = props['onUpdate:modelValue']
    delete props['onUpdate:modelValue']
  }
}

// Helper to merge model options from mixins
// 辅助函数：从 mixins 中合并 model 选项
function applyModelFromMixins(model: any, mixins?: ComponentOptions[]) {
  if (mixins) {
    mixins.forEach(m => {
      if (m.model) extend(model, m.model)
      if (m.mixins) applyModelFromMixins(model, m.mixins)
    })
  }
}

export function compatModelEmit(
  instance: ComponentInternalInstance,
  event: string,
  args: any[],
): void {
  // Check if COMPONENT_V_MODEL compat is enabled
  // 检查是否启用了 COMPONENT_V_MODEL 兼容性
  if (!isCompatEnabled(DeprecationTypes.COMPONENT_V_MODEL, instance)) {
    return
  }
  const props = instance.vnode.props
  // Find the compat model handler (prefixed with onModelCompat:)
  // 查找兼容模型处理程序（以 onModelCompat: 为前缀）
  const modelHandler = props && props[compatModelEventPrefix + event]
  if (modelHandler) {
    callWithErrorHandling(
      modelHandler,
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args,
    )
  }
}
