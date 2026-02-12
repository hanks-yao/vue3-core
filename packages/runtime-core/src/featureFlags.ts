import { getGlobalThis } from '@vue/shared'

/**
 * This is only called in esm-bundler builds.
 * It is called when a renderer is created, in `baseCreateRenderer` so that
 * importing runtime-core is side-effects free.
 * 
 * 仅在 esm-bundler 构建中调用。
 * 它在创建渲染器时调用，即在 `baseCreateRenderer` 中，以便导入 runtime-core 是无副作用的。
 */
export function initFeatureFlags(): void {
  const needWarn = []

  // Check if Options API feature flag is defined
  // 检查 Options API 特性标志是否已定义
  if (typeof __FEATURE_OPTIONS_API__ !== 'boolean') {
    __DEV__ && needWarn.push(`__VUE_OPTIONS_API__`)
    // Default to true if not defined
    // 如果未定义，默认为 true
    getGlobalThis().__VUE_OPTIONS_API__ = true
  }

  // Check if Production Devtools feature flag is defined
  // 检查生产环境 Devtools 特性标志是否已定义
  if (typeof __FEATURE_PROD_DEVTOOLS__ !== 'boolean') {
    __DEV__ && needWarn.push(`__VUE_PROD_DEVTOOLS__`)
    // Default to false if not defined
    // 如果未定义，默认为 false
    getGlobalThis().__VUE_PROD_DEVTOOLS__ = false
  }

  // Check if Hydration Mismatch Details feature flag is defined
  // 检查水合不匹配详情特性标志是否已定义
  if (typeof __FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__ !== 'boolean') {
    __DEV__ && needWarn.push(`__VUE_PROD_HYDRATION_MISMATCH_DETAILS__`)
    // Default to false if not defined
    // 如果未定义，默认为 false
    getGlobalThis().__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false
  }

  // Warn if any flags are missing in development mode
  // 在开发模式下，如果有任何标志缺失，则发出警告
  if (__DEV__ && needWarn.length) {
    const multi = needWarn.length > 1
    console.warn(
      `Feature flag${multi ? `s` : ``} ${needWarn.join(', ')} ${
        multi ? `are` : `is`
      } not explicitly defined. You are running the esm-bundler build of Vue, ` +
        `which expects these compile-time feature flags to be globally injected ` +
        `via the bundler config in order to get better tree-shaking in the ` +
        `production bundle.\n\n` +
        `For more details, see https://link.vuejs.org/feature-flags.`,
    )
  }
}
