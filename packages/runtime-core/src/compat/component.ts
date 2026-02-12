import { isFunction, isObject } from '@vue/shared'
import type { Component, ComponentInternalInstance } from '../component'
import {
  DeprecationTypes,
  checkCompatEnabled,
  softAssertCompatEnabled,
} from './compatConfig'
import { convertLegacyAsyncComponent } from './componentAsync'
import { convertLegacyFunctionalComponent } from './componentFunctional'

export function convertLegacyComponent(
  comp: any,
  instance: ComponentInternalInstance | null,
): Component {
  // 如果是内置组件，直接返回
  if (comp.__isBuiltIn) {
    return comp
  }

  // 2.x constructor
  // Vue 2.x 构造函数
  if (isFunction(comp) && comp.cid) {
    // #7766
    if (comp.render) {
      // only necessary when compiled from SFC
      // 仅在从 SFC (单文件组件) 编译时需要
      comp.options.render = comp.render
    }
    // copy over internal properties set by the SFC compiler
    // 复制 SFC 编译器设置的内部属性
    comp.options.__file = comp.__file
    comp.options.__hmrId = comp.__hmrId
    comp.options.__scopeId = comp.__scopeId
    comp = comp.options
  }

  // 2.x async component
  // Vue 2.x 异步组件
  if (
    isFunction(comp) &&
    checkCompatEnabled(DeprecationTypes.COMPONENT_ASYNC, instance, comp)
  ) {
    // since after disabling this, plain functions are still valid usage, do not
    // use softAssert here.
    // 因为禁用此功能后，普通函数仍然是有效用法，所以这里不使用 softAssert。
    return convertLegacyAsyncComponent(comp)
  }

  // 2.x functional component
  // Vue 2.x 函数式组件
  if (
    isObject(comp) &&
    comp.functional &&
    softAssertCompatEnabled(
      DeprecationTypes.COMPONENT_FUNCTIONAL,
      instance,
      comp,
    )
  ) {
    return convertLegacyFunctionalComponent(comp)
  }

  return comp
}
