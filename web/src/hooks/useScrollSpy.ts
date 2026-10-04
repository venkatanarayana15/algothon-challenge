import { useEffect, useRef, useState } from 'react'

export interface ScrollSpy {
  /** Id of the section currently occupying the reading band. */
  active: string
  /** 0–1 fraction of the document scrolled. */
  progress: number
  /** True once the user has scrolled past the first screen. */
  scrolled: boolean
}

/**
 * Which section is the reader actually looking at?
 *
 * Deliberately scroll-position rather than IntersectionObserver. A short section
 * such as the limitations grid may never intersect a fixed observation band on
 * a tall phone, so an observer silently keeps reporting its neighbour. Measuring
 * element tops against a probe at 35% viewport height is boring, and boring is
 * what you want from navigation.
 *
 * Reads are batched into one rAF per scroll event, so a fast flick costs one
 * layout read per frame rather than one per event.
 */
export function useScrollSpy(ids: string[]): ScrollSpy {
  const [active, setActive] = useState(ids[0] ?? '')
  const [progress, setProgress] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const frame = useRef(0)

  useEffect(() => {
    const key = ids.join('|')

    const measure = () => {
      frame.current = 0
      const scrollY = window.scrollY
      const viewport = window.innerHeight
      const scrollable = Math.max(document.documentElement.scrollHeight - viewport, 1)

      setProgress(Math.min(Math.max(scrollY / scrollable, 0), 1))
      setScrolled(scrollY > 96)

      const nearEnd = scrollY + viewport >= document.documentElement.scrollHeight - 4

      // At the very bottom the last section is by definition the one on screen,
      // even if a short final section never reaches the probe line.
      if (nearEnd) {
        setActive(key.split('|').filter(Boolean).pop() ?? '')
        return
      }

      const probe = scrollY + viewport * 0.35
      let current = key.split('|').filter(Boolean)[0] ?? ''
      for (const id of key.split('|').filter(Boolean)) {
        const el = document.getElementById(id)
        if (!el) continue
        if (el.getBoundingClientRect().top + scrollY <= probe) current = id
      }
      setActive(current)
    }

    const onScroll = () => {
      if (frame.current) return
      frame.current = requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [ids])

  return { active, progress, scrolled }
}
