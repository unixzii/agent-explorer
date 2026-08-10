import { truncateBlockText, truncatePreview } from '../core/text'
import type {
  ContentBlock,
  ConversationListItem,
  ConversationRole,
  EventCategory,
  ExplorerSession,
  ParsedLine,
  TimelineEvent,
  TokenUsage,
} from '../core/types'
import type { SessionAdapter } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function getNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return undefined
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? undefined : timestamp
}

function formatJson(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractContentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (!isRecord(part)) return ''
      if (part.type === 'text' && typeof part.text === 'string') return part.text
      if (part.type === 'image') {
        const mimeType = getString(part, 'mimeType')
        return `[Image${mimeType ? `: ${mimeType}` : ''}]`
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function toolInput(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : value === undefined ? {} : { value }
}

function extractAssistantBlocks(content: unknown): ContentBlock[] {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', text: truncateBlockText(content) }] : []
  }
  if (!Array.isArray(content)) return []

  const blocks: ContentBlock[] = []
  for (const part of content) {
    if (!isRecord(part)) continue
    if (part.type === 'text' && typeof part.text === 'string') {
      blocks.push({ type: 'text', text: truncateBlockText(part.text) })
    } else if (part.type === 'thinking' && typeof part.thinking === 'string') {
      blocks.push({ type: 'thinking', text: truncateBlockText(part.thinking) })
    } else if (part.type === 'toolCall') {
      const name = getString(part, 'name') ?? 'tool'
      const id = getString(part, 'id')
      const input = toolInput(part.arguments)
      blocks.push({
        type: 'tool_use',
        text: truncateBlockText(formatJson(part.arguments ?? input)),
        toolName: name,
        toolInput: input,
        toolCallId: id,
        status: 'pending',
      })
    }
  }
  return blocks
}

function blockRole(block: ContentBlock): ConversationRole {
  if (block.type === 'thinking') return 'thinking'
  if (block.type === 'tool_use') return 'tool_call'
  return 'assistant'
}

function blockLabel(block: ContentBlock): string {
  if (block.type === 'thinking') return 'thinking'
  if (block.type === 'tool_use') return `tool_use ${block.toolName ?? 'tool'}`
  return 'text'
}

function blockPreview(block: ContentBlock): string {
  if (block.type === 'tool_use') {
    return truncatePreview(`${block.toolName ?? 'tool'}: ${block.text}`)
  }
  return truncatePreview(block.text)
}

function parseUsage(message: Record<string, unknown>): TokenUsage | undefined {
  if (!isRecord(message.usage)) return undefined
  const inputTokens = getNumber(message.usage, 'input')
  const outputTokens = getNumber(message.usage, 'output')
  const cacheReadInputTokens = getNumber(message.usage, 'cacheRead')
  const cacheCreationInputTokens = getNumber(message.usage, 'cacheWrite')

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    cacheReadInputTokens === undefined &&
    cacheCreationInputTokens === undefined
  ) {
    return undefined
  }

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    cacheReadInputTokens: cacheReadInputTokens ?? 0,
    cacheCreationInputTokens: cacheCreationInputTokens ?? 0,
  }
}

function messageCategory(role: string | undefined): EventCategory {
  if (role === 'user') return 'user'
  if (role === 'assistant') return 'assistant'
  if (role === 'toolResult' || role === 'bashExecution') return 'tool'
  if (
    role === 'custom' ||
    role === 'branchSummary' ||
    role === 'compactionSummary'
  ) {
    return 'system'
  }
  return 'unknown'
}

function messageLabel(message: Record<string, unknown>): string {
  const role = getString(message, 'role')
  if (role === 'assistant') {
    const blocks = extractAssistantBlocks(message.content)
    if (blocks.length === 1) return blockLabel(blocks[0]!)
    if (blocks.length > 1) return `assistant (${blocks.length} blocks)`
    return 'assistant'
  }
  if (role === 'toolResult') {
    return `tool_result ${getString(message, 'toolName') ?? 'tool'}`
  }
  if (role === 'bashExecution') return 'bash_execution'
  if (role === 'custom') return `custom ${getString(message, 'customType') ?? ''}`.trim()
  if (role === 'branchSummary') return 'branch_summary'
  if (role === 'compactionSummary') return 'compaction_summary'
  return role ?? 'message'
}

function messagePreview(message: Record<string, unknown>): string {
  const role = getString(message, 'role')
  if (role === 'assistant') {
    const block = extractAssistantBlocks(message.content)[0]
    return block ? blockPreview(block) : ''
  }
  if (role === 'toolResult' || role === 'user' || role === 'custom') {
    return truncatePreview(extractContentText(message.content))
  }
  if (role === 'bashExecution') {
    return truncatePreview(
      [getString(message, 'command'), getString(message, 'output')]
        .filter(Boolean)
        .join('\n'),
    )
  }
  if (role === 'branchSummary' || role === 'compactionSummary') {
    return truncatePreview(getString(message, 'summary') ?? '')
  }
  return ''
}

