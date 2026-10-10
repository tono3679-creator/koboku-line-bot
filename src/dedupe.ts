// 同じWebhookイベントが2回届いたときに、2回返信してしまうのを防ぐための記録です。
//
// LINEは通信状況によって同じイベントを複数回送ってくることがあります。
// イベントごとに付く webhookEventId を一定時間覚えておき、2回目以降は処理しません。
//
// 記録はサーバーのメモリ上だけに持ちます（お客様の情報は保存しません。IDのみです）。
// Vercelのサーバーは複数台に分かれることがあるため、この記録だけでは完全ではありませんが、
// 「返信は応答トークン（1回しか使えない）で行う」「再送イベントは処理しない」と組み合わせて
// 二重返信を防いでいます（handler.ts 参照）。

const REMEMBER_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 1000;

const seenEventIds = new Map<string, number>();

// 初めて見るイベントなら記録して false、すでに処理済みなら true を返します。
export function isDuplicateEvent(webhookEventId: string, now: number = Date.now()): boolean {
  for (const [id, expiresAt] of seenEventIds) {
    if (expiresAt <= now) seenEventIds.delete(id);
  }

  if (seenEventIds.has(webhookEventId)) return true;

  // 記録が増えすぎないよう、上限を超えたら古いものから消す
  if (seenEventIds.size >= MAX_ENTRIES) {
    const oldest = seenEventIds.keys().next().value;
    if (oldest !== undefined) seenEventIds.delete(oldest);
  }

  seenEventIds.set(webhookEventId, now + REMEMBER_MS);
  return false;
}
