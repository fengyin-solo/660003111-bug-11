import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NFA, MatchResult, MatchStep, StepEdge, RegexTemplate, ASTNode } from '../types'

const GROUP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

export const TEMPLATES: RegexTemplate[] = [
  { name: '邮箱地址', pattern: '^([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})$', description: '匹配标准邮箱格式：用户名@域名.顶级域', testString: 'user@example.com admin@mail.org test.user+tag@sub.domain.co.uk', category: '常用' },
  { name: 'URL链接', pattern: '^(https?)://([^/:]+)(?::(\\d+))?(.*)$', description: '匹配HTTP/HTTPS URL：协议://主机:端口/路径', testString: 'https://www.example.com:8080/path/to/page http://localhost:3000/api', category: '常用' },
  { name: 'IPv4地址', pattern: '^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$', description: '匹配IPv4地址四段数字', testString: '192.168.1.1 10.0.0.1 255.255.255.0', category: '常用' },
  { name: '日期格式', pattern: '^(\\d{4})-(\\d{2})-(\\d{2})$', description: '匹配YYYY-MM-DD日期', testString: '2024-01-15 1999-12-31 2025-06-06', category: '常用' },
  { name: '手机号码', pattern: '^1[3-9]\\d{9}$', description: '匹配中国大陆手机号', testString: '13800138000 15912345678 18600000000', category: '常用' },
  { name: '身份证号', pattern: '^(\\d{6})(\\d{4})(\\d{2})(\\d{2})(\\d{3})([0-9Xx])$', description: '18位身份证：地区码+出生日期+顺序码+校验码', testString: '11010119900101001X 440304200512120039', category: '常用' },
  { name: '十六进制颜色', pattern: '^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$', description: '匹配#RGB或#RRGGBB格式', testString: '#FF5733 #abc #1A2B3C ff0000', category: '前端' },
  { name: '邮政编码', pattern: '^\\d{6}$', description: '6位中国邮编', testString: '100000 518000 200120', category: '常用' },
  { name: '浮点数', pattern: '^-?\\d+\\.\\d+$', description: '匹配带小数点的数字', testString: '3.14 -0.5 100.0', category: '数字' },
  { name: '科学计数法', pattern: '^-?\\d+(\\.\\d+)?[eE][+-]?\\d+$', description: '匹配科学计数法数字', testString: '1.5e10 -2.3E-4 6.022e23', category: '数字' },
  { name: 'MAC地址', pattern: '^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$', description: '匹配MAC地址XX:XX:XX:XX:XX:XX', testString: '00:1A:2B:3C:4D:5E AA-BB-CC-DD-EE-FF', category: '网络' },
  { name: 'UUID', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', description: '标准UUID格式', testString: '550e8400-e29b-41d4-a716-446655440000', category: '网络' },
  { name: 'QQ号', pattern: '^[1-9]\\d{4,10}$', description: '5-11位QQ号', testString: '12345 10000 1234567890', category: '常用' },
  { name: '密码强度', pattern: '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$', description: '至少8位含大小写字母数字特殊字符', testString: 'Passw0rd! Str0ng@Pass', category: '安全' },
  { name: '中文姓名', pattern: '^[\\u4e00-\\u9fa5]{2,4}$', description: '2-4位中文字符', testString: '张三 李世明 王小明', category: '常用' },
  { name: '车牌号', pattern: '^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-Z][A-HJ-NP-Z0-9]{5}$', description: '中国车牌格式', testString: '京A12345 沪B6789X', category: '常用' },
  { name: 'HTML标签', pattern: '<(\\w+)(\\s[^>]*)?>(.*?)</\\1>', description: '匹配HTML开闭标签对', testString: '<div class="x">content</div> <span>text</span>', category: '前端' },
  { name: '文件扩展名', pattern: '^.+\\.(\\w+)$', description: '提取文件扩展名', testString: 'image.png doc.pdf index.html', category: '前端' },
  { name: '经纬度', pattern: '^(\\-?\\d{1,3}\\.\\d+)\\s*,\\s*(\\-?\\d{1,3}\\.\\d+)$', description: '匹配经纬度坐标', testString: '116.404,39.915 -73.9857,40.7484', category: '地理' },
  { name: '版本号', pattern: '^(\\d+)\\.(\\d+)\\.(\\d+)(?:-(\\w+))?$', description: '语义化版本号x.y.z-tag', testString: '1.0.0 2.3.1-beta 10.20.30', category: '常用' },
  { name: '时间格式', pattern: '^([01]?\\d|2[0-3]):([0-5]\\d)(?::([0-5]\\d))?$', description: 'HH:MM或HH:MM:SS', testString: '14:30 23:59:59 00:00', category: '常用' }
]

interface StateNode {
  id: number
  isAccept: boolean
  transitions: Map<string, number[]>
  epsilonTransitions: number[]
}

function buildNFA(pattern: string): { states: StateNode[]; startState: number; acceptStates: number[] } {
  const states: StateNode[] = []
  let stateCounter = 0
  let pos = 0
  let groupCount = 0

  function newState(): number {
    const id = stateCounter++
    states.push({ id, isAccept: false, transitions: new Map(), epsilonTransitions: [] })
    return id
  }

  function addTransition(from: number, symbol: string, to: number) {
    if (!states[from].transitions.has(symbol)) {
      states[from].transitions.set(symbol, [])
    }
    states[from].transitions.get(symbol)!.push(to)
  }

  function addEpsilon(from: number, to: number) {
    states[from].epsilonTransitions.push(to)
  }

  function parseCharClass(): (ch: string) => boolean {
    const negative = pattern[pos] === '^'
    if (negative) pos++
    const ranges: [string, string][] = []
    const chars: string[] = []
    while (pos < pattern.length && pattern[pos] !== ']') {
      if (pattern[pos + 1] === '-' && pattern[pos + 2] && pattern[pos + 2] !== ']') {
        ranges.push([pattern[pos], pattern[pos + 2]])
        pos += 3
      } else {
        chars.push(pattern[pos])
        pos++
      }
    }
    pos++ // skip ]
    return (ch: string) => {
      if (negative) {
        return !chars.includes(ch) && !ranges.some(([s, e]) => ch >= s && ch <= e)
      }
      return chars.includes(ch) || ranges.some(([s, e]) => ch >= s && ch <= e)
    }
  }

  // 构造单个原子（字符/字符类/锚点/分组）的 Thompson 片段，并把解析位置推进到原子末尾
  function parseAtomNfa(): [number, number] {
    let segStart: number, segEnd: number
    const ch = pattern[pos]
    if (ch === '(') {
      pos++
      groupCount++
      if (pattern[pos] === '?') {
        pos++
        if (pattern[pos] === ':') pos++
      }
      const [s, e] = parseOr()
      segStart = s; segEnd = e
      pos++ // skip )
    } else if (ch === '[') {
      pos++
      segStart = newState()
      segEnd = newState()
      const matcher = parseCharClass()
      addTransition(segStart, '__class_' + segStart, segEnd)
      // 匹配器必须挂在转移的源状态，runMatch 在源状态上取 _matcher
      ;(states[segStart] as any)._matcher = matcher
    } else if (ch === '.') {
      segStart = newState()
      segEnd = newState()
      addTransition(segStart, '__dot', segEnd)
      pos++
    } else if (ch === '\\') {
      pos++
      const escaped = pattern[pos]
      segStart = newState()
      segEnd = newState()
      if (escaped === 'd') addTransition(segStart, '__digit', segEnd)
      else if (escaped === 'w') addTransition(segStart, '__word', segEnd)
      else if (escaped === 's') addTransition(segStart, '__space', segEnd)
      else addTransition(segStart, escaped, segEnd)
      pos++
    } else if (ch === '^' || ch === '$') {
      // 位置断言：零宽且带条件的 ε 边，匹配时按当前位置判定（start/end）
      segStart = newState()
      segEnd = newState()
      addTransition(segStart, ch === '^' ? '__start' : '__end', segEnd)
      pos++
    } else {
      segStart = newState()
      segEnd = newState()
      addTransition(segStart, ch, segEnd)
      pos++
    }
    return [segStart, segEnd]
  }

  function parseConcat(): [number, number] {
    let start = newState()
    let end = start
    while (pos < pattern.length && !['|', ')'].includes(pattern[pos])) {
      const atomStartPos = pos
      let [segStart, segEnd] = parseAtomNfa()

      // Handle quantifiers
      while (pos < pattern.length && ['*', '+', '?', '{'].includes(pattern[pos])) {
        const q = pattern[pos]
        const qStart = newState()
        const qEnd = newState()
        addEpsilon(qStart, segStart)
        if (q === '*') {
          pos++
          addEpsilon(qStart, qEnd)
          // 回边必须绕回原子入口 segStart（符号边源头），贪婪重复才真正可再消费字符
          addEpsilon(segEnd, segStart)
          addEpsilon(segEnd, qEnd)
        } else if (q === '+') {
          pos++
          addEpsilon(segEnd, segStart)
          addEpsilon(segEnd, qEnd)
        } else if (q === '?') {
          pos++
          addEpsilon(qStart, qEnd)
          addEpsilon(segEnd, qEnd)
        } else {
          // {n} / {n,} / {n,m}：通过重复构造原子片段实现，不能零宽忽略
          const close = pattern.indexOf('}', pos)
          const spec = pattern.slice(pos + 1, close)
          const parts = spec.split(',').map(x => x.trim())
          const minRepeat = parseInt(parts[0], 10) || 0
          const hasComma = parts.length > 1
          const maxRepeat = !hasComma ? minRepeat : parts[1] === '' ? Infinity : (parseInt(parts[1], 10) || 0)
          const afterQuantifier = close + 1

          // 复制一份原子：回到原子起点重新构造，再把 pos 恢复到量词之后
          const copyAtom = (): [number, number] => {
            const saved = pos
            pos = atomStartPos
            const frag = parseAtomNfa()
            pos = saved
            return frag
          }

          // 重复体入口与出口：{n,} 的回边必须绕回第一份原子
          // 逐份串联：第 1 份为原段，其余复制；min 之前必走
          let tailOut = segEnd
          let lastCopyIn = segStart  // 最后一份原子的入口（{n,} 回边目标）
          for (let k = 1; k < minRepeat; k++) {
            const [cs, ce] = copyAtom()
            addEpsilon(tailOut, cs)
            lastCopyIn = cs
            tailOut = ce
          }
          if (minRepeat === 0) addEpsilon(qStart, qEnd)
          if (maxRepeat === Infinity) {
            // {n,}：n 份之后可按"单份原子"继续任意次——回边绕到最后一份入口，
            // 并保留从末份出口离开的路径（故 a{2,} 匹配 2、3、4… 个 a，且贪婪取最长）
            addEpsilon(tailOut, lastCopyIn)
            addEpsilon(tailOut, qEnd)
          } else {
            // min..max 之间每份可选：接入副本的同时保留直达 qEnd 的旁路
            for (let k = Math.max(minRepeat, 1); k < maxRepeat; k++) {
              const [cs, ce] = copyAtom()
              addEpsilon(tailOut, cs)
              addEpsilon(tailOut, qEnd)
              tailOut = ce
            }
            addEpsilon(tailOut, qEnd)
          }
          pos = afterQuantifier
        }
        segStart = qStart; segEnd = qEnd
        if (pos < pattern.length && pattern[pos] === '?') pos++ // lazy
      }

      if (end !== segStart) addEpsilon(end, segStart)
      end = segEnd
    }
    return [start, end]
  }

  function parseOr(): [number, number] {
    const [s1, e1] = parseConcat()
    let start = s1, end = e1
    while (pos < pattern.length && pattern[pos] === '|') {
      pos++
      const [s2, e2] = parseConcat()
      const ns = newState(), ne = newState()
      addEpsilon(ns, start); addEpsilon(ns, s2)
      addEpsilon(end, ne); addEpsilon(e2, ne)
      start = ns; end = ne
    }
    return [start, end]
  }

  const [startState, acceptState] = parseOr()
  states[acceptState].isAccept = true
  return { states, startState, acceptStates: [acceptState] }
}

// 计算 ε 闭包，并记录从起点到闭包内每个状态实际经过的边（均为 ε 边），
// 起点自身的路径为空数组。所有画布高亮统一以该路径为准。
function epsilonClosurePaths(states: StateNode[], stateId: number): Map<number, StepEdge[]> {
  const paths = new Map<number, StepEdge[]>([[stateId, []]])
  const stack = [stateId]
  while (stack.length) {
    const s = stack.pop()!
    for (const next of states[s].epsilonTransitions) {
      if (!paths.has(next)) {
        paths.set(next, [...paths.get(s)!, { from: s, to: next, symbol: null }])
        stack.push(next)
      }
    }
  }
  return paths
}

function matchTransition(state: StateNode, symbol: string): number[] {
  const results: number[] = []
  for (const [sym, targets] of state.transitions) {
    if (sym === symbol) { results.push(...targets); continue }
    if (sym === '__dot' && symbol !== '\n') { results.push(...targets); continue }
    if (sym === '__digit' && /\d/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__word' && /\w/.test(symbol)) { results.push(...targets); continue }
    if (sym === '__space' && /\s/.test(symbol)) { results.push(...targets); continue }
    if (sym.startsWith('__class_')) {
      const matcher = (state as any)._matcher
      if (matcher && matcher(symbol)) results.push(...targets)
    }
  }
  return results
}

// 计算一个状态在不消费字符的情况下可到达的所有配置：先应用 ^/$ 断言，再展开 ε 闭包。
// 返回每条零消费路径（首条边为断言边或空），所有判定共用这一入口，保证口径一致。
function zeroWidthPaths(
  states: StateNode[],
  stateId: number,
  pos: number,
  inputLength: number
): Array<{ state: number; path: StepEdge[] }> {
  const result: Array<{ state: number; path: StepEdge[] }> = []
  const closure = epsilonClosurePaths(states, stateId)
  for (const [c, epsPath] of closure) {
    result.push({ state: c, path: epsPath })
    const startTargets = states[c].transitions.get('__start')
    if (pos === 0 && startTargets) {
      for (const t of startTargets) {
        for (const [c2, p2] of epsilonClosurePaths(states, t)) {
          result.push({ state: c2, path: [...epsPath, { from: c, to: t, symbol: '^' }, ...p2] })
        }
      }
    }
    const endTargets = states[c].transitions.get('__end')
    if (pos === inputLength && endTargets) {
      for (const t of endTargets) {
        for (const [c2, p2] of epsilonClosurePaths(states, t)) {
          result.push({ state: c2, path: [...epsPath, { from: c, to: t, symbol: '$' }, ...p2] })
        }
      }
    }
  }
  return result
}

function runMatch(states: StateNode[], startState: number, input: string): MatchResult {
  const steps: MatchStep[] = []
  let backtracks = 0
  let stepIndex = 0
  const startTime = performance.now()

  // NFA 回溯匹配 + 记忆化（多项式时间）：
  // finish(s, p) 返回从状态 s、输入位置 p 出发到接受态的最远终点及播放步骤序列。
  // 每个播放步骤是一段连续边：符号段（恰好 1 条消费字符边 + 其后 ε 闭包链）或
  // 纯零消费段（ε / ^ / $ 断言）。按 (s,p) 记忆化，零消费递归用访问集防环。
  interface SegStep { edgePath: StepEdge[] }
  interface FinishResult { end: number; segs: SegStep[] }
  const memo = new Map<string, FinishResult | null>()

  function finish(stateId: number, pos: number, zeroVisited: Set<number>): FinishResult | null {
    const k = stateId + ':' + pos
    if (zeroVisited.has(stateId)) return null
    if (memo.has(k)) return memo.get(k)!

    let best: FinishResult | null = null
    const consider = (r: FinishResult | null) => {
      if (r && (!best || r.end > best.end)) best = r
    }

    // 贪婪：先尝试消费一个字符继续延长，取所有分支里的最远终点
    if (pos < input.length) {
      const char = input[pos]
      for (const t of matchTransition(states[stateId], char)) {
        for (const [c, epsPath] of epsilonClosurePaths(states, t)) {
          const edgePath: StepEdge[] = [{ from: stateId, to: t, symbol: char }, ...epsPath]
          steps.push({
            stepIndex: stepIndex++,
            charIndex: pos,
            char,
            currentState: stateId,
            nextState: c,
            transition: char,
            isBacktrack: false,
            isMatch: true,
            edgePath
          })
          const sub = finish(c, pos + 1, new Set<number>())
          if (sub) consider({ end: sub.end, segs: [{ edgePath }, ...sub.segs] })
          else backtracks++
        }
      }
    }

    // 再零消费走 ε / ^ / $ 断言（不推进 pos）。成功时把本状态到 zs 的零消费
    // 前缀作为独立播放段拼到结果前，保证这些 ε/断言转移在画布上被正确高亮。
    const nextZero = new Set(zeroVisited)
    nextZero.add(stateId)
    for (const { state: zs, path: prefix } of zeroWidthPaths(states, stateId, pos, input.length)) {
      if (zs === stateId) continue
      const sub = finish(zs, pos, nextZero)
      if (sub) {
        const prefixSegs: SegStep[] = prefix.length ? [{ edgePath: prefix }] : []
        consider({ end: sub.end, segs: [...prefixSegs, ...sub.segs] })
      }
    }

    // 当前状态本身是接受态：可在 pos 结束（贪婪分支已先尝试延长，此处为兜底短终点）
    if (states[stateId].isAccept) consider({ end: pos, segs: [] })

    memo.set(k, best)
    return best
  }

  function tryFrom(startPos: number): FinishResult | null {
    memo.clear()
    return finish(startState, startPos, new Set<number>())
  }

  // 依次尝试每个起始位置（无 ^ 时等价搜索）
  let failSteps: MatchStep[] = []
  let failBacktracks = 0
  for (let startPos = 0; startPos <= input.length; startPos++) {
    steps.length = 0
    backtracks = 0
    stepIndex = 0
    const result = tryFrom(startPos)
    if (result) {
      // 成功路径的每个播放段对应一个 MatchStep；纯 ε/断言段不推进字符位置
      const success: MatchStep[] = []
      let cp = startPos
      for (const seg of result.segs) {
        const ep = seg.edgePath
        const symbolEdge = ep.find(e => e.symbol !== null && e.symbol !== '^' && e.symbol !== '$')
        const anchorEdge = ep.find(e => e.symbol === '^' || e.symbol === '$')
        const isSymbol = !!symbolEdge
        success.push({
          stepIndex: success.length,
          charIndex: cp,
          char: isSymbol ? symbolEdge!.symbol! : '',
          currentState: ep[0].from,
          nextState: ep[ep.length - 1].to,
          transition: isSymbol ? symbolEdge!.symbol! : anchorEdge ? anchorEdge.symbol! : 'ε',
          isBacktrack: false,
          isMatch: true,
          edgePath: ep
        })
        if (isSymbol) cp++
      }
      const matchText = input.substring(startPos, result.end)
      const duration = performance.now() - startTime
      return {
        matched: true,
        matchText,
        groups: [matchText],
        steps: success,
        backtracks: 0,
        totalSteps: success.length,
        duration: Math.round(duration * 100) / 100
      }
    }
    // 保留探索步数最多的一次失败作为演示（部分匹配后失败比瞬间失败信息更多）
    if (steps.length > failSteps.length) {
      failSteps = steps.slice()
      failBacktracks = backtracks
    }
  }

  // 无匹配：保留失败探索步骤（含回溯标记），让画布能演示走到哪一步死亡
  const duration = performance.now() - startTime
  return {
    matched: false,
    matchText: '',
    groups: [],
    steps: failSteps.map((s, i) => ({ ...s, stepIndex: i })),
    backtracks: failBacktracks,
    totalSteps: failSteps.length,
    duration: Math.round(duration * 100) / 100
  }
}

export function computeNFA(nfaResult: ReturnType<typeof buildNFA>): NFA {
  const nodes = nfaResult.states.map((s, i) => ({
    id: s.id,
    isStart: i === nfaResult.startState,
    isAccept: nfaResult.acceptStates.includes(s.id),
    x: 0, y: 0
  }))

  // Layout: circular
  const cx = 400, cy = 300, radius = 200
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2
    n.x = cx + Math.cos(angle) * radius
    n.y = cy + Math.sin(angle) * radius
  })

  const transitions: any[] = []
  nfaResult.states.forEach(s => {
    s.transitions.forEach((targets, symbol) => {
      targets.forEach(t => {
        transitions.push({ from: s.id, to: t, symbol: symbol.startsWith('__') ? symbol.replace('__', '') : symbol, label: symbol.startsWith('__') ? symbol.replace('__', '') : symbol })
      })
    })
    s.epsilonTransitions.forEach(t => {
      transitions.push({ from: s.id, to: t, symbol: null, label: 'ε' })
    })
  })

  return { states: nodes, transitions, startState: nfaResult.startState, acceptStates: nfaResult.acceptStates }
}

