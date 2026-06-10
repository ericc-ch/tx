import { Duration, Effect, Schedule } from "effect"

const debounceMs = 16

export const domWatchFallback = Duration.millis(500)

type DomWatch = {
  waitForChange: (maxWait: Duration.Duration) => Effect.Effect<void>
}

const watches = new WeakMap<ParentNode, DomWatch>()

const makeDomWatch = (root: ParentNode): DomWatch => {
  let observer: MutationObserver | undefined
  const waiters = new Set<() => void>()
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  const notify = () => {
    for (const waiter of waiters) waiter()
  }

  const ensureObserver = () => {
    if (observer) return
    const target = root instanceof Document ? root.documentElement : root
    observer = new MutationObserver(() => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined
        notify()
      }, debounceMs)
    })
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    })
  }

  return {
    waitForChange(maxWait) {
      return Effect.callback<void>((resume, signal) => {
        ensureObserver()
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          waiters.delete(finish)
          resume(Effect.void)
        }

        waiters.add(finish)
        const timer = setTimeout(finish, Duration.toMillis(maxWait))
        signal.addEventListener("abort", finish, { once: true })

        return Effect.sync(() => {
          if (!settled) finish()
        })
      })
    },
  }
}

export const domWatchFor = (root: ParentNode) => {
  const existing = watches.get(root)
  if (existing) return existing
  const watch = makeDomWatch(root)
  watches.set(root, watch)
  return watch
}

export const domChangeSchedule = (root: ParentNode) =>
  Schedule.addDelay(Schedule.forever, () =>
    domWatchFor(root).waitForChange(domWatchFallback).pipe(Effect.as(Duration.zero)),
  )
