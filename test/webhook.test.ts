// 実際のLINEには接続せず、Webhookの動作を確認するテストです。
// 実行: npm test
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { GET, POST } from '../api/webhook';
import { PHOTO_BUTTON_LABEL, PURCHASE_GUIDE_TEXT, TRIGGER_TEXT } from '../src/messages';

const CHANNEL_SECRET = 'test-channel-secret';
const ACCESS_TOKEN = 'test-access-token';

type FetchCall = { url: string; init: RequestInit };
let fetchCalls: FetchCall[];
let lineApiStatus: number;

function sign(body: string, secret = CHANNEL_SECRET): string {
  return createHmac('sha256', secret).update(body).digest('base64');
}

function webhookRequest(payload: unknown, signature?: string | null): Request {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const sig = signature === undefined ? sign(body) : signature;
  if (sig !== null) headers['x-line-signature'] = sig;
  return new Request('https://example.vercel.app/api/webhook', { method: 'POST', headers, body });
}

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'message',
    mode: 'active',
    timestamp: Date.now(),
    source: { type: 'user', userId: 'U0000000000000000000000000000000' },
    webhookEventId: randomUUID(),
    deliveryContext: { isRedelivery: false },
    replyToken: randomUUID(),
    ...overrides,
  };
}

function textEvent(text: string, overrides: Record<string, unknown> = {}) {
  return baseEvent({ message: { type: 'text', id: '1', quoteToken: 'q', text }, ...overrides });
}

function payloadOf(...events: unknown[]) {
  return { destination: 'U1111111111111111111111111111111', events };
}