export function parseAST(pattern: string): ASTNode {
  let pos = 0
  let groupIdx = 0

  function parseAtom(): ASTNode {
    const ch = pattern[pos]
    if (ch === '(') {
      pos++
      if (pattern[pos] === '?') { pos++; if (pattern[pos] === ':') pos++ }
      else groupIdx++
      const node = parseOr()
      if (pattern[pos] === ')') pos++
      return { type: 'group', children: [node], groupIndex: groupIdx }
    }
    if (ch === '[') {
      pos++
      let cls = ''
      while (pos < pattern.length && pattern[pos] !== ']') { cls += pattern[pos]; pos++ }
      pos++
      return { type: 'charclass', value: cls }
    }
    if (ch === '.') { pos++; return { type: 'dot' } }
    if (ch === '\\') {
      pos++
      const e = pattern[pos]; pos++
      if (e === 'd') return { type: 'digit' }
      if (e === 'w') return { type: 'word' }
      if (e === 's') return { type: 'space' }
      return { type: 'char', value: e }
    }
    if (ch === '^' || ch === '$') { pos++; return { type: 'anchor', value: ch } }
    pos++
    return { type: 'char', value: ch }
  }

  function parseQuantifier(): ASTNode {
    let node = parseAtom()
    while (pos < pattern.length && ['*', '+', '?', '{'].includes(pattern[pos])) {
      const q = pattern[pos]
      if (q === '{') {
        while (pos < pattern.length && pattern[pos] !== '}') pos++
        pos++
      } else {
        pos++
      }
      const type = q === '*' ? 'star' : q === '+' ? 'plus' : 'question'
      node = { type, children: [node] }
      if (pos < pattern.length && pattern[pos] === '?') pos++
    }
    return node
  }

  function parseConcat(): ASTNode {
    const nodes: ASTNode[] = []
    while (pos < pattern.length && !['|', ')'].includes(pattern[pos])) {
      nodes.push(parseQuantifier())
    }
    if (nodes.length === 1) return nodes[0]
    return { type: 'concat', children: nodes }
  }

  function parseOr(): ASTNode {
    let left = parseConcat()
    while (pos < pattern.length && pattern[pos] === '|') {
      pos++
      const right = parseConcat()
      left = { type: 'or', children: [left, right] }
    }
    return left
  }

  return parseOr()
}

