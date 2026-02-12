import { extend, hasChanged } from '@vue/shared'
import type { ComputedRefImpl } from './computed'
import type { TrackOpTypes, TriggerOpTypes } from './constants'
import { type Link, globalVersion } from './dep'
import { activeEffectScope } from './effectScope'
import { warn } from './warning'

// 副作用调度器类型
// Effect scheduler type
export type EffectScheduler = (...args: any[]) => any

// 调试器事件类型
// Debugger event type
export type DebuggerEvent = {
  effect: Subscriber
} & DebuggerEventExtraInfo

// 调试器事件额外信息
// Debugger event extra info
export type DebuggerEventExtraInfo = {
  target: object
  type: TrackOpTypes | TriggerOpTypes
  key: any
  newValue?: any
  oldValue?: any
  oldTarget?: Map<any, any> | Set<any>
}

// 调试器选项接口
// Debugger options interface
export interface DebuggerOptions {
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
}

// 响应式副作用选项接口
// Reactive effect options interface
export interface ReactiveEffectOptions extends DebuggerOptions {
  scheduler?: EffectScheduler
  allowRecurse?: boolean
  onStop?: () => void
}

// 响应式副作用运行器接口
// Reactive effect runner interface
export interface ReactiveEffectRunner<T = any> {
  (): T
  effect: ReactiveEffect
}

// 当前活跃的订阅者（正在执行的副作用）
// Currently active subscriber (effect being executed)
export let activeSub: Subscriber | undefined

// 副作用标志位枚举（使用位运算优化性能）
// Effect flags enum (using bitwise operations for performance)
export enum EffectFlags {
  /**
   * ReactiveEffect only
   * 仅用于 ReactiveEffect：表示副作用是否激活
   */
  ACTIVE = 1 << 0,
  /**
   * 正在运行中
   * Currently running
   */
  RUNNING = 1 << 1,
  /**
   * 正在追踪依赖
   * Currently tracking dependencies
   */
  TRACKING = 1 << 2,
  /**
   * 已被通知需要更新
   * Has been notified for update
   */
  NOTIFIED = 1 << 3,
  /**
   * 数据已变脏，需要重新计算
   * Data is dirty and needs recomputation
   */
  DIRTY = 1 << 4,
  /**
   * 允许递归触发
   * Allow recursive triggering
   */
  ALLOW_RECURSE = 1 << 5,
  /**
   * 已暂停
   * Paused
   */
  PAUSED = 1 << 6,
  /**
   * 已求值（用于 computed）
   * Has been evaluated (for computed)
   */
  EVALUATED = 1 << 7,
}

/**
 * Subscriber is a type that tracks (or subscribes to) a list of deps.
 * 订阅者是一个追踪（或订阅）依赖列表的类型
 */
export interface Subscriber extends DebuggerOptions {
  /**
   * Head of the doubly linked list representing the deps
   * 表示依赖的双向链表的头节点
   * @internal
   */
  deps?: Link
  /**
   * Tail of the same list
   * 同一链表的尾节点
   * @internal
   */
  depsTail?: Link
  /**
   * 副作用标志位
   * Effect flags
   * @internal
   */
  flags: EffectFlags
  /**
   * 指向下一个订阅者（用于批处理队列）
   * Points to next subscriber (for batch queue)
   * @internal
   */
  next?: Subscriber
  /**
   * returning `true` indicates it's a computed that needs to call notify
   * on its dep too
   * 返回 `true` 表示这是一个 computed，需要在其依赖上也调用 notify
   * @internal
   */
  notify(): true | void
}

// 暂停队列中的副作用集合
// Set of effects in paused queue
const pausedQueueEffects = new WeakSet<ReactiveEffect>()

/**
 * 响应式副作用类
 * 负责执行副作用函数、追踪依赖、触发更新
 * Reactive effect class
 * Responsible for executing effect functions, tracking dependencies, and triggering updates
 */
