import type { AppConfig } from '../apiCreateApp'
import {
  DeprecationTypes,
  softAssertCompatEnabled,
  warnDeprecation,
} from './compatConfig'
import { isCopyingConfig } from './global'
import { internalOptionMergeStrats } from '../componentOptions'

// legacy config warnings
// 旧版配置警告
export type LegacyConfig = {
  /**
   * @deprecated `config.silent` option has been removed
   * @deprecated `config.silent` 选项已被移除
   */
  silent?: boolean
  /**
   * @deprecated use __VUE_PROD_DEVTOOLS__ compile-time feature flag instead
   * @deprecated 请改用 __VUE_PROD_DEVTOOLS__ 编译时特性标志
   * https://github.com/vuejs/core/tree/main/packages/vue#bundler-build-feature-flags
   */
  devtools?: boolean
  /**
   * @deprecated use `config.isCustomElement` instead
   * @deprecated 请改用 `config.isCustomElement`
   * https://v3-migration.vuejs.org/breaking-changes/global-api.html#config-ignoredelements-is-now-config-iscustomelement
   */
  ignoredElements?: (string | RegExp)[]
  /**
   * @deprecated
   * https://v3-migration.vuejs.org/breaking-changes/keycode-modifiers.html
   */
  keyCodes?: Record<string, number | number[]>
  /**
   * @deprecated
   * https://v3-migration.vuejs.org/breaking-changes/global-api.html#config-productiontip-removed
   */
  productionTip?: boolean
}

// dev only
// 仅在开发环境下使用
export function installLegacyConfigWarnings(config: AppConfig): void {
  // Map legacy config options to their deprecation types
  // 将旧版配置选项映射到其弃用类型
  const legacyConfigOptions: Record<string, DeprecationTypes> = {
    silent: DeprecationTypes.CONFIG_SILENT,
    devtools: DeprecationTypes.CONFIG_DEVTOOLS,
    ignoredElements: DeprecationTypes.CONFIG_IGNORED_ELEMENTS,
    keyCodes: DeprecationTypes.CONFIG_KEY_CODES,
    productionTip: DeprecationTypes.CONFIG_PRODUCTION_TIP,
  }

  // Iterate over each legacy option and define a property on the config object
  // 遍历每个旧版选项并在 config 对象上定义属性
  Object.keys(legacyConfigOptions).forEach(key => {
    let val = (config as any)[key]
    Object.defineProperty(config, key, {
      enumerable: true,
      get() {
        return val
      },
      set(newVal) {
        // Warn if not just copying config (e.g. during app creation)
        // 如果不是在复制配置（例如在应用创建期间），则发出警告
        if (!isCopyingConfig) {
          warnDeprecation(legacyConfigOptions[key], null)
        }
        val = newVal
      },
    })
  })
}

export function installLegacyOptionMergeStrats(config: AppConfig): void {
  // Use a Proxy to intercept access to optionMergeStrategies
  // 使用 Proxy 拦截对 optionMergeStrategies 的访问
  config.optionMergeStrategies = new Proxy({} as any, {
    get(target, key) {
      // If the strategy exists on the target, return it
      // 如果目标对象上存在该策略，则直接返回
      if (key in target) {
        return target[key]
      }
      // Check if it's an internal strategy and if compat mode is enabled for it
      // 检查是否为内部策略，并且是否为其启用了兼容模式
      if (
        key in internalOptionMergeStrats &&
        softAssertCompatEnabled(
          DeprecationTypes.CONFIG_OPTION_MERGE_STRATS,
          null,
        )
      ) {
        // Return the internal strategy
        // 返回内部策略
        return internalOptionMergeStrats[
          key as keyof typeof internalOptionMergeStrats
        ]
      }
    },
  })
}
