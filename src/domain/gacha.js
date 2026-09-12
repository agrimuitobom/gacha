/**
 * コーデ抽選エンジン。
 *
 * 気温・降水確率・その日の予定から各アイテムにスコアを付け、
 * スコアを重みにした加重ランダムで1点ずつ引く。
 * 決定論的に「最適解」を出すのではなく、ふさわしい服が出やすい
 * "ガチャ" として成立させるのが狙い。
 */

export const CATEGORIES = ['tops', 'bottoms', 'shoes'];

export const CATEGORY_LABELS = {
  tops: 'トップス',
  bottoms: 'ボトムス',
  shoes: 'シューズ',
};

/** 気温から必要な生地の厚み(1-5)を求める */
export function targetWarmthFor(temp) {
  if (temp >= 28) return 1;
  if (temp >= 23) return 2;
  if (temp >= 17) return 3;
  if (temp >= 10) return 4;
  return 5;
}

const FORMAL_KEYWORDS = ['仕事', '会議', '打ち合わせ', '面接', '商談', '式典', '結婚式', '葬儀', 'プレゼン', '出社', '面談', '説明会'];
const SMART_KEYWORDS = ['デート', 'ディナー', '食事', 'ランチ', '観劇', 'パーティ', '飲み会', 'お出かけ', 'カフェ', '映画'];

/** その日の予定から必要なきれいめ度(1-3)を求める */
export function targetFormalityFor(schedules) {
  let level = 1;
  for (const item of schedules) {
    const title = item.title || '';
    if (FORMAL_KEYWORDS.some((word) => title.includes(word))) return 3;
    if (SMART_KEYWORDS.some((word) => title.includes(word))) level = Math.max(level, 2);
  }
  return level;
}

export function buildContext({ weather, schedules }) {
  const temp = weather ? weather.temp : null;
  const pop = weather ? weather.pop : null;
  return {
    temp,
    pop,
    targetWarmth: temp === null ? null : targetWarmthFor(temp),
    targetFormality: targetFormalityFor(schedules),
    rainy: pop !== null && pop >= 50,
  };
}

export function scoreItem(item, context) {
  let score = 10;
  if (context.targetWarmth !== null) {
    score -= Math.abs(item.warmth - context.targetWarmth) * 2.5;
  }
  score -= Math.abs(item.formality - context.targetFormality) * 1.5;
  if (context.rainy && item.rainSafe === false) score -= 4;
  // 0 にしないことで「たまに意外な組み合わせが出る」ガチャ性を残す
  return Math.max(0.2, score);
}

export function weightedPick(items, context, random = Math.random) {
  const weights = items.map((item) => scoreItem(item, context));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let threshold = random() * total;
  for (let index = 0; index < items.length; index += 1) {
    threshold -= weights[index];
    if (threshold <= 0) return items[index];
  }
  return items[items.length - 1];
}

export function buildMessage(context, missing) {
  if (missing.length > 0) {
    return `クローゼットに${missing.join('・')}が登録されていません。右上の「＋」から追加すると、完全なコーデを提案できます。`;
  }

  const parts = [];
  if (context.temp === null) {
    parts.push('天気を取得できなかったので、気温は考慮せずに選びました');
  } else {
    const warmthWord =
      context.targetWarmth <= 1 ? '涼しく過ごせる薄手' :
      context.targetWarmth === 2 ? '軽めの' :
      context.targetWarmth === 3 ? '過ごしやすい' :
      context.targetWarmth === 4 ? '暖かめの' : 'しっかり防寒できる';
    parts.push(`今日は${context.temp}°なので、${warmthWord}アイテムを選びました`);
  }

  if (context.rainy) {
    parts.push(`降水確率が${context.pop}%なので、雨に強いものを優先しています`);
  }

  if (context.targetFormality === 3) {
    parts.push('かしこまった予定があるので、フォーマル寄りにまとめました');
  } else if (context.targetFormality === 2) {
    parts.push('お出かけの予定に合わせて、少しきれいめにしています');
  }

  return `${parts.join('。')}。`;
}

/**
 * コーデを1組引く。
 * @param {{ items: object[], weather: object|null, schedules: object[], random?: () => number }} input
 */
export function drawOutfit({ items, weather, schedules, random = Math.random }) {
  const context = buildContext({ weather, schedules });

  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, items.filter((item) => item.category === category)])
  );

  const missing = CATEGORIES.filter((category) => byCategory[category].length === 0).map(
    (category) => CATEGORY_LABELS[category]
  );

  const picks = Object.fromEntries(
    CATEGORIES.map((category) => [
      category,
      byCategory[category].length ? weightedPick(byCategory[category], context, random) : null,
    ])
  );

  return { ...picks, message: buildMessage(context, missing), missing, context };
}
