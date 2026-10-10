// Vercel Functions の入口です。公開URLは https://<プロジェクト名>.vercel.app/api/webhook になります。
import { handleWebhookRequest } from '../src/handler';

// LINEからのWebhookを受け取る
export async function POST(request: Request): Promise<Response> {
  return handleWebhookRequest(request);
}

// ブラウザでURLを開いたときの動作確認用（LINEはここを使いません）
export function GET(): Response {
  return new Response('koboku-line-bot webhook is running.', { status: 200 });
}
