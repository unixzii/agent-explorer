import { memo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Markdown renderer for conversation messages — react-markdown + GFM.
 * Each element maps to themed Tailwind classes so output follows the
 * app's light/dark tokens. Supports headings, emphasis, inline & fenced
 * code, links, lists, blockquotes, GFM tables, and rules.
 */

interface MarkdownProps {
  source: string
  className?: string
}

const components: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h1 className="mt-3 mb-1 text-lg font-semibold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1 text-base font-semibold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-3 mb-1 text-base font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h6>,
  ul: ({ children }) => <ul className="my-2 ml-5 list-disc space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 ml-5 list-decimal space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-accent underline underline-offset-2"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="opacity-70">{children}</del>,
  hr: () => <hr className="my-3 border-separator" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-separator-strong pl-3 text-secondary">
      {children}
    </blockquote>
  ),
  code: ({ className, children }) => {
    // Fenced blocks get a language class; inline code does not.
    const isBlock = /language-/.test(className ?? '')
    if (isBlock) {
      return <code className={`font-mono ${className ?? ''}`}>{children}</code>
    }
    return (
      <code className="rounded border border-separator bg-background px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    )
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-hidden overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg border border-separator bg-background px-3 py-2 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-separator bg-background px-2 py-1 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => <td className="border border-separator px-2 py-1 align-top">{children}</td>,
}

export const Markdown = memo(function Markdown({ source, className }: MarkdownProps) {
  return (
    <div className={`md text-sm leading-relaxed wrap-break-word ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  )
})
