import {
  type DirectiveBinding,
  type DirectiveHook,
  type ObjectDirective,
  type VNode,
  nextTick,
  warn,
} from '@vue/runtime-core'
import { addEventListener } from '../modules/events'
import {
  invokeArrayFns,
  isArray,
  isSet,
  looseEqual,
  looseIndexOf,
  looseToNumber,
} from '@vue/shared'

type AssignerFn = (value: any) => void

// 获取 v-model 的赋值函数，用于更新绑定的数据
const getModelAssigner = (vnode: VNode): AssignerFn => {
  const fn =
    vnode.props!['onUpdate:modelValue'] ||
    (__COMPAT__ && vnode.props!['onModelCompat:input'])
  return isArray(fn) ? value => invokeArrayFns(fn, value) : fn
}

// 处理输入法开始输入时的事件（如拼音输入）
function onCompositionStart(e: Event) {
  ;(e.target as any).composing = true
}

// 处理输入法结束输入时的事件
function onCompositionEnd(e: Event) {
  const target = e.target as any
  if (target.composing) {
    target.composing = false
    target.dispatchEvent(new Event('input'))
  }
}

const assignKey: unique symbol = Symbol('_assign')

type ModelDirective<T, Modifiers extends string = string> = ObjectDirective<
  T & { [assignKey]: AssignerFn; _assigning?: boolean },
  any,
  Modifiers
>

// 类型转换函数，处理 .trim 和 .number 修饰符
function castValue(value: string, trim?: boolean, number?: boolean | null) {
  if (trim) value = value.trim()
  if (number) value = looseToNumber(value)
  return value
}

// We are exporting the v-model runtime directly as vnode hooks so that it can
// be tree-shaken in case v-model is never used.
// 我们直接将 v-model 的运行时导出为 vnode 钩子，以便在从未使用的 v-model 的情况下可以进行 tree-shaking。
export const vModelText: ModelDirective<
  HTMLInputElement | HTMLTextAreaElement,
  'trim' | 'number' | 'lazy'
> = {
  created(el, { modifiers: { lazy, trim, number } }, vnode) {
    el[assignKey] = getModelAssigner(vnode)
    const castToNumber =
      number || (vnode.props && vnode.props.type === 'number')
    // 监听输入事件。如果使用了 .lazy 修饰符，则监听 change 事件，否则监听 input 事件
    addEventListener(el, lazy ? 'change' : 'input', e => {
      if ((e.target as any).composing) return // 如果正在使用输入法（拼音等），则不触发更新
      el[assignKey](castValue(el.value, trim, castToNumber))
    })
    if (trim || castToNumber) {
      addEventListener(el, 'change', () => {
        el.value = castValue(el.value, trim, castToNumber)
      })
    }
    if (!lazy) {
      addEventListener(el, 'compositionstart', onCompositionStart)
      addEventListener(el, 'compositionend', onCompositionEnd)
      // Safari < 10.2 & UIWebView doesn't fire compositionend when
      // switching focus before confirming composition choice
      // this also fixes the issue where some browsers e.g. iOS Chrome
      // fires "change" instead of "input" on autocomplete.
      // Safari < 10.2 和 UIWebView 在确认输入法选择之前切换焦点时不会触发 compositionend
      // 这也修复了一些浏览器（例如 iOS Chrome）在自动完成时触发 "change" 而不是 "input" 的问题。
      addEventListener(el, 'change', onCompositionEnd)
    }
  },
  // set value on mounted so it's after min/max for type="range"
  // 在 mounted 时设置值，以便在 type="range" 的 min/max 之后执行
  mounted(el, { value }) {
    el.value = value == null ? '' : value
  },
  beforeUpdate(
    el,
    { value, oldValue, modifiers: { lazy, trim, number } },
    vnode,
  ) {
    el[assignKey] = getModelAssigner(vnode)
    // avoid clearing unresolved text. #2302
    // 避免清除尚未确定的文本。#2302
    if ((el as any).composing) return
    const elValue =
      (number || el.type === 'number') && !/^0\d/.test(el.value)
        ? looseToNumber(el.value)
        : el.value
    const newValue = value == null ? '' : value

    if (elValue === newValue) {
      return
    }

    if (document.activeElement === el && el.type !== 'range') {
      // #8546
      if (lazy && value === oldValue) {
        return
      }
      if (trim && el.value.trim() === newValue) {
        return
      }
    }

    el.value = newValue
  },
}

