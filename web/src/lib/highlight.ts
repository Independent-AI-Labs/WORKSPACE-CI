import { codeToHtml } from 'shiki'

const SUPPORTED_LANGS = new Set([
  'python',
  'bash',
  'makefile',
  'javascript',
  'typescript',
  'json',
  'yaml',
])

export async function highlightCode(
  code: string,
  language: string,
): Promise<string> {
  const lang = SUPPORTED_LANGS.has(language) ? language : 'bash'
  try {
    return await codeToHtml(code, {
      lang,
      theme: 'github-dark',
    })
  } catch {
    return `<pre class="shiki"><code>${escapeHtml(code)}</code></pre>`
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
