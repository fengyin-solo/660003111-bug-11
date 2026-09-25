<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-400">NFA 状态机可视化</h3>
      <span v-if="store.nfa" class="text-xs text-slate-500">{{ store.nfa.states.length }} 状态 · {{ store.nfa.transitions.length }} 转移</span>
    </div>
    <canvas ref="canvasRef" width="800" height="500" class="w-full bg-slate-900 rounded-lg border border-slate-700"></canvas>
    <div class="mt-2 flex gap-4 text-xs text-slate-500">
      <span><span class="inline-block w-3 h-3 rounded-full bg-cyan-500 mr-1"></span>起始状态</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span>接受状态</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-orange-500 mr-1"></span>当前激活</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-slate-600 mr-1"></span>普通状态</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRegexStore } from '../store/regex'
import type { NFATransition, StepEdge } from '../types'

// —— 全画布统一的判定口径：颜色、阈值、上限、边标识规则只在此定义一次 ——
const COLORS = {
  start: '#06b6d4',
  accept: '#22c55e',
  active: '#f97316',
  activeLabel: '#fbbf24',
  idle: '#475569',
  idleLabel: '#94a3b8',
}
const STATE_RADIUS = 20
const ACTIVE_HALO = 25
const EDGE_OFFSET = 20
const LABEL_OFFSET = 15

// 边的唯一标识：同一对状态间可能同时存在符号边与 ε 边，必须把 ε 口径计入键
function edgeKey(from: number, to: number, epsilon: boolean): string {
  return `${from}->${to}#${epsilon ? 'eps' : 'sym'}`
}

const store = useRegexStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

// 当前步骤对应的激活状态与激活边，均来自同一份 step.edgePath，
// 节点、连线、箭头、标签共用这一判定，不允许各处自行推断。
function getActive(): { states: Set<number>; edges: Set<string> } {
  const states = new Set<number>()
  const edges = new Set<string>()
  const steps = store.matchResult?.steps
  const step = steps && store.currentStep >= 0 ? steps[store.currentStep] : undefined
  if (step) {
    for (const e of step.edgePath) {
      states.add(e.from)
      states.add(e.to)
      edges.add(edgeKey(e.from, e.to, e.symbol === null))
    }
  }
  return { states, edges }
}

function isTransitionActive(t: NFATransition, activeEdges: Set<string>): boolean {
  return activeEdges.has(edgeKey(t.from, t.to, t.symbol === null))
}

// 计算连线的路径参数：起点、终点、二次贝塞尔控制点、末端切线角度（用于箭头）
function edgeGeometry(from: { x: number; y: number }, to: { x: number; y: number }, selfLoop: boolean) {
  if (selfLoop) {
    const sx = from.x + 14, sy = from.y - 15
    const cx = from.x + 28, cy = from.y - 38
    const ex = from.x + 10, ey = from.y - 15
    // t=1 处贝塞尔切线方向 = 终点 - 控制点
    const angle = Math.atan2(ey - cy, ex - cx)
    return { sx, sy, cx, cy, ex, ey, angle, lx: cx, ly: cy - 6 }
  }
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2
  const dx = to.x - from.x, dy = to.y - from.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const nx = -dy / len, ny = dx / len
  const cx = mx + nx * EDGE_OFFSET, cy = my + ny * EDGE_OFFSET
  const ex = to.x - (to.x - cx) / Math.hypot(to.x - cx, to.y - cy) * STATE_RADIUS * 1.1
  const ey = to.y - (to.y - cy) / Math.hypot(to.x - cx, to.y - cy) * STATE_RADIUS * 1.1
  const angle = Math.atan2(ey - cy, ex - cx)
  return { sx: from.x, sy: from.y, cx, cy, ex, ey, angle, lx: mx + nx * LABEL_OFFSET, ly: my + ny * LABEL_OFFSET }
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 无论是否存在 NFA 都先清屏，确保切换到无匹配/失败输入后旧路径不残留
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!store.nfa) return

  const { states: activeStates, edges: activeEdges } = getActive()

  // Draw transitions
  store.nfa.transitions.forEach(t => {
    const from = store.nfa!.states.find(s => s.id === t.from)
    const to = store.nfa!.states.find(s => s.id === t.to)
    if (!from || !to) return

    const active = isTransitionActive(t, activeEdges)
    const g = edgeGeometry(from, to, t.from === t.to)

    ctx.strokeStyle = active ? COLORS.active : COLORS.idle
    ctx.lineWidth = active ? 2.5 : 1
    ctx.beginPath()
    ctx.moveTo(g.sx, g.sy)
    ctx.quadraticCurveTo(g.cx, g.cy, g.ex, g.ey)
    ctx.stroke()

    // Arrowhead：沿曲线末端切线方向，与线身一致不错位
    ctx.beginPath()
    ctx.moveTo(g.ex, g.ey)
    ctx.lineTo(g.ex - Math.cos(g.angle - 0.4) * 8, g.ey - Math.sin(g.angle - 0.4) * 8)
    ctx.lineTo(g.ex - Math.cos(g.angle + 0.4) * 8, g.ey - Math.sin(g.angle + 0.4) * 8)
    ctx.closePath()
    ctx.fillStyle = active ? COLORS.active : COLORS.idle
    ctx.fill()

    // Label
    ctx.fillStyle = active ? COLORS.activeLabel : COLORS.idleLabel
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t.label, g.lx, g.ly)
  })

  // Draw states
  store.nfa.states.forEach(s => {
    const active = activeStates.has(s.id)

    if (active) {
      // 激活光环：对起始/接受/普通态使用同一标准，激活一定可见
      ctx.beginPath()
      ctx.arc(s.x, s.y, ACTIVE_HALO, 0, Math.PI * 2)
      ctx.strokeStyle = COLORS.activeLabel
      ctx.lineWidth = 2
      ctx.stroke()
    }

    const color = active ? COLORS.active : s.isStart ? COLORS.start : s.isAccept ? COLORS.accept : COLORS.idle
    ctx.beginPath()
    ctx.arc(s.x, s.y, STATE_RADIUS, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = active ? COLORS.activeLabel : '#1e293b'
    ctx.lineWidth = 2
    ctx.stroke()

    if (s.isAccept) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 15, 0, Math.PI * 2)
      ctx.strokeStyle = '#16a34a'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    ctx.fillStyle = '#f1f5f9'
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(s.id), s.x, s.y)

    if (s.isStart) {
      ctx.beginPath()
      ctx.moveTo(s.x - 40, s.y)
      ctx.lineTo(s.x - 22, s.y)
      ctx.strokeStyle = COLORS.start
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s.x - 22, s.y)
      ctx.lineTo(s.x - 28, s.y - 4)
      ctx.lineTo(s.x - 28, s.y + 4)
      ctx.closePath()
      ctx.fillStyle = COLORS.start
      ctx.fill()
    }
  })
}

onMounted(draw)
// 图、结果、步骤任一变化都按统一口径重绘；引用整体替换，无需 deep
watch(() => [store.nfa, store.matchResult, store.currentStep], draw)
</script>
