<template>
  <div class="bg-slate-800 rounded-lg p-4 border border-slate-700">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-bold text-slate-400">NFA 状态机可视化</h3>
      <span v-if="store.nfa" class="text-xs text-slate-500">{{ store.nfa.states.length }} 状态 · {{ store.nfa.transitions.length }} 转移</span>
    </div>
    <canvas ref="canvasRef" width="800" height="500" class="w-full bg-slate-900 rounded-lg border border-slate-700"></canvas>
    <div class="mt-2 flex gap-4 text-xs text-slate-500 flex-wrap">
      <span><span class="inline-block w-3 h-3 rounded-full bg-cyan-500 mr-1"></span>起始状态</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-green-500 mr-1"></span>接受状态</span>
      <span><span class="inline-block w-3 h-3 rounded-full ring-2 ring-orange-400 mr-1"></span>当前激活</span>
      <span><span class="inline-block w-3 h-3 rounded-full bg-slate-600 mr-1"></span>普通状态</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRegexStore } from '../store/regex'

const store = useRegexStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const NODE_R = 20

/** 当前步骤视图模型：节点集合、连线、结果三处共用的唯一口径 */
function activeView() {
  const result = store.matchResult
  const idx = store.currentStep
  if (!result || !result.matched || idx < 0 || idx >= result.steps.length) {
    return { nodeIds: new Set<number>(), edgeKey: null as string | null }
  }
  const step = result.steps[idx]
  const nodeIds = new Set<number>(step.activeStates)
  let edgeKey: string | null = null
  if (!step.isBacktrack && step.currentState >= 0 && step.nextState >= 0) {
    nodeIds.add(step.currentState)
    nodeIds.add(step.nextState)
    // 与 computeNFA 去重完全一致的边键：同一规则、同一标准
    edgeKey = `${step.currentState}->${step.nextState}::${step.transition}`
  }
  return { nodeIds, edgeKey }
}

/** 求二次贝塞尔在 t 处的点 */
function quadPoint(p0: { x: number; y: number }, pc: { x: number; y: number }, p1: { x: number; y: number }, t: number) {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * pc.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * pc.y + t * t * p1.y
  }
}

