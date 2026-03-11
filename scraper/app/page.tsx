'use client';

import { useEffect, useState, useCallback } from 'react';

interface Property {
  id: number;
  source: string;
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  listing_url: string;
  description?: string;
  amenities?: string[];
  phone?: string;
  key_facts?: string[];
  location: string;
  date_added: string;
  last_seen: string;
}

interface Stats {
  total: number;
  bySource: Record<string, number>;
  newest: string | null;
}

interface ScrapeResult {
  source: string;
  status: 'idle' | 'running' | 'enriching' | 'done' | 'error';
  message: string;
  newCount?: number;
}

const SOURCES = [
  { key: 'redfin', label: 'Redfin', dbSource: 'Redfin', endpoint: '/api/scrape?source=redfin', color: 'bg-red-600 hover:bg-red-700' },
  { key: 'craigslist-sale', label: 'Craigslist (For Sale)', dbSource: 'Craigslist (For Sale)', endpoint: '/api/scrape?source=craigslist-sale', color: 'bg-orange-500 hover:bg-orange-600' },
  { key: 'craigslist-rentals', label: 'Craigslist (Rentals)', dbSource: 'Craigslist (Rentals)', endpoint: '/api/scrape?source=craigslist-rentals', color: 'bg-amber-500 hover:bg-amber-600' },
  { key: 'zumper', label: 'Zumper', dbSource: 'Zumper', endpoint: '/api/scrape?source=zumper', color: 'bg-teal-600 hover:bg-teal-700' },
  { key: 'realtybase-sale', label: 'Realtor.com (For Sale)', dbSource: 'Realtor.com (For Sale)', endpoint: '/api/scrape?source=realtybase-sale', color: 'bg-blue-600 hover:bg-blue-700' },
  { key: 'realtybase-rentals', label: 'Realtor.com (Rentals)', dbSource: 'Realtor.com (Rentals)', endpoint: '/api/scrape?source=realtybase-rentals', color: 'bg-indigo-500 hover:bg-indigo-600' },
];

const BADGE_COLORS: Record<string, string> = {
  'Redfin': 'bg-red-100 text-red-700',
  'Craigslist (For Sale)': 'bg-orange-100 text-orange-700',
  'Craigslist (Rentals)': 'bg-amber-100 text-amber-700',
  'Zumper': 'bg-teal-100 text-teal-700',
  'Apartments.com': 'bg-blue-100 text-blue-700',
  'Realtor.com (For Sale)': 'bg-blue-100 text-blue-700',
  'Realtor.com (Rentals)': 'bg-indigo-100 text-indigo-700',
};