function entryCategory(type: string, entry: Record<string, unknown>): EventCategory {
  if (type === 'message' && isRecord(entry.message)) {
    return messageCategory(getString(entry.message, 'role'))
  }
  if (type === 'compaction' || type === 'branch_summary' || type === 'custom_message') {
    return 'system'
  }
  if (
    type === 'session' ||
    type === 'model_change' ||
    type === 'thinking_level_change' ||
    type === 'custom' ||
    type === 'label' ||
    type === 'session_info'
  ) {
    return 'meta'
  }
  return 'unknown'
}

function entryLabel(type: string, entry: Record<string, unknown>): string {
  if (type === 'message' && isRecord(entry.message)) return messageLabel(entry.message)
  if (type === 'model_change') return 'model_change'
  if (type === 'thinking_level_change') return 'thinking_level_change'
  if (type === 'branch_summary') return 'branch_summary'
  if (type === 'custom_message') {
    return `custom_message ${getString(entry, 'customType') ?? ''}`.trim()
  }
  if (type === 'custom') return `custom ${getString(entry, 'customType') ?? ''}`.trim()
  return type
}

function entryPreview(type: string, entry: Record<string, unknown>): string {
  if (type === 'message' && isRecord(entry.message)) return messagePreview(entry.message)
  if (type === 'session') {
    return truncatePreview(
      [getString(entry, 'id'), getString(entry, 'cwd')].filter(Boolean).join(' · '),
    )
  }
  if (type === 'model_change') {
    return truncatePreview(
      [getString(entry, 'provider'), getString(entry, 'modelId')]
        .filter(Boolean)
        .join('/'),
    )
  }
  if (type === 'thinking_level_change') {
    return getString(entry, 'thinkingLevel') ?? ''
  }
  if (type === 'compaction' || type === 'branch_summary') {
    return truncatePreview(getString(entry, 'summary') ?? '')
  }
  if (type === 'custom_message') return truncatePreview(extractContentText(entry.content))
  if (type === 'custom') return truncatePreview(formatJson(entry.data))
  if (type === 'label') {
    return truncatePreview(
      [getString(entry, 'label'), getString(entry, 'targetId')]
        .filter(Boolean)
        .join(' · '),
    )
  }
  if (type === 'session_info') return truncatePreview(getString(entry, 'name') ?? '')
  return ''
}

function messageConversationItems(
  message: Record<string, unknown>,
  event: TimelineEvent,
  lineIndex: number,
): ConversationListItem[] {
  const role = getString(message, 'role')
  if (role === 'user') {
    const text = extractContentText(message.content)
    return [{
      id: `conv-${lineIndex}-user`,
      event,
      role: 'user',
      block: text ? { type: 'text', text: truncateBlockText(text) } : undefined,
    }]
  }

  if (role === 'assistant') {
    const blocks = extractAssistantBlocks(message.content)
    if (blocks.length === 0) {
      return [{ id: `conv-${lineIndex}-assistant`, event, role: 'assistant' }]
    }
    return blocks.map((block, index) => ({
      id: `conv-${lineIndex}-block-${index}`,
      event,
      role: blockRole(block),
      block,
    }))
  }

  if (role === 'toolResult') {
    const text = extractContentText(message.content)
    return [{
      id: `conv-${lineIndex}-tool-result`,
      event,
      role: 'tool_result',
      block: {
        type: 'text',
        text: truncateBlockText(text),
        toolName: getString(message, 'toolName'),
        toolCallId: getString(message, 'toolCallId'),
        status: message.isError === true ? 'failed' : 'completed',
      },
    }]
  }

  if (role === 'bashExecution') {
    const text = [getString(message, 'command'), getString(message, 'output')]
      .filter(Boolean)
      .join('\n')
    const exitCode = getNumber(message, 'exitCode')
    return [{
      id: `conv-${lineIndex}-bash-execution`,
      event,
      role: 'tool_result',
      block: {
        type: 'text',
        text: truncateBlockText(text),
        toolName: 'bash',
        status: message.cancelled === true || (exitCode !== undefined && exitCode !== 0)
          ? 'failed'
          : 'completed',
      },
    }]
  }

  if (role === 'custom' && message.display === false) return []
  if (role === 'custom' || role === 'branchSummary' || role === 'compactionSummary') {
    return [{
      id: `conv-${lineIndex}-system`,
      event,
      role: 'system',
      block: {
        type: 'text',
        text: truncateBlockText(
          role === 'custom'
            ? extractContentText(message.content)
            : getString(message, 'summary') ?? '',
        ),
      },
    }]
  }

  return []
}

