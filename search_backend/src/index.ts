import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3004', 10);

const fallbackImages = [
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=600&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=600&auto=format&fit=crop&q=80',
];

// ─── DATA MODELS ─────────────────────────────────────────────────────────────

interface SearchItem {
  id: string;
  category: 'PEOPLE' | 'PHOTOS' | 'VIDEOS' | 'PLACES' | 'LIVE';
  title: string;
  subtitle?: string;
  tag: string;
  author?: string;
  imageUrl?: string;
  // Specific extras
  followers?: string;
  likes?: string;
  duration?: string;
  views?: string;
  distance?: string;
  coordinates?: string;
  viewers?: string;
  height?: number;
}

// ─── MOCK DATABASE ────────────────────────────────────────────────────────────

const searchDatabase: SearchItem[] = [
  // --- PEOPLE ---
  {
    id: 'p1',
    category: 'PEOPLE',
    title: 'Aria Mind',
    subtitle: 'AI Neural Companion',
    tag: '@aria.mind',
    followers: '1.2M',
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=60',
  },
  {
    id: 'p2',
    category: 'PEOPLE',
    title: 'Stellar Eye',
    subtitle: 'Astro-Photographer',
    tag: '@stellar_eye',
    followers: '45K',
    imageUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=60',
  },
  {
    id: 'p3',
    category: 'PEOPLE',
    title: 'Void Walker',
    subtitle: 'Cyber Architect',
    tag: '@void_walker',
    followers: '88K',
    imageUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=60',
  },
  {
    id: 'p4',
    category: 'PEOPLE',
    title: 'Chrono Nexus',
    subtitle: 'Temporal Artist',
    tag: '@chrono_nexus',
    followers: '120K',
    imageUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=150&auto=format&fit=crop&q=60',
  },
  {
    id: 'p5',
    category: 'PEOPLE',
    title: 'Dr. Sarah Bio',
    subtitle: 'Synthetics Engineer',
    tag: '@sarah.bio',
    followers: '67K',
    imageUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=60',
  },

  // --- PHOTOS ---
  {
    id: 'img1',
    category: 'PHOTOS',
    title: 'Neon Dystopia Series',
    tag: '#CyberPunk',
    author: '@void_walker',
    likes: '4.2K',
    height: 200,
    imageUrl: 'https://images.unsplash.com/photo-1515621061946-eff1c2a352bd?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'img2',
    category: 'PHOTOS',
    title: 'Machine Dreams',
    tag: '#AIArt',
    author: '@aria.mind',
    likes: '8.9K',
    height: 250,
    imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'img3',
    category: 'PHOTOS',
    title: 'Mars at Dawn',
    tag: '#SpaceX',
    author: '@stellar_eye',
    likes: '3.1K',
    height: 170,
    imageUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'img4',
    category: 'PHOTOS',
    title: 'Temporal Echoes',
    tag: '#FutureFreq',
    author: '@chrono_nexus',
    likes: '5.6K',
    height: 220,
    imageUrl: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'img5',
    category: 'PHOTOS',
    title: 'Hybrid Organisms',
    tag: '#BioHack',
    author: '@gen_splice',
    likes: '2.4K',
    height: 190,
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'img6',
    category: 'PHOTOS',
    title: 'Infinite Loop',
    tag: '#QuantumArt',
    author: '@quanta_kai',
    likes: '12K',
    height: 240,
    imageUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&auto=format&fit=crop&q=60',
  },

  // --- VIDEOS ---
  {
    id: 'v1',
    category: 'VIDEOS',
    title: 'Colonizing Kepler-186f',
    tag: '#Kepler',
    author: '@stellar_eye',
    duration: '12:45',
    views: '104K views',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'v2',
    category: 'VIDEOS',
    title: 'Designing Dyson Spheres',
    tag: '#DysonTech',
    author: '@void_walker',
    duration: '28:10',
    views: '54K views',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'v3',
    category: 'VIDEOS',
    title: 'Quantum Computers Explained',
    tag: '#Physics',
    author: '@aria.mind',
    duration: '08:15',
    views: '1.2M views',
    imageUrl: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=400&auto=format&fit=crop&q=60',
  },

  // --- PLACES ---
  {
    id: 'pl1',
    category: 'PLACES',
    title: 'Neo-Tokyo Sector 7',
    tag: '#CyberCity',
    distance: '12.4 km away',
    coordinates: '35.6762° N, 139.6503° E',
    imageUrl: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'pl2',
    category: 'PLACES',
    title: 'Olympus Mons Ridge Base',
    tag: '#MarsBase',
    distance: '225M km away',
    coordinates: '18.65° N, 226.2° E',
    imageUrl: 'https://images.unsplash.com/photo-1614728894747-a83421e2b9c9?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'pl3',
    category: 'PLACES',
    title: 'Kepler-186f First Outpost',
    tag: '#Exoplanet',
    distance: '582 Light Years away',
    coordinates: 'Cygnus Constellation',
    imageUrl: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&auto=format&fit=crop&q=60',
  },

  // --- LIVE ---
  {
    id: 'l1',
    category: 'LIVE',
    title: 'Exploring the Multiverse LIVE',
    tag: '#LiveStream',
    author: '@aria.mind',
    viewers: '12.4K watching',
    imageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&auto=format&fit=crop&q=60',
  },
  {
    id: 'l2',
    category: 'LIVE',
    title: 'Synthesizing Neural Art Live',
    tag: '#NeuralArt',
    author: '@chrono_nexus',
    viewers: '3.2K watching',
    imageUrl: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=400&auto=format&fit=crop&q=60',
  },
];

