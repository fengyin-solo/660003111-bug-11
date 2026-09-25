import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NFA, MatchResult, MatchStep, RegexTemplate, ASTNode } from '../types'

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
  { name: '文件扩展名', pattern: '.+\\.(\\w+)$', description: '提取文件扩展名', testString: 'image.png doc.pdf index.html', category: '前端' },
  { name: '经纬度', pattern: '^(\\-?\\d{1,3}\\.\\d+)\\s*,\\s*(\\-?\\d{1,3}\\.\\d+)$', description: '匹配经纬度坐标', testString: '116.404,39.915 -73.9857,40.7484', category: '地理' },
  { name: '版本号', pattern: '^(\\d+)\\.(\\d+)\\.(\\d+)(?:-(\\w+))?$', description: '语义化版本号x.y.z-tag', testString: '1.0.0 2.3.1-beta 10.20.30', category: '常用' },
  { name: '时间格式', pattern: '^([01]?\\d|2[0-3]):([0-5]\\d)(?::([0-5]\\d))?$', description: 'HH:MM或HH:MM:SS', testString: '14:30 23:59:59 00:00', category: '常用' }
]

interface SymbolTransition {
  /** 展示与边判定共用的唯一标签口径 */
  label: string
  /** 该转移对输入字符的统一判定规则（阈值/口径单一来源） */
  test: (ch: string) => boolean
  targets: number[]
}

interface StateNode {
  id: number
  isAccept: boolean
  symbolTransitions: SymbolTransition[]
  epsilonTransitions: number[]
}

/** NFA 片段 [起点, 终点]；null 表示零宽锚点（不产生状态） */
type Seg = [number, number] | null

const isDigit = (ch: string) => ch >= '0' && ch <= '9'
const isWord = (ch: string) => /\w/.test(ch)
const isSpace = (ch: string) => /\s/.test(ch)

/** 重复次数的统一上限，防止 {n,m} 展开失控 */
const MAX_REPEAT = 200

