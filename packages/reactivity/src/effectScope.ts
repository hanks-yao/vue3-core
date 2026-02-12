import type { ReactiveEffect } from './effect'
import { warn } from './warning'

// 当前活跃的 EffectScope
// The active effect scope
export let activeEffectScope: EffectScope | undefined

export class EffectScope {
  /**
   * @internal
   * 标记当前作用域是否处于激活状态
   */
  private _active = true
  /**
   * @internal track `on` calls, allow `on` call multiple times
   * 内部跟踪 `on` 调用次数，允许 `on` 被多次调用
   */
  private _on = 0
  /**
   * @internal
   * 存储当前作用域下的所有响应式副作用 (ReactiveEffect)
   */
  effects: ReactiveEffect[] = []
  /**
   * @internal
   * 存储当前作用域下的所有清理回调函数
   */
  cleanups: (() => void)[] = []

  // 标记当前作用域是否处于暂停状态
  private _isPaused = false

  /**
   * only assigned by undetached scope
   * @internal
   * 父级作用域，仅在非分离模式下赋值
   */
  parent: EffectScope | undefined
  /**
   * record undetached scopes
   * @internal
   * 记录子作用域（非分离模式下）
   */
  scopes: EffectScope[] | undefined
  /**
   * track a child scope's index in its parent's scopes array for optimized
   * removal
   * @internal
   * 记录子作用域在父级 scopes 数组中的索引，用于优化删除操作
   */
  private index: number | undefined

  constructor(public detached = false) {
    this.parent = activeEffectScope
    // 如果不是分离模式且存在活跃的父级作用域，将当前作用域添加到父级作用域的 scopes 中
    if (!detached && activeEffectScope) {
      this.index =
        (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this,
        ) - 1
    }
  }

  get active(): boolean {
    return this._active
  }

  // 暂停当前作用域及其所有子作用域和副作用
  pause(): void {
    if (this._active) {
      this._isPaused = true
      let i, l
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].pause()
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause()
      }
    }
  }

  /**
   * Resumes the effect scope, including all child scopes and effects.
   * 恢复作用域，包括所有子作用域和副作用。
   */
  resume(): void {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false
        let i, l
        if (this.scopes) {
          for (i = 0, l = this.scopes.length; i < l; i++) {
            this.scopes[i].resume()
          }
        }
        for (i = 0, l = this.effects.length; i < l; i++) {
          this.effects[i].resume()
        }
      }
    }
  }

  // 在当前作用域下执行函数，捕获副作用
  run<T>(fn: () => T): T | undefined {
    if (this._active) {
      const currentEffectScope = activeEffectScope
      try {
        activeEffectScope = this
        return fn()
      } finally {
        activeEffectScope = currentEffectScope
      }
    } else if (__DEV__) {
      warn(`cannot run an inactive effect scope.`)
    }
  }

  // 上一个活跃的作用域，用于 on/off 切换
  prevScope: EffectScope | undefined
  /**
   * This should only be called on non-detached scopes
   * @internal
   * 仅应在非分离作用域上调用。激活当前作用域。
   */
  on(): void {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope
      activeEffectScope = this
    }
  }

  /**
   * This should only be called on non-detached scopes
   * @internal
   * 仅应在非分离作用域上调用。退出当前作用域。
   */
  off(): void {
    if (this._on > 0 && --this._on === 0) {
      activeEffectScope = this.prevScope
      this.prevScope = undefined
    }
  }

  // 停止当前作用域，清理所有副作用和子作用域
  stop(fromParent?: boolean): void {
    if (this._active) {
      this._active = false
      let i, l
      // 停止所有副作用
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop()
      }
      this.effects.length = 0

      // 执行所有清理回调
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]()
      }
      this.cleanups.length = 0

      // 停止所有子作用域
      if (this.scopes) {
        for (i = 0, l = this.scopes.length; i < l; i++) {
          this.scopes[i].stop(true)
        }
        this.scopes.length = 0
      }

      // nested scope, dereference from parent to avoid memory leaks
      // 嵌套作用域，从父级解引用以避免内存泄漏
      if (!this.detached && this.parent && !fromParent) {
        // optimized O(1) removal
        // 优化的 O(1) 移除操作
        const last = this.parent.scopes!.pop()
        if (last && last !== this) {
          this.parent.scopes![this.index!] = last
          last.index = this.index!
        }
      }
      this.parent = undefined
    }
  }
}

/**
 * Creates an effect scope object which can capture the reactive effects (i.e.
 * computed and watchers) created within it so that these effects can be
 * disposed together. For detailed use cases of this API, please consult its
 * corresponding {@link https://github.com/vuejs/rfcs/blob/master/active-rfcs/0041-reactivity-effect-scope.md | RFC}.
 *
 * 创建一个 effect scope 对象，它可以捕获在其中创建的响应式副作用（即 computed 和 watchers），
 * 以便这些副作用可以一起被处理。有关此 API 的详细用例，请参阅其对应的 RFC。
 *
 * @param detached - Can be used to create a "detached" effect scope.
 *                   可用于创建一个“分离的” effect scope。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#effectscope}
 */
export function effectScope(detached?: boolean): EffectScope {
  return new EffectScope(detached)
}

/**
 * Returns the current active effect scope if there is one.
 * 如果存在，则返回当前活跃的 effect scope。
 *
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#getcurrentscope}
 */
export function getCurrentScope(): EffectScope | undefined {
  return activeEffectScope
}

/**
 * Registers a dispose callback on the current active effect scope. The
 * callback will be invoked when the associated effect scope is stopped.
 *
 * 在当前活跃的 effect scope 上注册一个清理回调。
 * 当关联的 effect scope 停止时，将调用该回调。
 *
 * @param fn - The callback function to attach to the scope's cleanup.
 *             要附加到作用域清理的毁掉函数。
 * @see {@link https://vuejs.org/api/reactivity-advanced.html#onscopedispose}
 */
export function onScopeDispose(fn: () => void, failSilently = false): void {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn)
  } else if (__DEV__ && !failSilently) {
    warn(
      `onScopeDispose() is called when there is no active effect scope` +
        ` to be associated with.`,
    )
  }
}
