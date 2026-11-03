// GET /api/intel/feed — consolidated news + video from public RSS/Atom feeds.
// Fetched server-side (no CORS), parsed without dependencies, cached 5 min.
// Only titles, short summaries, links and thumbnails leave this proxy; the
// reader follows the link to the publisher for the full story.

const CACHE_MS = 5 * 60_000;
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 3 * 1024 * 1024;
const PER_FEED = 30;

export const FEEDS = [
  { id: 'lrt', name: 'LRT', kind: 'news', url: 'https://www.lrt.lt/en/news-in-english?rss' },
  { id: 'bbc', name: 'BBC', kind: 'news', url: 'https://feeds.bbci.co.uk/news/world/europe/rss.xml' },
  { id: 'err', name: 'ERR', kind: 'news', url: 'https://news.err.ee/rss' },
  { id: 'lsm', name: 'LSM', kind: 'news', url: 'https://eng.lsm.lv/rss/' },
  { id: 'dw', name: 'DW', kind: 'news', url: 'https://rss.dw.com/rdf/rss-en-all' },
  { id: 'bbcw', name: 'BBC World', kind: 'news', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'guardian', name: 'The Guardian', kind: 'news', url: 'https://www.theguardian.com/world/rss' },
  { id: 'npr', name: 'NPR', kind: 'news', url: 'https://feeds.npr.org/1004/rss.xml' },
  { id: 'f24', name: 'France 24', kind: 'news', url: 'https://www.france24.com/en/rss' },
  { id: 'sky', name: 'Sky News', kind: 'news', url: 'https://feeds.skynews.com/feeds/rss/world.xml' },
  { id: 'cna', name: 'CNA', kind: 'news', url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6511' },
  { id: 'scmp', name: 'SCMP', kind: 'news', url: 'https://www.scmp.com/rss/91/feed' },
  { id: 'toi', name: 'Times of Israel', kind: 'news', url: 'https://www.timesofisrael.com/feed/' },
  { id: 'abc-au', name: 'ABC Australia', kind: 'news', url: 'https://www.abc.net.au/news/feed/2942460/rss.xml' },
  { id: 'kyivindep', name: 'Kyiv Independent', kind: 'news', url: 'https://kyivindependent.com/news-archive/rss/' },
  { id: 'aje', name: 'Al Jazeera', kind: 'news', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { id: 'bbc-tv', name: 'BBC News (video)', kind: 'video', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC16niRr50-MSBwiO3YDb3RA' },
  { id: 'dw-tv', name: 'DW News (video)', kind: 'video', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCknLrEdhRCp1aegoMqRaCZg' },
  { id: 'sky-tv', name: 'Sky News (video)', kind: 'video', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCoMdktPbSTixAyNGwb-UYkQ' },
  { id: 'aje-tv', name: 'Al Jazeera (video)', kind: 'video', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNye-wNBqNL5ZzHSJj3l8Bg' },
];

const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENT[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const strip = (s) => decode(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};
const attr = (block, name, a) => {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\s${a}="([^"]+)"`, 'i'));
  return m ? decode(m[1]) : '';
};

/** Parse RSS 2.0, RSS 1.0 (RDF) or Atom into plain items. */
export function parseFeed(xml, feed) {
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  const items = [];
  for (const b of blocks.slice(0, PER_FEED)) {
    const title = strip(tag(b, 'title'));
    let link = strip(tag(b, 'link')) || attr(b, 'link', 'href');
    if (!link) link = strip(tag(b, 'guid'));
    const date = strip(tag(b, 'pubDate') || tag(b, 'dc:date') || tag(b, 'published') || tag(b, 'updated'));
    const ts = Date.parse(date);
    const videoId = strip(tag(b, 'yt:videoId'));
    const summary = strip(tag(b, 'description') || tag(b, 'media:description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 400);
    const image =
      attr(b, 'media:thumbnail', 'url') ||
      attr(b, 'media:content', 'url') ||
      attr(b, 'enclosure', 'url') ||
      (videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : '');
    if (!title || !link || !Number.isFinite(ts)) continue;
    if (!/^https?:\/\//i.test(link)) continue;
    items.push({
      id: `${feed.id}:${videoId || link}`,
      source: feed.name,
      sourceId: feed.id,
      kind: feed.kind,
      title,
      link,
      ts,
      summary: videoId ? summary.slice(0, 200) : summary,
      image: /^https?:\/\//i.test(image) ? image : '',
      videoId: videoId || undefined,
    });
  }
  return items;
}

async function fetchFeed(feed) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, {
      signal: ctl.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; GodsEyeView/0.2)', accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) return { feed, items: [], error: `HTTP ${res.status}` };
    const text = await res.text();
    if (text.length > MAX_BYTES) return { feed, items: [], error: 'too large' };
    return { feed, items: parseFeed(text, feed) };
  } catch (e) {
    return { feed, items: [], error: e?.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

let cache = { at: 0, body: null, pending: null };

async function load() {
  if (cache.body && Date.now() - cache.at < CACHE_MS) return cache.body;
  if (cache.pending) return cache.pending;
  cache.pending = Promise.all(FEEDS.map(fetchFeed))
    .then((results) => {
      const items = results.flatMap((r) => r.items).sort((a, b) => b.ts - a.ts);
      const sources = results.map((r) => ({ id: r.feed.id, name: r.feed.name, kind: r.feed.kind, count: r.items.length, error: r.error }));
      cache = { at: Date.now(), body: { fetchedAt: Date.now(), sources, items }, pending: null };
      return cache.body;
    })
    .catch((e) => {
      cache.pending = null;
      throw e;
    });
  return cache.pending;
}

export function intelFeedProxy() {
  return {
    name: 'gev-intel-feed',
    configureServer(server) {
      server.middlewares.use('/api/intel/feed', async (req, res, next) => {
        if (req.method !== 'GET') return next();
        try {
          const body = await load();
          res.setHeader('content-type', 'application/json');
          res.setHeader('cache-control', 'no-store');
          res.end(JSON.stringify(body));
        } catch {
          res.statusCode = 502;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'feed_unavailable' }));
        }
      });
    },
  };
}
