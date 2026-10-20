import { apiFetch } from '../../services/api';

export interface AssistantConfiguration {
  status: string;
  bot_name: string;
  greeting: string;
  suggestions: string[];
  accent_color: string;
  history_turns: number;
  profile_avatar?: string | null;
}

export interface AssistantTurn {
  answer: string;
  disclaimer?: string | null;
  turn_id: number;
}

export interface HistoryTurn { role: 'user' | 'assistant'; text: string }

async function body(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firstError = Object.values(payload.errors ?? {}).flat()[0];
    throw new Error(String(firstError ?? payload.message ?? 'The assistant request could not be completed.'));
  }
  return payload.data;
}

export async function fetchAssistantConfiguration(): Promise<AssistantConfiguration> {
  return body(await apiFetch('/api/v1/catalogue/assistant'));
}

export async function askAssistant(input: {
  question: string;
  clientId: string;
  programmeId?: string;
  history: HistoryTurn[];
  onDelta?: (answer: string) => void;
}): Promise<AssistantTurn> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 160_000);
  try {
    const response = await fetch('/api/v1/catalogue/assistant/chat', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: input.question,
        client_id: input.clientId,
        programme_id: input.programmeId,
        history: input.history,
        stream: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) return body(response);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';
    let streamError = '';
    let disclaimer: string | null = null;
    let turnId = 0;
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        const event = frame.split(/\r?\n/).find((line) => line.startsWith('event:'))?.slice(6).trim();
        const raw = frame.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim();
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (event === 'answer') answer += String(data.delta ?? '');
        if (event === 'replace') answer = String(data.answer ?? '');
        if (event === 'error') { answer = ''; streamError = String(data.message ?? 'The assistant is temporarily unavailable. Please try again.'); }
        if (event === 'done') { disclaimer = data.disclaimer ?? null; turnId = Number(data.turn_id ?? 0); }
        if (event === 'answer' || event === 'replace') input.onDelta?.(answer);
      }
      if (done) break;
    }
    if (streamError) throw new Error(streamError);
    if (!answer) throw new Error('The assistant returned an empty response. Please try again.');
    return { answer, disclaimer, turn_id: turnId };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The assistant took too long to respond. Please try again.');
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function saveAssistantFeedback(turnId: number, clientId: string, feedback: 'like' | 'dislike' | null): Promise<void> {
  await body(await apiFetch('/api/v1/catalogue/assistant/feedback', {
    method: 'POST',
    body: JSON.stringify({ turn_id: turnId, client_id: clientId, feedback }),
  }));
}
