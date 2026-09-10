import { useState } from 'react';
import ArticleReader from './ArticleReader';
import './styles.css';

function App() {
  const [url, setUrl] = useState('');
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('extract'); // 'extract' | 'reader'

  const handleExtract = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);
    setError('');
    setArticle(null);

    try {
      const response = await fetch('./api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMessage = data.error?.message || data.error || 'Extraction failed';
        throw new Error(errorMessage);
      }

      setArticle(data.article);
      setView('reader');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setView('extract');
    setArticle(null);
    setError('');
  };

  return (
    <main className="app">
      <header className="hero">
        <div className="badge">LOCAL TOOL</div>
        <h1>Article Extractor</h1>
        <p>Extract clean, readable article content from webpages.</p>
      </header>

      {view === 'extract' && (
        <section className="extract-box">
          <form onSubmit={handleExtract} id="extract-form">
            <label htmlFor="url">Article URL</label>
            <div className="url-row">
              <input
                id="url"
                type="url"
                placeholder="https://example.com/article"
                autoComplete="off"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
              <button id="extract-button" type="submit" disabled={loading}>
                {loading ? 'Extracting...' : 'Extract'}
              </button>
            </div>
            {error && <div className="status error">{error}</div>}
          </form>
        </section>
      )}

      {view === 'reader' && article && (
        <ArticleReader article={article} onBack={handleBack} />
      )}
    </main>
  );
}

export default App;