export class ReactiveEffect<T = any>
  implements Subscriber, ReactiveEffectOptions
{
  /**
   * 依赖链表头节点
   * Head of dependency linked list
   * @internal
   */
  deps?: Link = undefined
  /**
   * 依赖链表尾节点
   * Tail of dependency linked list
   * @internal
   */
  depsTail?: Link = undefined
  /**
   * 副作用标志位（默认激活且追踪）
   * Effect flags (active and tracking by default)
   * @internal
   */
  flags: EffectFlags = EffectFlags.ACTIVE | EffectFlags.TRACKING
  /**
   * 批处理队列中的下一个订阅者
   * Next subscriber in batch queue
   * @internal
   */
  next?: Subscriber = undefined
  /**
   * 清理函数（在下次运行前或停止时调用）
   * Cleanup function (called before next run or on stop)
   * @internal
   */
  cleanup?: () => void = undefined

  scheduler?: EffectScheduler = undefined
  onStop?: () => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void

  constructor(public fn: () => T) {
    // 如果存在活跃的副作用作用域，将当前副作用添加到作用域中
    // If there's an active effect scope, add this effect to it
    if (activeEffectScope && activeEffectScope.active) {
      activeEffectScope.effects.push(this)
    }
  }

  /**
   * 暂停副作用
   * Pause the effect
   */
  pause(): void {
    this.flags |= EffectFlags.PAUSED
  }

  /**
   * 恢复副作用
   * Resume the effect
   */
  resume(): void {
    if (this.flags & EffectFlags.PAUSED) {
      this.flags &= ~EffectFlags.PAUSED
      // 如果在暂停期间被触发过，现在执行触发
      // If triggered during pause, execute trigger now
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this)
        this.trigger()
      }
    }
  }

  /**
   * 通知副作用需要更新
   * Notify that the effect needs to update
   * @internal
   */
  notify(): void {
    // 如果正在运行且不允许递归，直接返回
    // If running and recursion not allowed, return directly
    if (
      this.flags & EffectFlags.RUNNING &&
      !(this.flags & EffectFlags.ALLOW_RECURSE)
    ) {
      return
    }
    // 如果还未被通知，加入批处理队列
    // If not yet notified, add to batch queue
    if (!(this.flags & EffectFlags.NOTIFIED)) {
      batch(this)
    }
  }

  /**
   * 运行副作用函数
   * Run the effect function
   */
  run(): T {
    // TODO cleanupEffect

    // 如果副作用已停止，直接执行函数不追踪依赖
    // If effect is stopped, execute function without tracking
    if (!(this.flags & EffectFlags.ACTIVE)) {
      // stopped during cleanup
      return this.fn()
    }

    // 标记为正在运行
    // Mark as running
    this.flags |= EffectFlags.RUNNING
    // 执行清理函数
    // Execute cleanup function
    cleanupEffect(this)
    // 准备依赖追踪
    // Prepare dependency tracking
    prepareDeps(this)
    // 保存之前的活跃副作用和追踪状态
    // Save previous active effect and tracking state
    const prevEffect = activeSub
    const prevShouldTrack = shouldTrack
    activeSub = this
    shouldTrack = true

    try {
      return this.fn()
    } finally {
      if (__DEV__ && activeSub !== this) {
        warn(
          'Active effect was not restored correctly - ' +
            'this is likely a Vue internal bug.',
        )
      }
      // 清理未使用的依赖
      // Cleanup unused dependencies
      cleanupDeps(this)
      // 恢复之前的状态
      // Restore previous state
      activeSub = prevEffect
      shouldTrack = prevShouldTrack
      this.flags &= ~EffectFlags.RUNNING
    }
  }

  /**
   * 停止副作用
   * Stop the effect
   */
  stop(): void {
    if (this.flags & EffectFlags.ACTIVE) {
      // 从所有依赖中移除此订阅者
      // Remove this subscriber from all dependencies
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link)
      }
      this.deps = this.depsTail = undefined
      cleanupEffect(this)
      this.onStop && this.onStop()
      this.flags &= ~EffectFlags.ACTIVE
    }
  }

  /**
   * 触发副作用执行
   * Trigger effect execution
   */
  trigger(): void {
    if (this.flags & EffectFlags.PAUSED) {
      // 如果已暂停，加入暂停队列
      // If paused, add to paused queue
      pausedQueueEffects.add(this)
    } else if (this.scheduler) {
      // 如果有调度器，使用调度器执行
      // If has scheduler, use scheduler to execute
      this.scheduler()
    } else {
      // 否则，如果是脏的就运行
      // Otherwise, run if dirty
      this.runIfDirty()
    }
  }

  /**
   * 如果是脏的就运行
   * Run if dirty
   * @internal
   */
  runIfDirty(): void {
    if (isDirty(this)) {
      this.run()
    }
  }

  /**
   * 获取是否为脏数据
   * Get whether it's dirty
   */
  get dirty(): boolean {
    return isDirty(this)
  }
}

/**
 * For debugging
 * 用于调试
 */
// function printDeps(sub: Subscriber) {
//   let d = sub.deps
//   let ds = []
//   while (d) {
//     ds.push(d)
//     d = d.nextDep
//   }
//   return ds.map(d => ({
//     id: d.id,
//     prev: d.prevDep?.id,
//     next: d.nextDep?.id,
//   }))
// }

