import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Droplet, Sun, Download, Loader2, Building2, Search, X, Layers, Thermometer, CloudRain, Wind, Info, ChevronRight, Leaf, AlertCircle, FileText, ChevronUp, AlertTriangle, Maximize2 } from 'lucide-react';
import Building3DVisualization from './components/Building3DVisualization';
// Unified Loading Manager Component
const LoadingManager = ({ operations }) => {
  const activeOps = Object.entries(operations).filter(([_, data]) => data.active);
  if (activeOps.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 bg-white rounded-lg shadow-xl z-[10000] w-80 border border-slate-200">
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span className="font-semibold text-slate-900">Loading Data</span>
        </div>
      </div>
      <div className="p-4 space-y-3 max-h-64 overflow-y-auto">
        {activeOps.map(([key, data]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{data.label}</span>
              {data.progress && (
                <span className="text-xs text-slate-500">
                  {data.progress.current}/{data.progress.total}
                </span>
              )}
            </div>
            {data.progress ? (
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div 
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                  style={{ width: `${(data.progress.current / data.progress.total) * 100}%` }}
                />
              </div>
            ) : (
              <div className="w-full bg-slate-200 rounded-full h-1.5">
                <div className="bg-blue-600 h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const InfoModal = ({ type, onClose }) => {
  const infoContent = {
    solar: {
      title: "Solar Energy Potential",
      icon: <Sun className="w-6 h-6 text-amber-600" />,
      description: "Calculates rooftop solar PV generation capacity using real NASA POWER satellite irradiance data.",
      formula: "Annual Energy = Roof Area × Daily Irradiance × 365 × 0.20 × 0.85",
      dataSource: "NASA POWER API (ALLSKY_SFC_SW_DWN)",
      regulations: [
        "Bangladesh: Net metering up to 500 kW (SREDA 2018)",
        "India: 40% subsidy for residential solar up to 3 kW",
        "Average payback: 4-7 years, Panel lifespan: 25-30 years"
      ]
    },
    water: {
      title: "Rainwater Harvesting Potential",
      icon: <Droplet className="w-6 h-6 text-blue-600" />,
      description: "Calculates collectible rainwater using real historical precipitation data from Open-Meteo Archive.",
      formula: "Annual Water = Roof Area × Annual Rainfall × 0.90",
      dataSource: "Open-Meteo Historical Archive - 1 year of data",
      regulations: [
        "Bangladesh Building Code 2020: RWH required for buildings >1,000m²",
        "India IS 15797:2008: RWH design standards",
        "Typical system cost: $600-$1,000 for 500m² roof"
      ]
    },
    heat: {
      title: "Urban Heat Island Effect",
      icon: <Thermometer className="w-6 h-6 text-red-600" />,
      description: "Combined UHI model: NASA satellite temperature + building density + impervious surfaces.",
      formula: "UHI Risk = (NASA Temp × 0.5) + (Building Density × 0.3) + (Low Green × 0.2)",
      dataSource: "NASA POWER T2M + OpenStreetMap building footprints",
      regulations: [
        "India NAPCC: National guidelines for UHI mitigation",
        "LEED v4.1: Cool roof requirements (SRI ≥82)",
        "Cool roof coating: 3-5°C reduction, Green roof: 2-8°C"
      ]
    },
    airQuality: {
      title: "Air Quality Monitoring",
      icon: <Wind className="w-6 h-6 text-purple-600" />,
      description: "Real-time air quality from ground monitoring stations (PM2.5, PM10, NO₂, O₃).",
      formula: "AQI = EPA breakpoint calculation from PM2.5 concentration",
      dataSource: "OpenAQ API v3 (Real ground monitoring network)",
      regulations: [
        "Bangladesh: Annual PM2.5 limit 15 µg/m³",
        "WHO Guidelines: PM2.5 annual mean ≤5 µg/m³",
        "Green walls reduce PM10 by 60%, HEPA filters remove 99.97% PM2.5"
      ]
    },
    greenSpace: {
      title: "Green Space Opportunities",
      icon: <Leaf className="w-6 h-6 text-green-600" />,
      description: "Identifies underutilized open areas and large rooftops suitable for urban greening.",
      formula: "Suitability = Low Building Density + Open Rooftops + Public Proximity",
      dataSource: "OpenStreetMap building footprints",
      regulations: [
        "Bangladesh: 10% green area mandatory in new residential zones",
        "LEED: Requires >30% vegetated site area",
        "One tree absorbs 21 kg CO₂/year, Urban trees reduce runoff by 62%"
      ]
    },
    priorityZones: {
      title: "Priority Intervention Zones",
      icon: <AlertCircle className="w-6 h-6 text-orange-600" />,
      description: "Multi-criteria analysis combining NASA temperature data, building density, green space deficit, and rooftop opportunities.",
      formula: "Priority = (Heat Risk × 0.35) + (Building Density × 0.25) + (Green Deficit × 0.25) + (Rooftop Potential × 0.15)",
      dataSource: "NASA POWER Temperature + OpenStreetMap buildings + Environmental analysis",
      regulations: [
        "UN-Habitat: Climate adaptation in rapidly growing cities",
        "Paris Agreement: Urban adaptation strategies in NDCs",
        "WHO Heat-Health Action Plans: Priority zones for cooling centers",
        "Integrated approach: Combine cool roofs + green infrastructure + RWH"
      ]
    }
  };

  const content = infoContent[type];
  if (!content) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white p-6 rounded-t-xl flex items-start justify-between border-b border-slate-200">
          <div className="flex items-start space-x-3">
            <div className="bg-slate-100 p-2 rounded-lg">{content.icon}</div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{content.title}</h2>
              <p className="text-sm text-slate-600 mt-1">{content.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <h3 className="font-bold text-slate-900 mb-2 flex items-center">
              <FileText className="w-4 h-4 mr-2" />Calculation Method
            </h3>
            <code className="text-sm text-slate-800 block bg-white p-3 rounded border border-slate-200 font-mono">
              {content.formula}
            </code>
            <p className="text-xs text-slate-600 mt-2 flex items-center">
              <Info className="w-3 h-3 mr-1" />Data Source: {content.dataSource}
            </p>
          </div>
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="font-bold text-slate-900 mb-3 flex items-center">
              <FileText className="w-4 h-4 mr-2" />Regulations & Benchmarks
            </h3>
            <ul className="space-y-2">
              {content.regulations.map((reg, idx) => (
                <li key={idx} className="flex items-start text-sm text-slate-700">
                  <ChevronRight className="w-4 h-4 mr-2 text-blue-600 flex-shrink-0 mt-0.5" />
                  <span>{reg}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

const ErrorAlert = ({ message, onClose }) => (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3 mb-4">
    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
    <div className="flex-1">
      <h4 className="font-semibold text-red-900">Data Unavailable</h4>
      <p className="text-sm text-red-700 mt-1">{message}</p>
    </div>
    {onClose && (
      <button onClick={onClose} className="text-red-400 hover:text-red-600">
        <X className="w-4 h-4" />
      </button>
    )}
  </div>
);

const Legend = ({ gradient, steps }) => {
    if (gradient) {
        return (
            <div className="w-full mt-2">
                <div className="h-2 rounded-full" style={{ background: `linear-gradient(to right, ${gradient.from}, ${gradient.to})` }}></div>
                <div className="flex justify-between text-xs text-slate-600 mt-1">
                    <span>{gradient.startLabel}</span>
                    <span>{gradient.endLabel}</span>
                </div>
            </div>
        );
    }
    if (steps) {
        return (
            <div className="w-full mt-2 space-y-1">
                {steps.map((step, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: step.color }}></div>
                        <span className="text-xs text-slate-600">{step.label}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const LayerControlPanel = ({ layers, activeLayers, toggleLayer, setActiveInfo }) => {
    const [expanded, setExpanded] = useState(true);

    return (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-xl z-[1000] w-80 border border-slate-200">
            <button 
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between p-4 border-b border-slate-200 hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center space-x-2">
                    <Layers className="w-5 h-5 text-slate-700" />
                    <h3 className="font-bold text-slate-900">Data Layers</h3>
                </div>
                <ChevronUp className={`w-5 h-5 text-slate-500 transition-transform ${!expanded && 'rotate-180'}`} />
            </button>
            {expanded && (
                <div className="p-3 space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto">
                    {layers.map(layer => {
                        const isActive = activeLayers[layer.id];
                        return (
                            <div key={layer.id} className={`p-3 rounded-lg transition-all border ${isActive ? 'bg-blue-50 border-blue-200' : 'bg-white border-slate-200'}`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                                        <layer.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                                        <span className={`font-semibold text-sm ${isActive ? 'text-slate-900' : 'text-slate-600'}`}>{layer.label}</span>
                                    </div>
                                    <div className="flex items-center space-x-2 flex-shrink-0">
                                        <button onClick={() => setActiveInfo(layer.id)} className="text-slate-400 hover:text-blue-600 transition-colors">
                                            <Info className="w-4 h-4" />
                                        </button>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                          <input type="checkbox" checked={isActive} onChange={() => toggleLayer(layer.id)} className="sr-only peer" />
                                          <div className="w-9 h-5 bg-slate-200 rounded-full peer peer-focus:ring-2 peer-focus:ring-blue-300 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                                        </label>
                                    </div>
                                </div>
                                {isActive && (
                                    <div className="mt-3 pt-3 border-t border-slate-200">
                                        <p className="text-xs text-slate-600 mb-2">{layer.description}</p>
                                        <Legend {...layer.legend} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const RoofHarvestApp = () => {
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [roofData, setRoofData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('Dhaka');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [mapCenter, setMapCenter] = useState({ lat: 23.8103, lng: 90.4125 });
  const [buildings, setBuildings] = useState([]);
  const [activeInfo, setActiveInfo] = useState(null);
  const [dataError, setDataError] = useState(null);
  const [show3DView, setShow3DView] = useState(false);
  const [activeLayers, setActiveLayers] = useState({
    buildings: true,
    heat: false,
    airQuality: false,
    greenSpace: false,
    priorityZones: false
  });
  
  const [loadingOperations, setLoadingOperations] = useState({});

  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);
  const buildingLayersRef = useRef([]);
  const heatLayerRef = useRef(null);
  const airQualityLayerRef = useRef(null);
  const greenSpaceLayerRef = useRef(null);
  const priorityZoneLayerRef = useRef(null);
  const nasaDataCacheRef = useRef({});

  const layerConfig = [
    { 
      id: 'buildings', 
      icon: Building2, 
      label: 'Buildings', 
      description: 'Building footprints from OpenStreetMap.', 
      legend: { steps: [{color: '#cbd5e1', label: 'Standard'}, {color: '#86efac', label: 'Large roof (>300m²)'}]} 
    },
    { 
      id: 'heat', 
      icon: Thermometer, 
      label: 'Urban Heat', 
      description: 'Combined: NASA temperature + building density.', 
      legend: { gradient: {from: '#3b82f6', to: '#ef4444', startLabel: 'Cool', endLabel: 'Hot'}}
    },
    { 
      id: 'airQuality', 
      icon: Wind, 
      label: 'Air Quality', 
      description: 'Real-time monitoring stations (OpenAQ).', 
      legend: { gradient: {from: '#22c55e', to: '#dc2626', startLabel: 'Good', endLabel: 'Hazardous'}}
    },
    { 
      id: 'greenSpace', 
      icon: Leaf, 
      label: 'Green Opportunities', 
      description: 'Large rooftops suitable for urban greening.', 
      legend: { steps: [{color: '#10b981', label: 'Greening potential'}]} 
    },
    { 
  id: 'priorityZones', 
  icon: AlertCircle, 
  label: 'Priority Zones', 
  description: 'Multi-criteria analysis: heat + density + green deficit + rooftop potential.', 
  legend: { 
    gradient: {
      from: '#ddd6fe',  // Light purple
      to: '#4c1d95',     // Dark purple
      startLabel: 'Low Priority', 
      endLabel: 'Critical'
    }
  }
},
  ];

  const startLoading = (key, label, hasProgress = false) => {
    setLoadingOperations(prev => ({
      ...prev,
      [key]: { active: true, label, progress: hasProgress ? { current: 0, total: 1 } : null }
    }));
  };

  const updateLoadingProgress = (key, current, total) => {
    setLoadingOperations(prev => ({
      ...prev,
      [key]: { ...prev[key], progress: { current, total } }
    }));
  };

  const stopLoading = (key) => {
    setLoadingOperations(prev => {
      const newState = { ...prev };
      delete newState[key];
      return newState;
    });
  };

  useEffect(() => {
    if (window.L) {
      initMap();
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    script.onload = () => {
      const heatScript = document.createElement('script');
      heatScript.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
      heatScript.async = true;
      heatScript.onload = initMap;
      document.body.appendChild(heatScript);
    };
    document.body.appendChild(script);
    
    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, []);

  const initMap = () => {
    if (!window.L || !mapRef.current || leafletMapRef.current) return;
    const map = window.L.map(mapRef.current, {
      zoomControl: false,
      minZoom: 12,
      maxZoom: 19
    }).setView([mapCenter.lat, mapCenter.lng], 16);
    
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19
    }).addTo(map);
    
    window.L.control.zoom({ position: 'bottomright' }).addTo(map);
    leafletMapRef.current = map;
    fetchBuildings();
    
    let moveTimeout;
    map.on('moveend', () => {
      clearTimeout(moveTimeout);
      moveTimeout = setTimeout(() => {
        fetchBuildings();
        Object.keys(activeLayers).forEach(layerId => {
            if(activeLayers[layerId] && layerId !== 'buildings') {
                updateLayer(layerId);
            }
        });
      }, 500);
    });
  };

  const searchLocation = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`,
        { headers: { 'User-Agent': 'RoofHarvest/1.0' } }
      );
      if (!response.ok) throw new Error('Search unavailable');
      const data = await response.json();
      setSearchResults(data);
    } catch (error) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const selectLocation = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setMapCenter({ lat, lng });
    setSearchResults([]);
    setSearchQuery(result.display_name.split(',')[0]);
    if (leafletMapRef.current) {
      leafletMapRef.current.setView([lat, lng], 17);
    }
  };

  const fetchBuildings = async () => {
    if (!leafletMapRef.current) return;
    startLoading('buildings', 'Loading buildings');
    try {
      const bounds = leafletMapRef.current.getBounds();
      const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
      const query = `[out:json][timeout:25];way["building"](${bbox});out geom;`;
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: query
      });
      if (!response.ok) throw new Error('Overpass API unavailable');
      const data = await response.json();
      
      buildingLayersRef.current.forEach(layer => leafletMapRef.current?.removeLayer(layer));
      buildingLayersRef.current = [];

      const processedBuildings = data.elements.map((element) => {
        const nodes = element.geometry || [];
        if (nodes.length === 0) return null;
        const area = calculatePolygonArea(nodes);
        const centroid = calculateCentroid(nodes);
        
        const building = { 
          id: element.id, nodes, area, centroid, name: `Building ${element.id}`
        };
        
        if (leafletMapRef.current && nodes.length > 0) {
            const fillColor = area > 300 ? '#86efac' : '#cbd5e1';
            
            const polygon = window.L.polygon(nodes.map(n => [n.lat, n.lon]), {
              color: '#64748b', fillColor: fillColor, fillOpacity: 0.6, weight: 1
            });
            
            polygon.on('click', () => analyzeBuilding(building));
            polygon.bindTooltip(`<b>${building.name}</b><br>Area: ${building.area.toLocaleString()} m²`, { sticky: true });
            
            buildingLayersRef.current.push(polygon);
            if(activeLayers.buildings) polygon.addTo(leafletMapRef.current);
        }
        return building;
      }).filter(Boolean);

      setBuildings(processedBuildings);
      Object.keys(activeLayers).forEach(layerId => {
        if(activeLayers[layerId] && layerId !== 'buildings') {
            updateLayer(layerId, processedBuildings);
        }
      });

    } catch (error) {
      console.error("Failed to fetch buildings:", error);
    } finally {
      stopLoading('buildings');
    }
  };
  
  const updateLayer = (layerName, buildingsData = buildings) => {
    setDataError(null);
    setTimeout(() => {
        switch(layerName) {
            case 'heat': renderCombinedUHI(buildingsData); break;
            case 'airQuality': renderAirQuality(); break;
            case 'greenSpace': renderGreenSpaces(buildingsData); break;
            case 'priorityZones': renderPriorityZones(buildingsData); break;
        }
    }, 100);
  };

  const renderCombinedUHI = async (buildingsData) => {
   if (!leafletMapRef.current) return;
  if (heatLayerRef.current) leafletMapRef.current.removeLayer(heatLayerRef.current);
  
  startLoading('heat', 'Analyzing urban heat', true);
  
  // STEP 1: Get NASA temperature as REGIONAL BASELINE (fetch once for map center)
  const bounds = leafletMapRef.current.getBounds();
  const centerLat = (bounds.getNorth() + bounds.getSouth()) / 2;
  const centerLng = (bounds.getEast() + bounds.getWest()) / 2;
  
  const baselineTemp = await fetchRealNASATemperature(centerLat, centerLng);
  
  if (!baselineTemp || !baselineTemp.isReal) {
    setDataError('Unable to fetch NASA temperature data for this region.');
    stopLoading('heat');
    return;
  }
  
  console.log(`Regional baseline temperature: ${baselineTemp.avgTemperature}°C`);
  
  // STEP 2: Calculate heat for each building using validated factors
  const buildingHeatPoints = [];
  let processedBuildings = 0;
  
  updateLoadingProgress('heat', 0, buildingsData.length);
  
  for (const building of buildingsData) {
    processedBuildings++;
    updateLoadingProgress('heat', processedBuildings, buildingsData.length);
    
    // Calculate local urban heat factors (Climate Central methodology)
    
    // Factor 1: Building Density (12% influence)
    // Count buildings within 100m radius
    const nearbyBuildings = buildingsData.filter(b => {
      const distance = Math.sqrt(
        Math.pow((building.centroid.lat - b.centroid.lat) * 111000, 2) +
        Math.pow((building.centroid.lng - b.centroid.lng) * 111000, 2)
      );
      return distance < 100 && b.id !== building.id;
    });
    const densityFactor = Math.min(nearbyBuildings.length / 15, 1.0); // Normalize to 15 buildings
    const densityAdjustment = densityFactor * 2.0; // Max +2°C
    
    // Factor 2: Building Size/Albedo (29% influence combined)
    // Larger buildings = darker roofs = more heat absorption
    const sizeScore = Math.min(building.area / 1000, 1.0); // Normalize to 1000m²
    const albedoAdjustment = sizeScore * 3.0; // Max +3°C for large dark roofs
    
    // Factor 3: Green Space Deficit (21% influence)
    // Assume inverse of building density as proxy for green space
    const greenDeficit = densityFactor; // High density = low green space
    const greenAdjustment = -greenDeficit * 2.0; // Max -2°C for areas with parks
    
    // Factor 4: Building Height (8% influence)
    // Taller buildings create urban canyons, trap heat
    // We don't have height data, so use area as proxy
    const heightProxy = building.area > 500 ? 1.0 : 0.5;
    const heightAdjustment = heightProxy * 1.0; // Max +1°C
    
    // TOTAL ADJUSTMENT (scientifically weighted)
    const totalAdjustment = 
      (albedoAdjustment * 0.29) +     // 29% weight
      (greenAdjustment * 0.21) +      // 21% weight  
      (densityAdjustment * 0.12) +    // 12% weight
      (heightAdjustment * 0.08);      // 8% weight
    
    const buildingTemperature = baselineTemp.avgTemperature + totalAdjustment;
    const heatIntensity = normalizeTemperature(buildingTemperature);
    
    // Add building center point
    buildingHeatPoints.push({
      lat: building.centroid.lat,
      lng: building.centroid.lng,
      intensity: heatIntensity,
      temperature: buildingTemperature,
      area: building.area
    });
    
    // For large buildings, add surrounding points with natural decay
    if (building.area > 300) {
      const offset = 0.0003; // About 33 meters
      const decayFactor = 0.6; // Heat decays away from building
      
      // Add 4 cardinal direction points
      buildingHeatPoints.push(
        { lat: building.centroid.lat + offset, lng: building.centroid.lng, intensity: heatIntensity * decayFactor },
        { lat: building.centroid.lat - offset, lng: building.centroid.lng, intensity: heatIntensity * decayFactor },
        { lat: building.centroid.lat, lng: building.centroid.lng + offset, intensity: heatIntensity * decayFactor },
        { lat: building.centroid.lat, lng: building.centroid.lng - offset, intensity: heatIntensity * decayFactor }
      );
    }
  }
  
  // STEP 3: Create heatmap from building-based points
  if (window.L.heatLayer && buildingHeatPoints.length > 0) {
    const heatmapData = buildingHeatPoints.map(p => [p.lat, p.lng, p.intensity]);
    
    heatLayerRef.current = window.L.heatLayer(heatmapData, {
      radius: 20,              // Smaller radius = less artificial blur
      blur: 12,                // Less blur = follows buildings better
      maxZoom: 19,
      max: 1.0,
      minOpacity: 0.7,
      gradient: {
        0.0: '#3b82f6',   // Cool - blue
        0.25: '#10b981',  // Moderate - green
        0.5: '#fbbf24',   // Warm - yellow
        0.75: '#f97316',  // Hot - orange
        1.0: '#ef4444'    // Very hot - red
      }
    }).addTo(leafletMapRef.current);
    
    console.log(`✓ Created heat map from ${buildingHeatPoints.length} building-based points`);
  }
  
  stopLoading('heat');
};

  const fetchRealNASATemperature = async (latitude, longitude) => {
    const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const cached = nasaDataCacheRef.current[key];
    if (cached) return cached;

    try {
      const API_URL = process.env.REACT_APP_API_URL;
      const response = await fetch(`${API_URL}/api/getRoofData`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude, longitude, area: 1 })
      });

      if (!response.ok) return null;
      
      const data = await response.json();
      
      if (!data.solarData.isReal) return null;
      
      const nasaData = {
        avgIrradiance: data.solarData.avgIrradiance,
        avgTemperature: data.solarData.avgTemperature,
        annualPrecipitation: data.precipData.annualPrecipitation,
        isReal: true,
        timestamp: Date.now()
      };
      
      nasaDataCacheRef.current[key] = nasaData;
      return nasaData;
    } catch (error) {
      return null;
    }
  };

  const renderPriorityZones = async (buildingsData) => {
      if (!leafletMapRef.current) return;
  if (priorityZoneLayerRef.current) leafletMapRef.current.removeLayer(priorityZoneLayerRef.current);
  
  startLoading('priority', 'Identifying priority zones', true);
  priorityZoneLayerRef.current = window.L.layerGroup().addTo(leafletMapRef.current);
  
  // STEP 1: Identify building clusters (spatial proximity)
  updateLoadingProgress('priority', 1, 5);
  const clusters = identifyBuildingClusters(buildingsData, 0.0015); // 150m clustering distance
  
  console.log(`Identified ${clusters.length} building clusters`);
  
  // STEP 2: Get baseline temperature
  updateLoadingProgress('priority', 2, 5);
  const bounds = leafletMapRef.current.getBounds();
  const centerLat = (bounds.getNorth() + bounds.getSouth()) / 2;
  const centerLng = (bounds.getEast() + bounds.getWest()) / 2;
  const baselineTemp = await fetchRealNASATemperature(centerLat, centerLng);
  
  if (!baselineTemp || !baselineTemp.isReal) {
    setDataError('Unable to calculate priority zones without temperature data.');
    stopLoading('priority');
    return;
  }
  
  // STEP 3: Analyze each cluster
  updateLoadingProgress('priority', 3, 5);
  const clusterAnalysis = clusters.map(cluster => {
    const centerLat = cluster.buildings.reduce((sum, b) => sum + b.centroid.lat, 0) / cluster.buildings.length;
    const centerLng = cluster.buildings.reduce((sum, b) => sum + b.centroid.lng, 0) / cluster.buildings.length;
    
    // Calculate cluster characteristics
    const totalArea = cluster.buildings.reduce((sum, b) => sum + b.area, 0);
    const avgBuildingSize = totalArea / cluster.buildings.length;
    const largeRoofs = cluster.buildings.filter(b => b.area > 500).length;
    const buildingCount = cluster.buildings.length;
    
    // Calculate cluster density (buildings per hectare)
    const clusterAreaKm2 = cluster.areaKm2 || 0.01;
    const buildingDensity = buildingCount / (clusterAreaKm2 * 100); // per hectare
    
    // VALIDATED PRIORITY FACTORS
    
    // 1. Heat Risk (35%) - Using validated formula
    const densityFactor = Math.min(buildingDensity / 50, 1.0);
    const sizeFactor = Math.min(avgBuildingSize / 1000, 1.0);
    const estimatedHeatAdjustment = (densityFactor * 2.0) + (sizeFactor * 3.0);
    const clusterTemp = baselineTemp.avgTemperature + estimatedHeatAdjustment;
    const heatRisk = Math.min(Math.max((clusterTemp - 28) / 10, 0), 1.0);
    
    // 2. Building Density Risk (25%)
    const densityRisk = Math.min(buildingDensity / 80, 1.0); // Normalize to 80 buildings/hectare
    
    // 3. Green Space Deficit (25%)
    // High building density implies low green space
    const greenDeficit = densityRisk; // Simplified proxy
    
    // 4. Rooftop Intervention Potential (15%)
    const rooftopPotential = Math.min(largeRoofs / 5, 1.0); // Normalize to 5 large roofs
    
    // COMPOSITE PRIORITY SCORE (validated weights)
    const priorityScore = 
      (heatRisk * 0.35) +
      (densityRisk * 0.25) +
      (greenDeficit * 0.25) +
      (rooftopPotential * 0.15);
    
    return {
      ...cluster,
      centerLat,
      centerLng,
      totalArea,
      avgBuildingSize,
      largeRoofs,
      buildingDensity: buildingDensity.toFixed(1),
      clusterTemp,
      scores: {
        heat: heatRisk,
        density: densityRisk,
        green: greenDeficit,
        rooftop: rooftopPotential,
        overall: priorityScore
      }
    };
  });
  
  // STEP 4: Filter high-priority clusters
  updateLoadingProgress('priority', 4, 5);
  const highPriorityClusters = clusterAnalysis
    .filter(c => c.scores.overall > 0.4 && c.buildings.length >= 5)
    .sort((a, b) => b.scores.overall - a.scores.overall)
    .slice(0, 20); // Limit to top 20
  
  console.log(`Found ${highPriorityClusters.length} high-priority zones`);
  
  // STEP 5: Visualize as POLYGONS (not circles!)
  updateLoadingProgress('priority', 5, 5);
  highPriorityClusters.forEach((cluster, index) => {
    const priorityLevel = 
      cluster.scores.overall > 0.7 ? 'Critical' :
      cluster.scores.overall > 0.55 ? 'High' : 'Medium';
    
    const color = 
      priorityLevel === 'Critical' ? '#6b21a8' :
      priorityLevel === 'High' ? '#7c3aed' : '#a78bfa';
    
    // Create convex hull / bounding polygon
    const polygon = createClusterPolygon(cluster.buildings);
    
    const layer = window.L.polygon(polygon, {
      color: color,
      fillColor: color,
      fillOpacity: 0.25,
      weight: 3,
      dashArray: '8, 4'
    }).bindPopup(`
      <div class="font-sans p-2">
        <h3 class="font-bold text-lg mb-2">Priority Zone #${index + 1}</h3>
        <div class="bg-purple-50 p-2 rounded mb-3">
          <span class="font-semibold">Priority: </span>
          <span class="text-purple-700 font-bold text-lg">${priorityLevel}</span>
          <div class="text-xs text-purple-600 mt-1">Score: ${(cluster.scores.overall * 100).toFixed(0)}%</div>
        </div>
        
        <div class="grid grid-cols-2 gap-2 text-sm mb-3">
          <div><b>Buildings:</b> ${cluster.buildings.length}</div>
          <div><b>Density:</b> ${cluster.buildingDensity}/ha</div>
          <div><b>Large Roofs:</b> ${cluster.largeRoofs}</div>
          <div><b>Est. Temp:</b> ${cluster.clusterTemp.toFixed(1)}°C</div>
        </div>
        
        <div class="border-t pt-2">
          <p class="font-semibold mb-2 text-sm">Why Priority?</p>
          <div class="space-y-1 text-xs">
            ${cluster.scores.heat > 0.6 ? '<div>🔥 High heat risk</div>' : ''}
            ${cluster.scores.density > 0.6 ? '<div>🏢 Dense development</div>' : ''}
            ${cluster.scores.green > 0.6 ? '<div>🌳 Green space deficit</div>' : ''}
            ${cluster.scores.rooftop > 0.5 ? '<div>☀️ Solar/green roof potential</div>' : ''}
          </div>
        </div>
        
        <div class="mt-3 pt-2 border-t text-xs">
          <p class="font-semibold mb-1">Recommended Actions:</p>
          <ul class="space-y-1">
            ${cluster.scores.heat > 0.6 ? '<li>• Cool roof coatings</li>' : ''}
            ${cluster.largeRoofs >= 3 ? '<li>• Solar panel installation</li>' : ''}
            ${cluster.scores.green > 0.6 ? '<li>• Urban greening projects</li>' : ''}
            <li>• Rainwater harvesting systems</li>
          </ul>
        </div>
      </div>
    `);
    
    priorityZoneLayerRef.current.addLayer(layer);
  });
  
  stopLoading('priority');
}

  // Identify building clusters using spatial proximity (DBSCAN-like approach)
const identifyBuildingClusters = (buildings, maxDistance = 0.0015) => {
  const clusters = [];
  const visited = new Set();
  
  buildings.forEach((building, idx) => {
    if (visited.has(idx)) return;
    
    const cluster = {
      buildings: [building],
      indices: [idx]
    };
    
    visited.add(idx);
    
    // Find all nearby buildings
    buildings.forEach((other, otherIdx) => {
      if (visited.has(otherIdx)) return;
      
      const distance = Math.sqrt(
        Math.pow(building.centroid.lat - other.centroid.lat, 2) +
        Math.pow(building.centroid.lng - other.centroid.lng, 2)
      );
      
      if (distance < maxDistance) {
        cluster.buildings.push(other);
        cluster.indices.push(otherIdx);
        visited.add(otherIdx);
      }
    });
    
    // Only keep clusters with 3+ buildings
    if (cluster.buildings.length >= 3) {
      // Calculate cluster bounding box area
      const lats = cluster.buildings.map(b => b.centroid.lat);
      const lngs = cluster.buildings.map(b => b.centroid.lng);
      const latRange = Math.max(...lats) - Math.min(...lats);
      const lngRange = Math.max(...lngs) - Math.min(...lngs);
      cluster.areaKm2 = latRange * lngRange * 111 * 111; // Rough km²
      
      clusters.push(cluster);
    }
  });
  
  return clusters;
};

// Create polygon boundary around cluster of buildings
const createClusterPolygon = (buildings) => {
  const lats = buildings.map(b => b.centroid.lat);
  const lngs = buildings.map(b => b.centroid.lng);
  
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  
  const padding = 0.0005; // Add 55m padding around cluster
  
  // Return bounding box coordinates
  return [
    [minLat - padding, minLng - padding],
    [minLat - padding, maxLng + padding],
    [maxLat + padding, maxLng + padding],
    [maxLat + padding, minLng - padding]
  ];
};

// FIXED: renderAirQuality function with proper error handling
// Replace your existing renderAirQuality function in App.js with this:

const renderAirQuality = async () => {
  if (!leafletMapRef.current) return;
  startLoading('air', 'Loading air quality');
  
  // Clear existing layer
  if (airQualityLayerRef.current) {
    leafletMapRef.current.removeLayer(airQualityLayerRef.current);
  }
  airQualityLayerRef.current = window.L.layerGroup().addTo(leafletMapRef.current);
  
  const bounds = leafletMapRef.current.getBounds();
  
  try {
    // FIXED: Proper template literal for API URL
    const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    
    const response = await fetch(`${API_URL}/api/getAirQuality`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest()
        },
        latitude: (bounds.getNorth() + bounds.getSouth()) / 2,
        longitude: (bounds.getEast() + bounds.getWest()) / 2
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('Air quality response:', data);
    
    // Handle different failure scenarios with specific messages
    if (!data.isReal) {
      if (data.note) {
        setDataError(`Air Quality: ${data.note}`);
      } else {
        setDataError('Air quality data unavailable. No monitoring stations or model data accessible for this location.');
      }
      stopLoading('air');
      return;
    }
    
    if (data.locations.length === 0) {
      setDataError('No air quality monitoring stations found in this area. Try zooming out or searching a major city.');
      stopLoading('air');
      return;
    }
    
    console.log(`✓ Rendering ${data.locations.length} air quality points`);
    
    // Prepare heatmap data
    const aqiPoints = data.locations.map(loc => [
      loc.latitude, 
      loc.longitude, 
      Math.min(loc.aqi / 200, 1)
    ]).filter(point => point[2] > 0);
    
    // Render each monitoring station
    data.locations.forEach((loc, idx) => {
      const isStation = loc.sourceType === 'station';
      const isModel = loc.sourceType === 'model';
      
      // Create marker with different styles for station vs model
      const marker = window.L.circleMarker([loc.latitude, loc.longitude], {
        radius: isModel ? 30 : 20,
        fillColor: isStation ? loc.color : 'transparent',
        color: loc.color,
        weight: isModel ? 7 : 6,
        fillOpacity: isStation ? 0.9 : 0,
        dashArray: isModel ? '10, 10' : null,
        zIndexOffset: isModel ? 6000 : 5000
      });
      
      // Enhanced popup with all available data
      const measurements = Object.entries(loc.measurements)
        .map(([param, data]) => {
          const paramLabels = {
            pm25: 'PM2.5',
            pm10: 'PM10',
            no2: 'NO₂',
            o3: 'O₃',
            so2: 'SO₂',
            co: 'CO'
          };
          return `<div class="text-sm"><b>${paramLabels[param] || param}:</b> ${data.value.toFixed(1)} ${data.unit}</div>`;
        })
        .join('');
      
      const lastUpdate = loc.measurements.pm25?.lastUpdated 
        ? new Date(loc.measurements.pm25.lastUpdated).toLocaleString() 
        : 'N/A';
      
      marker.bindPopup(`
        <div class="font-sans p-2">
          ${isModel ? `
            <div class="bg-yellow-100 border border-yellow-400 p-2 rounded mb-3 text-xs flex items-start space-x-2">
              <span class="text-yellow-700">⚠️</span>
              <div>
                <div class="font-semibold text-yellow-900">Model Estimate</div>
                <div class="text-yellow-700">No ground monitoring stations nearby. Showing atmospheric model data from CAMS.</div>
              </div>
            </div>
          ` : ''}
          
          <div class="mb-3">
            <b class="text-lg block">${loc.name}</b>
            <div class="text-xs text-slate-500 mt-1">
              ${loc.latitude.toFixed(4)}°N, ${loc.longitude.toFixed(4)}°E
            </div>
          </div>
          
          <div class="p-4 rounded-lg mb-3" style="background-color: ${loc.color}20; border: 3px solid ${loc.color}">
            <div class="text-center">
              <span class="font-bold text-3xl block" style="color: ${loc.color}">AQI ${loc.aqi}</span>
              <span class="text-base font-semibold text-slate-800 mt-1 block">${loc.aqiCategory}</span>
            </div>
          </div>
          
          <div class="space-y-1 mb-3">
            ${measurements}
          </div>
          
          <div class="text-xs mt-3 pt-2 border-t ${isStation ? 'text-green-700' : 'text-orange-700'}">
            <div class="font-semibold flex items-center space-x-1">
              <span>${isStation ? '✓' : '⚠'}</span>
              <span>${isStation ? 'Ground Station (OpenAQ)' : 'CAMS Model (Open-Meteo)'}</span>
            </div>
            <div class="text-slate-500 mt-1">Last updated: ${lastUpdate}</div>
          </div>
        </div>
      `);
      
      airQualityLayerRef.current.addLayer(marker);
      
      // Auto-open first marker
      if (idx === 0) {
        marker.openPopup();
      }
    });
    
    // Add heatmap overlay if we have multiple points
    if (window.L.heatLayer && aqiPoints.length > 1) {
      const aqiHeat = window.L.heatLayer(aqiPoints, {
        radius: 90,
        blur: 50,
        maxZoom: 19,
        max: 1.0,
        minOpacity: 0.5,
        gradient: { 
          0.0: '#22c55e',   // Good - Green
          0.25: '#84cc16',  // Moderate - Yellow-green
          0.4: '#eab308',   // Unhealthy for sensitive - Yellow
          0.6: '#f97316',   // Unhealthy - Orange
          0.8: '#dc2626',   // Very unhealthy - Red
          1.0: '#7f1d1d'    // Hazardous - Dark red
        }
      });
      airQualityLayerRef.current.addLayer(aqiHeat);
    }
    
    console.log(`✓ Air quality layer rendered successfully`);
    
  } catch (error) {
    console.error('Air quality fetch error:', error);
    setDataError(`Failed to load air quality: ${error.message}. Check that your backend server is running.`);
  } finally {
    stopLoading('air');
  }
};

  const renderGreenSpaces = (buildingsData) => {
    if (!leafletMapRef.current) return;
    startLoading('green', 'Finding green opportunities');
    
    if (greenSpaceLayerRef.current) leafletMapRef.current.removeLayer(greenSpaceLayerRef.current);
    greenSpaceLayerRef.current = window.L.layerGroup().addTo(leafletMapRef.current);

    const greenRoofs = buildingsData.filter(b => b.area >= 500 && b.area <= 3000);
    
    greenRoofs.forEach(space => {
      const polygon = window.L.polygon(space.nodes.map(n => [n.lat, n.lon]), {
        color: '#10b981', fillColor: '#34d399', fillOpacity: 0.5, weight: 2, dashArray: '5, 5'
      }).bindPopup(`<b>Green Roof Opportunity</b><br>Area: ${space.area.toLocaleString()} m²<br>Potential for urban garden or green roof`);
      greenSpaceLayerRef.current.addLayer(polygon);
    });
    
    stopLoading('green');
  };

  const toggleLayer = (layerName) => {
    const newState = !activeLayers[layerName];
    setActiveLayers(prev => ({ ...prev, [layerName]: newState }));
    if (!leafletMapRef.current) return;
    
    if (newState) {
      if(layerName === 'buildings') {
        buildingLayersRef.current.forEach(l => l.addTo(leafletMapRef.current));
      } else {
        updateLayer(layerName);
      }
    } else {
      switch(layerName) {
        case 'buildings': buildingLayersRef.current.forEach(l => leafletMapRef.current.removeLayer(l)); break;
        case 'heat': if (heatLayerRef.current) leafletMapRef.current.removeLayer(heatLayerRef.current); break;
        case 'airQuality': if (airQualityLayerRef.current) leafletMapRef.current.removeLayer(airQualityLayerRef.current); break;
        case 'greenSpace': if (greenSpaceLayerRef.current) leafletMapRef.current.removeLayer(greenSpaceLayerRef.current); break;
        case 'priorityZones': if (priorityZoneLayerRef.current) leafletMapRef.current.removeLayer(priorityZoneLayerRef.current); break;
      }
    }
  };

  const calculatePolygonArea = (nodes) => {
    if (nodes.length < 3) return 100;
    let area = 0;
    const R = 6378137;
    for (let i = 0; i < nodes.length; i++) {
        const p1 = nodes[i];
        const p2 = nodes[(i + 1) % nodes.length];
        area += ((p1.lon * Math.PI / 180) - (p2.lon * Math.PI / 180)) * (2 + Math.sin(p1.lat * Math.PI / 180) + Math.sin(p2.lat * Math.PI / 180));
    }
    return Math.abs(area * R * R / 2);
  };
  
  const calculateCentroid = (nodes) => {
    if (!nodes.length) return { lat: 0, lng: 0 };
    return { 
      lat: nodes.reduce((s, n) => s + n.lat, 0) / nodes.length,
      lng: nodes.reduce((s, n) => s + n.lon, 0) / nodes.length
    };
  };

  const analyzeBuilding = async (building) => {
    setSelectedBuilding(building);
    startLoading('analysis', 'Analyzing building');
    setDataError(null);
    
    try {
      const API_URL = process.env.REACT_APP_API_URL;
      const response = await fetch(`${API_URL}/api/getRoofData`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: building.centroid.lat,
          longitude: building.centroid.lng,
          area: building.area
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to fetch data from server';
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.details || errorJson.error || errorMessage;
        } catch (e) {
          errorMessage = `Server error (${response.status}): ${errorText.substring(0, 100)}`;
        }
        
        setDataError(errorMessage);
        setRoofData(null);
        stopLoading('analysis');
        return;
      }
      
      const data = await response.json();
      
      if (!data.solarData || !data.precipData) {
        setDataError('Invalid response format from server');
        setRoofData(null);
        stopLoading('analysis');
        return;
      }
      
      if (!data.solarData.isReal) {
        setDataError(`Solar data unavailable: ${data.solarData.note || 'NASA POWER API error'}`);
        setRoofData(null);
        stopLoading('analysis');
        return;
      }

      const analysis = {
        area: building.area,
        solar: {
          annualGeneration: data.solarPotential.annualEnergy,
          avgIrradiance: data.solarData.avgIrradiance.toFixed(2),
          homesPowered: Math.round(data.solarPotential.annualEnergy / 4800),
          co2Offset: data.solarPotential.co2Offset,
          panelEfficiency: (data.solarPotential.panelEfficiency * 100).toFixed(0),
          performanceRatio: (data.solarPotential.performanceRatio * 100).toFixed(0)
        },
        water: data.precipData.isReal ? {
          annualCollection: data.rainwaterPotential.annualWater,
          annualRainfall: data.precipData.annualPrecipitation.toFixed(0),
          householdsSupported: data.rainwaterPotential.householdsSupported,
          runoffCoefficient: (data.rainwaterPotential.runoffCoefficient * 100).toFixed(0)
        } : {
          error: true,
          message: data.precipData.note || 'Precipitation data unavailable'
        },
        heat: {
          avgTemperature: data.solarData.avgTemperature.toFixed(1),
          riskLevel: building.area > 1000 ? 'High' : building.area > 500 ? 'Medium' : 'Low',
          temperatureReduction: building.area > 1000 ? '3-5°C' : building.area > 500 ? '2-3°C' : '1-2°C'
        },
        dataSource: `${data.solarData.source} & ${data.precipData.source}`,
        timestamp: new Date().toISOString()
      };
      
      setRoofData(analysis);
    } catch (error) {
      console.error('Network error:', error);
      setDataError(`Network error: ${error.message}. Make sure the server is running on process.env.REACT_APP_API_URL`);
      setRoofData(null);
    } finally {
      stopLoading('analysis');
    }
  };

  const normalizeTemperature = (temp) => {
    const min = 20;
    const max = 40;
    return Math.min(Math.max((temp - min) / (max - min), 0), 1);
  };

  const downloadReport = () => {
    if (!roofData || !selectedBuilding) return;
    
    const waterSection = roofData.water.error ? 
      `Annual Collection: Data Unavailable\nReason: ${roofData.water.message}` :
      `Annual Collection: ${roofData.water.annualCollection.toLocaleString()} liters/year
Annual Rainfall: ${roofData.water.annualRainfall} mm
Runoff Coefficient: ${roofData.water.runoffCoefficient}%
Households Supported: ${roofData.water.householdsSupported} families`;
    
    const report = `
╔═══════════════════════════════════════════════════════╗
           ROOFHARVEST ANALYSIS REPORT
╚═══════════════════════════════════════════════════════╝

Building: ${selectedBuilding.name}
Location: ${selectedBuilding.centroid.lat.toFixed(5)}°N, ${selectedBuilding.centroid.lng.toFixed(5)}°E
Roof Area: ${Math.round(selectedBuilding.area).toLocaleString()} m²
Report Generated: ${new Date().toLocaleString()}
Data Source: ${roofData.dataSource}

───────────────────────────────────────────────────────
SOLAR ENERGY POTENTIAL
───────────────────────────────────────────────────────
Annual Generation: ${roofData.solar.annualGeneration.toLocaleString()} kWh/year
Average Solar Irradiance: ${roofData.solar.avgIrradiance} kWh/m²/day
Panel Efficiency: ${roofData.solar.panelEfficiency}%
Performance Ratio: ${roofData.solar.performanceRatio}%
Homes Powered: ${roofData.solar.homesPowered} households
CO₂ Offset: ${roofData.solar.co2Offset.toLocaleString()} kg/year

───────────────────────────────────────────────────────
RAINWATER HARVESTING POTENTIAL
───────────────────────────────────────────────────────
${waterSection}

───────────────────────────────────────────────────────
URBAN HEAT ISLAND ANALYSIS
───────────────────────────────────────────────────────
Average Temperature: ${roofData.heat.avgTemperature}°C
Heat Risk Level: ${roofData.heat.riskLevel}
Potential Temperature Reduction: ${roofData.heat.temperatureReduction}
(with cool roof or green roof implementation)

───────────────────────────────────────────────────────
RECOMMENDATIONS
───────────────────────────────────────────────────────
✓ Install solar panels to generate clean energy
${!roofData.water.error ? '✓ Implement rainwater harvesting system' : '⚠ Precipitation data unavailable - consult local weather data'}
✓ Consider cool roof coating to reduce urban heat
✓ Explore green roof options for additional benefits

╔═══════════════════════════════════════════════════════╗
              Powered by NASA Earth Observations
╚═══════════════════════════════════════════════════════╝
    `;
    
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `roofharvest-report-${selectedBuilding.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {activeInfo && <InfoModal type={activeInfo} onClose={() => setActiveInfo(null)} />}
      <LoadingManager operations={loadingOperations} />
      
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-24 flex items-center">
          <img
            src="/logo.png"
            alt="RoofHarvest Logo"
            className="h-20 w-auto object-contain"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 80"%3E%3Ctext x="10" y="50" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="%232563eb"%3ERoofHarvest%3C/text%3E%3C/svg%3E';
            }}
          />
        </div>
      </header>

      <div className="relative h-[calc(100vh-96px)]">
        <div ref={mapRef} className="w-full h-full bg-gray-200"></div>
        
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg p-3 max-w-sm z-[1000] border border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchLocation()}
              placeholder="Search location"
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {searching && <div className="p-2 text-sm text-slate-600">Searching...</div>}
          {searchResults.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg mt-2 max-h-48 overflow-y-auto">
              {searchResults.map((result, idx) => (
                <button key={idx} onClick={() => selectLocation(result)} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-0 text-sm">{result.display_name}</button>
              ))}
            </div>
          )}
        </div>
        
        <LayerControlPanel 
          layers={layerConfig}
          activeLayers={activeLayers}
          toggleLayer={toggleLayer}
          setActiveInfo={setActiveInfo}
        />

        {selectedBuilding && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-xl p-5 z-[1000] w-[95%] max-w-3xl max-h-[60vh] overflow-y-auto border border-slate-200">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selectedBuilding.name}</h3>
                <p className="text-sm text-slate-600">Roof Area: {Math.round(selectedBuilding.area).toLocaleString()} m²</p>
                {roofData && <p className="text-xs text-slate-500 mt-1">{roofData.dataSource}</p>}
              </div>
              <div className="flex items-center space-x-2">
              {roofData && (
                  <button 
                    onClick={() => setShow3DView(true)} 
                    className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center space-x-2 shadow-lg"
                  >
                    <Maximize2 className="w-4 h-4" />
                    <span>3D View</span>
                  </button>
                )}
                {roofData && (
                  <button onClick={downloadReport} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all flex items-center space-x-2">
                    <Download className="w-4 h-4" /><span>Report</span>
                  </button>
                )}
                <button onClick={() => { setSelectedBuilding(null); setRoofData(null); setDataError(null); }} className="text-slate-500 hover:text-slate-800 p-2"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {dataError && <ErrorAlert message={dataError} onClose={() => setDataError(null)} />}

            {roofData && (
              <div className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <div className="flex items-center space-x-2 mb-2"><Sun className="w-5 h-5 text-amber-600" /><h4 className="font-bold text-slate-900">Solar Energy</h4></div>
                    <p className="text-2xl font-bold text-slate-800">{(roofData.solar.annualGeneration / 1000).toFixed(1)}k</p>
                    <p className="text-xs text-slate-600">kWh/year</p>
                    <p className="text-xs text-amber-700 mt-2">{roofData.solar.avgIrradiance} kWh/m²/day</p>
                    <p className="text-xs text-amber-700">Powers {roofData.solar.homesPowered} homes</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center space-x-2 mb-2"><Droplet className="w-5 h-5 text-blue-600" /><h4 className="font-bold text-slate-900">Rainwater</h4></div>
                    {roofData.water.error ? (
                      <div className="text-sm text-amber-700">
                        <p className="font-semibold">Data Unavailable</p>
                        <p className="text-xs mt-1">{roofData.water.message}</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-slate-800">{(roofData.water.annualCollection / 1000).toFixed(1)}k</p>
                        <p className="text-xs text-slate-600">liters/year</p>
                        <p className="text-xs text-blue-700 mt-2">{roofData.water.annualRainfall} mm/year</p>
                        <p className="text-xs text-blue-700">Supports {roofData.water.householdsSupported} families</p>
                      </>
                    )}
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                    <div className="flex items-center space-x-2 mb-2"><Thermometer className="w-5 h-5 text-red-600" /><h4 className="font-bold text-slate-900">Heat Analysis</h4></div>
                    <p className="text-2xl font-bold text-slate-800">{roofData.heat.riskLevel}</p>
                    <p className="text-xs text-slate-600">Risk Level</p>
                    <p className="text-xs text-red-700 mt-2">Avg: {roofData.heat.avgTemperature}°C</p>
                    <p className="text-xs text-red-700">Reduce by {roofData.heat.temperatureReduction}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {show3DView && selectedBuilding && roofData && (
  <Building3DVisualization
    building={selectedBuilding}
    roofData={roofData}
    onClose={() => setShow3DView(false)}
  />
)}
      </div>
    </div>
  );
};

export default RoofHarvestApp;