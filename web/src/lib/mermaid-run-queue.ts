// Serializes mermaid.run() invocations. Mermaid is not safe under concurrent
// run() calls across multiple diagram frames on the same page.

let runChain: Promise<void> = Promise.resolve()

export function enqueueMermaidRun(task: () => Promise<void>): Promise<void> {
  const next = runChain.then(task, task)
  runChain = next.catch((err: unknown) => {
    console.error('mermaid render queue task failed:', err)
  })
  return next
}

/** Test-only: reset queue between vitest cases. */
export function resetMermaidRunQueue(): void {
  runChain = Promise.resolve()
}