// 批处理深度（支持嵌套批处理）
// Batch depth (supports nested batching)
let batchDepth = 0
// 批处理的普通订阅者队列
// Batched normal subscriber queue
let batchedSub: Subscriber | undefined
// 批处理的计算属性队列
// Batched computed queue
let batchedComputed: Subscriber | undefined

/**
 * 将订阅者加入批处理队列
 * Add subscriber to batch queue
 */
export function batch(sub: Subscriber, isComputed = false): void {
  sub.flags |= EffectFlags.NOTIFIED
  if (isComputed) {
    // computed 有单独的队列，优先处理
    // Computed has separate queue, processed first
    sub.next = batchedComputed
    batchedComputed = sub
    return
  }
  sub.next = batchedSub
  batchedSub = sub
}

/**
 * 开始批处理
 * Start batch processing
 * @internal
 */
export function startBatch(): void {
  batchDepth++
}

/**
 * Run batched effects when all batches have ended
 * 当所有批处理结束时运行批处理的副作用
 * @internal
 */
export function endBatch(): void {
  // 如果还有嵌套的批处理，不执行
  // If there are nested batches, don't execute
  if (--batchDepth > 0) {
    return
  }

  // 先处理 computed 队列（清空标志位但不触发）
  // Process computed queue first (clear flags but don't trigger)
  if (batchedComputed) {
    let e: Subscriber | undefined = batchedComputed
    batchedComputed = undefined
    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED
      e = next
    }
  }

  // 处理普通副作用队列
  // Process normal effect queue
  let error: unknown
  while (batchedSub) {
    let e: Subscriber | undefined = batchedSub
    batchedSub = undefined
    while (e) {
      const next: Subscriber | undefined = e.next
      e.next = undefined
      e.flags &= ~EffectFlags.NOTIFIED
      if (e.flags & EffectFlags.ACTIVE) {
        try {
          // ACTIVE flag is effect-only
          // ACTIVE 标志仅用于副作用
          ;(e as ReactiveEffect).trigger()
        } catch (err) {
          // 收集错误但继续执行其他副作用
          // Collect error but continue executing other effects
          if (!error) error = err
        }
      }
      e = next
    }
  }

  // 所有副作用执行完后，如果有错误则抛出
  // After all effects executed, throw error if any
  if (error) throw error
}

/**
 * 准备依赖追踪
 * Prepare dependency tracking
 */
function prepareDeps(sub: Subscriber) {
  // Prepare deps for tracking, starting from the head
  // 从头节点开始准备依赖追踪
  for (let link = sub.deps; link; link = link.nextDep) {
    // set all previous deps' (if any) version to -1 so that we can track
    // which ones are unused after the run
    // 将所有之前的依赖版本设为 -1，以便追踪哪些在运行后未被使用
    link.version = -1
    // store previous active sub if link was being used in another context
    // 如果链接在另一个上下文中被使用，存储之前的活跃订阅者
    link.prevActiveLink = link.dep.activeLink
    link.dep.activeLink = link
  }
}

/**
 * 清理未使用的依赖
 * Cleanup unused dependencies
 */
function cleanupDeps(sub: Subscriber) {
  // Cleanup unused deps
  // 清理未使用的依赖
  let head
  let tail = sub.depsTail
  let link = tail
  // 从尾部向前遍历
  // Traverse from tail to head
  while (link) {
    const prev = link.prevDep
    if (link.version === -1) {
      // 版本为 -1 表示未被使用
      // Version -1 means unused
      if (link === tail) tail = prev
      // unused - remove it from the dep's subscribing effect list
      // 未使用 - 从依赖的订阅副作用列表中移除
      removeSub(link)
      // also remove it from this effect's dep list
      // 同时从此副作用的依赖列表中移除
      removeDep(link)
    } else {
      // The new head is the last node seen which wasn't removed
      // from the doubly-linked list
      // 新的头节点是最后一个未被移除的节点
      head = link
    }

    // restore previous active link if any
    // 恢复之前的活跃链接（如果有）
    link.dep.activeLink = link.prevActiveLink
    link.prevActiveLink = undefined
    link = prev
  }
  // set the new head & tail
  // 设置新的头尾节点
  sub.deps = head
  sub.depsTail = tail
}

/**
 * 检查订阅者是否为脏数据（需要重新计算）
 * Check if subscriber is dirty (needs recomputation)
 */
