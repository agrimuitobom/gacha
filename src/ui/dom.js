/**
 * DOM構築ヘルパー。
 * テキストは必ず textContent 経由で入るため、
 * ユーザー入力が HTML として解釈されることがない（XSS対策）。
 */
export function h(tag, props, ...children) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') element.className = value;
    else if (key === 'text') element.textContent = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else element.setAttribute(key, value === true ? '' : value);
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    element.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return element;
}

export const $ = (id) => document.getElementById(id);