export const useRegexStore = defineStore('regex', () => {
  const pattern = ref('^([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+)\\.([a-zA-Z]{2,})$')
  const testString = ref('user@example.com admin@mail.org invalid-email')
  const currentStep = ref(-1) // -1 = 空闲：画布、列表、详情均无激活路径
  const isPlaying = ref(false)
  const nfa = ref<NFA | null>(null)
  const matchResult = ref<MatchResult | null>(null)
  const ast = ref<ASTNode | null>(null)
  const error = ref('')
  const selectedTemplate = ref<string>('')
  let playTimer: ReturnType<typeof setInterval> | null = null

  const groupColors = GROUP_COLORS

  function clearPlayTimer() {
    if (playTimer !== null) {
      clearInterval(playTimer)
      playTimer = null
    }
  }

  const matchHighlight = computed(() => {
    if (!matchResult.value || !matchResult.value.matched) return null
    const matchText = matchResult.value.matchText
    const idx = testString.value.indexOf(matchText)
    if (idx === -1) return null
    return {
      before: testString.value.substring(0, idx),
      match: matchText,
      after: testString.value.substring(idx + matchText.length)
    }
  })

  function execute() {
    // 任何重新执行都先停止播放，避免旧定时器继续推进新结果造成跳步/错位
    clearPlayTimer()
    isPlaying.value = false
    try {
      const built = buildNFA(pattern.value)
      const nextNfa = computeNFA(built)
      const nextResult = runMatch(built.states, built.startState, testString.value)
      const nextAst = parseAST(pattern.value)
      // 构建成功后整体替换，保证图、布局、统计来自同一次计算且不重复
      nfa.value = nextNfa
      matchResult.value = nextResult
      ast.value = nextAst
      error.value = ''
      currentStep.value = -1
    } catch (e: any) {
      // 模式失败：保留上一张有效图与上一份结果，仅更新错误信息并清空激活态
      error.value = e.message || '正则表达式解析错误'
      currentStep.value = -1
    }
  }

  // 两个输入入口（编辑器、模板库）统一走这里，结果区域同步且只执行一次
  function updateInputs(p: string, s: string) {
    pattern.value = p
    testString.value = s
    execute()
  }

  function setPattern(p: string) {
    pattern.value = p
    execute()
  }

  function setTestString(s: string) {
    testString.value = s
    execute()
  }

  function applyTemplate(t: RegexTemplate) {
    selectedTemplate.value = t.name
    updateInputs(t.pattern, t.testString)
  }

  function stepForward() {
    if (isPlaying.value) return
    if (matchResult.value && currentStep.value < matchResult.value.steps.length - 1) {
      currentStep.value++
    }
  }

  function stepBackward() {
    if (currentStep.value > -1) currentStep.value--
  }

  function resetStep() {
    clearPlayTimer()
    isPlaying.value = false
    currentStep.value = -1
  }

  function play() {
    if (!matchResult.value || matchResult.value.steps.length === 0) return
    clearPlayTimer() // 防止重复点击叠加多个定时器
    if (currentStep.value >= matchResult.value.steps.length - 1) currentStep.value = -1
    isPlaying.value = true
    playTimer = setInterval(() => {
      if (matchResult.value && currentStep.value < matchResult.value.steps.length - 1) {
        currentStep.value++
      } else {
        // 播放结束：停止并清空激活状态
        clearPlayTimer()
        isPlaying.value = false
        currentStep.value = -1
      }
    }, 200)
  }

  function stop() {
    clearPlayTimer()
    isPlaying.value = false
  }

  return {
    pattern, testString, currentStep, isPlaying, nfa, matchResult, ast, error,
    selectedTemplate, groupColors, matchHighlight,
    execute, updateInputs, setPattern, setTestString, applyTemplate,
    stepForward, stepBackward, resetStep, play, stop
  }
})
