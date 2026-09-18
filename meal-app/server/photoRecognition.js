// 写真から食品名・概算栄養価を推定する（F-04改善：写真による自動入力）。
// Anthropic API（Claude、マルチモーダル対応モデル）を使う。ANTHROPIC_API_KEY が
// meal-app/.env に設定されていない場合は NO_API_KEY エラーを投げる。
const PROMPT = `この写真に写っている食事について、以下のJSON形式だけで回答してください。
説明文やコードブロックのマークダウンは付けず、JSONオブジェクトのみを出力してください。

{
  "name": "料理名（日本語、簡潔に）",
  "calories_kcal": 写真に写っている分量のおおよそのカロリー(kcal、整数),
  "protein_g": タンパク質(g、数値。分からなければnull),
  "fat_g": 脂質(g、数値。分からなければnull),
  "carbs_g": 炭水化物(g、数値。分からなければnull),
  "note": "推定の前提（見た目の量など）を一言で"
}`;

function noApiKeyError() {
  return Object.assign(new Error('ANTHROPIC_API_KEY is not set'), { code: 'NO_API_KEY' });
}

async function recognizePhoto(dataUrl) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw noApiKeyError();

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error('image は data:image/...;base64,... 形式で指定してください');
  }
  const [, mediaType, base64Data] = match;

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

  const message = await client.messages.create({
    model,
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === 'text');
  const jsonMatch = textBlock?.text?.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('AIの応答からJSONを取り出せませんでした');
  }
  const parsed = JSON.parse(jsonMatch[0]);

  return {
    name: parsed.name || '不明な料理',
    calories_kcal: parsed.calories_kcal ?? null,
    protein_g: parsed.protein_g ?? null,
    fat_g: parsed.fat_g ?? null,
    carbs_g: parsed.carbs_g ?? null,
    note: parsed.note || 'AIによる写真からの推定値です。目安としてご利用ください。',
  };
}

module.exports = { recognizePhoto };