function buildNFA(pattern: string): { states: StateNode[]; startState: number; acceptStates: number[]; anchoredStart: boolean; anchoredEnd: boolean } {
  const states: StateNode[] = []
  let stateCounter = 0
  let pos = 0
  /** 最近一个原子的源码区间，供 {n,m} 重新解析复制 */
  let atomSourceStart = 0
  let atomSourceEnd = 0
  /** 锚点：匹配执行时按这两个标志用同一规则约束起止位置 */
  let anchoredStart = false
  let anchoredEnd = false

  function newState(): number {
    const id = stateCounter++
    states.push({ id, isAccept: false, symbolTransitions: [], epsilonTransitions: [] })
    return id
  }

  function addTransition(from: number, tr: Omit<SymbolTransition, 'targets'>, to: number) {
    states[from].symbolTransitions.push({ label: tr.label, test: tr.test, targets: [to] })
  }

  function addEpsilon(from: number, to: number) {
    states[from].epsilonTransitions.push(to)
  }

  /** 解析 {n} / {n,} / {n,m}，统一的量词阈值/上限口径；非法写法直接抛错 */
  function parseBrace(): { min: number; max: number } {
    const start = pos
    pos++ // skip {
    let min = 0
    while (pos < pattern.length && isDigit(pattern[pos])) {
      min = min * 10 + (pattern.charCodeAt(pos) - 48)
      pos++
    }
    let max: number = min
    if (pattern[pos] === ',') {
      pos++
      max = Infinity
      let maxVal = 0
      let hasDigits = false
      while (pos < pattern.length && isDigit(pattern[pos])) {
        maxVal = maxVal * 10 + (pattern.charCodeAt(pos) - 48)
        hasDigits = true
        pos++
      }
      if (hasDigits) max = maxVal
    }
    if (pattern[pos] !== '}') throw new Error(`量词缺少 "}"：${pattern.slice(start, pos)}`)
    pos++ // skip }
    if (max < min) throw new Error(`量词下限不能大于上限：{${min},${max === Infinity ? '' : max}}`)
    // 上限只约束有限量词；无界 {n,} 不展开（循环边实现），不受此限制
    if ((Number.isFinite(max) ? (max as number) : 0) > MAX_REPEAT || min > MAX_REPEAT) {
      throw new Error(`重复次数超出上限 ${MAX_REPEAT}`)
    }
    return { min, max }
  }

  function parseCharClass(): Omit<SymbolTransition, 'targets'> {
    const start = pos
    pos++ // skip [
    const negative = pattern[pos] === '^'
    if (negative) pos++
    const ranges: [string, string][] = []
    const chars: string[] = []
    const predicates: ((ch: string) => boolean)[] = []

    function readChar(): string {
      if (pos >= pattern.length) throw new Error('字符类未闭合：缺少 "]"')
      if (pattern[pos] !== '\\') return pattern[pos++]
      pos++ // skip backslash
      const e = pattern[pos]
      if (e === undefined) throw new Error('非法的转义结尾：\\')
      pos++
      if (e === 'd') { predicates.push(isDigit); return '' }
      if (e === 'w') { predicates.push(isWord); return '' }
      if (e === 's') { predicates.push(isSpace); return '' }
      if (e === 'D') { predicates.push((ch) => !isDigit(ch)); return '' }
      if (e === 'W') { predicates.push((ch) => !isWord(ch)); return '' }
      if (e === 'S') { predicates.push((ch) => !isSpace(ch)); return '' }
      if (e === 'n') return '\n'
      if (e === 't') return '\t'
      if (e === 'r') return '\r'
      if (e === 'u' || e === 'x') {
        const len = e === 'u' ? 4 : 2
        const hex = pattern.slice(pos, pos + len)
        if (hex.length < len || !/^[0-9a-fA-F]+$/.test(hex)) throw new Error(`非法的 \\${e} 转义：\\${hex}`)
        pos += len
        return String.fromCharCode(parseInt(hex, 16))
      }
      // \] \- \^ \\ \. 等一律按字面量
      return e
    }

    while (pos < pattern.length && pattern[pos] !== ']') {
      const first = readChar()
      if (first !== '' && pattern[pos] === '-' && pattern[pos + 1] !== undefined && pattern[pos + 1] !== ']') {
        pos++ // skip -
        const second = readChar()
        if (second === '') continue
        if (first.charCodeAt(0) > second.charCodeAt(0)) throw new Error(`字符类区间非法：${first}-${second}`)
        ranges.push([first, second])
      } else if (first !== '') {
        chars.push(first)
      }
    }
    if (pattern[pos] !== ']') throw new Error('字符类未闭合：缺少 "]"')
    pos++ // skip ]
    const label = pattern.slice(start, pos)
    const test = (ch: string) => {
      const hit = chars.includes(ch) ||
        ranges.some(([s, e]) => ch >= s && ch <= e) ||
        predicates.some(fn => fn(ch))
      return negative ? !hit : hit
    }
    return { label, test }
  }

  /** 单个原子（不含量词），返回片段起止状态；锚点等零宽原子返回 null；matcher 始终挂在源状态的转移上 */
  function parseAtomOnce(): Seg {
    if (pos >= pattern.length) throw new Error('量词前缺少表达式')
    const ch = pattern[pos]
    if (ch === '(') {
      pos++
      if (pattern[pos] === '?') {
        pos++
        if (pattern[pos] !== ':') throw new Error('不支持的分组语法，仅支持 (?:...) 非捕获组')
        pos++
      }
      const [s, e] = parseOr()
      if (pattern[pos] !== ')') throw new Error('分组未闭合：缺少 ")"')
      pos++
      return [s, e]
    }
    if (ch === '[') {
      const segStart = newState()
      const segEnd = newState()
      addTransition(segStart, parseCharClass(), segEnd)
      return [segStart, segEnd]
    }
    if (ch === '.') {
      const segStart = newState()
      const segEnd = newState()
      addTransition(segStart, { label: '.', test: (c) => c !== '\n' }, segEnd)
      pos++
      return [segStart, segEnd]
    }
    if (ch === '\\') {
      pos++
      const escaped = pattern[pos]
      if (escaped === undefined) throw new Error('非法的转义结尾：\\')
      pos++
      const segStart = newState()
      const segEnd = newState()
      if (escaped === 'd') addTransition(segStart, { label: '\\d', test: isDigit }, segEnd)
      else if (escaped === 'w') addTransition(segStart, { label: '\\w', test: isWord }, segEnd)
      else if (escaped === 's') addTransition(segStart, { label: '\\s', test: isSpace }, segEnd)
      else if (escaped === 'D') addTransition(segStart, { label: '\\D', test: (c) => !isDigit(c) }, segEnd)
      else if (escaped === 'W') addTransition(segStart, { label: '\\W', test: (c) => !isWord(c) }, segEnd)
      else if (escaped === 'S') addTransition(segStart, { label: '\\S', test: (c) => !isSpace(c) }, segEnd)
      else addTransition(segStart, { label: escaped, test: (c) => c === escaped }, segEnd)
      return [segStart, segEnd]
    }
    if (ch === '^' || ch === '$') {
      // 锚点不产生任何 NFA 状态：仅设置标志位，由执行器用同一规则判定位置
      if (ch === '^') anchoredStart = true
      else anchoredEnd = true
      pos++
      return null
    }
    if (ch === ')' || ch === '|' || ch === '}') throw new Error(`非法字符 "${ch}"`)
    const segStart = newState()
    const segEnd = newState()
    addTransition(segStart, { label: ch, test: (c) => c === ch }, segEnd)
    pos++
    return [segStart, segEnd]
  }

  function parseAtomTracked(): Seg {
    atomSourceStart = pos
    const r = parseAtomOnce()
    atomSourceEnd = pos
    return r
  }

  /** 从同一源码片段重新解析出一份独立的 NFA 副本（供 {n,m} 展开） */
  function buildCopy(): [number, number] {
    const savedPos = pos
    pos = atomSourceStart
    const r = parseAtomOnce()
    if (r === null || pos !== atomSourceEnd) {
      pos = savedPos
      throw new Error('量词不能作用于锚点 ^ 或 $')
    }
    pos = savedPos
    return r
  }

  /** 原子 + 量词链 */
  function parseQuantifiedAtom(): Seg {
    const atom = parseAtomTracked()
    if (atom === null) return null // 锚点零宽，量词循环不会进入（pos 已越过锚点字符）
    let [segStart, segEnd] = atom

    while (pos < pattern.length && ['*', '+', '?', '{'].includes(pattern[pos])) {
      const q = pattern[pos]

      if (q === '{') {
        const { min, max } = parseBrace()
        if (pattern[pos] === '?') pos++ // 惰性标记，NFA 结构等价

        const copies: [number, number][] = [[segStart, segEnd]]
        const qStart = copies[0][0]
        const qEnd = newState()

        if (!Number.isFinite(max)) {
          // {n,}：n 个必选副本 + 单个循环体（Thompson 标准构造）
          // 必选部分
          for (let k = 1; k < min; k++) copies.push(buildCopy())
          for (let k = 0; k < copies.length - 1; k++) addEpsilon(copies[k][1], copies[k + 1][0])
          const lastIdx = copies.length - 1
          if (min === 0) {
            // {0,} 等价于 *：qStart 即可结束，也可进循环体
            const [loopStart, loopEnd] = buildCopy()
            addEpsilon(qStart, qEnd)
            addEpsilon(qStart, loopStart)
            addEpsilon(loopEnd, loopStart)
            addEpsilon(loopEnd, qEnd)
          } else {
            // 达到 n 次后：结束或进入循环体继续重复
            const [loopStart, loopEnd] = buildCopy()
            addEpsilon(copies[lastIdx][1], qEnd)
            addEpsilon(copies[lastIdx][1], loopStart)
            addEpsilon(loopEnd, loopStart)
            addEpsilon(loopEnd, qEnd)
          }
        } else {
          // {n,m}：m 个副本线性串联，第 n..m 个之后均可结束
          const maxCount = max as number
          for (let k = 1; k < maxCount; k++) copies.push(buildCopy())
          for (let k = 0; k < copies.length - 1; k++) addEpsilon(copies[k][1], copies[k + 1][0])
          if (min === 0) addEpsilon(qStart, qEnd) // 零次即可接受
          if (min >= 1) addEpsilon(copies[min - 1][1], qEnd)
          for (let k = min; k < copies.length; k++) addEpsilon(copies[k][1], qEnd)
        }
        segStart = qStart
        segEnd = qEnd
        continue
      }

      pos++
      const qStart = newState()
      const qEnd = newState()
      addEpsilon(qStart, segStart)
      if (q === '*') { addEpsilon(qStart, qEnd); addEpsilon(segEnd, qEnd); addEpsilon(segEnd, segStart) }
      else if (q === '+') { addEpsilon(segEnd, qEnd); addEpsilon(segEnd, segStart) }
      else { addEpsilon(qStart, qEnd); addEpsilon(segEnd, qEnd) } // ?
      segStart = qStart
      segEnd = qEnd
      if (pattern[pos] === '?') pos++ // 惰性标记，NFA 结构等价
    }
    return [segStart, segEnd]
  }

  function parseConcat(): [number, number] {
    let start: number | null = null
    let end = -1
    while (pos < pattern.length && !['|', ')'].includes(pattern[pos])) {
      const seg = parseQuantifiedAtom()
      if (seg === null) continue // 零宽锚点已被吸收为标志位
      const [segStart, segEnd] = seg
      if (start === null) start = segStart
      else addEpsilon(end, segStart)
      end = segEnd
    }
    if (start === null) {
      // 空表达式（如 ()、| 的空分支、纯锚点）：单个零宽状态
      start = newState()
      end = start
    }
    return [start, end]
  }

  function parseOr(): [number, number] {
    let [start, end] = parseConcat()
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
  if (pos !== pattern.length) throw new Error(`无法解析的残余字符：${pattern.slice(pos)}`)
  states[acceptState].isAccept = true
  return { states, startState, acceptStates: [acceptState], anchoredStart, anchoredEnd }
}

function epsilonClosure(states: StateNode[], stateId: number): Set<number> {
  const closure = new Set<number>([stateId])
  const stack = [stateId]
  while (stack.length) {
    const s = stack.pop()!
    for (const next of states[s].epsilonTransitions) {
      if (!closure.has(next)) {
        closure.add(next)
        stack.push(next)
      }
    }
  }
  return closure
}

interface FiredTransition { source: number; label: string; target: number }

function matchTransitions(state: StateNode, symbol: string): FiredTransition[] {
  const results: FiredTransition[] = []
  for (const tr of state.symbolTransitions) {
    // 画布高亮与匹配执行共用同一条 test、同一套阈值
    if (tr.test(symbol)) {
      for (const target of tr.targets) results.push({ source: state.id, label: tr.label, target })
    }
  }
  return results
}

function runMatch(
  states: StateNode[],
  startState: number,
  input: string,
  anchoredStart: boolean,
  anchoredEnd: boolean
): MatchResult {
  const startTime = performance.now()
  let backtracks = 0

  // 锚点的统一口径：把输入按空白切成多个样例 token，^/$ 约束 token 边界。
  // 单串输入时 token 即整个字符串，行为等同标准 ^/$；多串示例以空白分隔。
  // 画布/结果/统计共用同一规则、同一标准。
  const atStartBoundary = (pos: number) => pos === 0 || /\s/.test(input[pos - 1])
  const atEndBoundary = (pos: number) => pos === input.length || /\s/.test(input[pos])

  for (let startPos = 0; startPos <= input.length; startPos++) {
    if (anchoredStart && !atStartBoundary(startPos)) continue
    const steps: MatchStep[] = []
    let stepIndex = 0
    let currentStates = Array.from(epsilonClosure(states, startState))
    // 贪婪：记录到目前为止最长的接受位置，继续尝试吃更多字符
    const acceptsAt = (frontier: number[], pos: number) => {
      if (!frontier.some(s => states[s].isAccept)) return false
      return !anchoredEnd || atEndBoundary(pos)
    }
    let bestEnd = acceptsAt(currentStates, startPos) ? startPos : -1

    for (let i = startPos; i < input.length; i++) {
      const char = input[i]
      const fired: FiredTransition[] = []
      const nextSeen = new Set<number>()
      const nextStates: number[] = []

      for (const s of currentStates) {
        for (const hit of matchTransitions(states[s], char)) {
          if (!fired.some(f => f.source === hit.source && f.target === hit.target && f.label === hit.label)) {
            fired.push(hit)
          }
          for (const c of epsilonClosure(states, hit.target)) {
            if (!nextSeen.has(c)) {
              nextSeen.add(c)
              nextStates.push(c)
            }
          }
        }
      }

      if (nextStates.length === 0) {
        // 本起点走死：统一生成一条 FAIL 步，前沿为空（画布不残留任何激活）
        backtracks++
        steps.push({
          stepIndex: stepIndex++,
          charIndex: i,
          char,
          currentState: currentStates[0] ?? -1,
          nextState: -1,
          transition: 'FAIL',
          isBacktrack: true,
          isMatch: false,
          activeStates: []
        })
        break
      }

      // 同一字符的所有步共享同一个完整激活前沿——节点高亮的唯一口径
      for (const f of fired) {
        steps.push({
          stepIndex: stepIndex++,
          charIndex: i,
          char,
          currentState: f.source,
          nextState: f.target,
          transition: f.label,
          isBacktrack: false,
          isMatch: true,
          activeStates: nextStates
        })
      }

      currentStates = nextStates
      if (acceptsAt(currentStates, i + 1)) bestEnd = i + 1
    }

    if (bestEnd >= 0) {
      // 截断到最长接受点：走死后的 FAIL 步、或越过接受点后的残余步都不属于成功路径
      const successSteps = steps
        .filter(st => !st.isBacktrack && st.charIndex >= startPos && st.charIndex < bestEnd)
        .map((st, i) => ({ ...st, stepIndex: i })) // 重新编号，保证播放/列表/统计口径连续一致
      const matchText = input.substring(startPos, bestEnd)
      const duration = performance.now() - startTime
      return {
        matched: true,
        matchText,
        matchStart: startPos,
        groups: [matchText],
        steps: successSteps,
        backtracks,
        totalSteps: successSteps.length,
        duration: Math.round(duration * 100) / 100
      }
    }
    // 输入消费完仍未接受（如要求 $ 结尾但长度不符）：继续尝试下一个起点
  }

  const duration = performance.now() - startTime
  return {
    matched: false,
    matchText: '',
    matchStart: -1,
    groups: [],
    steps: [],
    backtracks,
    totalSteps: 0,
    duration: Math.round(duration * 100) / 100
  }
}

export function computeNFA(nfaResult: ReturnType<typeof buildNFA>): NFA {
  const nodes = nfaResult.states.map((s) => ({
    id: s.id,
    isStart: s.id === nfaResult.startState,
    isAccept: nfaResult.acceptStates.includes(s.id),
    x: 0, y: 0
  }))

  // 固定圆形布局：同一规则、同一半径，重新执行不产生重复/漂移
  const cx = 400, cy = 300, radius = 200
  nodes.forEach((n, i) => {
    const angle = (i / nodes.length) * Math.PI * 2
    n.x = cx + Math.cos(angle) * radius
    n.y = cy + Math.sin(angle) * radius
  })

  // 边按 “from->to::label” 唯一口径去重，重新执行布局不重复
  const seen = new Set<string>()
  const transitions: NFA['transitions'] = []
  const pushEdge = (from: number, to: number, symbol: string | null, label: string) => {
    const key = `${from}->${to}::${label}`
    if (seen.has(key)) return
    seen.add(key)
    transitions.push({ from, to, symbol, label })
  }

  nfaResult.states.forEach(s => {
    for (const tr of s.symbolTransitions) {
      for (const t of tr.targets) pushEdge(s.id, t, tr.label, tr.label)
    }
    for (const t of s.epsilonTransitions) pushEdge(s.id, t, null, 'ε')
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
      const capturing = pattern[pos] !== '?'
      if (pattern[pos] === '?') { pos++; if (pattern[pos] === ':') pos++ }
      if (capturing) groupIdx++
      const node = parseOr()
      if (pattern[pos] === ')') pos++
      return { type: 'group', children: [node], groupIndex: capturing ? groupIdx : undefined }
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
        pos++
        let min = 0
        while (pos < pattern.length && isDigit(pattern[pos])) {
          min = min * 10 + (pattern.charCodeAt(pos) - 48)
          pos++
        }
        let max: number = min
        if (pattern[pos] === ',') {
          pos++
          max = Infinity
          let maxVal = 0
          let hasDigits = false
          while (pos < pattern.length && isDigit(pattern[pos])) {
            maxVal = maxVal * 10 + (pattern.charCodeAt(pos) - 48)
            hasDigits = true
            pos++
          }
          if (hasDigits) max = maxVal
        }
        if (pattern[pos] === '}') pos++
        node = { type: 'repeat', min, max: Number.isFinite(max) ? max : undefined, children: [node] }
      } else {
        pos++
        const type = q === '*' ? 'star' : q === '+' ? 'plus' : 'question'
        node = { type, children: [node] }
      }
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
  const currentStep = ref(-1) // -1 = 无激活（初始/重置/播放结束），任何视图共用此口径
  const isPlaying = ref(false)
  const nfa = ref<NFA | null>(null)
  const matchResult = ref<MatchResult | null>(null)
  const ast = ref<ASTNode | null>(null)
  const error = ref('')
  const selectedTemplate = ref<string>('')

  const groupColors = GROUP_COLORS

  let playTimer: ReturnType<typeof setInterval> | null = null
  function clearPlayback() {
    if (playTimer !== null) {
      clearInterval(playTimer)
      playTimer = null
    }
    isPlaying.value = false
  }

  const matchHighlight = computed(() => {
    const r = matchResult.value
    if (!r || !r.matched || r.matchStart < 0) return null
    return {
      before: testString.value.substring(0, r.matchStart),
      match: r.matchText,
      after: testString.value.substring(r.matchStart + r.matchText.length)
    }
  })

  const stepCount = computed(() => matchResult.value?.steps.length ?? 0)

  function execute() {
    // 先在局部变量上构建/执行：全部成功后才提交；失败则保留上一张有效图与上一份结果
    try {
      const built = buildNFA(pattern.value)
      const nextNfa = computeNFA(built)
      const nextResult = runMatch(built.states, built.startState, testString.value, built.anchoredStart, built.anchoredEnd)
      const nextAst = parseAST(pattern.value)

      clearPlayback()
      nfa.value = nextNfa
      matchResult.value = nextResult
      ast.value = nextAst
      error.value = ''
      currentStep.value = nextResult.matched && nextResult.steps.length > 0 ? 0 : -1
    } catch (e: any) {
      // 保留 nfa / matchResult / ast 不变，只记录错误并清空激活与播放状态
      clearPlayback()
      error.value = e?.message || '正则表达式解析错误'
      currentStep.value = -1
    }
  }

  function setPattern(p: string) {
    pattern.value = p
    selectedTemplate.value = '' // 手动改表达式后，模板列表不再保留旧选中路径
    execute()
  }

  function setTestString(s: string) {
    testString.value = s
    execute()
  }

  /** 输入框“执行匹配”按钮的单一入口：一次写入、一次执行、一次统计 */
  function applyInput(p: string, s: string) {
    pattern.value = p
    testString.value = s
    selectedTemplate.value = '' // 手动执行后模板列表不保留旧选中路径
    execute()
  }

  function applyTemplate(t: RegexTemplate) {
    clearPlayback()
    pattern.value = t.pattern
    testString.value = t.testString
    selectedTemplate.value = t.name
    execute()
  }

  function stepForward() {
    if (!matchResult.value || currentStep.value >= matchResult.value.steps.length - 1) return
    currentStep.value = currentStep.value < 0 ? 0 : currentStep.value + 1
  }

  function stepBackward() {
    if (currentStep.value > 0) currentStep.value--
  }

  function resetStep() {
    // 重置即清空激活状态（– / len），画布与结果区同步
    clearPlayback()
    currentStep.value = -1
  }

  function play() {
    if (!matchResult.value?.matched || matchResult.value.steps.length === 0) return
    clearPlayback()
    if (currentStep.value < 0 || currentStep.value >= matchResult.value.steps.length - 1) {
      currentStep.value = 0
    }
    isPlaying.value = true
    playTimer = setInterval(() => {
      if (matchResult.value && currentStep.value < matchResult.value.steps.length - 1) {
        currentStep.value++
      } else {
        // 播放结束：清空激活状态，而不是停在最后一帧
        clearPlayback()
        currentStep.value = -1
      }
    }, 200)
  }

  function stop() {
    clearPlayback()
  }

  return {
    pattern, testString, currentStep, isPlaying, nfa, matchResult, ast, error,
    selectedTemplate, groupColors, matchHighlight, stepCount,
    execute, setPattern, setTestString, applyInput, applyTemplate,
    stepForward, stepBackward, resetStep, play, stop
  }
})
