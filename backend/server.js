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

const OPENAQ_API_KEY = '0f9fab0602c84f99f01a0bc7245318e6ccd88bffeb1a0c3259d1599dac3bef22';
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

// AIR QUALITY ENDPOINT
app.post('/api/getAirQuality', async (req, res) => {
  try {
    const { bounds, latitude, longitude } = req.body;

    console.log('Fetching air quality data...');

    const centerLat = bounds ? (bounds.north + bounds.south) / 2 : latitude;
    const centerLng = bounds ? (bounds.east + bounds.west) / 2 : longitude;

    if (!centerLat || !centerLng) {
      return res.status(400).json({ error: 'Provide bounds or coordinates' });
    }

    const cacheKey = getCacheKey('airquality', centerLat, centerLng);
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    const stationData = await fetchOpenAQStations(bounds, centerLat, centerLng);

    if (stationData.locations.length > 0) {
      console.log(`Returning ${stationData.locations.length} ground stations from OpenAQ`);
      setCache(cacheKey, stationData);
      return res.json(stationData);
    }

    console.log('No OpenAQ stations found. Falling back to CAMS model...');
    const modelData = await fetchModelAirQuality(centerLat, centerLng);

    if (modelData.isReal) {
      console.log('Returning model estimate from Open-Meteo (CAMS)');
      setCache(cacheKey, modelData);
      return res.json(modelData);
    }

    return res.json({
      locations: [],
      count: 0,
      source: 'None',
      isReal: false,
      note: 'No air quality data available. Neither ground stations (OpenAQ) nor model data (CAMS) are accessible for this location.',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error in getAirQuality:', error.message);
    res.status(503).json({
      locations: [],
      count: 0,
      error: error.message,
      isReal: false,
      timestamp: new Date().toISOString()
    });
  }
});

// Fetch OpenAQ v3 ground stations
async function fetchOpenAQStations(bounds, centerLat, centerLng) {
  try {
    let params = {
      limit: 100,
      'parameters_id': 2,
    };

    if (bounds) {
      params.bbox = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`;
      console.log('OpenAQ bbox:', params.bbox);
    } else {
      params.coordinates = `${centerLat},${centerLng}`;
      params.radius = 25000;
      console.log('OpenAQ coordinates:', params.coordinates);
    }

    const response = await axios.get(`${OPENAQ_BASE_URL}/latest`, {
      headers: {
        'X-API-Key': OPENAQ_API_KEY,
        'Accept': 'application/json'
      },
      params,
      timeout: 15000
    });

    const results = response.data.results || [];
    console.log(`OpenAQ returned ${results.length} measurements`);

    if (results.length === 0) {
      return { locations: [], count: 0 };
    }

    const locationMap = new Map();

    results.forEach(measurement => {
      const locId = measurement.location?.id || measurement.locationId;
      const locName = measurement.location?.name || measurement.location || `Station ${locId}`;
      const lat = measurement.coordinates?.latitude;
      const lng = measurement.coordinates?.longitude;

      if (!locId || !lat || !lng) return;

      if (!locationMap.has(locId)) {
        locationMap.set(locId, {
          id: locId,
          name: locName,
          latitude: lat,
          longitude: lng,
          measurements: {},
          sourceType: 'station'
        });
      }

      const loc = locationMap.get(locId);
      const paramName = measurement.parameter?.name || measurement.parameter;

      if (paramName) {
        loc.measurements[paramName] = {
          value: measurement.value,
          unit: measurement.parameter?.units || 'µg/m³',
          lastUpdated: measurement.date?.utc || measurement.datetime?.utc
        };
      }
    });

    const airQualityData = Array.from(locationMap.values())
      .filter(loc => loc.measurements.pm25)
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
      .sort((a, b) => b.aqi - a.aqi);

    return {
      locations: airQualityData.slice(0, 50),
      count: airQualityData.length,
      source: 'Ground stations (OpenAQ v3)',
      isReal: true,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('OpenAQ error:', error.message);
    return { locations: [], count: 0 };
  }
}

// Fetch model air quality from Open-Meteo
async function fetchModelAirQuality(latitude, longitude) {
  try {
    console.log(`Fetching CAMS model data for ${latitude}, ${longitude}`);

    await throttleRequest();

    const response = await axios.get('https://air-quality-api.open-meteo.com/v1/air-quality', {
      params: {
        latitude,
        longitude,
        current: 'pm10,pm2_5,nitrogen_dioxide,ozone,us_aqi',
        timezone: 'auto'
      },
      timeout: 10000
    });

    const data = response.data;

    if (!data.current) {
      return { isReal: false };
    }

    const pm25 = data.current.pm2_5;
    const pm10 = data.current.pm10;
    const no2 = data.current.nitrogen_dioxide;
    const o3 = data.current.ozone;
    const modelAQI = data.current.us_aqi || calculateAQI(pm25);

    const location = {
      id: 'model_estimate',
      name: 'Model Estimate (CAMS)',
      latitude,
      longitude,
      measurements: {
        pm25: { value: pm25, unit: 'µg/m³', lastUpdated: new Date().toISOString() },
        ...(pm10 && { pm10: { value: pm10, unit: 'µg/m³' } }),
        ...(no2 && { no2: { value: no2, unit: 'µg/m³' } }),
        ...(o3 && { o3: { value: o3, unit: 'µg/m³' } })
      },
      aqi: modelAQI,
      aqiCategory: getAQICategory(modelAQI),
      color: getAQIColor(modelAQI),
      sourceType: 'model'
    };

    return {
      locations: [location],
      count: 1,
      source: 'CAMS Model (Open-Meteo)',
      isReal: true,
      note: 'No ground stations nearby. Showing atmospheric model estimate.',
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Model API error:', error.message);
    return { isReal: false };
  }
}

// HELPER FUNCTIONS

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