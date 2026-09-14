/**
 * コーデ抽選エンジン。
 *
 * 気温・降水確率・その日の予定から各アイテムにスコアを付け、
 * スコアを重みにした加重ランダムで1点ずつ引く。
 * 決定論的に「最適解」を出すのではなく、ふさわしい服が出やすい
 * "ガチャ" として成立させるのが狙い。
 */

/** 表示順。上に着るものから並べる */
export const CATEGORIES = ['outer', 'tops', 'bottoms', 'shoes'];

/**
 * 必ず1点は選ぶカテゴリ。
 * アウターは気温次第で出さないので、ここには含めない。
 */
export const REQUIRED_CATEGORIES = ['tops', 'bottoms', 'shoes'];

export const CATEGORY_LABELS = {
  outer: 'アウター',
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

/**
 * 気温からアウターの要否を決める。
 *   no       … 不要
 *   optional … 朝晩は冷えるので、あると安心
 *   yes      … 無いと寒い
 */
export function outerNeedFor(temp) {
  if (temp === null) return 'no';
  if (temp >= 22) return 'no';
  if (temp >= 16) return 'optional';
  return 'yes';
}

/**
 * 直近に着たものは控えめにする日数。
 * 短すぎると毎日同じ組み合わせになり、長すぎると
 * 手持ちが少ない人がまともな提案を受けられなくなる。
 */
export const RECENT_WINDOW_DAYS = 4;

/**
 * 直近のコーデ記録から「何日前に着たか」を引ける Map を作る。
 * @param {{date: string, outerId, topsId, bottomsId, shoesId}[]} outfits
 * @param {string} todayKey
 */
export function buildRecentlyWorn(outfits, todayKey) {
  const worn = new Map();
  const today = Date.parse(`${todayKey}T00:00:00`);

  for (const outfit of outfits) {
    const daysAgo = Math.round((today - Date.parse(`${outfit.date}T00:00:00`)) / 86400000);
    if (daysAgo < 0 || daysAgo >= RECENT_WINDOW_DAYS) continue;
    for (const id of [outfit.outerId, outfit.topsId, outfit.bottomsId, outfit.shoesId]) {
      if (!id) continue;
      // 同じ服を複数回着ていたら、直近の方を採用する
      if (!worn.has(id) || worn.get(id) > daysAgo) worn.set(id, daysAgo);
    }
  }
  return worn;
}

export function buildContext({ weather, schedules, recentlyWorn = new Map() }) {
  const temp = weather ? weather.temp : null;
  const pop = weather ? weather.pop : null;
  return {
    temp,
    pop,
    targetWarmth: temp === null ? null : targetWarmthFor(temp),
    targetFormality: targetFormalityFor(schedules),
    rainy: pop !== null && pop >= 50,
    outerNeed: outerNeedFor(temp),
    recentlyWorn,
  };
}

export function scoreItem(item, context) {
  let score = 10;
  if (context.targetWarmth !== null) {
    score -= Math.abs(item.warmth - context.targetWarmth) * 2.5;
  }
  score -= Math.abs(item.formality - context.targetFormality) * 1.5;
  if (context.rainy && item.rainSafe === false) score -= 4;

  // 最近着たものは控えめに。直近ほど強く下げる
  const daysAgo = context.recentlyWorn?.get(item.id);
  if (daysAgo !== undefined) score -= RECENT_WINDOW_DAYS - daysAgo;
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

export function buildMessage(context, missing, { outerPicked = false, outerUnavailable = false } = {}) {
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

  if (outerPicked) {
    parts.push(context.outerNeed === 'yes'
      ? '冷えるのでアウターも合わせています'
      : '朝晩の冷え込みに備えて羽織りものを足しました');
  } else if (outerUnavailable && context.outerNeed === 'yes') {
    // 責めるのではなく、登録を促す
    parts.push('この気温だとアウターが欲しいところですが、まだ登録がありません');
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
export function drawOutfit({ items, weather, schedules, recentlyWorn, random = Math.random }) {
  const context = buildContext({ weather, schedules, recentlyWorn });

  const byCategory = Object.fromEntries(
    CATEGORIES.map((category) => [category, items.filter((item) => item.category === category)])
  );

  // 「足りない」と言うのは必須カテゴリだけ。
  // アウターは気温次第で不要なので、無くても欠品扱いにしない。
  const missing = REQUIRED_CATEGORIES
    .filter((category) => byCategory[category].length === 0)
    .map((category) => CATEGORY_LABELS[category]);

  const hasOuter = byCategory.outer.length > 0;
  const includeOuter = hasOuter && (
    context.outerNeed === 'yes' ||
    // 迷う気温は引くたびに変わってよい（ガチャとしての揺らぎ）
    (context.outerNeed === 'optional' && random() < 0.5)
  );

  const outer = includeOuter ? weightedPick(byCategory.outer, context, random) : null;

  // アウターを着るぶん、中は一段薄くてよい
  const innerContext = outer && context.targetWarmth !== null
    ? { ...context, targetWarmth: Math.max(1, context.targetWarmth - 1) }
    : context;

  const picks = {
    outer,
    tops: byCategory.tops.length ? weightedPick(byCategory.tops, innerContext, random) : null,
    bottoms: byCategory.bottoms.length ? weightedPick(byCategory.bottoms, context, random) : null,
    shoes: byCategory.shoes.length ? weightedPick(byCategory.shoes, context, random) : null,
  };

  return {
    ...picks,
    message: buildMessage(context, missing, {
      outerPicked: Boolean(outer),
      outerUnavailable: !hasOuter,
    }),
    missing,
    context,
  };
}
