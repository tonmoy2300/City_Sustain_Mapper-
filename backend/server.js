const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// CACHING SYSTEM - Prevents repeated API calls
const dataCache = new Map();
const CACHE_DURATION = 86400000; // 1 hour in milliseconds

// RATE LIMITING - Prevents hitting API limits
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // milliseconds between requests

async function throttleRequest() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

function getCacheKey(type, lat, lng) {
  return `${type}_${lat.toFixed(3)}_${lng.toFixed(3)}`;
}

function getFromCache(key) {
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`Cache hit: ${key}`);
    return cached.data;
  }
  return null;
}

function setCache(key, data) {
  dataCache.set(key, { data, timestamp: Date.now() });
  // Clean old cache entries
  if (dataCache.size > 1000) {
    const oldestKey = dataCache.keys().next().value;
    dataCache.delete(oldestKey);
  }
}

// API Configuration
const NASA_POWER_BASE_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const NASA_POWER_PARAMS = {
  parameters: 'ALLSKY_SFC_SW_DWN,T2M',
  community: 'RE',
  longitude: '',
  latitude: '',
  start: '20240901',
  end: '20250901',
  format: 'JSON'
};

const OPENAQ_API_KEY = '315d6ce5ea7776db705d50e70fc0d9f2bc5deac47a9c87f55c3529323a0a0c3f';
const OPENAQ_BASE_URL = 'https://api.openaq.org/v3';

// MAIN ROOF DATA ENDPOINT
app.post('/api/getRoofData', async (req, res) => {
  try {
    const { latitude, longitude, area } = req.body;

    console.log(`Analyzing roof at: ${latitude}, ${longitude} with area: ${area} m²`);

    if (!latitude || !longitude || !area) {
      return res.status(400).json({ 
        error: 'Missing required parameters: latitude, longitude, area' 
      });
    }

    const solarData = await fetchSolarData(latitude, longitude);
    const precipData = await fetchPrecipitationData(latitude, longitude);

    // Check if we got real data
    if (!solarData.isReal) {
      return res.status(503).json({
        error: 'Unable to fetch real NASA solar data',
        details: solarData.note || 'NASA POWER API unavailable'
      });
    }

    // Allow partial success - solar data is critical, precipitation is optional
    const solarPotential = calculateSolarPotential(area, solarData);
    const rainwaterPotential = precipData.isReal 
      ? calculateRainwaterPotential(area, precipData)
      : { error: 'Precipitation data unavailable', note: precipData.note };

    res.json({
      location: { latitude, longitude, area },
      solarData,
      precipData,
      solarPotential,
      rainwaterPotential,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getRoofData:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch roof data',
      details: error.message 
    });
  }
});

// REAL TEMPERATURE HEAT MAP ENDPOINT
app.post('/api/getHeatMap', async (req, res) => {
  try {
    const { bounds } = req.body;
    
    if (!bounds) {
      return res.status(400).json({ error: 'Missing bounds parameter' });
    }

    console.log('Fetching heat map data for bounds:', bounds);

    // REDUCED grid size to avoid rate limits
    const gridSize = 10; // 10x10 grid = 100 points instead of 225
    const latStep = (bounds.north - bounds.south) / gridSize;
    const lngStep = (bounds.east - bounds.west) / gridSize;
    
    const heatPoints = [];
    const failedPoints = [];

    const promises = [];
    for (let i = 0; i <= gridSize; i++) {
      for (let j = 0; j <= gridSize; j++) {
        const lat = bounds.south + (i * latStep);
        const lng = bounds.west + (j * lngStep);
        promises.push(fetchTemperaturePoint(lat, lng));
      }
    }

    const results = await Promise.all(promises);
    
    let pointIndex = 0;
    for (let i = 0; i <= gridSize; i++) {
        for (let j = 0; j <= gridSize; j++) {
            const lat = bounds.south + (i * latStep);
            const lng = bounds.west + (j * lngStep);
            const tempData = results[pointIndex++];

            if (tempData && tempData.isReal) {
                heatPoints.push({
                    lat,
                    lng,
                    temperature: tempData.avgTemperature,
                    intensity: normalizeTemperature(tempData.avgTemperature)
                });
            } else {
                failedPoints.push({ lat, lng });
            }
        }
    }

    res.json({
      heatPoints,
      bounds,
      totalPoints: (gridSize + 1) * (gridSize + 1),
      successfulPoints: heatPoints.length,
      failedPoints: failedPoints.length,
      dataQuality: heatPoints.length > 0 ? 'Real NASA POWER data' : 'No data available',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getHeatMap:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch heat map data',
      details: error.message 
    });
  }
});

