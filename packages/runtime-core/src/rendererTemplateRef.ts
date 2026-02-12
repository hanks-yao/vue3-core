import type { SuspenseBoundary } from './components/Suspense'
import type {
  VNode,
  VNodeNormalizedRef,
  VNodeNormalizedRefAtom,
  VNodeRef,
} from './vnode'
import {
  EMPTY_OBJ,
  NO,
  ShapeFlags,
  hasOwn,
  isArray,
  isFunction,
  isString,
  remove,
} from '@vue/shared'
import { isAsyncWrapper } from './apiAsyncComponent'
import { warn } from './warning'
import { isRef, toRaw } from '@vue/reactivity'
import { ErrorCodes, callWithErrorHandling } from './errorHandling'
import { type SchedulerJob, SchedulerJobFlags } from './scheduler'
import { queuePostRenderEffect } from './renderer'
import { type ComponentOptions, getComponentPublicInstance } from './component'
import { knownTemplateRefs } from './helpers/useTemplateRef'

const pendingSetRefMap = new WeakMap<VNodeNormalizedRef, SchedulerJob>()
/**
 * Function for handling a template ref
 * 处理模板 ref 的函数
 */
export function setRef(
  rawRef: VNodeNormalizedRef,
  oldRawRef: VNodeNormalizedRef | null,
  parentSuspense: SuspenseBoundary | null,
  vnode: VNode,
  isUnmount = false,
): void {
  // 如果 rawRef 是数组，说明可能有多个 ref 或者是在 v-for 中，递归调用 setRef
  if (isArray(rawRef)) {
    rawRef.forEach((r, i) =>
      setRef(
        r,
        oldRawRef && (isArray(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount,
      ),
    )
    return
  }

  if (isAsyncWrapper(vnode) && !isUnmount) {
    // #4999 if an async component already resolved and cached by KeepAlive,
    // we need to set the ref to inner component
    // #4999 如果异步组件已经解析并被 KeepAlive 缓存，我们需要将 ref 设置为内部组件
    if (
      vnode.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE &&
      (vnode.type as ComponentOptions).__asyncResolved &&
      vnode.component!.subTree.component
    ) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component!.subTree)
    }

    // otherwise, nothing needs to be done because the template ref
    // is forwarded to inner component
    // 否则，不需要做任何事情，因为模板 ref 会转发给内部组件
    return
  }

  // 获取 ref 的值：如果是状态组件，获取其实例；否则获取 DOM 元素
  const refValue =
    vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT
      ? getComponentPublicInstance(vnode.component!)
      : vnode.el
  // 如果是卸载操作，值为 null
  const value = isUnmount ? null : refValue

  const { i: owner, r: ref } = rawRef
  if (__DEV__ && !owner) {
    warn(
      `Missing ref owner context. ref cannot be used on hoisted vnodes. ` +
        `A vnode with ref must be created inside the render function.`,
    )
    return
  }
  const oldRef = oldRawRef && (oldRawRef as VNodeNormalizedRefAtom).r
  const refs = owner.refs === EMPTY_OBJ ? (owner.refs = {}) : owner.refs
  const setupState = owner.setupState
  const rawSetupState = toRaw(setupState)
  // 检查是否可以设置 setupState 中的 ref
  const canSetSetupRef =
    setupState === EMPTY_OBJ
      ? NO
      : (key: string) => {
          if (__DEV__) {
            if (hasOwn(rawSetupState, key) && !isRef(rawSetupState[key])) {
              warn(
                `Template ref "${key}" used on a non-ref value. ` +
                  `It will not work in the production build.`,
              )
            }

            if (knownTemplateRefs.has(rawSetupState[key] as any)) {
              return false
            }
          }
          return hasOwn(rawSetupState, key)
        }

  const canSetRef = (ref: VNodeRef) => {
    return !__DEV__ || !knownTemplateRefs.has(ref as any)
  }

  // dynamic ref changed. unset old ref
  // 动态 ref 发生变化。取消设置旧的 ref
  if (oldRef != null && oldRef !== ref) {
    invalidatePendingSetRef(oldRawRef!)
    if (isString(oldRef)) {
      refs[oldRef] = null
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null
      }
    } else if (isRef(oldRef)) {
      if (canSetRef(oldRef)) {
        oldRef.value = null
      }

      // this type assertion is valid since `oldRef` has already been asserted to be non-null
      // 这个类型断言是有效的，因为 oldRef 已经被断言为非空
      const oldRawRefAtom = oldRawRef as VNodeNormalizedRefAtom
      if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null
    }
  }

  // 处理函数类型的 ref
  if (isFunction(ref)) {
    callWithErrorHandling(ref, owner, ErrorCodes.FUNCTION_REF, [value, refs])
  } else {
    const _isString = isString(ref)
    const _isRef = isRef(ref)

    if (_isString || _isRef) {
      const doSet = () => {
        if (rawRef.f) {
          // 处理 v-for 中的 ref，通常是数组
          const existing = _isString
            ? canSetSetupRef(ref)
              ? setupState[ref]
              : refs[ref]
            : canSetRef(ref) || !rawRef.k
              ? ref.value
              : refs[rawRef.k]
          if (isUnmount) {
            isArray(existing) && remove(existing, refValue)
          } else {
            if (!isArray(existing)) {
              if (_isString) {
                refs[ref] = [refValue]
                if (canSetSetupRef(ref)) {
                  setupState[ref] = refs[ref]
                }
              } else {
                const newVal = [refValue]
                if (canSetRef(ref)) {
                  ref.value = newVal
                }
                if (rawRef.k) refs[rawRef.k] = newVal
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue)
            }
          }
        } else if (_isString) {
          // 字符串 ref 处理
          refs[ref] = value
          if (canSetSetupRef(ref)) {
            setupState[ref] = value
          }
        } else if (_isRef) {
          // Ref 对象处理
          if (canSetRef(ref)) {
            ref.value = value
          }
          if (rawRef.k) refs[rawRef.k] = value
        } else if (__DEV__) {
          warn('Invalid template ref type:', ref, `(${typeof ref})`)
        }
      }
      if (value) {
        // #1789: for non-null values, set them after render
        // null values means this is unmount and it should not overwrite another
        // ref with the same key
        // #1789: 对于非空值，在渲染后设置它们
        // null 值意味着这是卸载，它不应该覆盖具有相同键的另一个 ref
        const job: SchedulerJob = () => {
          doSet()
          pendingSetRefMap.delete(rawRef)
        }
        job.id = -1
        pendingSetRefMap.set(rawRef, job)
        queuePostRenderEffect(job, parentSuspense)
      } else {
        invalidatePendingSetRef(rawRef)
        doSet()
      }
    } else if (__DEV__) {
      warn('Invalid template ref type:', ref, `(${typeof ref})`)
    }
  }
}

function invalidatePendingSetRef(rawRef: VNodeNormalizedRef) {
  const pendingSetRef = pendingSetRefMap.get(rawRef)
  if (pendingSetRef) {
    pendingSetRef.flags! |= SchedulerJobFlags.DISPOSED
    pendingSetRefMap.delete(rawRef)
  }
}
