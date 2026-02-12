/* eslint-disable no-restricted-globals */
import {
  type ComponentInternalInstance,
  formatComponentName,
} from './component'
import { devtoolsPerfEnd, devtoolsPerfStart } from './devtools'

// 是否支持 performance API 的标志位
// Flag indicating if the performance API is supported
let supported: boolean
// Performance 实例
// Performance instance
let perf: Performance

/**
 * 开始测量性能
 * Start performance measurement
 * @param instance - 组件实例
 * @param type - 测量类型 (例如: init, render, patch 等)
 */
export function startMeasure(
  instance: ComponentInternalInstance,
  type: string,
): void {
  // 如果应用配置开启了 performance 选项，并且浏览器支持 performance API
  // If app config has performance enabled and browser supports performance API
  if (instance.appContext.config.performance && isSupported()) {
    // 标记开始时间点，标记名称格式为: vue-<类型>-<组件UID>
    // Mark the start time, mark name format: vue-<type>-<componentUID>
    perf.mark(`vue-${type}-${instance.uid}`)
  }

  // 在开发环境或启用了生产环境 devtools 时，通知 devtools 开始记录
  // In dev or if prod devtools are enabled, notify devtools to start recording
  if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
    devtoolsPerfStart(instance, type, isSupported() ? perf.now() : Date.now())
  }
}

/**
 * 结束测量性能
 * End performance measurement
 * @param instance - 组件实例
 * @param type - 测量类型
 */
export function endMeasure(
  instance: ComponentInternalInstance,
  type: string,
): void {
  // 如果应用配置开启了 performance 选项，并且浏览器支持 performance API
  // If app config has performance enabled and browser supports performance API
  if (instance.appContext.config.performance && isSupported()) {
    const startTag = `vue-${type}-${instance.uid}`
    const endTag = startTag + `:end`
    // 格式化组件名称，用于在性能面板中显示
    // Format component name for display in performance panel
    const measureName = `<${formatComponentName(instance, instance.type)}> ${type}`
    
    // 标记结束时间点
    // Mark the end time
    perf.mark(endTag)
    
    // 创建一个测量，计算 startTag 和 endTag 之间的时间差
    // Create a measure, calculating the duration between startTag and endTag
    perf.measure(measureName, startTag, endTag)
    
    // 清除测量数据和标记，避免内存泄漏和干扰后续测量
    // Clear measures and marks to prevent memory leaks and interference
    perf.clearMeasures(measureName)
    perf.clearMarks(startTag)
    perf.clearMarks(endTag)
  }

  // 在开发环境或启用了生产环境 devtools 时，通知 devtools 结束记录
  // In dev or if prod devtools are enabled, notify devtools to end recording
  if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
    devtoolsPerfEnd(instance, type, isSupported() ? perf.now() : Date.now())
  }
}

/**
 * 检查当前环境是否支持 performance API
 * Check if the current environment supports the performance API
 */
function isSupported() {
  if (supported !== undefined) {
    return supported
  }
  if (typeof window !== 'undefined' && window.performance) {
    supported = true
    perf = window.performance
  } else {
    supported = false
  }
  return supported
}
