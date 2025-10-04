import React, { useEffect, useRef, useState } from 'react';
import { X, Maximize2, Minimize2, RotateCcw, Sun, Droplet, Thermometer } from 'lucide-react';

const Building3DVisualization = ({ building, roofData, onClose }) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const buildingMeshRef = useRef(null);
  const animationIdRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rotationSpeed, setRotationSpeed] = useState(0.005);
  const [showSolarPanels, setShowSolarPanels] = useState(true);
  const [showWaterFlow, setShowWaterFlow] = useState(false);
  const [sunAngle, setSunAngle] = useState(45);

  useEffect(() => {
    if (!window.THREE || !mountRef.current) return;

    const THREE = window.THREE;
    
    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.Fog(0xf1f5f9, 10, 50);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(15, 12, 15);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffa500, 0.8);
    sunLight.position.set(10, 15, 10);
    sunLight.castShadow = true;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 50;
    sunLight.shadow.camera.left = -20;
    sunLight.shadow.camera.right = 20;
    sunLight.shadow.camera.top = 20;
    sunLight.shadow.camera.bottom = -20;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(40, 40);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4ade80,
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid helper
    const gridHelper = new THREE.GridHelper(40, 40, 0x94a3b8, 0xe2e8f0);
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Create 3D building from polygon
    const buildingHeight = Math.min(building.area / 100, 15);
    
    // Convert lat/lng nodes to local coordinates
    const nodes = building.nodes || [];
    if (nodes.length > 0) {
      // Center the building at origin
      const centerLat = nodes.reduce((sum, n) => sum + n.lat, 0) / nodes.length;
      const centerLng = nodes.reduce((sum, n) => sum + n.lon, 0) / nodes.length;
      
      const shape = new THREE.Shape();
      nodes.forEach((node, i) => {
        const x = (node.lon - centerLng) * 100000;
        const y = (node.lat - centerLat) * 100000;
        if (i === 0) {
          shape.moveTo(x, y);
        } else {
          shape.lineTo(x, y);
        }
      });

      // Extrude the building
      const extrudeSettings = {
        steps: 1,
        depth: buildingHeight,
        bevelEnabled: false
      };

      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.rotateX(Math.PI / 2);
      
      const buildingMaterial = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.7,
        metalness: 0.3
      });
      
      const buildingMesh = new THREE.Mesh(geometry, buildingMaterial);
      buildingMesh.castShadow = true;
      buildingMesh.receiveShadow = true;
      scene.add(buildingMesh);
      buildingMeshRef.current = buildingMesh;

      // Add roof (solar panel surface)
      const roofGeometry = new THREE.ShapeGeometry(shape);
      roofGeometry.rotateX(Math.PI / 2);
      
      const roofMaterial = new THREE.MeshStandardMaterial({
        color: showSolarPanels ? 0x1e3a8a : 0x94a3b8,
        roughness: 0.3,
        metalness: 0.7,
        emissive: showSolarPanels ? 0x3b82f6 : 0x000000,
        emissiveIntensity: 0.2
      });
      
      const roof = new THREE.Mesh(roofGeometry, roofMaterial);
      roof.position.y = buildingHeight + 0.1;
      roof.receiveShadow = true;
      scene.add(roof);

      // Add solar panels grid
      if (showSolarPanels && roofData) {
        const panelCount = Math.floor(building.area / 2);
        const panelsPerRow = Math.ceil(Math.sqrt(panelCount));
        
        for (let i = 0; i < Math.min(panelCount, 100); i++) {
          const panelGeometry = new THREE.BoxGeometry(0.3, 0.02, 0.5);
          const panelMaterial = new THREE.MeshStandardMaterial({
            color: 0x1e40af,
            roughness: 0.2,
            metalness: 0.8,
            emissive: 0x3b82f6,
            emissiveIntensity: 0.3
          });
          
          const panel = new THREE.Mesh(panelGeometry, panelMaterial);
          const row = Math.floor(i / panelsPerRow);
          const col = i % panelsPerRow;
          
          panel.position.x = (col - panelsPerRow / 2) * 0.4;
          panel.position.z = (row - panelsPerRow / 2) * 0.6;
          panel.position.y = buildingHeight + 0.15;
          panel.rotation.x = -Math.PI / 8;
          
          scene.add(panel);
        }
      }

      // Add energy visualization particles
      if (roofData && showSolarPanels) {
        const particlesGeometry = new THREE.BufferGeometry();
        const particleCount = 200;
        const positions = new Float32Array(particleCount * 3);
        
        for (let i = 0; i < particleCount; i++) {
          positions[i * 3] = (Math.random() - 0.5) * 10;
          positions[i * 3 + 1] = buildingHeight + Math.random() * 5;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
        }
        
        particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        
        const particlesMaterial = new THREE.PointsMaterial({
          color: 0xfbbf24,
          size: 0.1,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending
        });
        
        const particles = new THREE.Points(particlesGeometry, particlesMaterial);
        scene.add(particles);
      }
    }

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      
      if (buildingMeshRef.current) {
        buildingMeshRef.current.rotation.y += rotationSpeed;
      }
      
      renderer.render(scene, camera);
    };
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!mountRef.current) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [building, showSolarPanels, rotationSpeed, roofData]);

  const resetCamera = () => {
    if (cameraRef.current) {
      cameraRef.current.position.set(15, 12, 15);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={`fixed bg-white rounded-xl shadow-2xl z-[10001] ${
      isFullscreen ? 'inset-4' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-5xl h-[80vh]'
    } flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Maximize2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">{building.name} - 3D View</h3>
            <p className="text-sm text-slate-600">Interactive Building Analysis</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-white rounded-lg transition-all"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button
            onClick={resetCamera}
            className="p-2 hover:bg-white rounded-lg transition-all"
            title="Reset View"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div ref={mountRef} className="flex-1 bg-slate-50" />

      {/* Controls & Data Panel */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Controls */}
          <div className="space-y-3">
            <h4 className="font-semibold text-sm text-slate-700">Controls</h4>
            <div className="space-y-2">
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={showSolarPanels}
                  onChange={(e) => setShowSolarPanels(e.target.checked)}
                  className="rounded"
                />
                <Sun className="w-4 h-4 text-amber-600" />
                <span>Solar Panels</span>
              </label>
              <label className="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={showWaterFlow}
                  onChange={(e) => setShowWaterFlow(e.target.checked)}
                  className="rounded"
                />
                <Droplet className="w-4 h-4 text-blue-600" />
                <span>Water Flow</span>
              </label>
              <div>
                <label className="text-xs text-slate-600 block mb-1">Rotation Speed</label>
                <input
                  type="range"
                  min="0"
                  max="0.02"
                  step="0.001"
                  value={rotationSpeed}
                  onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Solar Data */}
          {roofData && (
            <>
              <div className="bg-amber-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <Sun className="w-4 h-4 text-amber-600" />
                  <h4 className="font-semibold text-sm">Solar Energy</h4>
                </div>
                <p className="text-2xl font-bold text-amber-900">{(roofData.solar.annualGeneration / 1000).toFixed(1)}k</p>
                <p className="text-xs text-amber-700">kWh/year</p>
                <p className="text-xs text-amber-600 mt-1">{roofData.solar.avgIrradiance} kWh/m²/day</p>
              </div>

              <div className="bg-blue-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <Droplet className="w-4 h-4 text-blue-600" />
                  <h4 className="font-semibold text-sm">Rainwater</h4>
                </div>
                {roofData.water.error ? (
                  <p className="text-xs text-amber-700">Data Unavailable</p>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-blue-900">{(roofData.water.annualCollection / 1000).toFixed(1)}k</p>
                    <p className="text-xs text-blue-700">liters/year</p>
                    <p className="text-xs text-blue-600 mt-1">{roofData.water.annualRainfall} mm/year</p>
                  </>
                )}
              </div>

              <div className="bg-red-50 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <Thermometer className="w-4 h-4 text-red-600" />
                  <h4 className="font-semibold text-sm">Heat Risk</h4>
                </div>
                <p className="text-2xl font-bold text-red-900">{roofData.heat.riskLevel}</p>
                <p className="text-xs text-red-700">Risk Level</p>
                <p className="text-xs text-red-600 mt-1">Avg: {roofData.heat.avgTemperature}°C</p>
              </div>
            </>
          )}
        </div>

        {/* Info */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <p className="text-xs text-slate-600">
            🎮 <strong>Tip:</strong> Drag to rotate • Scroll to zoom • Toggle controls to see different visualizations
          </p>
        </div>
      </div>
    </div>
  );
};

export default Building3DVisualization;