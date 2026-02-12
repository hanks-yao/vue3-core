/**
 * Runtime helper for applying directives to a vnode. Example usage:
 * 运行时辅助函数，用于将指令应用到 vnode。使用示例：
 *
 * const comp = resolveComponent('comp')
 * const foo = resolveDirective('foo')
 * const bar = resolveDirective('bar')
 *
 * return withDirectives(h(comp), [
 *   [foo, this.x],
 *   [bar, this.y]
 * ])
 */

import type { VNode } from './vnode'
import { EMPTY_OBJ, isBuiltInDirective, isFunction } from '@vue/shared'
import { warn } from './warning'
import {
  type ComponentInternalInstance,
  type Data,
  getComponentPublicInstance,
} from './component'
import { currentRenderingInstance } from './componentRenderContext'
import { ErrorCodes, callWithAsyncErrorHandling } from './errorHandling'
import type { ComponentPublicInstance } from './componentPublicInstance'
import { mapCompatDirectiveHook } from './compat/customDirective'
import { pauseTracking, resetTracking, traverse } from '@vue/reactivity'

// 指令绑定对象接口
export interface DirectiveBinding<
  Value = any,
  Modifiers extends string = string,
  Arg = any,
> {
  instance: ComponentPublicInstance | Record<string, any> | null
  value: Value
  oldValue: Value | null
  arg?: Arg
  modifiers: DirectiveModifiers<Modifiers>
  dir: ObjectDirective<any, Value, Modifiers, Arg>
}

// 指令钩子函数类型定义
export type DirectiveHook<
  HostElement = any,
  Prev = VNode<any, HostElement> | null,
  Value = any,
  Modifiers extends string = string,
  Arg = any,
> = (
  el: HostElement,
  binding: DirectiveBinding<Value, Modifiers, Arg>,
  vnode: VNode<any, HostElement>,
  prevVNode: Prev,
) => void

// SSR 指令钩子函数类型定义
export type SSRDirectiveHook<
  Value = any,
  Modifiers extends string = string,
  Arg = any,
> = (
  binding: DirectiveBinding<Value, Modifiers, Arg>,
  vnode: VNode,
) => Data | undefined

// 对象形式的指令接口
export interface ObjectDirective<
  HostElement = any,
  Value = any,
  Modifiers extends string = string,
  Arg = any,
> {
  /**
   * @internal without this, ts-expect-error in directives.test-d.ts somehow
   * fails when running tsc, but passes in IDE and when testing against built
   * dts. Could be a TS bug.
   * @internal 如果没有这个，在运行 tsc 时 directives.test-d.ts 会莫名其妙地报错，
   * 但在 IDE 中通过，并且针对构建后的 dts 测试也通过。可能是 TS 的 bug。
   */
  __mod?: Modifiers
  // 指令生命周期钩子
  created?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  beforeMount?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  mounted?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  beforeUpdate?: DirectiveHook<
    HostElement,
    VNode<any, HostElement>,
    Value,
    Modifiers,
    Arg
  >
  updated?: DirectiveHook<
    HostElement,
    VNode<any, HostElement>,
    Value,
    Modifiers,
    Arg
  >
  beforeUnmount?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  unmounted?: DirectiveHook<HostElement, null, Value, Modifiers, Arg>
  getSSRProps?: SSRDirectiveHook<Value, Modifiers, Arg>
  deep?: boolean
}

// 函数形式的指令类型
export type FunctionDirective<
  HostElement = any,
  V = any,
  Modifiers extends string = string,
  Arg = any,
> = DirectiveHook<HostElement, any, V, Modifiers, Arg>

// 指令类型，可以是对象或函数
export type Directive<
  HostElement = any,
  Value = any,
  Modifiers extends string = string,
  Arg = any,
> =
  | ObjectDirective<HostElement, Value, Modifiers, Arg>
  | FunctionDirective<HostElement, Value, Modifiers, Arg>

// 指令修饰符类型
export type DirectiveModifiers<K extends string = string> = Partial<
  Record<K, boolean>
>

export function validateDirectiveName(name: string): void {
  if (isBuiltInDirective(name)) {
    warn('Do not use built-in directive ids as custom directive id: ' + name)
    // 不要使用内置指令 ID 作为自定义指令 ID
  }
}

// Directive, value, argument, modifiers
// 指令参数数组类型：[指令, 值, 参数, 修饰符]
export type DirectiveArguments = Array<
  | [Directive | undefined]
  | [Directive | undefined, any]
  | [Directive | undefined, any, any]
  | [Directive | undefined, any, any, DirectiveModifiers]
>

/**
 * Adds directives to a VNode.
 * 将指令添加到 VNode。
 */
export function withDirectives<T extends VNode>(
  vnode: T,
  directives: DirectiveArguments,
): T {
  if (currentRenderingInstance === null) {
    __DEV__ && warn(`withDirectives can only be used inside render functions.`)
    // withDirectives 只能在渲染函数内部使用。
    return vnode
  }
  const instance = getComponentPublicInstance(currentRenderingInstance)
  // 获取或初始化 vnode 的 dirs 数组
  const bindings: DirectiveBinding[] = vnode.dirs || (vnode.dirs = [])
  for (let i = 0; i < directives.length; i++) {
    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i]
    if (dir) {
      if (isFunction(dir)) {
        // 如果指令是函数，则将其转换为对象形式，mounted 和 updated 使用同一个函数
        dir = {
          mounted: dir,
          updated: dir,
        } as ObjectDirective
      }
      if (dir.deep) {
        // 如果指令标记为 deep，则遍历 value 以触发响应式依赖收集
        traverse(value)
      }
      bindings.push({
        dir,
        instance,
        value,
        oldValue: void 0,
        arg,
        modifiers,
      })
    }
  }
  return vnode
}

export function invokeDirectiveHook(
  vnode: VNode,
  prevVNode: VNode | null,
  instance: ComponentInternalInstance | null,
  name: keyof ObjectDirective,
): void {
  const bindings = vnode.dirs!
  const oldBindings = prevVNode && prevVNode.dirs!
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i]
    if (oldBindings) {
      // 如果有旧的绑定，更新 oldValue
      binding.oldValue = oldBindings[i].value
    }
    let hook = binding.dir[name] as DirectiveHook | DirectiveHook[] | undefined
    if (__COMPAT__ && !hook) {
      hook = mapCompatDirectiveHook(name, binding.dir, instance)
    }
    if (hook) {
      // disable tracking inside all lifecycle hooks
      // since they can potentially be called inside effects.
      // 在所有生命周期钩子中禁用追踪，因为它们可能会在副作用中被调用。
      pauseTracking()
      callWithAsyncErrorHandling(hook, instance, ErrorCodes.DIRECTIVE_HOOK, [
        vnode.el,
        binding,
        vnode,
        prevVNode,
      ])
      resetTracking()
    }
  }
}