// ─── YOUTUBE DATA API HELPERS ──────────────────────────────────────────────────

function decodeHTMLEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®');
}

function parseISO8601Duration(durationStr: string): string {
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatViewCount(viewCountStr?: string): string {
  if (!viewCountStr) return '0 views';
  const views = parseInt(viewCountStr, 10);
  if (isNaN(views)) return '0 views';
  if (views >= 1000000) {
    return `${(views / 1000000).toFixed(1)}M views`;
  }
  if (views >= 1000) {
    return `${(views / 1000).toFixed(1)}K views`;
  }
  return `${views} views`;
}

function formatConcurrentViewers(viewersStr?: string): string {
  if (!viewersStr) return '0 watching';
  const viewers = parseInt(viewersStr, 10);
  if (isNaN(viewers)) return '0 watching';
  if (viewers >= 1000) {
    return `${(viewers / 1000).toFixed(1)}K watching`;
  }
  return `${viewers} watching`;
}

async function fetchYouTubeData(query: string, filter: string, apiKey: string): Promise<SearchItem[] | null> {
  const isLive = filter === 'LIVE';
  const eventTypeParam = isLive ? '&eventType=live' : '';
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&type=video${eventTypeParam}&q=${encodeURIComponent(query)}&key=${apiKey}`;

  console.log(`[Search Backend] Fetching YouTube results for query="${query}" filter="${filter}"`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  
  try {
    const res = await fetch(searchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      const errorText = await res.text();
      console.warn(`[Search Backend] YouTube Search API failed: status=${res.status} error=${errorText}`);
      return null;
    }
    
    const searchData = await res.json() as any;
    if (!searchData.items || !Array.isArray(searchData.items) || searchData.items.length === 0) {
      return [];
    }
    
    const videoIdMap = new Map<string, any>();
    const videoIds: string[] = [];
    for (const item of searchData.items) {
      if (item.id && item.id.videoId) {
        videoIds.push(item.id.videoId);
        videoIdMap.set(item.id.videoId, item);
      }
    }
    
    if (videoIds.length === 0) {
      return [];
    }
    
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,liveStreamingDetails&id=${videoIds.join(',')}&key=${apiKey}`;
    const detailsController = new AbortController();
    const detailsTimeoutId = setTimeout(() => detailsController.abort(), 4000);
    
    let videoDetailsMap = new Map<string, any>();
    try {
      const detailsRes = await fetch(detailsUrl, { signal: detailsController.signal });
      clearTimeout(detailsTimeoutId);
      if (detailsRes.ok) {
        const detailsData = await detailsRes.json() as any;
        if (detailsData.items && Array.isArray(detailsData.items)) {
          for (const item of detailsData.items) {
            videoDetailsMap.set(item.id, item);
          }
        }
      }
    } catch (e: any) {
      clearTimeout(detailsTimeoutId);
      console.error('[Search Backend] Failed to fetch video details from YouTube:', e.message || e);
    }
    
    const results: SearchItem[] = searchData.items.map((item: any, idx: number) => {
      const videoId = item.id.videoId;
      const detail = videoDetailsMap.get(videoId);
      
      const title = decodeHTMLEntities(item.snippet.title);
      const subtitle = decodeHTMLEntities(item.snippet.description || item.snippet.channelTitle);
      const author = item.snippet.channelTitle;
      const imageUrl = item.snippet.thumbnails?.high?.url || 
                       item.snippet.thumbnails?.medium?.url || 
                       item.snippet.thumbnails?.default?.url || 
                       '';
      
      const link = `https://www.youtube.com/watch?v=${videoId}`;
      
      if (isLive) {
        const viewersCount = detail?.liveStreamingDetails?.concurrentViewers || 
                             detail?.statistics?.viewCount || 
                             '';
        const viewers = formatConcurrentViewers(viewersCount);
        
        return {
          id: `yt_live_${videoId}_${idx}`,
          category: 'LIVE',
          title,
          subtitle,
          tag: '#YTLive',
          author,
          imageUrl,
          viewers,
          coordinates: link,
          followers: viewers,
          likes: 'Live',
          duration: 'LIVE',
          views: viewers,
          distance: 'YouTube Live'
        };
      } else {
        const durationRaw = detail?.contentDetails?.duration || '';
        const duration = durationRaw ? parseISO8601Duration(durationRaw) : 'Play';
        
        const viewsCount = detail?.statistics?.viewCount || '';
        const views = formatViewCount(viewsCount);
        
        return {
          id: `yt_video_${videoId}_${idx}`,
          category: 'VIDEOS',
          title,
          subtitle,
          tag: '#YouTube',
          author,
          imageUrl,
          duration,
          views,
          coordinates: link,
          followers: views,
          likes: views,
          distance: 'YouTube Video'
        };
      }
    });
    
    return results;
  } catch (e: any) {
    clearTimeout(timeoutId);
    console.error('[Search Backend] YouTube API query failed:', e.message || e);
    return null;
  }
}

