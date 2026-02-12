export enum LifecycleHooks {
  // beforeCreate: 在实例初始化之后、进行数据侦听和事件/侦听器的配置之前同步调用。
  BEFORE_CREATE = 'bc',
  // created: 在实例创建完成后被立即调用。
  CREATED = 'c',
  // beforeMount: 在挂载开始之前被调用：相关的 render 函数首次被调用。
  BEFORE_MOUNT = 'bm',
  // mounted: 实例被挂载后调用。
  MOUNTED = 'm',
  // beforeUpdate: 在数据发生改变后，DOM 被更新之前被调用。
  BEFORE_UPDATE = 'bu',
  // updated: 在数据更改导致的虚拟 DOM 重新渲染和更新完毕之后被调用。
  UPDATED = 'u',
  // beforeUnmount: 在卸载组件实例之前调用。
  BEFORE_UNMOUNT = 'bum',
  // unmounted: 卸载组件实例后调用。
  UNMOUNTED = 'um',
  // deactivated: 被 keep-alive 缓存的组件失活时调用。
  DEACTIVATED = 'da',
  // activated: 被 keep-alive 缓存的组件激活时调用。
  ACTIVATED = 'a',
  // renderTriggered: 调试钩子，当虚拟 DOM 重新渲染被触发时调用。
  RENDER_TRIGGERED = 'rtg',
  // renderTracked: 调试钩子，当虚拟 DOM 重新渲染被跟踪时调用。
  RENDER_TRACKED = 'rtc',
  // errorCaptured: 在捕获一个来自后代组件的错误时被调用。
  ERROR_CAPTURED = 'ec',
  // serverPrefetch: (SSR only) 在组件实例在服务器上被渲染前调用。
  SERVER_PREFETCH = 'sp'
}
