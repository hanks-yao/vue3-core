import { isPlainObject } from '@vue/shared'
import { DeprecationTypes, warnDeprecation } from './compatConfig'

/**
 * Deep merge two data objects.
 * 深度合并两个数据对象。
 *
 * @param to - The target object. 目标对象。
 * @param from - The source object. 源对象。
 * @returns The merged object. 合并后的对象。
 */
export function deepMergeData(to: any, from: any): any {
  for (const key in from) {
    const toVal = to[key]
    const fromVal = from[key]
    // If key exists in both objects and both values are plain objects, perform deep merge
    // 如果键在两个对象中都存在，且两个值都是普通对象，则执行深度合并
    if (key in to && isPlainObject(toVal) && isPlainObject(fromVal)) {
      // Warn about the data merge behavior change/deprecation
      // 警告关于数据合并行为的变更/弃用
      __DEV__ && warnDeprecation(DeprecationTypes.OPTIONS_DATA_MERGE, null, key)
      deepMergeData(toVal, fromVal)
    } else {
      // Otherwise, overwrite the value in the target object
      // 否则，直接覆盖目标对象中的值
      to[key] = fromVal
    }
  }
  return to
}
