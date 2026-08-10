import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { detectAndParse } from '../core/registry'
import { parseJsonlText } from '../core/jsonl'
import { BLOCK_TEXT_LIMIT } from '../core/text'
import { piSessionAdapter } from './pi-session'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')
const sampleText = readFileSync(join(fixtureDir, 'pi-session.sample.jsonl'), 'utf8')
const referenceSessionPath =
  '/Users/cyandev/.pi/agent/sessions/--Users-cyandev-Developer-work-ambi-ios--/2026-08-10T04-43-34-270Z_019fe9fb-b1fe-7944-bf3d-ca90d265cc52.jsonl'

function line(data: Record<string, unknown>, lineIndex = 1) {
  return {
    lineIndex,
    raw: JSON.stringify(data),
    data,
  }
}

describe('piSessionAdapter.detect', () => {
  it('returns high confidence for Pi session samples', () => {
    const { lines } = parseJsonlText(sampleText)
    expect(piSessionAdapter.detect(lines)).toBe(1)
  })

  it('returns zero for unrelated JSONL', () => {
    expect(piSessionAdapter.detect([line({ foo: 'bar' })])).toBe(0)
  })
})

describe('piSessionAdapter.parse', () => {
  it('parses session metadata, model changes, and turns', () => {
    const { lines } = parseJsonlText(sampleText)
    const session = piSessionAdapter.parse(lines, 'pi.jsonl')

    expect(session.fileType).toBe('Pi')
    expect(session.meta).toMatchObject({
      sessionId: '019fe9fb-b1fe-7944-bf3d-ca90d265cc52',
      cwd: '/Users/example/project',
      version: '3',
      model: 'openai-codex/gpt-5.6-sol',
      eventCount: 9,
      turnCount: 1,
    })
    expect(session.events[0]).toMatchObject({
      category: 'meta',
      kind: 'session',
      sessionId: '019fe9fb-b1fe-7944-bf3d-ca90d265cc52',
    })
    expect(session.events[2]).toMatchObject({
      kind: 'model_change',
      model: 'gpt-5.6-sol',
    })
  })

  it('flattens assistant blocks and links tool calls to results', () => {
    const { lines } = parseJsonlText(sampleText)
    const session = piSessionAdapter.parse(lines, 'pi.jsonl')

    expect(session.conversationItems.map((item) => item.role)).toEqual([
      'user',
      'thinking',
      'assistant',
      'tool_call',
      'tool_result',
      'assistant',
      'system',
    ])

    const toolCall = session.conversationItems.find((item) => item.role === 'tool_call')
    const toolResult = session.conversationItems.find((item) => item.role === 'tool_result')
    expect(toolCall?.block).toMatchObject({
      toolCallId: 'call_123',
      toolName: 'bash',
      toolInput: { command: 'find . -maxdepth 2 -type f' },
      status: 'pending',
    })
    expect(toolResult?.block).toMatchObject({
      toolCallId: 'call_123',
      toolName: 'bash',
      status: 'completed',
    })
    expect(toolResult?.block?.text).toContain('./README.md')
  })

  it('maps Pi token usage onto explorer usage fields', () => {
    const { lines } = parseJsonlText(sampleText)
    const session = piSessionAdapter.parse(lines, 'pi.jsonl')
    const assistantEvent = session.events.find(
      (event) => event.role === 'assistant' && event.stopReason === 'toolUse',
    )

    expect(assistantEvent?.model).toBe('gpt-5.6-sol')
    expect(assistantEvent?.usage).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      cacheReadInputTokens: 80,
      cacheCreationInputTokens: 10,
    })
  })

  it('supports extended messages, custom entries, and image placeholders', () => {
    const session = piSessionAdapter.parse(
      [
        line({
          type: 'session',
          version: 3,
          id: 'session-1',
          timestamp: '2026-01-01T00:00:00.000Z',
          cwd: '/tmp/project',
        }),
        line({
          type: 'message',
          id: 'bash-1',
          parentId: null,
          timestamp: '2026-01-01T00:00:01.000Z',
          message: {
            role: 'bashExecution',
            command: 'false',
            output: 'failed',
            exitCode: 1,
            cancelled: false,
          },
        }, 2),
        line({
          type: 'message',
          id: 'custom-1',
          parentId: 'bash-1',
          timestamp: '2026-01-01T00:00:02.000Z',
          message: {
            role: 'custom',
            customType: 'visible-extension',
            content: [{ type: 'image', mimeType: 'image/png', data: 'abc' }],
            display: true,
          },
        }, 3),
        line({
          type: 'custom_message',
          id: 'custom-2',
          parentId: 'custom-1',
          timestamp: '2026-01-01T00:00:03.000Z',
          customType: 'hidden-extension',
          content: 'hidden context',
          display: false,
        }, 4),
        line({
          type: 'branch_summary',
          id: 'branch-1',
          parentId: 'custom-2',
          timestamp: '2026-01-01T00:00:04.000Z',
          fromId: 'old-branch',
          summary: 'Tried another approach.',
        }, 5),
      ],
      'extended.jsonl',
    )

    expect(session.events).toHaveLength(5)
    expect(session.conversationItems).toHaveLength(3)
    expect(session.conversationItems[0]).toMatchObject({
      role: 'tool_result',
      block: { toolName: 'bash', status: 'failed' },
    })
    expect(session.conversationItems[1]?.block?.text).toBe('[Image: image/png]')
    expect(session.conversationItems[2]?.role).toBe('system')
    expect(session.events[3]?.preview).toBe('hidden context')
  })

  it('truncates large thinking blocks at parse time', () => {
    const longThinking = 'z'.repeat(BLOCK_TEXT_LIMIT + 500)
    const session = piSessionAdapter.parse(
      [
        line({
          type: 'session',
          version: 3,
          id: 'session-1',
          cwd: '/tmp/project',
        }),
        line({
          type: 'message',
          id: 'assistant-1',
          parentId: null,
          message: {
            role: 'assistant',
            content: [{ type: 'thinking', thinking: longThinking }],
          },
        }, 2),
      ],
      'large.jsonl',
    )

    expect(session.conversationItems[0]?.block?.text.endsWith('… [truncated]')).toBe(true)
  })

  it('parses the provided reference session when available locally', () => {
    let text: string
    try {
      text = readFileSync(referenceSessionPath, 'utf8')
    } catch {
      return
    }

    const session = detectAndParse(text, 'reference.jsonl')
    expect(session.fileType).toBe('Pi')
    expect(session.meta.sessionId).toBe('019fe9fb-b1fe-7944-bf3d-ca90d265cc52')
    expect(session.meta.turnCount).toBeGreaterThanOrEqual(8)
    expect(session.conversationItems.some((item) => item.role === 'thinking')).toBe(true)
    expect(session.conversationItems.some((item) => item.role === 'tool_call')).toBe(true)
    expect(session.conversationItems.some((item) => item.role === 'tool_result')).toBe(true)
  })
})

describe('detectAndParse with Pi sessions', () => {
  it('selects the Pi adapter for session files', () => {
    const session = detectAndParse(sampleText, 'pi-session.jsonl')
    expect(session.fileType).toBe('Pi')
  })
})
