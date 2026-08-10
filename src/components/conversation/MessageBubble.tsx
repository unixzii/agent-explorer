import { selectedRing } from '../../styles/uiClasses'
import type { ConversationListItem } from '../../core/types'
import { Markdown } from '../shared/Markdown'

interface MessageBubbleProps {
  item: ConversationListItem
  selected: boolean
  onSelect: (item: ConversationListItem) => void
}

export function UserBubble({ item, selected, onSelect }: MessageBubbleProps) {
  const text = item.block?.text ?? item.event.preview

  return (
    <div className="flex justify-end px-4 pt-2 pb-8">
      <div
        role="button"
        onClick={() => { onSelect(item) }}
        className={`max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-left text-primary border ${
          selected
            ? `bg-message-bubble ${selectedRing}`
            : 'bg-message-bubble border-transparent'
        }`}
      >
        <Markdown source={text} />
      </div>
    </div>
  )
}

export function AssistantBubble({ item, selected, onSelect }: MessageBubbleProps) {
  const text = item.block?.text ?? item.event.preview

  return (
    <div className="flex justify-start px-4">
      <div
        role="button"
        onClick={() => { onSelect(item) }}
        className={`px-2 py-1 rounded-lg text-left text-primary border ${
          selected ? selectedRing : 'border-transparent'
        }`}
      >
        <Markdown source={text} />
      </div>
    </div>
  )
}

export function SystemMessage({ item, selected, onSelect }: MessageBubbleProps) {
  return (
    <div className="flex justify-center px-4 py-2">
      <button
        type="button"
        onClick={() => { onSelect(item) }}
        className={`max-w-[90%] rounded-lg border border-dashed px-3 py-2 text-center text-xs text-secondary ${
          selected ? selectedRing : 'border-separator-strong'
        }`}
      >
        <span className="font-medium uppercase tracking-wide">System</span>
        <p className="mt-1 whitespace-pre-wrap">
          {item.block?.text ?? item.event.preview}
        </p>
      </button>
    </div>
  )
}