beforeEach(() => {
  process.env.LINE_CHANNEL_SECRET = CHANNEL_SECRET;
  process.env.LINE_CHANNEL_ACCESS_TOKEN = ACCESS_TOKEN;
  fetchCalls = [];
  lineApiStatus = 200;
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init: RequestInit = {}) => {
    fetchCalls.push({ url: String(input), init });
    if (lineApiStatus !== 200) {
      return new Response(JSON.stringify({ message: 'error from LINE' }), { status: lineApiStatus });
    }
    return new Response(JSON.stringify({ sentMessages: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  // テスト中のログ出力を止める
  mock.method(console, 'log', () => {});
  mock.method(console, 'warn', () => {});
  mock.method(console, 'error', () => {});
});

afterEach(() => {
  mock.restoreAll();
});

describe('購入後のご案内の自動返信', () => {
  it('「購入後のご案内」には案内文と「写真を選ぶ」ボタンを返信する', async () => {
    const event = textEvent(TRIGGER_TEXT);
    const res = await POST(webhookRequest(payloadOf(event)));

    assert.equal(res.status, 200);
    assert.equal(fetchCalls.length, 1);

    const call = fetchCalls[0];
    assert.equal(call.url, 'https://api.line.me/v2/bot/message/reply');
    assert.equal(call.init.method, 'POST');
    const headers = new Headers(call.init.headers);
    assert.equal(headers.get('authorization'), `Bearer ${ACCESS_TOKEN}`);

    const sent = JSON.parse(String(call.init.body));
    assert.equal(sent.replyToken, event.replyToken);
    assert.equal(sent.messages[0].type, 'text');
    assert.equal(sent.messages[0].text, PURCHASE_GUIDE_TEXT);

    // クイックリプライは最後のメッセージに付いていること
    const last = sent.messages.at(-1);
    assert.deepEqual(last.quickReply, {
      items: [{ type: 'action', action: { type: 'cameraRoll', label: PHOTO_BUTTON_LABEL } }],
    });
    assert.ok(sent.messages.length <= 5, '1回の返信は5通まで');
  });

  it('前後に空白や改行が付いていても返信する', async () => {
    await POST(webhookRequest(payloadOf(textEvent(`  ${TRIGGER_TEXT}\n`))));
    assert.equal(fetchCalls.length, 1);
  });

  it('案内文は依頼された文面のとおり', () => {
    assert.ok(PURCHASE_GUIDE_TEXT.startsWith('この度は、こぼく工房をご利用いただきありがとうございます！'));
    assert.ok(PURCHASE_GUIDE_TEXT.includes('・注文番号（BASEの購入完了メールに記載）'));
    assert.ok(PURCHASE_GUIDE_TEXT.endsWith('上記3点を確認後、順次制作を開始いたします。'));
    assert.equal(PHOTO_BUTTON_LABEL, '写真を選ぶ');
    assert.equal(TRIGGER_TEXT, '購入後のご案内');
  });
});

describe('既存LINEとの共存（自動返信しないケース）', () => {
  const noReplyCases: Array<[string, unknown]> = [
    ['通常のお問い合わせ', textEvent('こんにちは。納期を教えてください')],
    ['合言葉を含むだけの文章', textEvent('購入後のご案内をお願いします')],
    ['リッチメニューのボタン名', textEvent('購入後はこちら')],
    ['写真', baseEvent({ message: { type: 'image', id: '2', quoteToken: 'q', contentProvider: { type: 'line' } } })],
    ['スタンプ', baseEvent({ message: { type: 'sticker', id: '3', quoteToken: 'q', packageId: '1', stickerId: '1' } })],
    ['友だち追加', baseEvent({ type: 'follow', follow: { isUnblocked: false } })],
    ['ブロック', baseEvent({ type: 'unfollow', replyToken: undefined })],
    ['ポストバック', baseEvent({ type: 'postback', postback: { data: TRIGGER_TEXT } })],
    ['グループトークでの発言', textEvent(TRIGGER_TEXT, { source: { type: 'group', groupId: 'C1' } })],
    ['standbyモード', textEvent(TRIGGER_TEXT, { mode: 'standby' })],
    ['応答トークンなし', textEvent(TRIGGER_TEXT, { replyToken: undefined })],
  ];

  for (const [name, event] of noReplyCases) {
    it(`${name}には返信しない`, async () => {
      const res = await POST(webhookRequest(payloadOf(event)));
      assert.equal(res.status, 200);
      assert.equal(fetchCalls.length, 0);
    });
  }

  it('写真が複数枚まとめて届いても返信しない', async () => {
    const images = [1, 2, 3].map((n) =>
      baseEvent({ message: { type: 'image', id: String(n), quoteToken: 'q', contentProvider: { type: 'line' } } }),
    );
    const res = await POST(webhookRequest(payloadOf(...images)));
    assert.equal(res.status, 200);
    assert.equal(fetchCalls.length, 0);
  });

  it('複数イベントのうち、合言葉のものにだけ返信する', async () => {
    const res = await POST(
      webhookRequest(payloadOf(textEvent('こんにちは'), textEvent(TRIGGER_TEXT), textEvent('ありがとう'))),
    );
    assert.equal(res.status, 200);
    assert.equal(fetchCalls.length, 1);
  });
});

describe('セキュリティ', () => {
  it('署名が正しくないリクエストは 401 で拒否する', async () => {
    const res = await POST(webhookRequest(payloadOf(textEvent(TRIGGER_TEXT)), 'aW52YWxpZA=='));
    assert.equal(res.status, 401);
    assert.equal(fetchCalls.length, 0);
  });

  it('別のチャネルシークレットで作られた署名は拒否する', async () => {
    const body = JSON.stringify(payloadOf(textEvent(TRIGGER_TEXT)));
    const res = await POST(webhookRequest(body, sign(body, 'another-secret')));
    assert.equal(res.status, 401);
    assert.equal(fetchCalls.length, 0);
  });

  it('署名ヘッダーがないリクエストは 401 で拒否する', async () => {
    const res = await POST(webhookRequest(payloadOf(textEvent(TRIGGER_TEXT)), null));
    assert.equal(res.status, 401);
    assert.equal(fetchCalls.length, 0);
  });

  it('本文を書き換えられたリクエストは拒否する', async () => {
    const original = JSON.stringify(payloadOf(textEvent('こんにちは')));
    const tampered = JSON.stringify(payloadOf(textEvent(TRIGGER_TEXT)));
    const res = await POST(webhookRequest(tampered, sign(original)));
    assert.equal(res.status, 401);
    assert.equal(fetchCalls.length, 0);
  });

  it('署名は正しいがJSONでない本文は 400', async () => {
    const res = await POST(webhookRequest('not json'));
    assert.equal(res.status, 400);
    assert.equal(fetchCalls.length, 0);
  });

  it('環境変数が未設定なら 500（返信はしない）', async () => {
    delete process.env.LINE_CHANNEL_SECRET;
    const res = await POST(webhookRequest(payloadOf(textEvent(TRIGGER_TEXT))));
    assert.equal(res.status, 500);
    assert.equal(fetchCalls.length, 0);
  });

  it('環境変数の前後に空白や改行が混ざっていても動く', async () => {
    process.env.LINE_CHANNEL_SECRET = ` ${CHANNEL_SECRET}\n`;
    process.env.LINE_CHANNEL_ACCESS_TOKEN = `${ACCESS_TOKEN} \n`;
    const res = await POST(webhookRequest(payloadOf(textEvent(TRIGGER_TEXT))));
    assert.equal(res.status, 200);
    assert.equal(fetchCalls.length, 1);
    assert.equal(new Headers(fetchCalls[0].init.headers).get('authorization'), `Bearer ${ACCESS_TOKEN}`);
  });
});

describe('二重返信の防止', () => {
  it('同じイベントが2回届いても、返信は1回だけ', async () => {
    const event = textEvent(TRIGGER_TEXT);
    const first = await POST(webhookRequest(payloadOf(event)));
    const second = await POST(webhookRequest(payloadOf(event)));
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(fetchCalls.length, 1);
  });

  it('同じイベントが同時に届いても、返信は1回だけ', async () => {
    const event = textEvent(TRIGGER_TEXT);
    await Promise.all([POST(webhookRequest(payloadOf(event))), POST(webhookRequest(payloadOf(event)))]);
    assert.equal(fetchCalls.length, 1);
  });

  it('再送イベント（isRedelivery）には返信しない', async () => {
    const event = textEvent(TRIGGER_TEXT, { deliveryContext: { isRedelivery: true } });
    const res = await POST(webhookRequest(payloadOf(event)));
    assert.equal(res.status, 200);
    assert.equal(fetchCalls.length, 0);
  });

  it('お客様が2回タップした場合（別イベント）は、それぞれに返信する', async () => {
    await POST(webhookRequest(payloadOf(textEvent(TRIGGER_TEXT))));
    await POST(webhookRequest(payloadOf(textEvent(TRIGGER_TEXT))));
    assert.equal(fetchCalls.length, 2);
  });
});

describe('Webhookの検証・エラー時の動作', () => {
  it('LINE Developers の「検証」ボタン（eventsが空）には 200 を返す', async () => {
    const res = await POST(webhookRequest(payloadOf()));
    assert.equal(res.status, 200);
    assert.equal(fetchCalls.length, 0);
  });

  it('LINEへの返信が失敗しても 200 を返し、エラーをログに残す', async () => {
    lineApiStatus = 401;
    const res = await POST(webhookRequest(payloadOf(textEvent(TRIGGER_TEXT))));
    assert.equal(res.status, 200);
    assert.equal(fetchCalls.length, 1);
    const errorLog = (console.error as unknown as { mock: { calls: Array<{ arguments: unknown[] }> } }).mock.calls;
    assert.equal(errorLog.length, 1);
    assert.match(String(errorLog[0].arguments[0]), /status=401/);
  });

  it('ブラウザで開いたとき（GET）は 200 を返す', async () => {
    const res = GET();
    assert.equal(res.status, 200);
  });
});
