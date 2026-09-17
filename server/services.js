// 連携可能な外部サービスの定義（将来アプリが増えたらここに追加する）
const AVAILABLE_SERVICES = [
  { content_key: 'meal', display_name: '食事管理アプリ' },
  { content_key: 'workout', display_name: '運動管理アプリ' },
];

function isValidContentKey(key) {
  return AVAILABLE_SERVICES.some((s) => s.content_key === key);
}

function displayNameFor(key) {
  return AVAILABLE_SERVICES.find((s) => s.content_key === key)?.display_name || key;
}

// 新しい端末（ユーザー）を作成したときに用意する初期カテゴリ
const DEFAULT_CATEGORIES = [
  ['expense', '食費', 1],
  ['expense', '日用品', 2],
  ['expense', '交通費', 3],
  ['expense', '交際費', 4],
  ['expense', '娯楽', 5],
  ['expense', '医療', 6],
  ['expense', '固定費', 7],
  ['expense', 'その他', 99],
  ['income', '給与', 1],
  ['income', '副収入', 2],
  ['income', '臨時収入', 3],
];

module.exports = { AVAILABLE_SERVICES, isValidContentKey, displayNameFor, DEFAULT_CATEGORIES };
