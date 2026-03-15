/* Substack page — fetch and render articles from RSS feed */

document.addEventListener('DOMContentLoaded', () => {
    fetchSubstackArticles();
});

async function fetchSubstackArticles() {
    const container = document.getElementById('substackArticles');

    try {
        const response = await fetch('https://murphonomics.substack.com/feed');
        if (!response.ok) throw new Error('Feed unavailable');

        const text = await response.text();
        const xml = new DOMParser().parseFromString(text, 'text/xml');
        const items = Array.from(xml.querySelectorAll('item'));

        if (items.length === 0) {
            container.innerHTML = '<p class="substack-page-empty">No posts yet.</p>';
            return;
        }

        const posts = items.map(item => {
            const rawLink = item.querySelector('link');
            const link = rawLink ? (rawLink.textContent || rawLink.nextSibling?.nodeValue || '').trim() : '';

            /* Strip HTML from description to get a plain-text preview */
            const rawDesc = item.querySelector('description')?.textContent || '';
            const tmp = document.createElement('div');
            tmp.innerHTML = rawDesc;
            const plainDesc = (tmp.textContent || tmp.innerText || '').trim();
            const preview = plainDesc.length > 200
                ? plainDesc.slice(0, 200).trim() + '…'
                : plainDesc;

            return {
                title: item.querySelector('title')?.textContent?.trim() || 'Untitled',
                link: link || 'https://murphonomics.substack.com/',
                pubDate: new Date(item.querySelector('pubDate')?.textContent || 0),
                preview
            };
        }).sort((a, b) => b.pubDate - a.pubDate);

        container.innerHTML = posts.map(post => {
            const dateStr = post.pubDate.toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric'
            });
            return `
                <article class="substack-article-card">
                    <span class="substack-article-date">${dateStr}</span>
                    <h3 class="substack-article-title">
                        <a href="${post.link}" target="_blank" rel="noopener noreferrer">${post.title}</a>
                    </h3>
                    ${post.preview ? `<p class="substack-article-preview">${post.preview}</p>` : ''}
                    <a class="substack-article-link" href="${post.link}" target="_blank" rel="noopener noreferrer">Read article →</a>
                </article>`;
        }).join('');

    } catch {
        /* Fallback: show known articles statically (fetch fails on file:// protocol) */
        const fallback = [
            { title: 'The Trump Economy', link: 'https://murphonomics.substack.com/p/the-trump-economy', preview: '' }
        ];
        container.innerHTML = fallback.map(post => `
            <article class="substack-article-card">
                <h3 class="substack-article-title">
                    <a href="${post.link}" target="_blank" rel="noopener noreferrer">${post.title}</a>
                </h3>
                <a class="substack-article-link" href="${post.link}" target="_blank" rel="noopener noreferrer">Read article →</a>
            </article>`).join('');
    }
}
