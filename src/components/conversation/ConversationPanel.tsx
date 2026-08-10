import { useRef, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { emptyState, panelHeader } from '../../styles/uiClasses'
import { filterConversationItems } from '../../core/filter'
import { useSessionStore } from '../../store/sessionStore'
import { useSettingsStore } from '../../store/settingsStore'
import type { ConversationListItem } from '../../core/types'
import { useSpringScrollToFn } from '../shared/useSpringScrollToFn'
import { ConversationMessage } from './ConversationMessage'

const EMPTY_ITEMS: ConversationListItem[] = []

type VirtualRow =
  | { kind: 'turn'; turnIndex: number; key: string }
  | { kind: 'item'; key: string; itemIndex: number }

function estimateRowSize(
  row: VirtualRow | undefined,
  items: ConversationListItem[],
): number {
  if (!row) return 64
  if (row.kind === 'turn') return 40

  const item = items[row.itemIndex]
  if (!item) return 64

  switch (item.role) {
    case 'user':
    case 'assistant':
      return Math.min(320, 72 + Math.ceil(item.event.preview.length / 48) * 20)
    case 'thinking':
      return 26
    case 'tool_call':
      return 30
    case 'system':
      return 80
    default:
      return 64
  }
}

function resolveActiveToolCallId(
  items: ConversationListItem[],
  selectedItemId: string | null | undefined,
): string | null {
  if (selectedItemId) {
    const selected = items.find((item) => item.id === selectedItemId)
    if (
      selected?.block?.toolCallId &&
      (selected.role === 'tool_call' || selected.role === 'tool_result')
    ) {
      return selected?.block?.toolCallId
    }
  }

  return null
}

function isToolPairHighlighted(
  item: ConversationListItem,
  activeToolCallId: string | null,
): boolean {
  if (!activeToolCallId || !item.block?.toolCallId) return false
  if (item.block?.toolCallId !== activeToolCallId) return false
  if (item.role !== 'tool_call' && item.role !== 'tool_result') return false
  return true
}

export function ConversationPanel() {
  const session = useSessionStore((s) => s.session)
  const selection = useSessionStore((s) => s.selection)
  const selectConversationItem = useSessionStore((s) => s.selectConversationItem)
  const parentRef = useRef<HTMLDivElement>(null)

  const allItems = session?.conversationItems ?? EMPTY_ITEMS
  const searchQuery = useSettingsStore((s) => s.searchQuery)
  const hideSystem = useSettingsStore((s) => s.hideSystem)
  const hideThinking = useSettingsStore((s) => s.hideThinking)
  const hideToolCalls = useSettingsStore((s) => s.hideToolCalls)
  const items = useMemo(
    () =>
      filterConversationItems(allItems, {
        searchQuery,
        hideSystem,
        hideThinking,
        hideToolCalls,
      }),
    [allItems, searchQuery, hideSystem, hideThinking, hideToolCalls],
  )
  const selectedItemId = selection?.conversationItem?.id

  const activeToolCallId = useMemo(
    () => resolveActiveToolCallId(items, selectedItemId),
    [items, selectedItemId],
  )

  const rows: VirtualRow[] = useMemo(() => {
    const result: VirtualRow[] = []
    let lastTurn = -1
    items.forEach((item, itemIndex) => {
      const turnIndex = item.event?.turnIndex ?? 0
      if (turnIndex !== lastTurn) {
        result.push({ kind: 'turn', turnIndex, key: `turn-${turnIndex}` })
        lastTurn = turnIndex
      }
      result.push({ kind: 'item', key: item.id, itemIndex })
    })
    return result
  }, [items])

  const scrollToFn = useSpringScrollToFn()
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => rows[index]?.key ?? String(index),
    estimateSize: (index) => estimateRowSize(rows[index], items),
    overscan: 8,
    scrollToFn,
  })

  useEffect(() => {
    if (selection?.source === 'conversation') {
      return
    }
    if (!selectedItemId) return
    const index = rows.findIndex(
      (row) => row.kind === 'item' && items[row.itemIndex]?.id === selectedItemId,
    )
    if (index >= 0) virtualizer.scrollToIndex(index, { align: 'start', behavior: 'smooth' })
  }, [selection, selectedItemId, rows, items, virtualizer])

  if (!session) {
    return (
      <div className={`flex h-full items-center justify-center p-4 ${emptyState}`}>
        Open an agent session JSONL file to explore it
      </div>
    )
  }

  if (allItems.length === 0) {
    return (
      <div className={`flex h-full items-center justify-center p-4 ${emptyState}`}>
        No conversation items in this file
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <div className={panelHeader}>
          Conversation · 0 / {allItems.length} messages
        </div>
        <div className={`flex flex-1 items-center justify-center p-4 ${emptyState}`}>
          No messages match the current filters
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-under-page-background">
      <div className={panelHeader}>
        Conversation · {items.length}
        {items.length !== allItems.length ? ` / ${allItems.length}` : ''} messages ·{' '}
        {session.meta.turnCount} turns
      </div>
      <div ref={parentRef} className="flex-1 overflow-auto py-3">
        <div
          style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]!
            return (
              <div
                key={row.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.kind === 'turn' ? (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className={`h-px flex-1 bg-separator`} />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-tertiary">
                      Turn {row.turnIndex}
                    </span>
                    <div className={`h-px flex-1 bg-separator`} />
                  </div>
                ) : (
                  <ConversationMessage
                    item={items[row.itemIndex]!}
                    selected={selectedItemId === items[row.itemIndex]!.id}
                    pairHighlighted={isToolPairHighlighted(
                      items[row.itemIndex]!,
                      activeToolCallId,
                    )}
                    onSelect={selectConversationItem}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
