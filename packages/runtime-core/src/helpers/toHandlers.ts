import { isObject, toHandlerKey } from '@vue/shared'
import { warn } from '../warning'

/**
 * For prefixing keys in v-on="obj" with "on"
 * 用于为 v-on="obj" 中的键添加 "on" 前缀
 * @private
 */
export function toHandlers(
  obj: Record<string, any>,
  preserveCaseIfNecessary?: boolean,
): Record<string, any> {
  const ret: Record<string, any> = {}
  // 在开发环境下，如果传入的 obj 不是对象，发出警告
  if (__DEV__ && !isObject(obj)) {
    warn(`v-on with no argument expects an object value.`)
    return ret
  }
  // 遍历传入对象的所有键
  for (const key in obj) {
    ret[
      // 如果 preserveCaseIfNecessary 为 true 且键名包含大写字母，则使用 on: 前缀保留大小写
      // 否则使用 toHandlerKey 转换为标准的事件处理函数名（例如：click -> onClick）
      preserveCaseIfNecessary && /[A-Z]/.test(key)
        ? `on:${key}`
        : toHandlerKey(key)
    ] = obj[key]
  }
  return ret
}