/** 二次贝塞尔在 t 处的切角 */
function quadAngle(p0: { x: number; y: number }, pc: { x: number; y: number }, p1: { x: number; y: number }, t: number) {
  const dx = 2 * (1 - t) * (pc.x - p0.x) + 2 * t * (p1.x - pc.x)
  const dy = 2 * (1 - t) * (pc.y - p0.y) + 2 * t * (p1.y - pc.y)
  return Math.atan2(dy, dx)
}

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.clearRect(0, 0, canvas.width, canvas.height)
  if (!store.nfa) return

  const { nodeIds: activeNodeIds, edgeKey } = activeView()

  // 同一对节点之间可能存在多条平行边，按序号做对称偏移，避免错位重叠
  const pairCount = new Map<string, number>()
  const pairIndex = new Map<string, number>()
  store.nfa.transitions.forEach(t => {
    const key = `${Math.min(t.from, t.to)}->${Math.max(t.from, t.to)}`
    if (t.from !== t.to) {
      pairIndex.set(`${t.from}->${t.to}::${t.label}`, pairCount.get(key) ?? 0)
      pairCount.set(key, (pairCount.get(key) ?? 0) + 1)
    }
  })

  // Draw transitions
  store.nfa.transitions.forEach(t => {
    const from = store.nfa!.states.find(s => s.id === t.from)
    const to = store.nfa!.states.find(s => s.id === t.to)
    if (!from || !to) return

    const key = `${t.from}->${t.to}::${t.label}`
    const isActive = key === edgeKey
    ctx.strokeStyle = isActive ? '#f97316' : '#475569'
    ctx.fillStyle = isActive ? '#f97316' : '#475569'
    ctx.lineWidth = isActive ? 2.5 : 1

    let p0: { x: number; y: number }
    let pc: { x: number; y: number }
    let p1: { x: number; y: number }
    let labelPos: { x: number; y: number }

    if (t.from === t.to) {
      // 自环：节点正上方的弧，起止点对称
      p0 = { x: from.x - 12, y: from.y - 16 }
      p1 = { x: from.x + 12, y: from.y - 16 }
      pc = { x: from.x, y: from.y - 60 }
      labelPos = { x: from.x, y: from.y - 64 }
    } else {
      // 起终点收缩到节点圆周，避免线段穿入/错位到相邻节点
      const baseDx = to.x - from.x
      const baseDy = to.y - from.y
      const baseLen = Math.sqrt(baseDx * baseDx + baseDy * baseDy) || 1
      const ux = baseDx / baseLen
      const uy = baseDy / baseLen
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2
      const pk = `${Math.min(t.from, t.to)}->${Math.max(t.from, t.to)}`
      const total = pairCount.get(pk) ?? 1
      const idx = pairIndex.get(key) ?? 0
      // 平行边沿法向对称分布（中线偏移量 0、±26、±52…）
      const slot = total === 1 ? 0 : idx - (total - 1) / 2
      const offset = slot * 26
      const offX = (-uy) * (20 + offset)
      const offY = (ux) * (20 + offset)
      p0 = { x: from.x + ux * NODE_R, y: from.y + uy * NODE_R }
      p1 = { x: to.x - ux * NODE_R, y: to.y - uy * NODE_R }
      pc = { x: mx + offX, y: my + offY }
      labelPos = { x: mx + offX * 1.15, y: my + offY * 1.15 }
    }

    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.quadraticCurveTo(pc.x, pc.y, p1.x, p1.y)
    ctx.stroke()

    // 箭头：沿曲线在终点处的真实切线方向（不再用直线 atan2，消除错位）
    const endT = 1
    const tip = quadPoint(p0, pc, p1, endT)
    const tipAngle = quadAngle(p0, pc, p1, endT)
    const bx = tip.x - Math.cos(tipAngle) * 9
    const by = tip.y - Math.sin(tipAngle) * 9
    ctx.beginPath()
    ctx.moveTo(tip.x, tip.y)
    ctx.lineTo(bx + Math.cos(tipAngle + Math.PI / 2) * 5, by + Math.sin(tipAngle + Math.PI / 2) * 5)
    ctx.lineTo(bx - Math.cos(tipAngle + Math.PI / 2) * 5, by - Math.sin(tipAngle + Math.PI / 2) * 5)
    ctx.closePath()
    ctx.fill()

    // Label
    ctx.fillStyle = isActive ? '#fbbf24' : '#94a3b8'
    ctx.font = '11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(t.label, labelPos.x, labelPos.y)
  })

  // Draw states
  store.nfa.states.forEach(s => {
    const isActive = activeNodeIds.has(s.id)
    const baseColor = s.isStart ? '#06b6d4' : s.isAccept ? '#22c55e' : '#475569'

    // 激活外圈（起始/接受态也用同一橙色环表示激活，口径一致）
    if (isActive) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, NODE_R + 5, 0, Math.PI * 2)
      ctx.strokeStyle = '#f97316'
      ctx.lineWidth = 3
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.arc(s.x, s.y, NODE_R, 0, Math.PI * 2)
    ctx.fillStyle = baseColor
    ctx.fill()
    ctx.strokeStyle = isActive ? '#fbbf24' : '#1e293b'
    ctx.lineWidth = 2
    ctx.stroke()

    if (s.isAccept) {
      ctx.beginPath()
      ctx.arc(s.x, s.y, 15, 0, Math.PI * 2)
      ctx.strokeStyle = isActive ? '#fbbf24' : '#16a34a'
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
      ctx.strokeStyle = '#06b6d4'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(s.x - 22, s.y)
      ctx.lineTo(s.x - 28, s.y - 4)
      ctx.lineTo(s.x - 28, s.y + 4)
      ctx.closePath()
      ctx.fillStyle = '#06b6d4'
      ctx.fill()
    }
  })
}

onMounted(() => { draw() })
// 每次执行都是整体替换 nfa / matchResult，浅监听即可；currentStep 驱动每帧高亮
watch(() => [store.nfa, store.matchResult, store.currentStep], () => draw())
</script>
