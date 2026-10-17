import { useEffect, useState } from 'react'

// A lesson chains short games over one unit of the plan. While it runs, the end screen of
// each game is short (the next game follows), and the results are collected here.

export type LessonState = {
  active: boolean
  /** a game finished on its own (not left with ✕): the runner may go on to the next one */
  next: boolean
  correct: number
  total: number
}

let state: LessonState = { active: false, next: false, correct: 0, total: 0 }
const listeners = new Set<(s: LessonState) => void>()

function set(patch: Partial<LessonState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
}

export const lesson = {
  start() {
    set({ active: true, next: false, correct: 0, total: 0 })
  },
  stop() {
    set({ active: false, next: false })
  },
  /** a game's result */
  report(score: number, total: number) {
    set({ correct: state.correct + score, total: state.total + total })
  },
  /** called by the end screen before it hands over to the runner */
  markNext() {
    set({ next: true })
  },
  /** true once, if the last game ended by itself */
  takeNext(): boolean {
    const n = state.next
    if (n) set({ next: false })
    return n
  },
  get(): LessonState {
    return state
  },
}

export function useLesson(): LessonState {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    return () => {
      listeners.delete(setS)
    }
  }, [])
  return s
}