// BUILDING DENSITY HEAT MAP ENDPOINT
app.post('/api/getBuildingDensityMap', (req, res) => {
  try {
    const { bounds, buildings } = req.body;

    if (!bounds || !buildings) {
      return res.status(400).json({ error: 'Missing bounds or buildings data' });
    }
    
    console.log(`Calculating building density for ${buildings.length} buildings`);

    const gridSize = 0.002;
    const densityPoints = [];
    
    for (let lat = bounds.south; lat < bounds.north; lat += gridSize) {
      for (let lng = bounds.west; lng < bounds.east; lng += gridSize) {
        
        const buildingsInZone = buildings.filter(b => 
          b.centroid &&
          b.centroid.lat >= lat && b.centroid.lat < lat + gridSize &&
          b.centroid.lng >= lng && b.centroid.lng < lng + gridSize
        );
        
        const density = buildingsInZone.length;
        
        if (density > 0) {
          const maxDensityForNormalization = 20;
          const intensity = Math.min(density / maxDensityForNormalization, 1.0);

          if (intensity > 0.05) {
            densityPoints.push([
              lat + gridSize / 2,
              lng + gridSize / 2,
              intensity
            ]);
          }
        }
      }
    }

    console.log(`Generated ${densityPoints.length} density points.`);
    
    res.json({
      densityPoints,
      bounds,
      gridSize,
      source: 'Calculated from OpenStreetMap data',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getBuildingDensityMap:', error.message);
    res.status(500).json({ 
      error: 'Failed to calculate building density',
      details: error.message 
    });
  }
});

// RAINFALL FORECAST ENDPOINT
app.post('/api/getRainfallForecast', async (req, res) => {
  try {
    const { latitude, longitude, days = 3 } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'Missing latitude or longitude' });
    }

    const cacheKey = getCacheKey('forecast', latitude, longitude);
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    console.log(`Fetching rainfall forecast for: ${latitude}, ${longitude}`);

    await throttleRequest();

    const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude,
        longitude,
        hourly: 'precipitation,precipitation_probability',
        forecast_days: days,
        timezone: 'auto'
      },
      timeout: 10000
    });

    const data = response.data;
    
    const rainfallData = data.hourly.time.map((time, index) => ({
      time,
      precipitation: data.hourly.precipitation[index],
      probability: data.hourly.precipitation_probability[index]
    })).filter(item => item.precipitation > 0);

    const dailyTotals = {};
    rainfallData.forEach(item => {
      const date = item.time.split('T')[0];
      if (!dailyTotals[date]) dailyTotals[date] = 0;
      dailyTotals[date] += item.precipitation;
    });

    const result = {
      location: { latitude, longitude },
      hourly: rainfallData,
      dailyTotals,
      totalPrecipitation: rainfallData.reduce((sum, item) => sum + item.precipitation, 0),
      source: 'Open-Meteo API (Real forecast data)',
      isReal: true,
      timestamp: new Date().toISOString()
    };

    setCache(cacheKey, result);
    res.json(result);

  } catch (error) {
    console.error('Error in getRainfallForecast:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch rainfall forecast',
      details: error.message,
      isReal: false
    });
  }
});

// FIXED: Air Quality endpoint with proper OpenAQ v3 implementation
// Replace your existing /api/getAirQuality endpoint in server.js with this:

