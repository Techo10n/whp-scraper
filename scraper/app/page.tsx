'use client';

import { useState, useEffect } from 'react';
import Image from "next/image";

interface PropertyListing {
  id: string;
  address: string;
  price: string;
  beds: string;
  baths: string;
  sqft: string;
  imageUrl: string;
  listingUrl: string;
}

export default function Home() {
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState('Atlanta, GA');
  const [searchLocation, setSearchLocation] = useState('Atlanta, GA');

  const fetchProperties = async (searchLoc: string) => {
    setLoading(true);
    try {
      const url = `/api/apartments-scraper?location=${encodeURIComponent(searchLoc)}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      
      if (data.success) {
        setProperties(data.properties);
        setLocation(data.location);
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
    fetchProperties(location);
  }, []); // Only run on mount

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProperties(searchLocation);
  };

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-8 text-gray-800">
          Apartments.com Scraper
        </h1>
        
        <p className="text-center text-gray-600 mb-6">
          Search for rental properties from Apartments.com using Puppeteer web scraping
        </p>
        
        {/* Search Form */}
        <form onSubmit={handleSearch} className="mb-8">
          <div className="flex flex-col items-center gap-4 max-w-md mx-auto">
            <div className="flex gap-2 w-full">
              <input
                type="text"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                placeholder="Enter location (e.g., Atlanta, GA)"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
              />
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Scraping...' : 'Search'}
              </button>
            </div>
          </div>
        </form>

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
              {/* Property Image */}
              {property.imageUrl ? (
                <div className="relative h-48 w-full bg-gray-200">
                  <Image
                    src={property.imageUrl}
                    alt={property.address}
                    fill
                    className="object-cover"
                    onError={(e) => {
                      // Hide broken images and show placeholder
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent) {
                        parent.innerHTML = `
                          <div class="flex items-center justify-center h-full bg-gray-200 text-gray-500">
                            <div class="text-center">
                              <svg class="mx-auto h-12 w-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                              </svg>
                              <p class="text-sm">Property Image</p>
                            </div>
                          </div>
                        `;
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="h-48 w-full bg-gray-200 flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                    </svg>
                    <p className="text-sm">No Image Available</p>
                  </div>
                </div>
              )}
              
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
            <p className="text-gray-600">No properties found. Try searching for a different location.</p>
          </div>
        )}
      </div>
    </div>
  );
}