function isDirty(sub: Subscriber): boolean {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (
      // 依赖的版本与记录的版本不一致
      // Dependency version doesn't match recorded version
      link.dep.version !== link.version ||
      // 或者依赖是 computed 且需要刷新
      // Or dependency is computed and needs refresh
      (link.dep.computed &&
        (refreshComputed(link.dep.computed) ||
          link.dep.version !== link.version))
    ) {
      return true
    }
  }
  // @ts-expect-error only for backwards compatibility where libs manually set
  // this flag - e.g. Pinia's testing module
  // 仅用于向后兼容，某些库手动设置此标志 - 例如 Pinia 的测试模块
  if (sub._dirty) {
    return true
  }
  return false
}

/**
 * Returning false indicates the refresh failed
 * 返回 false 表示刷新失败
 * 刷新计算属性的值
 * Refresh computed value
 * @internal
 */
export function refreshComputed(computed: ComputedRefImpl): undefined {
  // 如果正在追踪且不是脏数据，无需刷新
  // If tracking and not dirty, no need to refresh
  if (
    computed.flags & EffectFlags.TRACKING &&
    !(computed.flags & EffectFlags.DIRTY)
  ) {
    return
  }
  computed.flags &= ~EffectFlags.DIRTY

  // Global version fast path when no reactive changes has happened since
  // last refresh.
  // 全局版本快速路径：自上次刷新以来没有响应式变化
  if (computed.globalVersion === globalVersion) {
    return
  }
  computed.globalVersion = globalVersion

  // In SSR there will be no render effect, so the computed has no subscriber
  // and therefore tracks no deps, thus we cannot rely on the dirty check.
  // Instead, computed always re-evaluate and relies on the globalVersion
  // fast path above for caching.
  // 在 SSR 中不会有渲染副作用，所以 computed 没有订阅者，因此不追踪依赖
  // 我们不能依赖脏检查，而是总是重新求值，依赖上面的 globalVersion 快速路径进行缓存
  // #12337 if computed has no deps (does not rely on any reactive data) and evaluated,
  // there is no need to re-evaluate.
  // #12337 如果 computed 没有依赖（不依赖任何响应式数据）且已求值，无需重新求值
  if (
    !computed.isSSR &&
    computed.flags & EffectFlags.EVALUATED &&
    ((!computed.deps && !(computed as any)._dirty) || !isDirty(computed))
  ) {
    return
  }
  computed.flags |= EffectFlags.RUNNING

  const dep = computed.dep
  const prevSub = activeSub
  const prevShouldTrack = shouldTrack
  activeSub = computed
  shouldTrack = true

  try {
    prepareDeps(computed)
    const value = computed.fn(computed._value)
    // 如果值发生变化，更新缓存值并增加版本号
    // If value changed, update cached value and increment version
    if (dep.version === 0 || hasChanged(value, computed._value)) {
      computed.flags |= EffectFlags.EVALUATED
      computed._value = value
      dep.version++
    }
  } catch (err) {
    dep.version++
    throw err
  } finally {
    activeSub = prevSub
    shouldTrack = prevShouldTrack
    cleanupDeps(computed)
    computed.flags &= ~EffectFlags.RUNNING
  }
}

/**
 * 从依赖的订阅者列表中移除链接
 * Remove link from dependency's subscriber list
 */
function removeSub(link: Link, soft = false) {
  const { dep, prevSub, nextSub } = link
  // 从订阅者双向链表中移除
  // Remove from subscriber doubly linked list
  if (prevSub) {
    prevSub.nextSub = nextSub
    link.prevSub = undefined
  }
  if (nextSub) {
    nextSub.prevSub = prevSub
    link.nextSub = undefined
  }
  if (__DEV__ && dep.subsHead === link) {
    // was previous head, point new head to next
    // 如果是之前的头节点，将新头节点指向下一个
    dep.subsHead = nextSub
  }

  if (dep.subs === link) {
    // was previous tail, point new tail to prev
    // 如果是之前的尾节点，将新尾节点指向上一个
    dep.subs = prevSub

    if (!prevSub && dep.computed) {
      // if computed, unsubscribe it from all its deps so this computed and its
      // value can be GCed
      // 如果是 computed，从所有依赖中取消订阅，以便 computed 及其值可以被垃圾回收
      dep.computed.flags &= ~EffectFlags.TRACKING
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        // here we are only "soft" unsubscribing because the computed still keeps
        // referencing the deps and the dep should not decrease its sub count
        // 这里只是"软"取消订阅，因为 computed 仍然保持对依赖的引用
        // 依赖不应该减少其订阅者计数
        removeSub(l, true)
      }
    }
  }

  if (!soft && !--dep.sc && dep.map) {
    // #11979
    // property dep no longer has effect subscribers, delete it
    // this mostly is for the case where an object is kept in memory but only a
    // subset of its properties is tracked at one time
    // 属性依赖不再有副作用订阅者，删除它
    // 这主要用于对象保留在内存中但一次只追踪其部分属性的情况
    dep.map.delete(dep.key)
  }
}

