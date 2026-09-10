const PLACEHOLDER_PATTERNS = [
  /grey-placeholder/i, /placeholder/i, /pixel\.gif/i, /transparent\.png/i,
  /loading\.gif/i, /spinner/i, /blank\.gif/i, /1x1\.(gif|png)/i,
];

const CREDIT_PATTERN = /^(?:photo|image|credit|source|©|copyright|getty(?: images)?|ap(?: photo)?|reuters|afp|bbc|epa)/i;
const TIMESTAMP_PATTERN = /^(?:updated\s+)?(?:\d+\s+(?:minutes?|hours?|days?|weeks?|months?)\s+ago|\d{1,2}\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})$/i;
const BYLINE_PATTERN = /^(?:by\s+)?[\p{Lu}][\p{L}.'’-]+(?:\s+[\p{Lu}][\p{L}.'’-]+){1,4}\s*(?:[\p{L}-]+\s+){0,4}(?:reporter|correspondent|editor|journalist|writer|producer|presenter)\b/iu;
const NAME_PATTERN = /^(?:by\s+)?[\p{Lu}][\p{L}.'’-]+(?:\s+[\p{Lu}][\p{L}.'’-]+){1,3}$/u;

function removeLeadingMetadata(document) {
  document.querySelectorAll('[data-testid*="byline" i], [data-component*="byline" i], [class*="byline" i]')
    .forEach((element) => element.remove());

  let checked = 0;
  let foundMetadata = false;
  const leadingBlocks = [...document.body.querySelectorAll('p, time, div')]
    .filter((element) => !element.querySelector('p, time, div'));
  for (const element of leadingBlocks) {
    if (checked++ >= 8) break;
    const text = element.textContent.replace(/\s+/g, ' ').trim();
    const isUiLabel = /^(?:share|save|add as preferred on google)$/i.test(text);
    const isTimestamp = TIMESTAMP_PATTERN.test(text);
    const isByline = BYLINE_PATTERN.test(text) || (foundMetadata && NAME_PATTERN.test(text));
    if (isTimestamp || isByline || isUiLabel) {
      element.remove();
      foundMetadata = true;
      continue;
    }
    break;
  }
}

function absoluteUrl(value, document) {
  if (!value || value.startsWith('data:')) return value;
  try {
    return new URL(value, document.baseURI).href;
  } catch {
    return value;
  }
}

function parseSrcset(srcset, document) {
  if (!srcset) return [];
  return srcset.split(',').map((entry) => {
    const [url, descriptor = ''] = entry.trim().split(/\s+/, 2);
    const width = Number(descriptor.match(/^(\d+)w$/)?.[1] || 0);
    const density = Number(descriptor.match(/^([\d.]+)x$/)?.[1] || 0);
    return { url: absoluteUrl(url, document), width, density };
  }).filter(({ url }) => url);
}

function bestCandidate(candidates) {
  return candidates.sort((left, right) => right.width - left.width || right.density - left.density)[0]?.url || null;
}

function isPlaceholderImage(image) {
  const src = image.getAttribute('src') || '';
  const dataSrc = image.getAttribute('data-src') || '';
  const className = image.getAttribute('class') || '';
  const hasRealDeferredSource = image.hasAttribute('srcset') || image.hasAttribute('data-srcset') ||
    (dataSrc && !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(dataSrc)));

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(src)) && !hasRealDeferredSource) return true;
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(dataSrc)) && !image.hasAttribute('srcset')) return true;
  if (/image unavailable/i.test(image.getAttribute('aria-label') || '')) return true;
  if (/^(image unavailable|placeholder|loading)$/i.test(image.getAttribute('alt') || '') && !hasRealDeferredSource) return true;
  return /placeholder|spinner|blank/i.test(className) && !hasRealDeferredSource;
}

function bestImageUrl(image, document) {
  const candidates = [
    ...parseSrcset(image.getAttribute('srcset'), document),
    ...parseSrcset(image.getAttribute('data-srcset'), document),
  ];
  const picture = image.closest('picture');
  if (picture) {
    picture.querySelectorAll('source').forEach((source) => {
      candidates.push(...parseSrcset(source.getAttribute('srcset'), document));
      const src = source.getAttribute('src');
      if (src) candidates.push({ url: absoluteUrl(src, document), width: 0, density: 0 });
    });
  }
  const deferredSource = image.getAttribute('data-src');
  const source = image.getAttribute('src');
  if (deferredSource) candidates.push({ url: absoluteUrl(deferredSource, document), width: 0, density: 0 });
  if (source) candidates.push({ url: absoluteUrl(source, document), width: 0, density: 0 });
  return bestCandidate(candidates);
}

