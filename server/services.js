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

module.exports = { AVAILABLE_SERVICES, isValidContentKey, displayNameFor };
