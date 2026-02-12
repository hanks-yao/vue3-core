/* eslint-disable no-restricted-globals */
import {
  type ClassComponent,
  type ComponentInternalInstance,
  type ComponentOptions,
  type ConcreteComponent,
  type InternalRenderFunction,
  isClassComponent,
} from './component'
import { SchedulerJobFlags, queueJob, queuePostFlushCb } from './scheduler'
import { extend, getGlobalThis } from '@vue/shared'

type HMRComponent = ComponentOptions | ClassComponent

// 标记是否正在进行 HMR 更新
// Flag to indicate if HMR update is in progress
export let isHmrUpdating = false

// 存储 HMR 过程中被标记为 dirty 的组件及其实例集合
// Map to store dirty components during HMR
export const hmrDirtyComponents: Map<
  ConcreteComponent,
  Set<ComponentInternalInstance>
> = new Map<ConcreteComponent, Set<ComponentInternalInstance>>()

export interface HMRRuntime {
  createRecord: typeof createRecord
  rerender: typeof rerender
  reload: typeof reload
}

// Expose the HMR runtime on the global object
// This makes it entirely tree-shakable without polluting the exports and makes
// it easier to be used in toolings like vue-loader
// Note: for a component to be eligible for HMR it also needs the __hmrId option
// to be set so that its instances can be registered / removed.
// 将 HMR 运行时暴露在全局对象上
// 这使得它完全可以被 tree-shake，而不会污染导出，并且更容易在 vue-loader 等工具中使用
// 注意：组件要支持 HMR，还需要设置 __hmrId 选项，以便注册/移除其实例。
if (__DEV__) {
  getGlobalThis().__VUE_HMR_RUNTIME__ = {
    createRecord: tryWrap(createRecord),
    rerender: tryWrap(rerender),
    reload: tryWrap(reload),
  } as HMRRuntime
}

// 存储 HMR ID 到组件定义和实例集合的映射
const map: Map<
  string,
  {
    // the initial component definition is recorded on import - this allows us
    // to apply hot updates to the component even when there are no actively
    // rendered instance.
    // 初始组件定义在导入时记录 - 这允许我们即使在没有活跃渲染实例的情况下也能对组件应用热更新。
    initialDef: ComponentOptions
    instances: Set<ComponentInternalInstance>
  }
> = new Map()

// 注册 HMR：将组件实例添加到对应的记录中
export function registerHMR(instance: ComponentInternalInstance): void {
  const id = instance.type.__hmrId!
  let record = map.get(id)
  if (!record) {
    createRecord(id, instance.type as HMRComponent)
    record = map.get(id)!
  }
  record.instances.add(instance)
}

// 注销 HMR：从记录中移除组件实例
export function unregisterHMR(instance: ComponentInternalInstance): void {
  map.get(instance.type.__hmrId!)!.instances.delete(instance)
}

// 创建 HMR 记录：如果 ID 不存在，则初始化记录
function createRecord(id: string, initialDef: HMRComponent): boolean {
  if (map.has(id)) {
    return false
  }
  map.set(id, {
    initialDef: normalizeClassComponent(initialDef),
    instances: new Set(),
  })
  return true
}

// 规范化类组件：如果是类组件，返回其 __vccOpts，否则返回原组件
function normalizeClassComponent(component: HMRComponent): ComponentOptions {
  return isClassComponent(component) ? component.__vccOpts : component
}

// 重新渲染组件：用于模板更新
function rerender(id: string, newRender?: Function): void {
  const record = map.get(id)
  if (!record) {
    return
  }

  // update initial record (for not-yet-rendered component)
  // 更新初始记录（针对尚未渲染的组件）
  record.initialDef.render = newRender

  // Create a snapshot which avoids the set being mutated during updates
  // 创建快照以避免在更新期间集合被修改
  ;[...record.instances].forEach(instance => {
    if (newRender) {
      instance.render = newRender as InternalRenderFunction
      normalizeClassComponent(instance.type as HMRComponent).render = newRender
    }
    instance.renderCache = []
    // this flag forces child components with slot content to update
    // 此标志强制具有插槽内容的子组件更新
    isHmrUpdating = true
    // #13771 don't update if the job is already disposed
    // #13771 如果 job 已经被销毁，则不更新
    if (!(instance.job.flags! & SchedulerJobFlags.DISPOSED)) {
      instance.update()
    }
    isHmrUpdating = false
  })
}