function captionParts(figcaption) {
  if (!figcaption) return { caption: '', credit: '' };
  const creditElement = figcaption.querySelector('[class*="credit" i], [class*="source" i], [data-credit]');
  const credit = creditElement?.textContent.trim() || '';
  const text = figcaption.textContent.trim();
  if (credit) return { caption: text.replace(credit, '').trim(), credit };
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && CREDIT_PATTERN.test(lines.at(-1))) {
    return { caption: lines.slice(0, -1).join(' '), credit: lines.at(-1) };
  }
  return CREDIT_PATTERN.test(text) ? { caption: '', credit: text } : { caption: text, credit: '' };
}

function nearbyCredit(image) {
  let container = image.closest('figure') || image;
  while (container?.parentElement) {
    const sibling = container.nextElementSibling;
    if (sibling) {
      const text = sibling.textContent.trim();
      return text.length < 120 && CREDIT_PATTERN.test(text) ? { text, element: sibling } : null;
    }
    container = container.parentElement;
  }
  return null;
}

function normalizeFigure(image, document) {
  let figure = image.closest('figure');
  if (!figure) {
    figure = document.createElement('figure');
    figure.className = 'article-image';
    image.replaceWith(figure);
    figure.append(image);
  } else {
    figure.classList.add('article-image');
  }

  const originalCaption = figure.querySelector('figcaption');
  const { caption, credit } = captionParts(originalCaption);
  const adjacentCredit = credit ? null : nearbyCredit(image);
  const resolvedCredit = credit || adjacentCredit?.text || '';
  if (adjacentCredit) adjacentCredit.element.remove();
  if (originalCaption) originalCaption.remove();
  if (caption || resolvedCredit) {
    const figcaption = document.createElement('figcaption');
    if (caption) {
      const captionElement = document.createElement('span');
      captionElement.className = 'caption';
      captionElement.textContent = caption;
      figcaption.append(captionElement);
    }
    if (resolvedCredit) {
      const creditElement = document.createElement('span');
      creditElement.className = 'credit';
      creditElement.textContent = resolvedCredit;
      figcaption.append(creditElement);
    }
    figure.append(figcaption);
  }
}

export function processImagesJSDOM(document) {
  document.querySelectorAll('video, audio, iframe, embed, object').forEach((element) => element.remove());

  document.querySelectorAll('picture').forEach((picture) => {
    if (picture.querySelector('img')) return;
    const candidates = [];
    picture.querySelectorAll('source').forEach((source) => {
      candidates.push(...parseSrcset(source.getAttribute('srcset'), document));
      const src = source.getAttribute('src');
      if (src) candidates.push({ url: absoluteUrl(src, document), width: 0, density: 0 });
    });
    const source = bestCandidate(candidates);
    if (source) {
      const image = document.createElement('img');
      image.setAttribute('src', source);
      image.setAttribute('alt', picture.getAttribute('alt') || '');
      picture.append(image);
    }
  });

  [...document.querySelectorAll('img')].forEach((image) => {
    if (!image.isConnected) return;
    if (isPlaceholderImage(image)) {
      image.remove();
      return;
    }
    const source = bestImageUrl(image, document);
    if (!source) {
      image.remove();
      return;
    }
    image.setAttribute('src', source);
    ['srcset', 'sizes', 'data-srcset', 'data-src', 'loading'].forEach((attribute) => image.removeAttribute(attribute));
    normalizeFigure(image, document);
  });

  document.querySelectorAll('picture').forEach((picture) => {
    const image = picture.querySelector('img');
    if (image) picture.replaceWith(image.closest('figure') || image);
    else picture.remove();
  });
  document.querySelectorAll('figure').forEach((figure) => {
    if (!figure.querySelector('img')) figure.remove();
  });
  return document;
}

export function sanitizeHtmlJSDOM(document) {
  document.querySelectorAll('script, style, noscript').forEach((element) => element.remove());
  document.querySelectorAll('*').forEach((element) => {
    [...element.attributes].filter((attribute) => attribute.name.startsWith('on'))
      .forEach((attribute) => element.removeAttribute(attribute.name));
  });
  removeLeadingMetadata(document);
  return processImagesJSDOM(document);
}
