'use client';

import { useState, useEffect } from 'react';

interface RedfinPropertyListing {
  id: string;
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  listingUrl: string;
  keyFacts?: string[];
}

export default function RedfinScraper() {
  const [properties, setProperties] = useState<RedfinPropertyListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [location] = useState('Walla Walla, WA'); // Fixed location since API is hardcoded

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/redfin-scraper');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      if (data.success) {
        setProperties(data.properties);
        if (data.note || data.source) {
          console.log('API Note:', data.note || `Source: ${data.source}`);
        }
      } else {
        console.error('Failed to fetch properties:', data.error);
        alert(`Error: ${data.error}. ${data.note || ''}`);
      }
    } catch (error) {
      console.error('Error fetching properties:', error);
      alert('Network error occurred while fetching properties');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []); // Only run on mount

  const handleRefresh = () => {
    fetchProperties();
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Redfin Property Scraper
        </h1>
        
        <p className="text-center text-gray-600 mb-6">
          Rental and sale properties from Redfin in {location} using Puppeteer web scraping
        </p>
        
        {/* Refresh Button */}
        <div className="flex justify-center mb-8">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Scraping...' : 'Refresh Properties'}
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            <p className="mt-2 text-gray-600">Scraping properties from Redfin...</p>
          </div>
        )}

        {/* Results Header */}
        {!loading && properties.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-800">
              Found {properties.length} properties in {location}
            </h2>
          </div>
        )}

        {/* Property Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property) => (
            <div key={property.id} className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow">
              {/* Property Details */}
              <div className="p-4">
                <div className="mb-2">
                  <h3 className="text-lg font-semibold text-gray-800 mb-1">
                    {property.price}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {property.address}
                  </p>
                </div>
                
                <div className="flex justify-between text-sm text-gray-500 mb-3">
                  <span>{property.beds}</span>
                  <span>{property.baths}</span>
                  <span>{property.sqft}</span>
                </div>

                {/* Key Facts */}
                {property.keyFacts && property.keyFacts.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Key Facts:</h4>
                    <div className="flex flex-wrap gap-1">
                      {property.keyFacts.map((fact, index) => (
                        <span
                          key={index}
                          className="inline-block bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full"
                        >
                          {fact}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* No Results */}
        {!loading && properties.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-600">No properties found. Try refreshing to scrape again.</p>
          </div>
        )}
      </div>
    </div>
  );
}