// --- CACHE & DYNAMIC APIS ---

const presetGradients = [
  ['0xFF0D0D2B', '0xFF1A0533', '0xFF06B6D4'],
  ['0xFF1A0820', '0xFF3D1050', '0xFFFF67AD'],
  ['0xFF0A0516', '0xFF2A1060', '0xFF9C48EA'],
  ['0xFF150B00', '0xFF3D2200', '0xFFF59E0B'],
  ['0xFF001A10', '0xFF003D25', '0xFF34D399'],
];
const presetTagColors = [
  '0xFF8CE7FF',
  '0xFFFF67AD',
  '0xFFCC97FF',
  '0xFFF59E0B',
  '0xFF34D399',
];

interface CachedData {
  trending: any[];
  suggestions: string[];
  discovery: any[];
  timestamp: number;
}

let cache: CachedData | null = null;
const CACHE_TTL = 1000 * 60 * 60; // 1 hour caching

async function fetchFeaturedFeed(): Promise<any> {
  const date = new Date();
  // Try today, yesterday, and day before yesterday to prevent time zone mismatch 404s
  for (let i = 0; i < 3; i++) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const url = `https://en.wikipedia.org/api/rest_v1/feed/featured/${y}/${m}/${d}`;
    try {
      console.log(`[Search Backend] Fetching real-time Wikipedia featured feed: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error('[Search Backend] Failed to fetch featured feed for', `${y}/${m}/${d}`, ':', e);
    }
    date.setDate(date.getDate() - 1);
  }
  return null;
}

async function getOrUpdateCache(): Promise<CachedData> {
  const now = Date.now();
  if (cache && (now - cache.timestamp < CACHE_TTL)) {
    return cache;
  }

  try {
    const feed = await fetchFeaturedFeed();
    if (feed) {
      // Parse Trending
      const rawArticles = feed.mostread?.articles || [];
      const trending = rawArticles.slice(0, 5).map((art: any, idx: number) => ({
        rank: idx + 1,
        topic: art.normalizedtitle || art.title,
        category: art.description || 'Trending Article',
        postCount: art.views || Math.floor(Math.random() * 5000) + 1000
      }));

      // Parse Suggestions
      const emojis = ['🚀', '🧠', '🌐', '🔮', '⚛', '🧬', '🎨', '⚡'];
      const suggestions = rawArticles.slice(5, 9).map((art: any, idx: number) => {
        const title = art.normalizedtitle || art.title;
        const emoji = emojis[idx % emojis.length];
        return `${emoji}  ${title}`;
      });

      // Parse Discovery
      const discovery = rawArticles.slice(10, 16).map((art: any, idx: number) => {
        const title = art.normalizedtitle || art.title;
        const tag = '#' + title.replace(/[^a-zA-Z0-9]/g, '');
        const tagColor = presetTagColors[idx % presetTagColors.length];
        const gradientColors = presetGradients[idx % presetGradients.length];
        return {
          tag,
          tagColor,
          title,
          author: art.description ? `@${art.description.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 15)}` : '@wikipedia',
          height: 170 + (idx % 3) * 40,
          gradientColors
        };
      });

      if (trending.length >= 3 && suggestions.length >= 2 && discovery.length >= 2) {
        cache = { trending, suggestions, discovery, timestamp: now };
        console.log('[Search Backend] Successfully updated real-time feed cache.');
        return cache;
      }
    }
  } catch (e) {
    console.error('[Search Backend] Cache update exception:', e);
  }

  // Initial fallbacks if feed fails
  if (!cache) {
    cache = {
      trending: [
        { rank: 1, topic: 'Artificial Intelligence', category: 'Tech', postCount: 50400 },
        { rank: 2, topic: 'Space Colonization', category: 'Science', postCount: 38200 },
        { rank: 3, topic: 'Quantum Computing', category: 'Physics', postCount: 29800 },
        { rank: 4, topic: 'Climate Solutions', category: 'Environment', postCount: 22100 },
        { rank: 5, topic: 'Electric Propulsion', category: 'Engineering', postCount: 15700 },
      ],
      suggestions: [
        '⚛  Quantum Physics',
        '🎨  Neural Art',
        '🚀  Space Exploration',
        '🧬  Bio-Hacking',
      ],
      discovery: [
        { tag: '#AIArt', tagColor: '0xFFFF67AD', title: 'Machine Dreams', author: '@aria.mind', height: 250, gradientColors: ['0xFF1A0820', '0xFF3D1050', '0xFFFF67AD'] },
        { tag: '#SpaceX', tagColor: '0xFFCC97FF', title: 'Mars at Dawn', author: '@stellar_eye', height: 170, gradientColors: ['0xFF0A0516', '0xFF2A1060', '0xFF9C48EA'] },
        { tag: '#FutureFreq', tagColor: '0xFFF59E0B', title: 'Temporal Echoes', author: '@chrono_nexus', height: 220, gradientColors: ['0xFF150B00', '0xFF3D2200', '0xFFF59E0B'] },
      ],
      timestamp: 0 // Retry next time
    };
  }
  return cache;
}

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'online', service: 'Search Backend', port: PORT });
});

app.get('/api/trending', async (req, res) => {
  const cached = await getOrUpdateCache();
  res.json(cached.trending);
});

app.get('/api/suggestions', async (req, res) => {
  const cached = await getOrUpdateCache();
  res.json(cached.suggestions);
});

app.get('/api/discovery', async (req, res) => {
  const cached = await getOrUpdateCache();
  res.json(cached.discovery);
});

app.get('/api/search', async (req, res) => {
  const query = (req.query.q as string || '').trim().toLowerCase();
  const filter = (req.query.filter as string || 'ALL').trim().toUpperCase();

  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  // 0. If empty query, serve dynamically mapped category lists from the real-time Wikipedia featured feed!
  if (query.length === 0) {
    try {
      const feed = await fetchFeaturedFeed();
      if (feed && feed.mostread && Array.isArray(feed.mostread.articles)) {
        const articles = feed.mostread.articles;
        
        let targetArticles = articles;
        if (filter !== 'ALL') {
          const slices: Record<string, [number, number]> = {
            'PEOPLE': [0, 6],
            'PHOTOS': [6, 12],
            'VIDEOS': [12, 18],
            'PLACES': [18, 24],
            'LIVE': [24, 30]
          };
          const [start, end] = slices[filter] || [0, 10];
          targetArticles = articles.slice(start, end);
        } else {
          targetArticles = articles.slice(0, 15);
        }

        const dynamicResults = targetArticles.map((art: any, idx: number) => {
          const cat = filter === 'ALL' ? (['PEOPLE', 'PHOTOS', 'VIDEOS', 'PLACES', 'LIVE'][idx % 5]) : filter;
          const cleanSnippet = (art.extract || art.description || '').replace(/<\/?[^>]+(>|$)/g, "");
          const link = art.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encodeURIComponent(art.title)}`;
          const imageUrl = art.thumbnail?.source || fallbackImages[idx % fallbackImages.length];

          return {
            id: `feed_${art.pageid || idx}_${Date.now()}`,
            category: cat,
            title: art.normalizedtitle || art.title,
            subtitle: cleanSnippet,
            tag: '#' + (art.normalizedtitle || art.title).replace(/[^a-zA-Z0-9]/g, ''),
            author: art.description ? `@${art.description.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12)}` : 'wikipedia.org',
            imageUrl: imageUrl,
            followers: art.views ? `${(art.views / 1000).toFixed(1)}k views` : 'Real Web Result',
            likes: 'Wiki',
            duration: 'Read',
            views: art.views ? `${art.views.toLocaleString()} views` : 'Wikipedia Index',
            distance: 'Wiki Link',
            coordinates: link,
            viewers: 'Active Info'
          };
        });
        return res.json(dynamicResults);
      }
    } catch (e) {
      console.error('[Search Backend] Error generating dynamic empty-query results:', e);
    }
  }

  // 1. YouTube Search Integration (for VIDEOS and LIVE filters)
  if (query.length > 0 && apiKey && (filter === 'VIDEOS' || filter === 'LIVE')) {
    try {
      const ytResults = await fetchYouTubeData(query, filter, apiKey);
      if (ytResults !== null) {
        console.log(`[Search Backend] Successfully fetched ${ytResults.length} YouTube results for filter ${filter}`);
        return res.json(ytResults);
      }
    } catch (e: any) {
      console.error('[Search Backend] YouTube route exception:', e.message || e);
    }
  }

  let googleResults: any[] = [];
  let googleSuccess = false;

  // 1. Google Custom Search (if keys are configured in .env)
  if (apiKey && cx && query.length > 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    try {
      const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`;
      const response = await fetch(googleUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json() as any;

      if (data.items && Array.isArray(data.items)) {
        googleResults = data.items.map((item: any, idx: number) => {
          const cseImage = item.pagemap?.cse_image?.[0]?.src || item.pagemap?.metatags?.[0]?.['og:image'] || '';
          
          let category = filter;
          if (category === 'ALL') {
            const categories: ('PEOPLE' | 'PHOTOS' | 'VIDEOS' | 'PLACES' | 'LIVE')[] = ['PHOTOS', 'PLACES', 'PEOPLE', 'VIDEOS'];
            category = categories[idx % categories.length];
          }

          return {
            id: `google_${idx}_${Date.now()}`,
            category,
            title: item.title,
            subtitle: item.snippet,
            tag: '#GoogleSearch',
            author: new URL(item.link).hostname,
            imageUrl: cseImage || 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=400&auto=format&fit=crop&q=60',
            followers: 'Real Web Result',
            likes: 'Web',
            duration: 'Link',
            views: 'Google Index',
            distance: 'Google Link',
            coordinates: item.link,
            viewers: 'Active Result'
          };
        });
        googleSuccess = true;
      } else if (data.error) {
        console.warn('[Search Backend] Google Search API returned error:', data.error.message);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error('[Search Backend] Google API Error:', e.message || e);
    }
  }

  if (googleSuccess && googleResults.length > 0) {
    return res.json(googleResults);
  }

  // 2. Wikipedia Search API Fallback (if real search requested but Google failed or no keys)
  if (query.length > 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&prop=pageimages|extracts&piprop=thumbnail&pithumbsize=600&exintro&explaintext&exsentences=2&format=json&origin=*`;
      const response = await fetch(wikiUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await response.json() as any;

      if (data.query && data.query.pages) {
        const pages = Object.values(data.query.pages) as any[];
        // Sort by search index relevance
        pages.sort((a, b) => (a.index || 0) - (b.index || 0));

        const wikiResults = pages.map((page: any, idx: number) => {
          let category = filter;
          if (category === 'ALL') {
            const categories: ('PEOPLE' | 'PHOTOS' | 'VIDEOS' | 'PLACES' | 'LIVE')[] = ['PEOPLE', 'PHOTOS', 'VIDEOS', 'PLACES', 'LIVE'];
            category = categories[idx % categories.length];
          }

          const cleanSnippet = page.extract || '';
          const link = `https://en.wikipedia.org/?curid=${page.pageid}`;
          const imageUrl = page.thumbnail?.source || fallbackImages[idx % fallbackImages.length];

          return {
            id: `wiki_${page.pageid}`,
            category,
            title: page.title,
            subtitle: cleanSnippet,
            tag: '#Wikipedia',
            author: 'wikipedia.org',
            imageUrl: imageUrl,
            followers: 'Real Web Result',
            likes: 'Wiki',
            duration: 'Read',
            views: 'Wikipedia Index',
            distance: 'Wiki Link',
            coordinates: link,
            viewers: 'Active Article'
          };
        });
        return res.json(wikiResults);
      }
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error('[Search Backend] Wikipedia API Fallback Error:', e.message || e);
    }
  }

  // 3. Fallback to Local Mock Database search
  let results = searchDatabase;
  if (filter !== 'ALL') {
    results = results.filter(item => item.category === filter);
  }
  if (query.length > 0) {
    results = results.filter(item => {
      return (
        item.title.toLowerCase().includes(query) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(query)) ||
        item.tag.toLowerCase().includes(query) ||
        (item.author && item.author.toLowerCase().includes(query))
      );
    });
  }

  res.json(results);
});

// ─── STARTUP ──────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Search Backend] Server listening on http://localhost:${PORT}`);
});
