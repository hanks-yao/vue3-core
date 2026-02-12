import { hasChanged } from '@vue/shared'
import { type VNode, currentBlock, isBlockTreeEnabled } from '../vnode'

/**
 * Higher-order function for handling v-memo
 * 用于处理 v-memo 的高阶函数
 *
 * @param memo - The dependency array to check for changes
 *               用于检查变化的依赖数组
 * @param render - The function to render the vnode
 *                 渲染 vnode 的函数
 * @param cache - The cache array shared by the component instance
 *                组件实例共享的缓存数组
 * @param index - The index in the cache array for this specific memo
 *                该 memo 在缓存数组中的索引
 */
export function withMemo(
  memo: any[],
  render: () => VNode<any, any>,
  cache: any[],
  index: number,
): VNode<any, any> {
  // Try to retrieve the cached VNode
  // 尝试获取缓存的 VNode
  const cached = cache[index] as VNode | undefined

  // Check if cache exists and if the memo dependencies haven't changed
  // 检查缓存是否存在，以及 memo 依赖项是否未发生变化
  if (cached && isMemoSame(cached, memo)) {
    // If same, return the cached VNode (skipping re-render)
    // 如果相同，返回缓存的 VNode（跳过重新渲染）
    return cached
  }

  // If not same or no cache, execute render function
  // 如果不同或没有缓存，执行渲染函数
  const ret = render()

  // shallow clone
  // 浅拷贝 memo 数组到 VNode 上，用于下次比较
  ret.memo = memo.slice()
  // Store the cache index on the VNode for future reference
  // 在 VNode 上存储缓存索引，以备将来引用
  ret.cacheIndex = index

  // Update the cache with the new VNode and return it
  // 使用新的 VNode 更新缓存并返回它
  return (cache[index] = ret)
}

/**
 * Checks if the memo dependencies have changed compared to the cached VNode
 * 检查 memo 依赖项与缓存的 VNode 相比是否发生了变化
 */
export function isMemoSame(cached: VNode, memo: any[]): boolean {
  const prev: any[] = cached.memo!
  // If length is different, they are definitely different
  // 如果长度不同，它们肯定不同
  if (prev.length != memo.length) {
    return false
  }

  // Compare each dependency
  // 比较每一个依赖项
  for (let i = 0; i < prev.length; i++) {
    // If any dependency has changed, return false
    // 如果任何依赖项发生变化，返回 false
    if (hasChanged(prev[i], memo[i])) {
      return false
    }
  }

  // make sure to let parent block track it when returning cached
  // 确保在返回缓存时让父级 block 追踪它
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(cached)
  }
  return true
}
