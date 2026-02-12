import {
  type Ref,
  isReactive,
  isReadonly,
  isRef,
  isShallow,
  pauseTracking,
  resetTracking,
  toRaw,
} from '@vue/reactivity'
import { EMPTY_OBJ, extend, isArray, isFunction, isObject } from '@vue/shared'
import type { ComponentInternalInstance, ComponentOptions } from './component'
import type { ComponentPublicInstance } from './componentPublicInstance'


export function initCustomFormatter(): void {
  /* eslint-disable no-restricted-globals */
  // Check if development mode and window is defined
  // 检查是否为开发模式且 window 已定义
  if (!__DEV__ || typeof window === 'undefined') {
    return
  }

  const vueStyle = { style: 'color:#3ba776' }
  const numberStyle = { style: 'color:#1677ff' }
  const stringStyle = { style: 'color:#f5222d' }
  const keywordStyle = { style: 'color:#eb2f96' }

  // custom formatter for Chrome
  // Chrome 的自定义格式化器
  // https://www.mattzeunert.com/2016/02/19/custom-chrome-devtools-object-formatters.html
  const formatter = {
    __vue_custom_formatter: true,
    // Header defines how the object is displayed in the summary view
    // Header 定义对象在摘要视图中的显示方式
    header(obj: unknown) {
      // TODO also format ComponentPublicInstance & ctx.slots/attrs in setup
      // TODO 还需要在 setup 中格式化 ComponentPublicInstance 和 ctx.slots/attrs
      if (!isObject(obj)) {
        return null
      }

      if (obj.__isVue) {
        return ['div', vueStyle, `VueInstance`]
      } else if (isRef(obj)) {
        // avoid tracking during debugger accessing
        // 避免在调试器访问期间进行追踪
        pauseTracking()
        const value = obj.value
        resetTracking()
        return [
          'div',
          {},
          ['span', vueStyle, genRefFlag(obj)],
          '<',
          formatValue(value),
          `>`,
        ]
      } else if (isReactive(obj)) {
        return [
          'div',
          {},
          ['span', vueStyle, isShallow(obj) ? 'ShallowReactive' : 'Reactive'],
          '<',
          formatValue(obj),
          `>${isReadonly(obj) ? ` (readonly)` : ``}`,
        ]
      } else if (isReadonly(obj)) {
        return [
          'div',
          {},
          ['span', vueStyle, isShallow(obj) ? 'ShallowReadonly' : 'Readonly'],
          '<',
          formatValue(obj),
          '>',
        ]
      }
      return null
    },
    // Check if the object has a body to expand
    // 检查对象是否有主体可以展开
    hasBody(obj: unknown) {
      return obj && (obj as any).__isVue
    },
    // Body defines the expanded view of the object
    // Body 定义对象的展开视图
    body(obj: unknown) {
      if (obj && (obj as any).__isVue) {
        return [
          'div',
          {},
          ...formatInstance((obj as ComponentPublicInstance).$),
        ]
      }
    },
  }

  // Format Vue component instance details
  // 格式化 Vue 组件实例详情
  function formatInstance(instance: ComponentInternalInstance) {
    const blocks = []
    if (instance.type.props && instance.props) {
      blocks.push(createInstanceBlock('props', toRaw(instance.props)))
    }
    if (instance.setupState !== EMPTY_OBJ) {
      blocks.push(createInstanceBlock('setup', instance.setupState))
    }
    if (instance.data !== EMPTY_OBJ) {
      blocks.push(createInstanceBlock('data', toRaw(instance.data)))
    }
    const computed = extractKeys(instance, 'computed')
    if (computed) {
      blocks.push(createInstanceBlock('computed', computed))
    }
    const injected = extractKeys(instance, 'inject')
    if (injected) {
      blocks.push(createInstanceBlock('injected', injected))
    }

    blocks.push([
      'div',
      {},
      [
        'span',
        {
          style: keywordStyle.style + ';opacity:0.66',
        },
        '$ (internal): ',
      ],
      ['object', { object: instance }],
    ])
    return blocks
  }

  // Create a display block for instance information
  // 为实例信息创建一个显示块
  function createInstanceBlock(type: string, target: any) {
    target = extend({}, target)
    if (!Object.keys(target).length) {
      return ['span', {}]
    }
    return [
      'div',
      { style: 'line-height:1.25em;margin-bottom:0.6em' },
      [
        'div',
        {
          style: 'color:#476582',
        },
        type,
      ],
      [
        'div',
        {
          style: 'padding-left:1.25em',
        },
        ...Object.keys(target).map(key => {
          return [
            'div',
            {},
            ['span', keywordStyle, key + ': '],
            formatValue(target[key], false),
          ]
        }),
      ],
    ]
  }

  // Format value display style based on type
  // 根据类型格式化值的显示样式
  function formatValue(v: unknown, asRaw = true) {
    if (typeof v === 'number') {
      return ['span', numberStyle, v]
    } else if (typeof v === 'string') {
      return ['span', stringStyle, JSON.stringify(v)]
    } else if (typeof v === 'boolean') {
      return ['span', keywordStyle, v]
    } else if (isObject(v)) {
      return ['object', { object: asRaw ? toRaw(v) : v }]
    } else {
      return ['span', stringStyle, String(v)]
    }
  }

  // Extract keys of a specific type (e.g., computed, inject) from the instance
  // 从实例中提取特定类型的键（例如 computed, inject）
  function extractKeys(instance: ComponentInternalInstance, type: string) {
    const Comp = instance.type
    if (isFunction(Comp)) {
      return
    }
    const extracted: Record<string, any> = {}
    for (const key in instance.ctx) {
      if (isKeyOfType(Comp, key, type)) {
        extracted[key] = instance.ctx[key]
      }
    }
    return extracted
  }

  // Check if a key belongs to a specific type in the component options
  // 检查键是否属于组件选项中的特定类型
  function isKeyOfType(Comp: ComponentOptions, key: string, type: string) {
    const opts = Comp[type]
    if (
      (isArray(opts) && opts.includes(key)) ||
      (isObject(opts) && key in opts)
    ) {
      return true
    }
    if (Comp.extends && isKeyOfType(Comp.extends, key, type)) {
      return true
    }
    if (Comp.mixins && Comp.mixins.some(m => isKeyOfType(m, key, type))) {
      return true
    }
  }

  // Generate flag for Ref types
  // 生成 Ref 类型的标记
  function genRefFlag(v: Ref) {
    if (isShallow(v)) {
      return `ShallowRef`
    }
    if ((v as any).effect) {
      return `ComputedRef`
    }
    return `Ref`
  }

  // Register the formatter to window.devtoolsFormatters
  // 将格式化器注册到 window.devtoolsFormatters
  if ((window as any).devtoolsFormatters) {
    ;(window as any).devtoolsFormatters.push(formatter)
  } else {
    ;(window as any).devtoolsFormatters = [formatter]
  }
}

