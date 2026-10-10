import type { messagingApi } from '@line/bot-sdk';

// リッチメニューから送信される合言葉。
// この文字と完全に一致したメッセージにだけ自動返信します。
// 変更するときは、LINE Official Account Manager のリッチメニュー側の「テキスト」も同じ文字にしてください。
export const TRIGGER_TEXT = '購入後のご案内';

// 写真選択ボタンに表示する文字。
export const PHOTO_BUTTON_LABEL = '写真を選ぶ';

// 写真選択ボタンの見た目。
// 色はホームページの注文ボタンと同じ色です。
// 文字の大きさは 'lg'（小さめ）→ 'xl' → 'xxl' → '3xl'（大きめ）の順に大きくなります。
// 余白（ボタンの高さ）は 'md' → 'lg' → 'xl' → 'xxl' の順に大きくなります。
const PHOTO_BUTTON_COLOR = '#b0604f';
const PHOTO_BUTTON_TEXT_SIZE = 'xl';
const PHOTO_BUTTON_PADDING = 'xl';

// ボタンを押したときに開く、LINEアプリ内の「カメラロール（複数枚選択）」。
// LINEが用意している専用のURLで、外部ブラウザには移動しません。
// スマートフォン版LINE（iOS / Android）のトークでのみ動きます。
const CAMERA_ROLL_URL = 'https://line.me/R/nv/cameraRoll/multi';

// 購入後の案内文。
export const PURCHASE_GUIDE_TEXT = `この度は、こぼく工房をご利用いただきありがとうございます！

【ご購入後にお願いしたいこと】

制作を開始するため、以下の3点をこのLINEにお送りください。

① ご注文情報
・注文番号（BASEの購入完了メールに記載）
・ご購入者様のお名前
・ご購入プラン

② お写真の送信
スタンプにしたいお子さまやペットのお写真を複数枚お送りください。

③ ご希望内容
文言・表情・ポーズなど、ご希望があればお知らせください。
おまかせでも大丈夫です！

上記3点を確認後、順次制作を開始いたします。`;

// 写真の送り方の案内（2通目。ボタンの上に表示されます）。
export const PHOTO_HINT_TEXT = `📷 お写真は、下の「${PHOTO_BUTTON_LABEL}」ボタンからお送りいただけます。
複数枚まとめて選べます。追加で送りたいときも、同じボタンをもう一度押してください。`;

// ボタンの下に小さく表示する注意書き。
export const PHOTO_NOTE_TEXT = '※ ボタンが反応しない場合は、メッセージ入力欄の写真マークからお送りください。';

// 通知やトーク一覧に表示される文字（2通目はボタン付きのメッセージのため、代わりの文字が必要です）。
const PHOTO_MESSAGE_ALT_TEXT = `お写真は「${PHOTO_BUTTON_LABEL}」ボタンからお送りいただけます。`;

// 2通目：写真の送り方の案内と、大きな「写真を選ぶ」ボタン。
// ボタンはメッセージの中にあるので、ほかのメッセージが届いても消えず、あとから何度でも押せます。
function buildPhotoMessage(): messagingApi.FlexMessage {
  return {
    type: 'flex',
    altText: PHOTO_MESSAGE_ALT_TEXT,
    contents: {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'lg',
        paddingAll: 'xl',
        backgroundColor: '#ffffff',
        contents: [
          { type: 'text', text: PHOTO_HINT_TEXT, wrap: true, size: 'md', color: '#5a4034' },
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: PHOTO_BUTTON_COLOR,
            cornerRadius: 'xl',
            paddingAll: PHOTO_BUTTON_PADDING,
            action: { type: 'uri', label: PHOTO_BUTTON_LABEL, uri: CAMERA_ROLL_URL },
            contents: [
              {
                type: 'text',
                text: `📷 ${PHOTO_BUTTON_LABEL}`,
                size: PHOTO_BUTTON_TEXT_SIZE,
                weight: 'bold',
                color: '#ffffff',
                align: 'center',
                adjustMode: 'shrink-to-fit',
              },
            ],
          },
          { type: 'text', text: PHOTO_NOTE_TEXT, wrap: true, size: 'xs', color: '#806a5e' },
        ],
      },
    },
  };
}

// 自動返信するメッセージ一式を組み立てます。
export function buildPurchaseGuideMessages(): messagingApi.Message[] {
  return [{ type: 'text', text: PURCHASE_GUIDE_TEXT }, buildPhotoMessage()];
}
