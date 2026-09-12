import {
  createElement,
  AlertCircle, Calendar, Camera, CameraOff, Check, CheckCircle2, ChevronLeft, ChevronRight,
  Cloud, CloudFog, CloudLightning, CloudOff, CloudRain, CloudSun, Clock, ExternalLink,
  LogIn, MapPin, MinusCircle, Plus, PlusCircle, RefreshCcw, ShoppingBag, Snowflake,
  Sparkles, Sun, Trash2, WifiOff, Wand2, X,
} from 'lucide';

/**
 * 使うアイコンだけを登録する（バンドルに全アイコンを含めないため）。
 * CDN 版のようにDOMを走査して <i> を置換するのではなく、
 * SVG を直接生成するので再描画のたびに走査し直す必要がない。
 */
const REGISTRY = {
  'alert-circle': AlertCircle,
  calendar: Calendar,
  camera: Camera,
  'camera-off': CameraOff,
  check: Check,
  'check-circle-2': CheckCircle2,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  cloud: Cloud,
  'cloud-fog': CloudFog,
  'cloud-lightning': CloudLightning,
  'cloud-off': CloudOff,
  'cloud-rain': CloudRain,
  'cloud-sun': CloudSun,
  clock: Clock,
  'external-link': ExternalLink,
  'log-in': LogIn,
  'map-pin': MapPin,
  'minus-circle': MinusCircle,
  plus: Plus,
  'plus-circle': PlusCircle,
  'refresh-ccw': RefreshCcw,
  'shopping-bag': ShoppingBag,
  snowflake: Snowflake,
  sparkles: Sparkles,
  sun: Sun,
  'trash-2': Trash2,
  'wifi-off': WifiOff,
  'wand-2': Wand2,
  x: X,
};

/**
 * アイコン SVG を生成する。
 * 装飾目的なので aria-hidden を付け、読み上げ対象から外す。
 * 意味を伝える必要がある場合はボタン側に aria-label を付けること。
 */
export function icon(name, className = 'w-4 h-4') {
  const iconNode = REGISTRY[name];
  if (!iconNode) {
    console.warn(`未登録のアイコン: ${name}`);
    return document.createComment(`missing icon: ${name}`);
  }
  return createElement(iconNode, {
    class: `${className} pointer-events-none shrink-0`,
    'aria-hidden': 'true',
    focusable: 'false',
  });
}

/** 既存要素の中身をアイコン1つに差し替える */
export function setIcon(target, name, className) {
  target.replaceChildren(icon(name, className));
}
