import type { messagingApi } from '@line/bot-sdk';

// リッチメニューから送信される合言葉。
// この文字と完全に一致したメッセージにだけ自動返信します。
// 変更するときは、LINE Official Account Manager のリッチメニュー側の「テキスト」も同じ文字にしてください。
export const TRIGGER_TEXT = '購入後のご案内';

// 写真選択ボタン（クイックリプライ）に表示する文字。
export const PHOTO_BUTTON_LABEL = '写真を選ぶ';

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

// 写真の送り方の補足。
// 「写真を選ぶ」ボタンは写真を1回送ると消えるので、追加で送る方法もここで案内しています。
// 補足が不要な場合は、下の buildPurchaseGuideMessages() から2通目を外してください。
export const PHOTO_HINT_TEXT = `📷 お写真は、下の「${PHOTO_BUTTON_LABEL}」ボタンからお送りいただけます。
複数枚ある場合は、何回かに分けて送っていただいても大丈夫です。
ボタンが消えたあとは、メッセージ入力欄の写真マークからいつでも追加できます。`;

// 自動返信するメッセージ一式を組み立てます。
// クイックリプライは「最後のメッセージ」に付けたものだけが表示されるため、2通目に付けています。
export function buildPurchaseGuideMessages(): messagingApi.Message[] {
  const quickReply: messagingApi.QuickReply = {
    items: [
      {
        type: 'action',
        // cameraRoll = LINEアプリ内でカメラロールを開く（外部ブラウザには移動しません）
        action: { type: 'cameraRoll', label: PHOTO_BUTTON_LABEL },
      },
    ],
  };

  return [
    { type: 'text', text: PURCHASE_GUIDE_TEXT },
    { type: 'text', text: PHOTO_HINT_TEXT, quickReply },
  ];
}
