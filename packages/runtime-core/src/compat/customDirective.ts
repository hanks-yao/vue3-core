import { isArray } from '@vue/shared'
import type { ComponentInternalInstance } from '../component'
import type { DirectiveHook, ObjectDirective } from '../directives'
import { DeprecationTypes, softAssertCompatEnabled } from './compatConfig'

/**
 * Vue 2 directive definition
 * Vue 2 指令定义
 */
export interface LegacyDirective {
  bind?: DirectiveHook
  inserted?: DirectiveHook
  update?: DirectiveHook
  componentUpdated?: DirectiveHook
  unbind?: DirectiveHook
}

/**
 * Map Vue 3 directive hooks to Vue 2 directive hooks
 * 将 Vue 3 指令钩子映射到 Vue 2 指令钩子
 */
const legacyDirectiveHookMap: Partial<
  Record<
    keyof ObjectDirective,
    keyof LegacyDirective | (keyof LegacyDirective)[]
  >
> = {
  beforeMount: 'bind',
  mounted: 'inserted',
  updated: ['update', 'componentUpdated'],
  unmounted: 'unbind',
}

/**
 * Resolve compat directive hooks
 * 解析兼容模式下的指令钩子
 *
 * @param name - The name of the hook in Vue 3 (Vue 3 中的钩子名称)
 * @param dir - The directive object (指令对象)
 * @param instance - The component instance (组件实例)
 */
export function mapCompatDirectiveHook(
  name: keyof ObjectDirective,
  dir: ObjectDirective & LegacyDirective,
  instance: ComponentInternalInstance | null,
): DirectiveHook | DirectiveHook[] | undefined {
  // Check if there is a mapping for the current hook name
  // 检查当前钩子名称是否存在映射
  const mappedName = legacyDirectiveHookMap[name]
  if (mappedName) {
    // If the mapping is an array (e.g. updated -> [update, componentUpdated])
    // 如果映射是一个数组（例如 updated -> [update, componentUpdated]）
    if (isArray(mappedName)) {
      const hook: DirectiveHook[] = []
      mappedName.forEach(mapped => {
        const mappedHook = dir[mapped]
        if (mappedHook) {
          // Warn if compatibility mode is enabled and a legacy hook is used
          // 如果启用了兼容模式并使用了旧版钩子，则发出警告
          softAssertCompatEnabled(
            DeprecationTypes.CUSTOM_DIR,
            instance,
            mapped,
            name,
          )
          hook.push(mappedHook)
        }
      })
      return hook.length ? hook : undefined
    } else {
      // If the mapping is a single string
      // 如果映射是单个字符串
      if (dir[mappedName]) {
        // Warn if compatibility mode is enabled and a legacy hook is used
        // 如果启用了兼容模式并使用了旧版钩子，则发出警告
        softAssertCompatEnabled(
          DeprecationTypes.CUSTOM_DIR,
          instance,
          mappedName,
          name,
        )
      }
      return dir[mappedName]
    }
  }
}