/**
 * 从副作用的依赖列表中移除链接
 * Remove link from effect's dependency list
 */
function removeDep(link: Link) {
  const { prevDep, nextDep } = link
  if (prevDep) {
    prevDep.nextDep = nextDep
    link.prevDep = undefined
  }
  if (nextDep) {
    nextDep.prevDep = prevDep
    link.nextDep = undefined
  }
}

/**
 * 创建一个响应式副作用
 * Create a reactive effect
 * @param fn - 副作用函数 / Effect function
 * @param options - 选项 / Options
 * @returns 副作用运行器 / Effect runner
 */
export function effect<T = any>(
  fn: () => T,
  options?: ReactiveEffectOptions,
): ReactiveEffectRunner<T> {
  // 如果传入的是一个 runner，提取其原始函数
  // If passed a runner, extract its original function
  if ((fn as ReactiveEffectRunner).effect instanceof ReactiveEffect) {
    fn = (fn as ReactiveEffectRunner).effect.fn
  }

  const e = new ReactiveEffect(fn)
  if (options) {
    extend(e, options)
  }
  try {
    // 立即执行一次副作用
    // Execute effect immediately
    e.run()
  } catch (err) {
    e.stop()
    throw err
  }
  // 创建 runner 函数，绑定 this 为副作用实例
  // Create runner function, bind this to effect instance
  const runner = e.run.bind(e) as ReactiveEffectRunner
  runner.effect = e
  return runner
}

/**
 * Stops the effect associated with the given runner.
 * 停止与给定 runner 关联的副作用
 *
 * @param runner - Association with the effect to stop tracking.
 *                 与要停止追踪的副作用关联
 */
export function stop(runner: ReactiveEffectRunner): void {
  runner.effect.stop()
}

/**
 * 是否应该追踪依赖
 * Whether should track dependencies
 * @internal
 */
export let shouldTrack = true
// 追踪状态栈（支持嵌套的暂停/恢复）
// Track state stack (supports nested pause/resume)
const trackStack: boolean[] = []

/**
 * Temporarily pauses tracking.
 * 临时暂停依赖追踪
 */
export function pauseTracking(): void {
  trackStack.push(shouldTrack)
  shouldTrack = false
}

/**
 * Re-enables effect tracking (if it was paused).
 * 重新启用副作用追踪（如果之前被暂停）
 */
export function enableTracking(): void {
  trackStack.push(shouldTrack)
  shouldTrack = true
}

/**
 * Resets the previous global effect tracking state.
 * 重置之前的全局副作用追踪状态
 */
export function resetTracking(): void {
  const last = trackStack.pop()
  shouldTrack = last === undefined ? true : last
}

/**
 * Registers a cleanup function for the current active effect.
 * The cleanup function is called right before the next effect run, or when the
 * effect is stopped.
 * 为当前活跃的副作用注册一个清理函数
 * 清理函数会在下次副作用运行之前或副作用停止时被调用
 *
 * Throws a warning if there is no current active effect. The warning can be
 * suppressed by passing `true` to the second argument.
 * 如果没有当前活跃的副作用会抛出警告，可以通过传递 `true` 作为第二个参数来抑制警告
 *
 * @param fn - the cleanup function to be registered
 *             要注册的清理函数
 * @param failSilently - if `true`, will not throw warning when called without
 * an active effect.
 *                       如果为 `true`，在没有活跃副作用时调用不会抛出警告
 */
export function onEffectCleanup(fn: () => void, failSilently = false): void {
  if (activeSub instanceof ReactiveEffect) {
    activeSub.cleanup = fn
  } else if (__DEV__ && !failSilently) {
    warn(
      `onEffectCleanup() was called when there was no active effect` +
        ` to associate with.`,
    )
  }
}

/**
 * 执行副作用的清理函数
 * Execute effect's cleanup function
 */
function cleanupEffect(e: ReactiveEffect) {
  const { cleanup } = e
  e.cleanup = undefined
  if (cleanup) {
    // run cleanup without active effect
    // 在没有活跃副作用的情况下运行清理函数
    const prevSub = activeSub
    activeSub = undefined
    try {
      cleanup()
    } finally {
      activeSub = prevSub
    }
  }
}
