import { useState, useEffect, useCallback, useMemo } from 'react';

function clipboardContent(content) {
  const doc = new DOMParser().parseFromString(content, 'text/html');
  doc.querySelectorAll('script, style, noscript, video, audio, iframe, embed, object').forEach((element) => element.remove());

  const blocks = [];
  let inlineText = '';
  const blockTags = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'li', 'td', 'th', 'pre']);
  const addInlineText = (value) => {
    const text = value.replace(/\s+/g, ' ').trim();
    if (text) inlineText += `${inlineText ? ' ' : ''}${text}`;
  };
  const flush = () => {
    if (inlineText) blocks.push(inlineText);
    inlineText = '';
  };
  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      addInlineText(node.textContent);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'figure') {
      flush();
      if (node.querySelector('img')) blocks.push('[图片]');
      const caption = node.querySelector('.caption')?.textContent.trim();
      const credit = node.querySelector('.credit')?.textContent.trim();
      const fallbackCaption = node.querySelector('figcaption')?.textContent.trim();
      if (caption || (!credit && fallbackCaption)) blocks.push(caption || fallbackCaption);
      if (credit) blocks.push(credit);
      return;
    }
    if (tag === 'img') {
      flush();
      blocks.push('[图片]');
      return;
    }
    if (tag === 'br') {
      flush();
      return;
    }
    if (blockTags.has(tag)) flush();
    Array.from(node.childNodes).forEach(visit);
    if (blockTags.has(tag)) flush();
  };

  Array.from(doc.body.childNodes).forEach(visit);
  flush();
  return {
    html: doc.body.innerHTML,
    text: blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
  };
}

