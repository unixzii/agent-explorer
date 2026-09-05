import { useState } from 'react'
import { textExpandButton } from '../../styles/uiClasses'
import {
  DETAIL_TEXT_LIMIT,
  isDetailTruncated,
  truncateDetailText,
} from '../../core/text'

interface ExpandablePreProps {
  text: string
  emptyLabel?: string
  className?: string
  mono?: boolean
}

export function ExpandablePre({
  text,
  emptyLabel = '(empty)',
  className = '',
  mono = true,
}: ExpandablePreProps) {
  const [expanded, setExpanded] = useState(false)
  const hasText = text.length > 0
  const canExpand = hasText && isDetailTruncated(text)
  const displayText =
    !hasText ? emptyLabel : expanded || !canExpand ? text : truncateDetailText(text)

  return (
    <div>
      <pre
        className={`max-h-72 overflow-x-hidden overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] text-xs leading-relaxed text-secondary ${mono ? 'font-mono' : 'font-sans'} ${className}`}
      >
        {displayText}
      </pre>
      {canExpand && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setExpanded((value) => !value)
          }}
          className={`px-3 pb-2 text-[10px] ${textExpandButton}`}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

export { DETAIL_TEXT_LIMIT }
