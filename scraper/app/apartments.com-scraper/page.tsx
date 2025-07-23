'use client';

import { useState, useEffect } from 'react';

interface PropertyListing {
  id: string;
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  listingUrl: string;
  description?: string;
  amenities?: string[];
  phone?: string;
}

export default function Home() {
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [location] = useState('Walla Walla, WA'); // Fixed location since API is hardcoded

  const fetchProperties = async () => {
    setLoading(true);
    try {
      // No location parameter needed since API is hardcoded to Walla Walla
      const response = await fetch('/api/apartments-scraper');
      
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
          Apartments.com Scraper
        </h1>
        
        <p className="text-center text-gray-600 mb-6">
          Rental properties from Apartments.com in {location} using Puppeteer web scraping
        </p>
        
        {/* Refresh Button */}
        <div className="flex justify-center mb-8">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Scraping...' : 'Refresh Properties'}
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-gray-600">Scraping properties from Apartments.com...</p>
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
                  <span>{property.beds} beds</span>
                  <span>{property.baths} baths</span>
                  <span>{property.sqft} sqft</span>
                </div>

                {/* Description */}
                {property.description && (
                  <div className="mb-3">
                    <p className="text-sm text-gray-600 line-clamp-3">
                      {property.description}
                    </p>
                  </div>
                )}

                {/* Amenities */}
                {property.amenities && property.amenities.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Amenities:</h4>
                    <div className="flex flex-wrap gap-1">
                      {property.amenities.slice(0, 6).map((amenity, index) => (
                        <span
                          key={index}
                          className="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
                        >
                          {amenity}
                        </span>
                      ))}
                      {property.amenities.length > 6 && (
                        <span className="inline-block bg-gray-100 text-gray-600 text-xs px-2 py-1 rounded-full">
                          +{property.amenities.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Phone Number */}
                {property.phone && (
                  <div className="mb-3">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Phone: </span>
                      <a href={`tel:${property.phone}`} className="text-blue-600 hover:underline">
                        {property.phone}
                      </a>
                    </p>
                  </div>
                )}
                
                {property.listingUrl && (
                  <a
                    href={property.listingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block w-full text-center bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors text-sm"
                  >
                    View on Apartments.com
                  </a>
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