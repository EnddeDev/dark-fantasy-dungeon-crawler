import type { ChatMessage } from "../../net/protocol";

/** Сколько сообщений держим на экране одного канала. */
export const CHAT_KEEP = 200;

/** Id последнего известного сообщения: с него просим только новые. */
export function lastMessageId(list: ChatMessage[]): number {
  let max = 0;
  for (const m of list) if (m.id > max) max = m.id;
  return max;
}

/**
 * Добавляет новые сообщения к уже показанным: без дублей, по порядку id,
 * последние CHAT_KEEP. Старые сообщения при этом не теряются.
 */
export function mergeMessages(current: ChatMessage[], incoming: ChatMessage[], keep = CHAT_KEEP): ChatMessage[] {
  const seen = new Set<number>();
  const merged: ChatMessage[] = [];
  for (const m of [...current, ...incoming]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    merged.push(m);
  }
  merged.sort((a, b) => a.id - b.id);
  return merged.length > keep ? merged.slice(-keep) : merged;
}