export const vModelCheckbox: ModelDirective<HTMLInputElement> = {
  // #4096 array checkboxes need to be deep traversed
  // #4096 数组复选框需要进行深度遍历
  deep: true,
  created(el, _, vnode) {
    el[assignKey] = getModelAssigner(vnode)
    addEventListener(el, 'change', () => {
      const modelValue = (el as any)._modelValue
      const elementValue = getValue(el)
      const checked = el.checked
      const assign = el[assignKey]
      // 如果绑定的值是数组，则处理添加和删除
      if (isArray(modelValue)) {
        const index = looseIndexOf(modelValue, elementValue)
        const found = index !== -1
        if (checked && !found) {
          assign(modelValue.concat(elementValue))
        } else if (!checked && found) {
          const filtered = [...modelValue]
          filtered.splice(index, 1)
          assign(filtered)
        }
      } else if (isSet(modelValue)) { // 如果绑定的是 Set 集合，同样处理添加和删除
        const cloned = new Set(modelValue)
        if (checked) {
          cloned.add(elementValue)
        } else {
          cloned.delete(elementValue)
        }
        assign(cloned)
      } else { // 单一绑定值
        assign(getCheckboxValue(el, checked))
      }
    })
  },
  // set initial checked on mount to wait for true-value/false-value
  // 在 mount 时设置初始选中状态，以等待 true-value/false-value
  mounted: setChecked,
  beforeUpdate(el, binding, vnode) {
    el[assignKey] = getModelAssigner(vnode)
    setChecked(el, binding, vnode)
  },
}

function setChecked(
  el: HTMLInputElement,
  { value, oldValue }: DirectiveBinding,
  vnode: VNode,
) {
  // store the v-model value on the element so it can be accessed by the
  // change listener.
  // 将 v-model 的值存储在元素上，以便可以在 change 监听器中访问它。
  ;(el as any)._modelValue = value
  let checked: boolean

  if (isArray(value)) {
    checked = looseIndexOf(value, vnode.props!.value) > -1
  } else if (isSet(value)) {
    checked = value.has(vnode.props!.value)
  } else {
    if (value === oldValue) return
    checked = looseEqual(value, getCheckboxValue(el, true))
  }

  // Only update if the checked state has changed
  // 只有在 checked 状态发生改变时才更新
  if (el.checked !== checked) {
    el.checked = checked
  }
}

export const vModelRadio: ModelDirective<HTMLInputElement> = {
  created(el, { value }, vnode) {
    el.checked = looseEqual(value, vnode.props!.value)
    el[assignKey] = getModelAssigner(vnode)
    addEventListener(el, 'change', () => {
      el[assignKey](getValue(el))
    })
  },
  beforeUpdate(el, { value, oldValue }, vnode) {
    el[assignKey] = getModelAssigner(vnode)
    if (value !== oldValue) {
      el.checked = looseEqual(value, vnode.props!.value)
    }
  },
}

export const vModelSelect: ModelDirective<HTMLSelectElement, 'number'> = {
  // <select multiple> value need to be deep traversed
  // <select multiple> 绑定的值需要深度遍历
  deep: true,
  created(el, { value, modifiers: { number } }, vnode) {
    const isSetModel = isSet(value)
    addEventListener(el, 'change', () => {
      const selectedVal = Array.prototype.filter
        .call(el.options, (o: HTMLOptionElement) => o.selected)
        .map((o: HTMLOptionElement) =>
          number ? looseToNumber(getValue(o)) : getValue(o),
        )
      el[assignKey](
        el.multiple
          ? isSetModel
            ? new Set(selectedVal)
            : selectedVal
          : selectedVal[0],
      )
      el._assigning = true
      nextTick(() => {
        el._assigning = false
      })
    })
    el[assignKey] = getModelAssigner(vnode)
  },
  // set value in mounted & updated because <select> relies on its children
  // <option>s.
  // 在 mounted 和 updated 钩子中设置值，因为 <select> 依赖其子元素 <option>
  mounted(el, { value }) {
    setSelected(el, value)
  },
  beforeUpdate(el, _binding, vnode) {
    el[assignKey] = getModelAssigner(vnode)
  },
  updated(el, { value }) {
    if (!el._assigning) {
      setSelected(el, value)
    }
  },
}