function ArticleReader({ article, onBack }) {
  const [fontSize, setFontSize] = useState(18);
  const [darkMode, setDarkMode] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Calculate reading progress
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const articleEl = document.querySelector('.article-body');
      if (!articleEl) return;

      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = Math.min(100, Math.max(0, (scrollTop / docHeight) * 100));
      setProgress(progress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const readingTime = Math.ceil((article.textContent?.length || 0) / 400); // ~400 chars per minute
  const wordCount = (article.textContent?.split(/\s+/).filter(Boolean).length || 0).toLocaleString();

  // Sanitize HTML content - remove scripts, styles, event handlers
  const sanitizedContent = useMemo(() => article.content
    ?.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    ?.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    ?.replace(/on\w+="[^"]*"/gi, '')
    ?.replace(/on\w+='[^']*'/gi, ''), [article.content]);

  // Copy text to clipboard - parse HTML to preserve paragraph structure
  // Only copies the article body content (正文), without title, author, or other metadata
  const handleCopyText = useCallback(async () => {
    if (!sanitizedContent) return;
    const { html, text } = clipboardContent(sanitizedContent);

    try {
      if (navigator.clipboard.write && window.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setCopyStatus('Copied');
      setTimeout(() => setCopyStatus(''), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      setCopyStatus('Failed');
      setTimeout(() => setCopyStatus(''), 2000);
    }
  }, [sanitizedContent]);

  // Generate Markdown content - preserve images, captions, code blocks, tables, links
  const generateMarkdown = useCallback(() => {
    const lines = [];
    lines.push(`# ${article.title || 'Untitled'}`);
    lines.push('');
    
    if (article.author) {
      lines.push(`Author: ${article.author}`);
    }
    
    lines.push(`Source: ${article.url}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    
    // Convert HTML content to Markdown using DOM parser for accuracy
    let markdown = article.content || '';
    
    // Use DOMParser for more reliable HTML -> Markdown conversion
    const parser = new DOMParser();
    const doc = parser.parseFromString(markdown, 'text/html');
    
    // Process figures: keep images with captions as proper markdown
    doc.querySelectorAll('figure').forEach(figure => {
      const img = figure.querySelector('img');
      const caption = figure.querySelector('figcaption');
      if (img) {
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || (caption ? caption.textContent.trim() : '');
        const markdownImg = alt ? `![${alt}](${src})` : `![](${src})`;
        if (caption) {
          figure.outerHTML = `${markdownImg}\n\n*${caption.textContent.trim()}*`;
        } else {
          figure.outerHTML = markdownImg;
        }
      }
    });
    
    // Process remaining images not in figures
    doc.querySelectorAll('img').forEach(img => {
      // Skip if already processed (inside a figure we handled)
      if (img.closest('figure')) return;
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      img.outerHTML = alt ? `![${alt}](${src})` : `![](${src})`;
    });
    
    // Get the processed HTML
    markdown = doc.body.innerHTML;
    
    // Convert other HTML to Markdown
    markdown = markdown
      // Headings
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n')
      .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n')
      .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n')
      // Paragraphs
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      // Bold/italic
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      // Inline code
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      // Code blocks - preserve language if present
      .replace(/<pre[^>]*><code[^>]*class="language-([^"]*)"[^>]*>(.*?)<\/code><\/pre>/gi, '\n```$1\n$2\n```\n')
      .replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n')
      .replace(/<pre[^>]*>(.*?)<\/pre>/gi, '\n```\n$1\n```\n')
      // Links
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      // Blockquotes
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, (match, content) => {
        // Convert inner content to blockquote format
        const lines = content.trim().split('\n').map(l => l.trim()).filter(l => l);
        return lines.map(l => `> ${l}`).join('\n') + '\n\n';
      })
      // Lists
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
      .replace(/<ul[^>]*>(.*?)<\/ul>/gi, '$1\n')
      .replace(/<ol[^>]*>(.*?)<\/ol>/gi, (match, content) => {
        let i = 1;
        return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${i++}. $1\n`) + '\n';
      })
      // Tables - convert to markdown tables
      .replace(/<table[^>]*>(.*?)<\/table>/gi, (match, content) => {
        const tableDoc = parser.parseFromString(`<table>${content}</table>`, 'text/html');
        const rows = tableDoc.querySelectorAll('tr');
        if (rows.length === 0) return '';
        
        let md = '';
        let isHeader = true;
        rows.forEach(row => {
          const cells = row.querySelectorAll('th, td');
          const cellTexts = Array.from(cells).map(c => c.textContent.trim().replace(/\|/g, '\\|'));
          md += '| ' + cellTexts.join(' | ') + ' |\n';
          if (isHeader) {
            md += '| ' + cellTexts.map(() => '---').join(' | ') + ' |\n';
            isHeader = false;
          }
        });
        return md + '\n';
      })
      // Line breaks
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<hr\s*\/?>/gi, '\n---\n')
      // Remove remaining HTML tags
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, "'")
      // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    
    lines.push(markdown);
    
    return lines.join('\n');
  }, [article]);

  // Download Markdown file
  const handleDownloadMarkdown = useCallback(() => {
    const markdown = generateMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(article.title || 'article').replace(/[<>:"\/\\|?*]/g, '').slice(0, 100)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }, [article, generateMarkdown]);

  // Generate standalone HTML with reader styles and metadata
  const generateHTML = useCallback(() => {
    // Complete reader CSS matching the app styles
    const css = `/* Article Reader Styles - Complete */
* { box-sizing: border-box; }
:root {
  --bg: #fafafa;
  --bg-elevated: #ffffff;
  --text: #1a1a1a;
  --text-secondary: #666666;
  --text-muted: #999999;
  --border: #e5e5e5;
  --accent: #20201e;
  --accent-hover: #3a3a36;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 30px rgba(0, 0, 0, 0.1);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --max-width: 820px;
  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-serif: Georgia, Cambria, "Times New Roman", Times, serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121212;
    --bg-elevated: #1e1e1e;
    --text: #e8e8e8;
    --text-secondary: #a0a0a0;
    --text-muted: #777777;
    --border: #333333;
    --accent: #eab308;
    --accent-hover: #facc15;
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 8px 30px rgba(0, 0, 0, 0.5);
  }
}
body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font-sans); line-height: 1.6; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
.article-container { max-width: var(--max-width); margin: 0 auto; padding: 60px 20px; background: var(--bg-elevated); box-shadow: var(--shadow-lg); }
.article-header { margin-bottom: 40px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
.article-title { font-family: var(--font-serif); font-size: 40px; line-height: 1.15; margin: 0 0 16px; font-weight: 700; color: var(--text); }
.article-meta { display: flex; flex-wrap: wrap; gap: 16px; color: var(--text-secondary); font-size: 15px; }
.article-meta .author { font-weight: 500; color: var(--text); }
.article-meta a { color: var(--accent); text-decoration: none; }
.article-meta a:hover { text-decoration: underline; }
.article-body { font-family: var(--font-serif); font-size: 18px; line-height: 1.85; color: var(--text); }
.article-body h1, .article-body h2, .article-body h3, .article-body h4, .article-body h5, .article-body h6 { font-family: var(--font-sans); font-weight: 700; line-height: 1.3; color: var(--text); margin: 2.5em 0 0.8em; }
.article-body h1 { font-size: 2.25em; } .article-body h2 { font-size: 1.75em; } .article-body h3 { font-size: 1.4em; } .article-body h4 { font-size: 1.2em; }
.article-body p { margin: 0 0 1.5em; text-align: justify; hyphens: auto; }
.article-body strong, .article-body b { font-weight: 700; color: var(--text); }
.article-body em, .article-body i { font-style: italic; }
.article-body a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; transition: color 0.15s ease; }
.article-body a:hover { color: var(--accent-hover); }
.article-body blockquote { margin: 2em 0; padding: 1em 1.5em; border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--bg)); border-radius: 0 var(--radius-md) var(--radius-md) 0; font-style: italic; color: var(--text-secondary); }
.article-body blockquote p:last-child { margin-bottom: 0; }
.article-body blockquote cite { display: block; margin-top: 0.75em; font-size: 0.9em; font-style: normal; color: var(--text-muted); }
.article-body code { font-family: var(--font-mono); font-size: 0.9em; background: color-mix(in srgb, var(--accent) 10%, var(--bg)); padding: 0.15em 0.4em; border-radius: 4px; color: var(--accent); }
.article-body pre { margin: 2em 0; padding: 1.5em; background: #1e1e1e; border-radius: var(--radius-md); overflow-x: auto; }
.article-body pre code { background: transparent; padding: 0; font-size: 0.875em; line-height: 1.7; color: #d4d4d4; }
.article-body ul, .article-body ol { margin: 1.5em 0; padding-left: 1.5em; }
.article-body li { margin: 0.5em 0; line-height: 1.8; }
.article-body li > p { margin: 0; }
.article-body figure { margin: 2.5em 0; text-align: center; }
.article-body img { max-width: 100%; height: auto; border-radius: var(--radius-md); box-shadow: var(--shadow-md); }
.article-body figcaption { margin-top: 0.75em; font-size: 0.875em; color: var(--text-muted); font-style: italic; text-align: center; }
.article-body hr { margin: 3em 0; border: none; border-top: 1px solid var(--border); }
.article-body table { width: 100%; border-collapse: collapse; margin: 2em 0; font-size: 0.95em; }
.article-body th, .article-body td { padding: 0.75em 1em; border: 1px solid var(--border); text-align: left; }
.article-body th { background: var(--bg); font-weight: 600; font-family: var(--font-sans); }
.article-body tr:nth-child(even) td { background: var(--bg); }
.article-footer { margin-top: 40px; padding-top: 24px; border-top: 1px solid var(--border); font-size: 14px; color: var(--text-muted); }
.article-footer a { color: var(--accent); }`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${article.title || 'Untitled'}</title>
  <meta name="author" content="${article.author || ''}" />
  <meta name="source" content="${article.url}" />
  <style>${css}</style>
</head>
<body>
  <div class="article-container">
    <header class="article-header">
      <h1 class="article-title">${article.title || 'Untitled'}</h1>
      <div class="article-meta">
        ${article.author ? `<span class="author">${article.author}</span>` : ''}
        ${article.siteName ? `<span class="site">${article.siteName}</span>` : ''}
        <span class="source"><a href="${article.url}" target="_blank" rel="noopener">Source</a></span>
      </div>
    </header>
    <div class="article-body">${sanitizedContent}</div>
    <footer class="article-footer">
      <p>Exported from Article Extractor · <a href="${article.url}" target="_blank" rel="noopener">${article.url}</a></p>
    </footer>
  </div>
</body>
</html>`;
  }, [article, sanitizedContent]);

  // Download HTML file
  const handleDownloadHTML = useCallback(() => {
    const html = generateHTML();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(article.title || 'article').replace(/[<>:"\/\\|?*]/g, '').slice(0, 100)}.html`;
    link.click();
    URL.revokeObjectURL(url);
  }, [article, generateHTML]);

  return (
    <>
      {/* Progress bar */}
      <div
        className="progress-bar"
        style={{
          width: `${progress}%`,
          background: darkMode ? '#eab308' : '#20201e',
        }}
      />

      <article className="reader-page">
        <header className="reader-header">
          <button className="back-button" onClick={onBack} aria-label="Back to extract">
            ← Back
          </button>

          <div className="reader-meta">
            <h1 className="reader-title">{article.title}</h1>
            <div className="reader-byline">
              {article.siteName && <span className="site">{article.siteName}</span>}
              <span className="stats">
                {wordCount} words · {readingTime} min read
              </span>
            </div>
          </div>

          <div className="reader-controls">
            <div className="control-group">
              <label htmlFor="font-size" className="sr-only">Font size</label>
              <input
                id="font-size"
                type="range"
                min="14"
                max="24"
                step="1"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                aria-label="Font size"
              />
              <span className="font-size-label">{fontSize}px</span>
            </div>

            <button
              className="icon-button"
              onClick={() => setDarkMode(!darkMode)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        <div
          className="article-body"
          style={{ fontSize: `${fontSize}px` }}
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />

        <footer className="reader-footer">
          <div className="export-actions">
            <button 
              className="export-button"
              onClick={handleCopyText}
              disabled={copyStatus === 'Copied' || copyStatus === 'Failed'}
            >
              {copyStatus === 'Copied' ? 'Copied!' : copyStatus === 'Failed' ? 'Failed' : 'Copy Text'}
            </button>
            
            <button 
              className="export-button"
              onClick={handleDownloadMarkdown}
            >
              Download MD
            </button>
            
            <button 
              className="export-button"
              onClick={handleDownloadHTML}
            >
              Download HTML
            </button>
          </div>
          
          <div className="source-link">
            <span>Source:</span>
            <a href={article.url} target="_blank" rel="noopener noreferrer">
              {article.url}
            </a>
          </div>
        </footer>
      </article>
    </>
  );
}

export default ArticleReader;
