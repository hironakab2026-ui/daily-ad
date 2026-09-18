// 評価（grade）算出ロジック（03_要件定義書_運動管理アプリ.md 6章「採点基準は未定」への一次回答）。
// 直近7日間のトレーニング日数を基準にする、シンプルな頻度ベースの評価。
//   S: 週5日以上／A: 週3〜4日／B: 週1〜2日／C: 週0日
// 種目・重量の質までは評価しない（Phase 4での詳細化を想定）。
function gradeForWeekDays(weekDays) {
  if (weekDays >= 5) return 'S';
  if (weekDays >= 3) return 'A';
  if (weekDays >= 1) return 'B';
  return 'C';
}

module.exports = { gradeForWeekDays };
