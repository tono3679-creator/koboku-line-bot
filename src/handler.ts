import { HTTPFetchError, messagingApi, validateSignature, webhook } from '@line/bot-sdk';
import { isDuplicateEvent } from './dedupe';
import { TRIGGER_TEXT, buildPurchaseGuideMessages } from './messages';

const LOG_PREFIX = '[koboku-line-bot]';

// 「購入後のご案内」に返信すべきイベントだけを通すための型。
type PurchaseGuideRequest = webhook.MessageEvent & {
  replyToken: string;
  message: webhook.TextMessageContent;
};

let cachedClient: { token: string; client: messagingApi.MessagingApiClient } | undefined;

function getClient(channelAccessToken: string): messagingApi.MessagingApiClient {
  if (cachedClient?.token !== channelAccessToken) {
    cachedClient = {
      token: channelAccessToken,
      client: new messagingApi.MessagingApiClient({ channelAccessToken }),
    };
  }
  return cachedClient.client;
}

// 自動返信の対象かどうかを判定します。
// ここで true にならないもの（写真・スタンプ・通常のお問い合わせ・友だち追加など）には一切返信しません。
function isPurchaseGuideRequest(event: webhook.Event): event is PurchaseGuideRequest {
  return (
    event.type === 'message' &&
    event.mode === 'active' &&
    // 1対1のトークのみ（リッチメニューは1対1のトークにしか表示されないため）
    event.source?.type === 'user' &&
    event.message.type === 'text' &&
    event.message.text.trim() === TRIGGER_TEXT &&
    typeof event.replyToken === 'string' &&
    event.replyToken.length > 0
  );
}

function logReplyError(webhookEventId: string, error: unknown): void {
  if (error instanceof HTTPFetchError) {
    // status 401: アクセストークンが違う／失効  400: 応答トークンが期限切れ・使用済み など
    console.error(
      `${LOG_PREFIX} 返信に失敗しました event=${webhookEventId} status=${error.status}` +
        ` requestId=${error.headers.get('x-line-request-id') ?? '-'} body=${error.body}`,
    );
    return;
  }
  console.error(`${LOG_PREFIX} 返信に失敗しました event=${webhookEventId}`, error);
}

// LINEからのWebhook（POST）を処理します。
export async function handleWebhookRequest(request: Request): Promise<Response> {
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!channelSecret || !channelAccessToken) {
    console.error(
      `${LOG_PREFIX} 環境変数 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN が設定されていません。` +
        'Vercelの Settings > Environment Variables を確認し、設定後に再デプロイしてください。',
    );
    return new Response('Server is not configured', { status: 500 });
  }

  // 署名の検証には「届いたままの本文」が必要なので、JSONに変換する前のデータで検証する
  const rawBody = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get('x-line-signature');
  if (!signature || !validateSignature(rawBody, channelSecret, signature)) {
    console.warn(
      `${LOG_PREFIX} 署名の検証に失敗したため、リクエストを拒否しました。` +
        'LINE以外からのアクセスか、LINE_CHANNEL_SECRET の値が違う可能性があります。',
    );
    return new Response('Invalid signature', { status: 401 });
  }

  let events: webhook.Event[];
  try {
    const payload = JSON.parse(rawBody.toString('utf8')) as Partial<webhook.CallbackRequest>;
    events = Array.isArray(payload.events) ? payload.events : [];
  } catch {
    console.warn(`${LOG_PREFIX} 本文をJSONとして読み取れませんでした。`);
    return new Response('Invalid body', { status: 400 });
  }

  // LINE Developers の「検証」ボタンは events が空のリクエストを送ってくる。その場合はそのまま 200 を返す。
  let replied = 0;
  for (const event of events) {
    if (!isPurchaseGuideRequest(event)) continue;

    // 再送されたイベント・すでに処理したイベントには返信しない（二重返信の防止）
    if (event.deliveryContext?.isRedelivery) {
      console.log(`${LOG_PREFIX} 再送イベントのため返信しません event=${event.webhookEventId}`);
      continue;
    }
    if (isDuplicateEvent(event.webhookEventId)) {
      console.log(`${LOG_PREFIX} 処理済みイベントのため返信しません event=${event.webhookEventId}`);
      continue;
    }

    try {
      // 応答トークンは1回しか使えないため、万一同じイベントを2回処理してもLINE側で2通目は拒否される
      await getClient(channelAccessToken).replyMessage({
        replyToken: event.replyToken,
        messages: buildPurchaseGuideMessages(),
      });
      replied += 1;
      console.log(`${LOG_PREFIX} 購入後のご案内を返信しました event=${event.webhookEventId}`);
    } catch (error) {
      logReplyError(event.webhookEventId, error);
    }
  }

  // お客様のメッセージ内容やユーザーIDはログに残さない（件数のみ）
  console.log(`${LOG_PREFIX} 受信 ${events.length}件 / 返信 ${replied}件`);

  // 返信に失敗した場合もLINEには 200 を返す（失敗の詳細は上のログで確認する）
  return new Response('OK', { status: 200 });
}
