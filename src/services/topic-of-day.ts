/**
 * Chon chu de luyen tieng Anh/IELTS "theo tung ngay".
 *
 * Thiet ke: hoan toan la HAM THUAN TUY cua ngay (khong doc/ghi DB, khong goi API
 * nao) — cung mot ngay thi luon ra cung mot bo chu de, du goi bao nhieu lan hay
 * server co restart. Dung mot hoan vi (permutation) co dinh cho moi danh sach
 * thay vi lay chi so ngay % do_dai, de di het ca danh sach roi moi lap lai thay
 * vi co the trung ngay hom sau (vi du 24 % 20 va 4 % 20 deu ra 4).
 */

import { SPEAKING_TOPICS, VOCAB_THEMES, WRITING_TOPICS, type SpeakingTopic, type VocabTheme, type WritingTopic } from '../data/ielts_topics';

/** PRNG nho gon, dinh danh (Mulberry32) — chi de tao hoan vi co dinh luc build, khong dung de bao mat. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hoan vi Fisher-Yates dung seed co dinh — luon ra cung mot ket qua moi lan chay. */
function fixedPermutation(length: number, seed: number): number[] {
  const rand = mulberry32(seed);
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const SPEAKING_ORDER = fixedPermutation(SPEAKING_TOPICS.length, 1001);
const WRITING_ORDER = fixedPermutation(WRITING_TOPICS.length, 2002);
const VOCAB_ORDER = fixedPermutation(VOCAB_THEMES.length, 3003);

/** 'YYYY-MM-DD' -> so ngay ke tu 1970-01-01 (dung UTC vi chuoi da la ngay lich, khong can gio). */
function daysSinceEpoch(dateStr: string): number {
  return Math.floor(Date.parse(`${dateStr}T00:00:00Z`) / 86_400_000);
}

function pick<T>(list: T[], order: number[], dayIndex: number): T {
  const i = ((dayIndex % order.length) + order.length) % order.length;
  return list[order[i]];
}

export interface TopicOfDay {
  date: string;
  speaking: SpeakingTopic;
  writing: WritingTopic;
  vocab: VocabTheme;
}

/** `dateStr` la ngay theo gio Viet Nam, dang 'YYYY-MM-DD' (dung chung ham toVNDate). */
export function getTopicOfDay(dateStr: string): TopicOfDay {
  const dayIndex = daysSinceEpoch(dateStr);
  return {
    date: dateStr,
    speaking: pick(SPEAKING_TOPICS, SPEAKING_ORDER, dayIndex),
    writing: pick(WRITING_TOPICS, WRITING_ORDER, dayIndex),
    vocab: pick(VOCAB_THEMES, VOCAB_ORDER, dayIndex),
  };
}

/** Ban tom tat ngan de nhet vao system prompt — khong nhet toan bo object cho ton token. */
export function describeTopicOfDay(topic: TopicOfDay): string {
  return `- Speaking (chủ đề "${topic.speaking.theme}"): "${topic.speaking.cueCard.title}"
- Writing Task 2 (${topic.writing.type}): "${topic.writing.prompt}"
- Từ vựng chủ đề "${topic.vocab.theme}": ${topic.vocab.words.map((w) => w.word).join(', ')}`;
}