// 重载组件：用于脚本或样式更新
function reload(id: string, newComp: HMRComponent): void {
  const record = map.get(id)
  if (!record) return

  newComp = normalizeClassComponent(newComp)
  // update initial def (for not-yet-rendered components)
  // 更新初始定义（针对尚未渲染的组件）
  updateComponentDef(record.initialDef, newComp)

  // create a snapshot which avoids the set being mutated during updates
  // 创建快照以避免在更新期间集合被修改
  const instances = [...record.instances]

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i]
    const oldComp = normalizeClassComponent(instance.type as HMRComponent)

    let dirtyInstances = hmrDirtyComponents.get(oldComp)
    if (!dirtyInstances) {
      // 1. Update existing comp definition to match new one
      // 1. 更新现有的组件定义以匹配新的定义
      if (oldComp !== record.initialDef) {
        updateComponentDef(oldComp, newComp)
      }
      // 2. mark definition dirty. This forces the renderer to replace the
      // component on patch.
      // 2. 将定义标记为 dirty。这会强制渲染器在 patch 时替换组件。
      hmrDirtyComponents.set(oldComp, (dirtyInstances = new Set()))
    }
    dirtyInstances.add(instance)

    // 3. invalidate options resolution cache
    // 3. 使选项解析缓存失效
    instance.appContext.propsCache.delete(instance.type as any)
    instance.appContext.emitsCache.delete(instance.type as any)
    instance.appContext.optionsCache.delete(instance.type as any)

    // 4. actually update
    // 4. 实际执行更新
    if (instance.ceReload) {
      // custom element
      // 自定义元素
      dirtyInstances.add(instance)
      instance.ceReload((newComp as any).styles)
      dirtyInstances.delete(instance)
    } else if (instance.parent) {
      // 4. Force the parent instance to re-render. This will cause all updated
      // components to be unmounted and re-mounted. Queue the update so that we
      // don't end up forcing the same parent to re-render multiple times.
      // 4. 强制父实例重新渲染。这将导致所有更新的组件被卸载并重新挂载。
      // 将更新排队，以免我们最终强制同一个父组件多次重新渲染。
      queueJob(() => {
        // vite-plugin-vue/issues/599
        // don't update if the job is already disposed
        // 如果 job 已经被销毁，则不更新
        if (!(instance.job.flags! & SchedulerJobFlags.DISPOSED)) {
          isHmrUpdating = true
          instance.parent!.update()
          isHmrUpdating = false
          // #6930, #11248 avoid infinite recursion
          // #6930, #11248 避免无限递归
          dirtyInstances.delete(instance)
        }
      })
    } else if (instance.appContext.reload) {
      // root instance mounted via createApp() has a reload method
      // 通过 createApp() 挂载的根实例有一个 reload 方法
      instance.appContext.reload()
    } else if (typeof window !== 'undefined') {
      // root instance inside tree created via raw render(). Force reload.
      // 通过原始 render() 创建的树内的根实例。强制重载。
      window.location.reload()
    } else {
      console.warn(
        '[HMR] Root or manually mounted instance modified. Full reload required.',
      )
    }

    // update custom element child style
    // 更新自定义元素子组件样式
    if (instance.root.ce && instance !== instance.root) {
      instance.root.ce._removeChildStyle(oldComp)
    }
  }

  // 5. make sure to cleanup dirty hmr components after update
  // 5. 确保在更新后清理 dirty hmr 组件
  queuePostFlushCb(() => {
    hmrDirtyComponents.clear()
  })
}

// 更新组件定义对象
function updateComponentDef(
  oldComp: ComponentOptions,
  newComp: ComponentOptions,
) {
  extend(oldComp, newComp)
  for (const key in oldComp) {
    if (key !== '__file' && !(key in newComp)) {
      delete oldComp[key]
    }
  }
}

// 尝试包装函数，添加错误处理
function tryWrap(fn: (id: string, arg: any) => any): Function {
  return (id: string, arg: any) => {
    try {
      return fn(id, arg)
    } catch (e: any) {
      console.error(e)
      console.warn(
        `[HMR] Something went wrong during Vue component hot-reload. ` +
          `Full reload required.`,
      )
    }
  }
}
