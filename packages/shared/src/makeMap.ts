/**
 * Make a map and return a function for checking if a key
 * is in that map.
 * IMPORTANT: all calls of this function must be prefixed with
 * \/\*#\_\_PURE\_\_\*\/
 * So that rollup can tree-shake them if necessary.
 */

/**
 * 根据一串“键”生成一个“判断某个键是否在这串键里”的函数。
 * @example
 * const map = makeMap('a,b,c') 
 * map('a') // true
 * map('d') // false
 */

/*@__NO_SIDE_EFFECTS__*/
export function makeMap(str: string): (key: string) => boolean {
  const map = Object.create(null)
  for (const key of str.split(',')) map[key] = 1
  return val => val in map
}
