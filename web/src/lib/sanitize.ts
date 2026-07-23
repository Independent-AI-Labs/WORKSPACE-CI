import createDOMPurify from 'isomorphic-dompurify'

const ALLOWED_TAGS = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'pre', 'code', 'blockquote',
  'a', 'strong', 'em', 'del',
  'img',
  'div', 'span',
]

const ALLOWED_ATTR = ['href', 'title', 'alt', 'src', 'class', 'id', 'rel', 'target', 'style', 'width', 'height']

export function sanitizeHtml(dirty: string): string {
  return createDOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
  })
}
