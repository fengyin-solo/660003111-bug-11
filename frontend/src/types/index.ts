export interface NFAState {
  id: number
  isStart: boolean
  isAccept: boolean
  x: number
  y: number
}

export interface NFATransition {
  from: number
  to: number
  symbol: string | null // null = epsilon
  label: string
}

export interface NFA {
  states: NFAState[]
  transitions: NFATransition[]
  startState: number
  acceptStates: number[]
}

export interface MatchStep {
  stepIndex: number
  charIndex: number
  char: string
  /** 真实走过的转移：源状态（FAIL 步可能为 -1） */
  currentState: number
  /** 真实走过的转移：目标状态（FAIL 步为 -1） */
  nextState: number
  /** 该转移上的符号（展示口径，ε 闭包已折叠在内） */
  transition: string
  isBacktrack: boolean
  isMatch: boolean
  /** 本步之后 NFA 激活前沿的完整状态集（节点高亮的唯一口径） */
  activeStates: number[]
}

export interface MatchResult {
  matched: boolean
  matchText: string
  /** 匹配串在测试串中的起始下标（高亮位置的唯一口径） */
  matchStart: number
  groups: string[]
  steps: MatchStep[]
  backtracks: number
  totalSteps: number
  duration: number
}

export interface RegexTemplate {
  name: string
  pattern: string
  description: string
  testString: string
  category: string
}

export interface ASTNode {
  type: 'char' | 'star' | 'plus' | 'question' | 'repeat' | 'or' | 'concat' | 'group' | 'dot' | 'anchor' | 'charclass' | 'digit' | 'word' | 'space'
  value?: string
  min?: number
  max?: number
  children?: ASTNode[]
  groupIndex?: number
}