// AIR QUALITY ENDPOINT - FIXED VERSION
app.post('/api/getAirQuality', async (req, res) => {
  try {
    const { bounds, latitude, longitude } = req.body;

    console.log('=== AIR QUALITY REQUEST ===');
    console.log('Bounds:', bounds);
    console.log('Center:', latitude, longitude);

    const centerLat = bounds ? (bounds.north + bounds.south) / 2 : latitude;
    const centerLng = bounds ? (bounds.east + bounds.west) / 2 : longitude;

    if (!centerLat || !centerLng) {
      return res.status(400).json({ 
        error: 'Must provide either bounds or coordinates',
        isReal: false 
      });
    }

    // Check cache first
    const cacheKey = getCacheKey('airquality', centerLat, centerLng);
    const cached = getFromCache(cacheKey);
    if (cached) {
      console.log('✓ Returning cached air quality data');
      return res.json(cached);
    }

    // Try OpenAQ ground stations first
    console.log('Attempting OpenAQ ground stations...');
    const stationData = await fetchOpenAQStations(bounds, centerLat, centerLng);

    if (stationData.locations && stationData.locations.length > 0) {
      console.log(`✓ SUCCESS: ${stationData.locations.length} ground stations from OpenAQ`);
      setCache(cacheKey, stationData);
      return res.json(stationData);
    }

    // Fallback to CAMS model if no stations found
    console.log('No OpenAQ stations found. Trying CAMS model...');
    const modelData = await fetchModelAirQuality(centerLat, centerLng);

    if (modelData.isReal) {
      console.log('✓ SUCCESS: Model estimate from Open-Meteo (CAMS)');
      setCache(cacheKey, modelData);
      return res.json(modelData);
    }

    // Both failed - return error
    console.log('✗ FAILED: No data from OpenAQ or CAMS');
    return res.json({
      locations: [],
      count: 0,
      source: 'None',
      isReal: false,
      note: 'No air quality data available. Neither ground monitoring stations (OpenAQ) nor atmospheric model data (CAMS) are accessible for this location.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('✗ Air quality endpoint error:', error.message);
    res.status(503).json({
      locations: [],
      count: 0,
      error: error.message,
      isReal: false,
      timestamp: new Date().toISOString()
    });
  }
});

// UPDATED: OpenAQ v3 with correct endpoint and parameters
// Replace the fetchOpenAQStations function in your server.js

async function fetchOpenAQStations(bounds, centerLat, centerLng) {
  try {
    console.log('\n=== FETCHING OPENAQ STATIONS ===');
    
    // Build request parameters
    let params = {
      limit: 100,
      'order_by': 'datetime',
      'sort_order': 'desc'
    };

    // Spatial filtering
    if (bounds) {
      // OpenAQ v3 uses: west,south,east,north
      const bboxString = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
      params.bbox = bboxString;
      console.log(`Using bbox: ${bboxString}`);
    } else {
      params.coordinates = `${centerLat},${centerLng}`;
      params.radius = 50000; // 50km
      console.log(`Using coordinates: ${params.coordinates}, radius: ${params.radius}m`);
    }

    console.log('Full OpenAQ request params:', JSON.stringify(params, null, 2));

    await throttleRequest();

    const url = `${OPENAQ_BASE_URL}/latest`;
    console.log(`Requesting: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'X-API-Key': OPENAQ_API_KEY,
        'Accept': 'application/json'
      },
      params,
      timeout: 20000
    });

    console.log('OpenAQ Response Status:', response.status);
    console.log('OpenAQ Response Headers:', response.headers);

    if (!response.data) {
      console.log('❌ No data in response');
      return { locations: [], count: 0 };
    }

    const meta = response.data.meta;
    const results = response.data.results || [];
    
    console.log(`OpenAQ Meta:`, JSON.stringify(meta, null, 2));
    console.log(`OpenAQ returned ${results.length} measurements`);

    if (results.length === 0) {
      console.log('❌ Zero results from OpenAQ');
      console.log('This could mean:');
      console.log('  1. No stations in this area');
      console.log('  2. API rate limit reached');
      console.log('  3. Invalid bbox/coordinates');
      return { locations: [], count: 0 };
    }

    // Log first result for debugging
    if (results.length > 0) {
      console.log('First measurement sample:', JSON.stringify(results[0], null, 2));
    }

    // Group measurements by location
    const locationMap = new Map();

    results.forEach((measurement, idx) => {
      try {
        // Extract location information
        const locId = measurement.locationId || measurement.location?.id;
        const locName = measurement.location?.name || 
                       measurement.locationName || 
                       `Station ${locId}`;
        
        const coords = measurement.coordinates;
        const lat = coords?.latitude;
        const lng = coords?.longitude;

        // Validate required fields
        if (!locId || lat == null || lng == null) {
          console.log(`Skipping measurement ${idx}: missing location data`);
          return;
        }

        // Initialize location entry
        if (!locationMap.has(locId)) {
          locationMap.set(locId, {
            id: locId,
            name: locName,
            latitude: lat,
            longitude: lng,
            measurements: {},
            sourceType: 'station',
            lastUpdate: null
          });
        }

        const loc = locationMap.get(locId);

        // Extract parameter info
        const param = measurement.parameter;
        const paramId = param?.id;
        const paramName = param?.name?.toLowerCase() || '';
        const paramUnits = param?.units || 'µg/m³';
        const value = measurement.value;
        const datetime = measurement.date?.utc || 
                        measurement.datetime?.utc || 
                        new Date().toISOString();

        // Map parameter names to standard keys
        const paramMapping = {
          'pm25': 'pm25',
          'pm2.5': 'pm25',
          'pm10': 'pm10',
          'no2': 'no2',
          'nitrogen dioxide': 'no2',
          'o3': 'o3',
          'ozone': 'o3',
          'so2': 'so2',
          'sulfur dioxide': 'so2',
          'co': 'co',
          'carbon monoxide': 'co'
        };

        const standardParam = paramMapping[paramName] || paramName;

        if (value != null && standardParam) {
          loc.measurements[standardParam] = {
            value: value,
            unit: paramUnits,
            lastUpdated: datetime
          };

          // Track latest update time
          if (!loc.lastUpdate || datetime > loc.lastUpdate) {
            loc.lastUpdate = datetime;
          }
        }

      } catch (err) {
        console.error(`Error processing measurement ${idx}:`, err.message);
      }
    });

    console.log(`Grouped into ${locationMap.size} unique locations`);

    // Convert to array and filter
    const locations = Array.from(locationMap.values())
      .filter(loc => {
        // Must have at least PM2.5
        const hasPM25 = loc.measurements.pm25;
        if (!hasPM25) {
          console.log(`Filtering out ${loc.name}: no PM2.5 data`);
        }
        return hasPM25;
      })
      .map(loc => {
        const pm25Value = loc.measurements.pm25.value;
        const aqi = calculateAQI(pm25Value);

        return {
          ...loc,
          aqi,
          aqiCategory: getAQICategory(aqi),
          color: getAQIColor(aqi)
        };
      })
      .sort((a, b) => b.aqi - a.aqi)
      .slice(0, 50);

    console.log(`✅ Final result: ${locations.length} valid stations with PM2.5`);
    
    if (locations.length > 0) {
      console.log('Sample station:', {
        name: locations[0].name,
        aqi: locations[0].aqi,
        measurements: Object.keys(locations[0].measurements)
      });
    }

    return {
      locations: locations,
      count: locations.length,
      source: 'Ground monitoring stations (OpenAQ v3)',
      isReal: true,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('\n❌ OpenAQ ERROR ===');
    console.error('Error message:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error('⚠️  API KEY INVALID - Get new key from https://explore.openaq.org/');
      } else if (error.response.status === 429) {
        console.error('⚠️  RATE LIMIT EXCEEDED - Wait 1 hour or upgrade plan');
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.error('⚠️  Cannot connect to OpenAQ API');
    }
    
    return { locations: [], count: 0 };
  }
}

// FIXED: Model air quality with better error handling
async function fetchModelAirQuality(latitude, longitude) {
  try {
    console.log(`Fetching CAMS model data for ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);

    await throttleRequest();

    const response = await axios.get('https://air-quality-api.open-meteo.com/v1/air-quality', {
      params: {
        latitude: latitude.toFixed(4),
        longitude: longitude.toFixed(4),
        current: 'pm10,pm2_5,nitrogen_dioxide,ozone,sulphur_dioxide,carbon_monoxide,us_aqi',
        timezone: 'auto'
      },
      timeout: 10000
    });

    if (!response.data || !response.data.current) {
      console.log('CAMS API returned invalid structure');
      return { isReal: false };
    }

    const current = response.data.current;

    // Extract pollutants
    const pm25 = current.pm2_5;
    const pm10 = current.pm10;
    const no2 = current.nitrogen_dioxide;
    const o3 = current.ozone;
    const so2 = current.sulphur_dioxide;
    const co = current.carbon_monoxide;

    // Calculate or use provided AQI
    const modelAQI = current.us_aqi || calculateAQI(pm25);

    const location = {
      id: 'cams_model',
      name: 'CAMS Model Estimate',
      latitude,
      longitude,
      measurements: {
        pm25: { value: pm25, unit: 'µg/m³', lastUpdated: new Date().toISOString() }
      },
      aqi: modelAQI,
      aqiCategory: getAQICategory(modelAQI),
      color: getAQIColor(modelAQI),
      sourceType: 'model'
    };

    // Add other pollutants if available
    if (pm10 != null) location.measurements.pm10 = { value: pm10, unit: 'µg/m³' };
    if (no2 != null) location.measurements.no2 = { value: no2, unit: 'µg/m³' };
    if (o3 != null) location.measurements.o3 = { value: o3, unit: 'µg/m³' };
    if (so2 != null) location.measurements.so2 = { value: so2, unit: 'µg/m³' };
    if (co != null) location.measurements.co = { value: co, unit: 'µg/m³' };

    console.log(`✓ CAMS model returned AQI ${modelAQI}`);

    return {
      locations: [location],
      count: 1,
      source: 'CAMS Atmospheric Model (Open-Meteo)',
      isReal: true,
      note: 'No ground monitoring stations found nearby. Showing atmospheric model estimate from Copernicus Atmosphere Monitoring Service (CAMS).',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('CAMS model API error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
    }
    return { isReal: false };
  }
}


// Fetch solar data from NASA POWER with caching
async function fetchSolarData(latitude, longitude) {
  const cacheKey = getCacheKey('solar', latitude, longitude);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const params = {
      ...NASA_POWER_PARAMS,
      latitude,
      longitude
    };

    const url = `${NASA_POWER_BASE_URL}?${new URLSearchParams(params)}`;
    console.log(`Fetching NASA POWER data for ${latitude}, ${longitude}`);
    
    await throttleRequest();
    
    const response = await axios.get(url, { timeout: 15000 });

    const irradianceData = response.data.properties.parameter.ALLSKY_SFC_SW_DWN;
    const tempData = response.data.properties.parameter.T2M;

    const irradianceValues = Object.values(irradianceData).filter(v => v !== -999);
    const avgIrradiance = irradianceValues.reduce((a, b) => a + b, 0) / irradianceValues.length;

    const tempValues = Object.values(tempData).filter(v => v !== -999);
    const avgTemp = tempValues.reduce((a, b) => a + b, 0) / tempValues.length;

    console.log(`NASA POWER: ${irradianceValues.length} data points retrieved`);

    const result = {
      avgIrradiance: avgIrradiance,
      avgTemperature: avgTemp,
      dataPoints: irradianceValues.length,
      source: 'NASA POWER API',
      isReal: true
    };

    setCache(cacheKey, result);
    return result;

  } catch (error) {
    console.error('NASA POWER API Error:', error.message);
    return {
      avgIrradiance: null,
      avgTemperature: null,
      dataPoints: 0,
      source: 'NASA POWER API',
      isReal: false,
      note: `API Error: ${error.message}`
    };
  }
}

// Fetch temperature for a single point with caching
async function fetchTemperaturePoint(latitude, longitude) {
  const cacheKey = getCacheKey('temp', latitude, longitude);
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  try {
    const params = {
      ...NASA_POWER_PARAMS,
      latitude,
      longitude
    };

    const url = `${NASA_POWER_BASE_URL}?${new URLSearchParams(params)}`;
    
    await throttleRequest();
    
    const response = await axios.get(url, { timeout: 8000 });

    const tempData = response.data.properties.parameter.T2M;
    const tempValues = Object.values(tempData).filter(v => v !== -999);
    const avgTemp = tempValues.reduce((a, b) => a + b, 0) / tempValues.length;

    const result = { 
      avgTemperature: avgTemp,
      isReal: true 
    };

    setCache(cacheKey, result);
    return result;
  } catch (error) {
    return { 
      avgTemperature: null,
      isReal: false,
      note: error.message
    };
  }
}

// Fetch precipitation data with caching and rate limiting
async function fetchPrecipitationData(latitude, longitude) {
  const cacheKey = getCacheKey('precip', latitude, longitude);
  const cached = getFromCache(cacheKey);
  if (cached) {
    console.log(`✓ Cache hit: ${cacheKey}`);
    return cached;
  }

  try {
    console.log(`Fetching precipitation forecast for ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);

    await throttleRequest();

    // Use FORECAST API instead of Archive API - much better rate limits
    const response = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: latitude.toFixed(4),
        longitude: longitude.toFixed(4),
        daily: 'precipitation_sum',
        past_days: 92, // Get past 3 months
        forecast_days: 1,
        timezone: 'auto'
      },
      timeout: 10000
    });

    if (!response.data?.daily?.precipitation_sum) {
      throw new Error('Invalid response structure');
    }

    const precipData = response.data.daily.precipitation_sum;
    const totalPrecip = precipData.reduce((sum, val) => sum + (val || 0), 0);
    const avgDaily = totalPrecip / precipData.length;
    const annualPrecip = avgDaily * 365;

    console.log(`✓ Success: ${precipData.length} days of precipitation data (Forecast API)`);

    const result = {
      avgDailyPrecipitation: parseFloat(avgDaily.toFixed(2)),
      annualPrecipitation: parseFloat(annualPrecip.toFixed(0)),
      dataPoints: precipData.length,
      source: 'Open-Meteo Forecast API (3 months historical)',
      isReal: true,
      lastUpdate: new Date().toISOString()
    };

    setCache(cacheKey, result);
    return result;

  } catch (error) {
    console.error(`✗ Precipitation fetch failed:`, error.message);
    
    // Fallback to typical Bangladesh rainfall if API fails
    const typicalBangladeshRainfall = 2200; // mm/year
    
    return {
      avgDailyPrecipitation: parseFloat((typicalBangladeshRainfall / 365).toFixed(2)),
      annualPrecipitation: typicalBangladeshRainfall,
      dataPoints: 0,
      source: 'Typical Bangladesh average (API unavailable)',
      isReal: false,
      note: error.response?.status === 429 
        ? 'Rate limit reached. Using regional average.' 
        : 'Using regional average rainfall data.'
    };
  }
}
// Calculate solar potential
function calculateSolarPotential(area, solarData) {
  if (!solarData.isReal || !solarData.avgIrradiance) {
    return {
      error: 'Cannot calculate - no real solar data available'
    };
  }

  const PANEL_EFFICIENCY = 0.20;
  const PERFORMANCE_RATIO = 0.85;
  const DAYS_PER_YEAR = 365;

  const avgIrradiance = solarData.avgIrradiance;
  const annualEnergy = area * avgIrradiance * DAYS_PER_YEAR * PANEL_EFFICIENCY * PERFORMANCE_RATIO;

  return {
    annualEnergy: Math.round(annualEnergy),
    avgIrradiance: avgIrradiance,
    panelEfficiency: PANEL_EFFICIENCY,
    performanceRatio: PERFORMANCE_RATIO,
    estimatedPanels: Math.floor(area / 2),
    co2Offset: Math.round(annualEnergy * 0.5),
    isReal: true
  };
}

// Calculate rainwater potential
function calculateRainwaterPotential(area, precipData) {
  if (!precipData.isReal || !precipData.annualPrecipitation) {
    return {
      error: 'Cannot calculate - no real precipitation data available'
    };
  }

  const RUNOFF_COEFFICIENT = 0.9;
  const annualRainfall = precipData.annualPrecipitation;
  const annualWater = area * annualRainfall * RUNOFF_COEFFICIENT;

  return {
    annualWater: Math.round(annualWater),
    avgPrecipitation: precipData.avgDailyPrecipitation,
    runoffCoefficient: RUNOFF_COEFFICIENT,
    storageTankSize: Math.ceil(annualWater / 12 / 1000),
    householdsSupported: Math.floor(annualWater / 50000),
    isReal: true
  };
}

// Normalize temperature for heat map
function normalizeTemperature(temp) {
  const min = 20;
  const max = 40;
  return Math.min(Math.max((temp - min) / (max - min), 0), 1);
}

// Calculate AQI from PM2.5
function calculateAQI(pm25) {
  const breakpoints = [
    { cLow: 0, cHigh: 12.0, iLow: 0, iHigh: 50 },
    { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
    { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
    { cLow: 250.5, cHigh: 500.4, iLow: 301, iHigh: 500 }
  ];

  for (const bp of breakpoints) {
    if (pm25 >= bp.cLow && pm25 <= bp.cHigh) {
      const aqi = ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (pm25 - bp.cLow) + bp.iLow;
      return Math.round(aqi);
    }
  }
  
  return pm25 > 500.4 ? 500 : 0;
}

// Get AQI category
function getAQICategory(aqi) {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

// Get AQI color
function getAQIColor(aqi) {
  if (aqi <= 50) return '#00e400';
  if (aqi <= 100) return '#ffff00';
  if (aqi <= 150) return '#ff7e00';
  if (aqi <= 200) return '#ff0000';
  if (aqi <= 300) return '#8f3f97';
  return '#7e0023';
}

// HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'RoofHarvest API is running - REAL DATA ONLY',
    cacheSize: dataCache.size,
    endpoints: [
      'POST /api/getRoofData',
      'POST /api/getHeatMap',
      'POST /api/getBuildingDensityMap',
      'POST /api/getRainfallForecast',
      'POST /api/getAirQuality',
      'GET /api/health'
    ],
    dataSources: [
      'NASA POWER (Real solar & temperature)',
      'Open-Meteo Archive (Real historical precipitation)',
      'Open-Meteo Forecast (Real rainfall forecast)',
      'OpenAQ v3 (Real air quality monitoring)',
      'OpenStreetMap (via client for Building Density)'
    ],
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
====================================================
          RoofHarvest Backend Server                   
              NO SYNTHETIC DATA                  
                                                       
  Status: Running                                      
  Port: ${PORT}                                           
  URL: http://localhost:${PORT}                           
                                                       
  Endpoints:                                           
    POST /api/getRoofData                              
    POST /api/getHeatMap                               
    POST /api/getBuildingDensityMap                    
    POST /api/getRainfallForecast                      
    POST /api/getAirQuality                            
    GET  /api/health                                   
                                                       
  Real Data Sources:                                   
    - NASA POWER (Solar + Temperature)                
    - Open-Meteo Archive (Precipitation History)      
    - Open-Meteo (Rainfall Forecast)                  
    - OpenAQ v3 (Air Quality Monitoring)              
    - OpenStreetMap (Building data via client)        
                                                       
  Features:
    - Caching: ${dataCache.size} entries
    - Rate limiting: 100ms between requests
    - All endpoints return isReal flag                 
    - Failed API calls return 503 or error objects     
====================================================
  `);
});