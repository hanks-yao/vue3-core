import { type ComponentInternalInstance, currentInstance } from './component'
import {
  type VNode,
  type VNodeChild,
  type VNodeNormalizedChildren,
  normalizeVNode,
} from './vnode'
import {
  EMPTY_OBJ,
  type IfAny,
  type Prettify,
  ShapeFlags,
  SlotFlags,
  def,
  isArray,
  isFunction,
} from '@vue/shared'
import { warn } from './warning'
import { isKeepAlive } from './components/KeepAlive'
import {
  type ContextualRenderFn,
  currentRenderingInstance,
  withCtx,
} from './componentRenderContext'
import { isHmrUpdating } from './hmr'
import { DeprecationTypes, isCompatEnabled } from './compat/compatConfig'
import { TriggerOpTypes, trigger } from '@vue/reactivity'
import { createInternalObject } from './internalObject'

export type Slot<T extends any = any> = (
  ...args: IfAny<T, any[], [T] | (T extends undefined ? [] : never)>
) => VNode[]

export type InternalSlots = {
  [name: string]: Slot | undefined
}

export type Slots = Readonly<InternalSlots>

declare const SlotSymbol: unique symbol
export type SlotsType<T extends Record<string, any> = Record<string, any>> = {
  [SlotSymbol]?: T
}

export type StrictUnwrapSlotsType<
  S extends SlotsType,
  T = NonNullable<S[typeof SlotSymbol]>,
> = [keyof S] extends [never] ? Slots : Readonly<T> & T

export type UnwrapSlotsType<
  S extends SlotsType,
  T = NonNullable<S[typeof SlotSymbol]>,
> = [keyof S] extends [never]
  ? Slots
  : Readonly<
      Prettify<{
        [K in keyof T]: NonNullable<T[K]> extends (...args: any[]) => any
          ? T[K]
          : Slot<T[K]>
      }>
    >

export type RawSlots = {
  [name: string]: unknown
  // manual render fn hint to skip forced children updates
  // 手动渲染函数的提示，用于跳过强制子节点更新
  $stable?: boolean
  /**
   * for tracking slot owner instance. This is attached during
   * normalizeChildren when the component vnode is created.
   * 用于跟踪插槽所有者实例。这是在创建组件 vnode 时的 normalizeChildren 期间附加的。
   * @internal
   */
  _ctx?: ComponentInternalInstance | null
  /**
   * indicates compiler generated slots
   * we use a reserved property instead of a vnode patchFlag because the slots
   * object may be directly passed down to a child component in a manual
   * render function, and the optimization hint need to be on the slot object
   * itself to be preserved.
   * 指示编译器生成的插槽。
   * 我们使用保留属性而不是 vnode patchFlag，因为插槽对象可能直接传递给手动渲染函数中的子组件，
   * 并且优化提示需要保留在插槽对象本身上。
   * @internal
   */
  _?: SlotFlags
}

const isInternalKey = (key: string) =>
  key === '_' || key === '_ctx' || key === '$stable'

const normalizeSlotValue = (value: unknown): VNode[] =>
  isArray(value)
    ? value.map(normalizeVNode)
    : [normalizeVNode(value as VNodeChild)]

/**
 * Normalize a slot function
 * 标准化插槽函数
 * 
 * @param key - 插槽名称
 * @param rawSlot - 原始插槽函数
 * @param ctx - 组件实例上下文
 */
const normalizeSlot = (
  key: string,
  rawSlot: Function,
  ctx: ComponentInternalInstance | null | undefined,
): Slot => {
  if ((rawSlot as any)._n) {
    // already normalized - #5353
    // 已经标准化 - #5353
    return rawSlot as Slot
  }
  const normalized = withCtx((...args: any[]) => {
    if (
      __DEV__ &&
      currentInstance &&
      !(ctx === null && currentRenderingInstance) &&
      !(ctx && ctx.root !== currentInstance.root)
    ) {
      warn(
        `Slot "${key}" invoked outside of the render function: ` +
          `this will not track dependencies used in the slot. ` +
          `Invoke the slot function inside the render function instead.`,
      )
    }
    return normalizeSlotValue(rawSlot(...args))
  }, ctx) as Slot
  // NOT a compiled slot
  // 不是编译后的插槽
  ;(normalized as ContextualRenderFn)._c = false
  return normalized
}

/**
 * Normalize object slots
 * 标准化对象类型的插槽
 * 
 * @param rawSlots - 原始插槽对象
 * @param slots - 目标插槽对象
 * @param instance - 组件实例
 */