const PI_ENTRY_TYPES = new Set([
  'session',
  'message',
  'model_change',
  'thinking_level_change',
  'compaction',
  'branch_summary',
  'custom',
  'custom_message',
  'label',
  'session_info',
])

export const piSessionAdapter: SessionAdapter = {
  detect(samples: ParsedLine[]): number {
    if (samples.length === 0) return 0
    let hits = 0
    for (const sample of samples) {
      if (!isRecord(sample.data)) continue
      const type = getString(sample.data, 'type')
      if (type === 'session' && getString(sample.data, 'id') && getString(sample.data, 'cwd')) {
        return 1
      }
      if (type === 'message' && isRecord(sample.data.message)) {
        const role = getString(sample.data.message, 'role')
        if (
          role === 'user' ||
          role === 'assistant' ||
          role === 'toolResult' ||
          role === 'bashExecution' ||
          role === 'custom' ||
          role === 'branchSummary' ||
          role === 'compactionSummary'
        ) {
          hits++
        }
      } else if (type && PI_ENTRY_TYPES.has(type)) {
        hits++
      }
    }
    return hits / samples.length
  },

  parse(lines: ParsedLine[], fileName: string): ExplorerSession {
    const events: TimelineEvent[] = []
    const conversationItems: ConversationListItem[] = []
    let sessionId: string | undefined
    let cwd: string | undefined
    let version: string | undefined
    let model: string | undefined
    let provider: string | undefined
    let turnIndex = 0

    for (const line of lines) {
      const entry = line.data
      if (!isRecord(entry)) continue
      const type = getString(entry, 'type') ?? 'unknown'
      const message = isRecord(entry.message) ? entry.message : undefined

      if (type === 'session') {
        sessionId ??= getString(entry, 'id')
        cwd ??= getString(entry, 'cwd')
        const rawVersion = entry.version
        if (typeof rawVersion === 'string' || typeof rawVersion === 'number') {
          version ??= String(rawVersion)
        }
      } else if (type === 'model_change') {
        model = getString(entry, 'modelId') ?? model
        provider = getString(entry, 'provider') ?? provider
      } else if (message && getString(message, 'role') === 'assistant') {
        model = getString(message, 'model') ?? model
        provider = getString(message, 'provider') ?? provider
      }

      if (message && getString(message, 'role') === 'user') turnIndex++

      const event: TimelineEvent = {
        id: `line-${line.lineIndex}`,
        lineIndex: line.lineIndex,
        timestamp: parseTimestamp(entry.timestamp),
        category: entryCategory(type, entry),
        kind: type === 'message' ? getString(message ?? {}, 'role') ?? type : type,
        label: entryLabel(type, entry),
        preview: entryPreview(type, entry),
        turnIndex,
        model: type === 'model_change' ? getString(entry, 'modelId') : getString(message ?? {}, 'model') ?? model,
        usage: parseUsage(message ?? entry),
        uuid: getString(entry, 'id'),
        sessionId: type === 'session' ? sessionId : undefined,
        cwd: type === 'session' ? cwd : undefined,
        timestampLabel: getString(entry, 'timestamp'),
        role: message ? getString(message, 'role') : undefined,
        stopReason: message ? getString(message, 'stopReason') : undefined,
        raw: entry,
      }

      let items: ConversationListItem[] = []
      if (type === 'message' && message) {
        items = messageConversationItems(message, event, line.lineIndex)
      } else if (type === 'compaction' || type === 'branch_summary') {
        items = [{
          id: `conv-${line.lineIndex}-system`,
          event,
          role: 'system',
          block: {
            type: 'text',
            text: truncateBlockText(getString(entry, 'summary') ?? ''),
          },
        }]
      } else if (type === 'custom_message' && entry.display !== false) {
        items = [{
          id: `conv-${line.lineIndex}-system`,
          event,
          role: 'system',
          block: {
            type: 'text',
            text: truncateBlockText(extractContentText(entry.content)),
          },
        }]
      }

      for (const item of items) conversationItems.push(item)
      if (items.length > 0) event.conversationItem = items.at(-1)
      events.push(event)
    }

    return {
      fileType: 'Pi',
      fileName,
      meta: {
        sessionId,
        model: model ? [provider, model].filter(Boolean).join('/') : undefined,
        cwd,
        version,
        eventCount: events.length,
        turnCount: turnIndex,
      },
      events,
      conversationItems,
      parseWarnings: [],
    }
  },
}
