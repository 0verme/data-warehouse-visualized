import { useEffect, useRef, useState } from 'react'
import type { LessonContent } from '../../content/types'
import type { Lesson } from '../../data/course'
import { loadLessonContent, primeLessonContentCache } from '../../content/lessons/client-loader'

export type LessonContentStatus = 'ready' | 'loading' | 'error'

export interface LessonContentState {
  lessonId: string
  status: LessonContentStatus
  content: LessonContent | null
}

export interface UseLessonContentResult {
  state: LessonContentState
  retryContent: () => void
}

/**
 * 当前课程内容的客户端状态机。
 *
 * - 首屏课程（SSR 通过 initialContent 提供）在初始 state 中即为 ready；
 * - 切换课程：缓存命中则同步 ready，否则立即进入 loading 并异步加载；
 * - race condition：课程切换时前一课程的 in-flight 结果被 cleanup 置为 cancelled，
 *   晚返回的旧课程内容永远不会覆盖当前课程；
 * - 加载失败：进入 error；retryContent 通过整页 reload 获得全新 module map 后重新加载。
 */
export function useLessonContent(
  lesson: Lesson,
  initialLesson: Lesson,
  initialContent: LessonContent,
): UseLessonContentResult {
  // 已就绪内容的按 slug 缓存（初次渲染同步可用，SSR markup 保持完整）。
  const [readyBySlug, setReadyBySlug] = useState<Record<string, LessonContent>>(() => ({
    [initialLesson.slug]: initialContent,
  }))
  const readyRef = useRef<Record<string, LessonContent>>(readyBySlug)
  const [failedSlug, setFailedSlug] = useState<string | null>(null)
  const failedRef = useRef<string | null>(null)
  const inflightSlugRef = useRef<string | null>(null)

  // 将 SSR 提供的首屏内容预置进 loader 共享缓存，避免重复请求。
  useEffect(() => {
    primeLessonContentCache(initialLesson.slug, initialContent)
  }, [initialLesson.slug, initialContent])

  useEffect(() => {
    const slug = lesson.slug

    if (lesson.id === initialLesson.id) {
      // 首屏课程由 SSR 渲染，内容已在初始 state 中。
      return
    }
    if (readyRef.current[slug]) {
      return
    }
    if (failedRef.current === slug) {
      return
    }
    if (inflightSlugRef.current === slug) {
      return
    }

    let cancelled = false
    inflightSlugRef.current = slug

    loadLessonContent(slug).then(
      (content) => {
        if (cancelled) {
          return
        }
        inflightSlugRef.current = null
        readyRef.current = { ...readyRef.current, [slug]: content }
        setReadyBySlug(readyRef.current)
      },
      (error: unknown) => {
        if (cancelled) {
          return
        }
        console.error(`[LearnShell] 课程内容加载失败: ${slug}`, error)
        inflightSlugRef.current = null
        failedRef.current = slug
        setFailedSlug(slug)
      },
    )

    return () => {
      // 课程已切换：丢弃仍在途的异步结果。
      cancelled = true
      if (inflightSlugRef.current === slug) {
        inflightSlugRef.current = null
      }
    }
  }, [lesson.id, lesson.slug, initialLesson.id])

  const isInitialLesson = lesson.id === initialLesson.id
  const readyContent = readyBySlug[lesson.slug]
  let status: LessonContentStatus
  if (isInitialLesson || readyContent) {
    status = 'ready'
  } else if (failedSlug === lesson.slug) {
    status = 'error'
  } else {
    status = 'loading'
  }

  const content = isInitialLesson ? initialContent : (readyContent ?? null)

  function retryContent(): void {
    // 浏览器在同一 document 内缓存 failed dynamic import（module map），
    // 同 URL 重试不会重新发起请求；整页 reload 获得全新 module map 并重新加载。
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  return { state: { lessonId: lesson.id, status, content }, retryContent }
}