const normalizeObjectSlots = (
  rawSlots: RawSlots,
  slots: InternalSlots,
  instance: ComponentInternalInstance,
) => {
  const ctx = rawSlots._ctx
  for (const key in rawSlots) {
    if (isInternalKey(key)) continue
    const value = rawSlots[key]
    if (isFunction(value)) {
      slots[key] = normalizeSlot(key, value, ctx)
    } else if (value != null) {
      if (
        __DEV__ &&
        !(
          __COMPAT__ &&
          isCompatEnabled(DeprecationTypes.RENDER_FUNCTION, instance)
        )
      ) {
        warn(
          `Non-function value encountered for slot "${key}". ` +
            `Prefer function slots for better performance.`,
        )
      }
      const normalized = normalizeSlotValue(value)
      slots[key] = () => normalized
    }
  }
}

/**
 * Normalize VNode slots (default slot)
 * 标准化 VNode 类型的插槽（默认插槽）
 * 
 * @param instance - 组件实例
 * @param children - 子节点
 */
const normalizeVNodeSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren,
) => {
  if (
    __DEV__ &&
    !isKeepAlive(instance.vnode) &&
    !(__COMPAT__ && isCompatEnabled(DeprecationTypes.RENDER_FUNCTION, instance))
  ) {
    warn(
      `Non-function value encountered for default slot. ` +
        `Prefer function slots for better performance.`,
    )
  }
  const normalized = normalizeSlotValue(children)
  instance.slots.default = () => normalized
}

/**
 * Assign slots to the internal slots object
 * 将插槽赋值给内部插槽对象
 * 
 * @param slots - 内部插槽对象
 * @param children - 新的插槽对象
 * @param optimized - 是否优化模式
 */
const assignSlots = (
  slots: InternalSlots,
  children: Slots,
  optimized: boolean,
) => {
  for (const key in children) {
    // #2893
    // when rendering the optimized slots by manually written render function,
    // do not copy the `slots._` compiler flag so that `renderSlot` creates
    // slot Fragment with BAIL patchFlag to force full updates
    // #2893
    // 当通过手动编写的渲染函数渲染优化插槽时，
    // 不要复制 `slots._` 编译器标志，以便 `renderSlot` 创建
    // 带有 BAIL patchFlag 的插槽 Fragment，从而强制完全更新
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key]
    }
  }
}

/**
 * Initialize slots for a component instance
 * 初始化组件实例的插槽
 * 
 * @param instance - 组件实例
 * @param children - 子节点
 * @param optimized - 是否优化模式
 */
export const initSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren,
  optimized: boolean,
): void => {
  const slots = (instance.slots = createInternalObject())
  if (instance.vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    const type = (children as RawSlots)._
    if (type) {
      assignSlots(slots, children as Slots, optimized)
      // make compiler marker non-enumerable
      // 使编译器标记不可枚举
      if (optimized) {
        def(slots, '_', type, true)
      }
    } else {
      normalizeObjectSlots(children as RawSlots, slots, instance)
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children)
  }
}

/**
 * Update slots for a component instance
 * 更新组件实例的插槽
 * 
 * @param instance - 组件实例
 * @param children - 新的子节点
 * @param optimized - 是否优化模式
 */
export const updateSlots = (
  instance: ComponentInternalInstance,
  children: VNodeNormalizedChildren,
  optimized: boolean,
): void => {
  const { vnode, slots } = instance
  let needDeletionCheck = true
  let deletionComparisonTarget = EMPTY_OBJ
  if (vnode.shapeFlag & ShapeFlags.SLOTS_CHILDREN) {
    const type = (children as RawSlots)._
    if (type) {
      // compiled slots.
      // 编译后的插槽。
      if (__DEV__ && isHmrUpdating) {
        // Parent was HMR updated so slot content may have changed.
        // force update slots and mark instance for hmr as well
        // 父组件已进行 HMR 更新，因此插槽内容可能已更改。
        // 强制更新插槽并标记实例以进行 HMR
        assignSlots(slots, children as Slots, optimized)
        trigger(instance, TriggerOpTypes.SET, '$slots')
      } else if (optimized && type === SlotFlags.STABLE) {
        // compiled AND stable.
        // no need to update, and skip stale slots removal.
        // 编译后且稳定的。
        // 无需更新，并跳过过时插槽的移除。
        needDeletionCheck = false
      } else {
        // compiled but dynamic (v-if/v-for on slots) - update slots, but skip
        // normalization.
        // 编译后但是动态的（插槽上有 v-if/v-for） - 更新插槽，但跳过标准化。
        assignSlots(slots, children as Slots, optimized)
      }
    } else {
      needDeletionCheck = !(children as RawSlots).$stable
      normalizeObjectSlots(children as RawSlots, slots, instance)
    }
    deletionComparisonTarget = children as RawSlots
  } else if (children) {
    // non slot object children (direct value) passed to a component
    // 传递给组件的非插槽对象子节点（直接值）
    normalizeVNodeSlots(instance, children)
    deletionComparisonTarget = { default: 1 }
  }

  // delete stale slots
  // 删除过时的插槽
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key]
      }
    }
  }
}
