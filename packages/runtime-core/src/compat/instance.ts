import {
  NOOP,
  extend,
  looseEqual,
  looseIndexOf,
  looseToNumber,
  toDisplayString,
} from '@vue/shared'
import type {
  ComponentPublicInstance,
  PublicPropertiesMap,
} from '../componentPublicInstance'
import { getCompatChildren } from './instanceChildren'
import {
  DeprecationTypes,
  assertCompatEnabled,
  isCompatEnabled,
  warnDeprecation,
} from './compatConfig'
import { off, on, once } from './instanceEventEmitter'
import { getCompatListeners } from './instanceListeners'
import { shallowReadonly } from '@vue/reactivity'
import { legacySlotProxyHandlers } from './componentFunctional'
import { compatH } from './renderFn'
import { createCommentVNode, createTextVNode } from '../vnode'
import { renderList } from '../helpers/renderList'
import {
  legacyBindDynamicKeys,
  legacyBindObjectListeners,
  legacyBindObjectProps,
  legacyCheckKeyCodes,
  legacyMarkOnce,
  legacyPrependModifier,
  legacyRenderSlot,
  legacyRenderStatic,
  legacyResolveScopedSlots,
} from './renderHelpers'
import { resolveFilter } from '../helpers/resolveAssets'
import type { Slots } from '../componentSlots'
import { resolveMergedOptions } from '../componentOptions'

export type LegacyPublicInstance = ComponentPublicInstance &
  LegacyPublicProperties

export interface LegacyPublicProperties {
  $set<T extends Record<keyof any, any>, K extends keyof T>(
    target: T,
    key: K,
    value: T[K],
  ): void
  $delete<T extends Record<keyof any, any>, K extends keyof T>(
    target: T,
    key: K,
  ): void
  $mount(el?: string | Element): this
  $destroy(): void
  $scopedSlots: Slots
  $on(event: string | string[], fn: Function): this
  $once(event: string, fn: Function): this
  $off(event?: string | string[], fn?: Function): this
  $children: LegacyPublicProperties[]
  $listeners: Record<string, Function | Function[]>
}

// Install Vue 2 compat instance properties
// 安装 Vue 2 兼容实例属性
export function installCompatInstanceProperties(
  map: PublicPropertiesMap,
): void {
  const set = (target: any, key: any, val: any) => {
    target[key] = val
    return target[key]
  }

  const del = (target: any, key: any) => {
    delete target[key]
  }

  extend(map, {
    // Vue 2 $set
    // Vue 2 的 $set 方法
    $set: i => {
      assertCompatEnabled(DeprecationTypes.INSTANCE_SET, i)
      return set
    },

    // Vue 2 $delete
    // Vue 2 的 $delete 方法
    $delete: i => {
      assertCompatEnabled(DeprecationTypes.INSTANCE_DELETE, i)
      return del
    },

    // Vue 2 $mount
    // Vue 2 的 $mount 方法
    $mount: i => {
      assertCompatEnabled(
        DeprecationTypes.GLOBAL_MOUNT,
        null /* this warning is global */,
      )
      // root mount override from ./global.ts in installCompatMount
      // 根挂载覆盖来自 ./global.ts 中的 installCompatMount
      return i.ctx._compat_mount || NOOP
    },

    // Vue 2 $destroy
    // Vue 2 的 $destroy 方法
    $destroy: i => {
      assertCompatEnabled(DeprecationTypes.INSTANCE_DESTROY, i)
      // root destroy override from ./global.ts in installCompatMount
      // 根销毁覆盖来自 ./global.ts 中的 installCompatMount
      return i.ctx._compat_destroy || NOOP
    },

    // overrides existing accessor
    // 覆盖现有的访问器
    $slots: i => {
      if (
        isCompatEnabled(DeprecationTypes.RENDER_FUNCTION, i) &&
        i.render &&
        i.render._compatWrapped
      ) {
        return new Proxy(i.slots, legacySlotProxyHandlers)
      }
      return __DEV__ ? shallowReadonly(i.slots) : i.slots
    },

    // Vue 2 $scopedSlots (mapped to $slots in Vue 3)
    // Vue 2 的 $scopedSlots（在 Vue 3 中映射为 $slots）
    $scopedSlots: i => {
      assertCompatEnabled(DeprecationTypes.INSTANCE_SCOPED_SLOTS, i)
      return __DEV__ ? shallowReadonly(i.slots) : i.slots
    },

    // Event emitter methods
    // 事件发射器方法
    $on: i => on.bind(null, i),
    $once: i => once.bind(null, i),
    $off: i => off.bind(null, i),

    // Vue 2 $children & $listeners
    // Vue 2 的 $children 和 $listeners
    $children: getCompatChildren,
    $listeners: getCompatListeners,

    // inject additional properties into $options for compat
    // 为兼容性向 $options 注入额外属性
    // e.g. vuex needs this.$options.parent
    // 例如 vuex 需要 this.$options.parent
    $options: i => {
      if (!isCompatEnabled(DeprecationTypes.PRIVATE_APIS, i)) {
        return resolveMergedOptions(i)
      }
      if (i.resolvedOptions) {
        return i.resolvedOptions
      }
      const res = (i.resolvedOptions = extend({}, resolveMergedOptions(i)))
      Object.defineProperties(res, {
        parent: {
          get() {
            warnDeprecation(DeprecationTypes.PRIVATE_APIS, i, '$options.parent')
            return i.proxy!.$parent
          },
        },
        propsData: {
          get() {
            warnDeprecation(
              DeprecationTypes.PRIVATE_APIS,
              i,
              '$options.propsData',
            )
            return i.vnode.props
          },
        },
      })
      return res
    },
  } as PublicPropertiesMap)

  // Private Vue 2 APIs used by compiler-generated code
  // 编译器生成的代码使用的私有 Vue 2 API
  const privateAPIs = {
    // needed by many libs / render fns
    // 许多库/渲染函数需要
    $vnode: i => i.vnode,

    // some private properties that are likely accessed...
    // 一些可能被访问的私有属性...
    _self: i => i.proxy,
    _uid: i => i.uid,
    _data: i => i.data,
    _isMounted: i => i.isMounted,
    _isDestroyed: i => i.isUnmounted,

    // v2 render helpers
    // v2 渲染辅助函数
    $createElement: () => compatH,
    _c: () => compatH,
    _o: () => legacyMarkOnce,
    _n: () => looseToNumber,
    _s: () => toDisplayString,
    _l: () => renderList,
    _t: i => legacyRenderSlot.bind(null, i),
    _q: () => looseEqual,
    _i: () => looseIndexOf,
    _m: i => legacyRenderStatic.bind(null, i),
    _f: () => resolveFilter,
    _k: i => legacyCheckKeyCodes.bind(null, i),
    _b: () => legacyBindObjectProps,
    _v: () => createTextVNode,
    _e: () => createCommentVNode,
    _u: () => legacyResolveScopedSlots,
    _g: () => legacyBindObjectListeners,
    _d: () => legacyBindDynamicKeys,
    _p: () => legacyPrependModifier,
  } as PublicPropertiesMap

  for (const key in privateAPIs) {
    map[key] = i => {
      if (isCompatEnabled(DeprecationTypes.PRIVATE_APIS, i)) {
        return privateAPIs[key](i)
      }
    }
  }
}