export default function Dashboard() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<string>('all');
  const [scrapeResults, setScrapeResults] = useState<Record<string, ScrapeResult>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const fetchProperties = useCallback(async () => {
    try {
      const url = filterSource === 'all'
        ? '/api/properties'
        : `/api/properties?source=${encodeURIComponent(filterSource)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setProperties(data.properties);
        setStats(data.stats);
      }
    } catch (e) {
      console.error('Failed to load properties', e);
    } finally {
      setLoading(false);
    }
  }, [filterSource]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  async function runScraper(source: typeof SOURCES[number]) {
    setScrapeResults(prev => ({
      ...prev,
      [source.key]: { source: source.label, status: 'running', message: '' }
    }));
    try {
      const res = await fetch(source.endpoint);
      const data = await res.json();
      if (data.success) {
        const newCount = data.saved?.inserted ?? 0;

        // ── Enrichment phase ──────────────────────────────────────────────
        setScrapeResults(prev => ({
          ...prev,
          [source.key]: { source: source.label, status: 'enriching', message: '', newCount }
        }));

        let enrichMsg = '';
        try {
          const enrichRes = await fetch('/api/enrich');
          const enrichData = await enrichRes.json();
          if (enrichData.success && enrichData.enriched > 0) {
            enrichMsg = ` ${enrichData.enriched} enriched with assessor data.`;
          }
        } catch {
          // enrichment failure is non-fatal
        }

        setScrapeResults(prev => ({
          ...prev,
          [source.key]: {
            source: source.label,
            status: 'done',
            message: `Done — ${newCount} new listings added.${enrichMsg}`,
            newCount,
          }
        }));
        await fetchProperties();
      } else {
        setScrapeResults(prev => ({
          ...prev,
          [source.key]: {
            source: source.label,
            status: 'error',
            message: data.details || data.error || 'Unknown error',
          }
        }));
      }
    } catch {
      setScrapeResults(prev => ({
        ...prev,
        [source.key]: {
          source: source.label,
          status: 'error',
          message: 'Request failed. Is the dev server running?',
        }
      }));
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this listing from the database?')) return;
    setDeletingId(id);
    try {
      await fetch(`/api/properties?id=${id}`, { method: 'DELETE' });
      setProperties(prev => prev.filter(p => p.id !== id));
      setStats(prev => prev ? { ...prev, total: prev.total - 1 } : prev);
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = properties.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.address.toLowerCase().includes(q)
      || p.price?.toLowerCase().includes(q)
      || p.source.toLowerCase().includes(q);
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Property Database</h1>
            <p className="text-sm text-gray-500 mt-0.5">Walla Walla, WA — Home Reseller Dashboard</p>
          </div>
          {stats && (
            <div className="flex gap-6 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
                <div className="text-xs text-gray-500">Total Listings</div>
              </div>
              {Object.entries(stats.bySource).map(([src, count]) => (
                <div key={src}>
                  <div className="text-2xl font-bold text-gray-900">{count}</div>
                  <div className="text-xs text-gray-500">{src}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Run Scrapers</h2>
          <div className="flex flex-wrap gap-4">
            {SOURCES.map(source => {
              const result = scrapeResults[source.key];
              const isRunning = result?.status === 'running' || result?.status === 'enriching';
              const spinnerLabel = result?.status === 'enriching'
                ? `Enriching ${source.label}...`
                : `Scraping ${source.label}...`;
              return (
                <div key={source.key} className="flex items-center gap-3">
                  <button
                    onClick={() => runScraper(source)}
                    disabled={isRunning}
                    className={`${source.color} text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
                  >
                    {isRunning ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        {spinnerLabel}
                      </span>
                    ) : `Scrape ${source.label}`}
                  </button>
                  {result && (result.status === 'done' || result.status === 'error') && (
                    <span className={`text-sm ${result.status === 'done' ? 'text-green-600' : 'text-red-600'}`}>
                      {result.status === 'done' ? '✓' : '✗'} {result.message}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3 mb-4 items-center text-black">
          <input
            type="text"
            placeholder="Search address, price, source..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterSource}
            onChange={e => { setFilterSource(e.target.value); setLoading(true); }}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Sources</option>
            {SOURCES.map(s => <option key={s.key} value={s.dbSource}>{s.label}</option>)}
          </select>
          <span className="text-sm text-gray-500 ml-auto">
            {filtered.length} listing{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-gray-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <p className="text-lg font-medium mb-1">No listings yet</p>
              <p className="text-sm">Run a scraper above to populate the database.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Address</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Price</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Beds / Baths / Sqft</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Added</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(property => (
                  <tr key={property.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <a
                        href={property.listing_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline font-medium"
                      >
                        {property.address || '—'}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-semibold">{property.price || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {[property.beds, property.baths, property.sqft].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${BADGE_COLORS[property.source] ?? 'bg-gray-100 text-gray-700'
                        }`}>
                        {property.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(property.date_added)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(property.id)}
                        disabled={deletingId === property.id}
                        className="text-red-500 hover:text-red-700 text-xs disabled:opacity-40"
                      >
                        {deletingId === property.id ? 'Removing...' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