// 帮助函数：设置 select 元素的选中状态
function setSelected(el: HTMLSelectElement, value: any) {
  const isMultiple = el.multiple
  const isArrayValue = isArray(value)
  if (isMultiple && !isArrayValue && !isSet(value)) {
    __DEV__ &&
      warn(
        `<select multiple v-model> expects an Array or Set value for its binding, ` +
          `but got ${Object.prototype.toString.call(value).slice(8, -1)}.`,
      )
    return
  }

  for (let i = 0, l = el.options.length; i < l; i++) {
    const option = el.options[i]
    const optionValue = getValue(option)
    if (isMultiple) {
      if (isArrayValue) {
        const optionType = typeof optionValue
        // fast path for string / number values
        // 对字符串和数字类型的值进行快速匹配
        if (optionType === 'string' || optionType === 'number') {
          option.selected = value.some(v => String(v) === String(optionValue))
        } else {
          option.selected = looseIndexOf(value, optionValue) > -1
        }
      } else {
        option.selected = value.has(optionValue)
      }
    } else if (looseEqual(getValue(option), value)) {
      if (el.selectedIndex !== i) el.selectedIndex = i
      return
    }
  }
  if (!isMultiple && el.selectedIndex !== -1) {
    el.selectedIndex = -1
  }
}

// retrieve raw value set via :value bindings
// 检索通过 :value 绑定设置的原始值
function getValue(el: HTMLOptionElement | HTMLInputElement) {
  return '_value' in el ? (el as any)._value : el.value
}

// retrieve raw value for true-value and false-value set via :true-value or :false-value bindings
// 为通过 :true-value 或 :false-value 绑定设置的值检索原始值
function getCheckboxValue(
  el: HTMLInputElement & { _trueValue?: any; _falseValue?: any },
  checked: boolean,
) {
  const key = checked ? '_trueValue' : '_falseValue'
  return key in el ? el[key] : checked
}

// 动态处理 v-model 绑定（用于动态组件 <component :is="...">）
export const vModelDynamic: ObjectDirective<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
> = {
  created(el, binding, vnode) {
    callModelHook(el, binding, vnode, null, 'created')
  },
  mounted(el, binding, vnode) {
    callModelHook(el, binding, vnode, null, 'mounted')
  },
  beforeUpdate(el, binding, vnode, prevVNode) {
    callModelHook(el, binding, vnode, prevVNode, 'beforeUpdate')
  },
  updated(el, binding, vnode, prevVNode) {
    callModelHook(el, binding, vnode, prevVNode, 'updated')
  },
}

// 根据标签名或类型返回对应的 v-model 指令对象
function resolveDynamicModel(tagName: string, type: string | undefined) {
  switch (tagName) {
    case 'SELECT':
      return vModelSelect
    case 'TEXTAREA':
      return vModelText
    default:
      switch (type) {
        case 'checkbox':
          return vModelCheckbox
        case 'radio':
          return vModelRadio
        default:
          return vModelText
      }
  }
}

// 调用对应动态指令的生命周期钩子
function callModelHook(
  el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  binding: DirectiveBinding,
  vnode: VNode,
  prevVNode: VNode | null,
  hook: keyof ObjectDirective,
) {
  const modelToUse = resolveDynamicModel(
    el.tagName,
    vnode.props && vnode.props.type,
  )
  const fn = modelToUse[hook] as DirectiveHook
  fn && fn(el, binding, vnode, prevVNode)
}

// SSR vnode transforms, only used when user includes client-oriented render
// function in SSR
// SSR vnode 转换，仅在用户在 SSR 中包含面向客户端的渲染函数时使用
export function initVModelForSSR(): void {
  vModelText.getSSRProps = ({ value }) => ({ value })

  vModelRadio.getSSRProps = ({ value }, vnode) => {
    if (vnode.props && looseEqual(vnode.props.value, value)) {
      return { checked: true }
    }
  }

  vModelCheckbox.getSSRProps = ({ value }, vnode) => {
    if (isArray(value)) {
      if (vnode.props && looseIndexOf(value, vnode.props.value) > -1) {
        return { checked: true }
      }
    } else if (isSet(value)) {
      if (vnode.props && value.has(vnode.props.value)) {
        return { checked: true }
      }
    } else if (value) {
      return { checked: true }
    }
  }

  vModelDynamic.getSSRProps = (binding, vnode) => {
    if (typeof vnode.type !== 'string') {
      return
    }
    const modelToUse = resolveDynamicModel(
      // resolveDynamicModel expects an uppercase tag name, but vnode.type is lowercase
      // resolveDynamicModel 期望大写的标签名，但 vnode.type 是小写的
      vnode.type.toUpperCase(),
      vnode.props && vnode.props.type,
    )
    if (modelToUse.getSSRProps) {
      return modelToUse.getSSRProps(binding, vnode)
    }
  }
}

export type VModelDirective =
  | typeof vModelText
  | typeof vModelCheckbox
  | typeof vModelSelect
  | typeof vModelRadio
  | typeof vModelDynamic
