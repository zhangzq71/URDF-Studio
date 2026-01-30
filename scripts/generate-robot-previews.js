#!/usr/bin/env node
/**
 * Robot Preview Generator Script
 * Generates high-quality animated WebP/GIF previews for URDF models
 * 
 * Usage: node scripts/generate-robot-previews.js
 * 
 * Requirements:
 * - npm install puppeteer sharp gif-encoder-2
 * - Dev server running at http://localhost:5173
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Robot configurations - add your robots here
const ROBOTS = [
  {
    id: 'go2',
    name: 'Unitree Go2',
    urdfPath: '/library/urdf/unitree/go2_description',
    outputName: 'go2_preview'
  },
  {
    id: 'go1',
    name: 'Unitree Go1',
    urdfPath: '/library/urdf/unitree/go1_description',
    outputName: 'go1_preview'
  },
  {
    id: 'g1',
    name: 'Unitree G1',
    urdfPath: '/library/urdf/unitree/g1_description',
    urdfFile: 'g1_29dof_with_hand.urdf',
    outputName: 'g1_preview'
  },
  {
    id: 'h1',
    name: 'Unitree H1',
    urdfPath: '/library/urdf/unitree/h1_description',
    urdfFile: 'urdf/h1_with_hand.urdf',
    outputName: 'h1_preview'
  },
  {
    id: 'h1_2',
    name: 'Unitree H1 2.0',
    urdfPath: '/library/urdf/unitree/h1_2_description',
    outputName: 'h1_2_preview'
  },
  {
    id: 'a1',
    name: 'Unitree A1',
    urdfPath: '/library/urdf/unitree/a1_description',
    outputName: 'a1_preview'
  },
  {
    id: 'b1',
    name: 'Unitree B1',
    urdfPath: '/library/urdf/unitree/b1_description',
    outputName: 'b1_preview'
  },
  {
    id: 'b2',
    name: 'Unitree B2',
    urdfPath: '/library/urdf/unitree/b2_description',
    outputName: 'b2_preview'
  },
  {
    id: 'aliengo',
    name: 'Unitree Aliengo',
    urdfPath: '/library/urdf/unitree/aliengo_description',
    outputName: 'aliengo_preview'
  },
];

// Configuration
const CONFIG = {
  width: 400,           // Preview width
  height: 400,          // Preview height
  frameCount: 60,       // Number of frames (60 = 2 seconds at 30fps)
  fps: 30,              // Frames per second
  quality: 90,          // Image quality (1-100)
  rotationSpeed: 360,   // Degrees per full animation
  outputDir: 'public/previews',
  devServerUrl: 'http://localhost:5173',
};

// HTML template for rendering a single robot
const getPreviewHTML = (urdfPath, urdfFile) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    * { margin: 0; padding: 0; }
    body { background: #1f1f1f; overflow: hidden; }
    #container { width: ${CONFIG.width}px; height: ${CONFIG.height}px; }
  </style>
</head>
<body>
  <div id="container"></div>
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/",
      "urdf-loader": "https://unpkg.com/urdf-loader@0.12.2/src/URDFLoader.js"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import URDFLoader from 'urdf-loader';

    const container = document.getElementById('container');
    
    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(${CONFIG.width}, ${CONFIG.height});
    renderer.setPixelRatio(2);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1f1f1f);

    // Setup camera
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
    camera.up.set(0, 0, 1);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(5, 5, 10);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-5, -5, 5);
    scene.add(dirLight2);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2a2a2a, 
      roughness: 0.8 
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.receiveShadow = true;
    scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(10, 20, 0x404040, 0x303030);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.001;
    scene.add(grid);

    // Robot group for rotation
    const robotGroup = new THREE.Group();
    scene.add(robotGroup);

    // Material for robot
    const robotMaterial = new THREE.MeshStandardMaterial({
      color: 0x707070,
      roughness: 0.45,
      metalness: 0.15
    });

    // Load URDF
    const urdfPath = '${urdfPath}';
    const urdfFile = '${urdfFile || ''}';
    
    async function loadRobot() {
      try {
        // Fetch manifest
        const manifestRes = await fetch(urdfPath + '/manifest.json');
        const manifest = await manifestRes.json();
        
        // Determine URDF file
        let urdfFileName = urdfFile || manifest.urdf || 'robot.urdf';
        const urdfUrl = urdfPath + '/' + urdfFileName;
        
        // Fetch URDF content
        const urdfRes = await fetch(urdfUrl);
        const urdfContent = await urdfRes.text();
        
        // Build asset index
        const assetIndex = {};
        function indexAssets(items, basePath) {
          for (const item of items) {
            if (item.type === 'file') {
              const fullPath = basePath + '/' + item.name;
              assetIndex[item.name] = fullPath;
              assetIndex[fullPath] = fullPath;
              assetIndex[fullPath.replace(/^\\//, '')] = fullPath;
            } else if (item.type === 'directory' && item.children) {
              indexAssets(item.children, basePath + '/' + item.name);
            }
          }
        }
        indexAssets(manifest.files || [], urdfPath);
        
        // Create loader
        const manager = new THREE.LoadingManager();
        const loader = new URDFLoader(manager);
        loader.packages = '';
        
        loader.loadMeshCb = (path, _manager, done) => {
          const fileName = path.split('/').pop();
          let resolvedPath = assetIndex[path] || assetIndex[fileName] || path;
          
          const ext = resolvedPath.split('.').pop().toLowerCase();
          
          if (ext === 'stl') {
            import('three/addons/loaders/STLLoader.js').then(({ STLLoader }) => {
              new STLLoader().load(resolvedPath, (geometry) => {
                const mesh = new THREE.Mesh(geometry, robotMaterial.clone());
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                done(mesh);
              });
            });
          } else if (ext === 'dae') {
            import('three/addons/loaders/ColladaLoader.js').then(({ ColladaLoader }) => {
              new ColladaLoader().load(resolvedPath, (collada) => {
                collada.scene.traverse(c => {
                  if (c.isMesh) {
                    c.material = robotMaterial.clone();
                    c.castShadow = true;
                    c.receiveShadow = true;
                  }
                });
                done(collada.scene);
              });
            });
          } else {
            done(new THREE.Object3D());
          }
        };
        
        manager.onLoad = () => {
          // Calculate bounds
          const box = new THREE.Box3().setFromObject(robot);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const minZ = box.min.z;
          
          // Position robot
          robot.position.set(-center.x, -center.y, -minZ);
          
          // Setup camera
          const aspectRatio = size.z / Math.max(size.x, size.y, 0.01);
          const isHumanoid = aspectRatio > 2.5;
          const maxDim = Math.max(size.x, size.y, size.z);
          const fov = camera.fov * (Math.PI / 180);
          const fitDistance = (maxDim / 2) / Math.tan(fov / 2);
          const distanceMultiplier = isHumanoid ? 1.2 : 1.6;
          const cameraDistance = Math.max(fitDistance * distanceMultiplier, 0.5);
          
          const robotCenterZ = size.z / 2;
          camera.position.set(
            cameraDistance * 0.8,
            cameraDistance * 0.8,
            robotCenterZ + cameraDistance * 0.3
          );
          camera.lookAt(0, 0, robotCenterZ);
          camera.updateProjectionMatrix();
          
          // Signal ready
          window.robotReady = true;
          window.robotGroup = robotGroup;
        };
        
        const robot = loader.parse(urdfContent);
        robotGroup.add(robot);
        
      } catch (error) {
        console.error('Failed to load robot:', error);
        window.robotError = error.message;
      }
    }

    loadRobot();

    // Animation loop
    function animate() {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }
    animate();

    // Expose rotation control
    window.setRotation = (angle) => {
      if (window.robotGroup) {
        window.robotGroup.rotation.z = angle;
      }
    };
  </script>
</body>
</html>
`;

async function generatePreview(browser, robot) {
  console.log(`\\n📦 Generating preview for ${robot.name}...`);
  
  const page = await browser.newPage();
  await page.setViewport({ width: CONFIG.width, height: CONFIG.height, deviceScaleFactor: 2 });
  
  // Set HTML content
  const html = getPreviewHTML(robot.urdfPath, robot.urdfFile);
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  // Wait for robot to load
  console.log('  ⏳ Loading robot...');
  try {
    await page.waitForFunction('window.robotReady === true', { timeout: 30000 });
  } catch (e) {
    const error = await page.evaluate(() => window.robotError);
    console.log(`  ❌ Failed to load: ${error || 'timeout'}`);
    await page.close();
    return null;
  }
  
  // Wait a bit for rendering to settle
  await new Promise(r => setTimeout(r, 500));
  
  // Capture frames
  console.log(`  📸 Capturing ${CONFIG.frameCount} frames...`);
  const frames = [];
  const anglePerFrame = (Math.PI * 2) / CONFIG.frameCount;
  
  for (let i = 0; i < CONFIG.frameCount; i++) {
    const angle = i * anglePerFrame;
    await page.evaluate((a) => window.setRotation(a), angle);
    await new Promise(r => setTimeout(r, 16)); // Wait for render
    
    const screenshot = await page.screenshot({ 
      type: 'png',
      omitBackground: false 
    });
    frames.push(screenshot);
    
    if ((i + 1) % 10 === 0) {
      process.stdout.write(`  Progress: ${i + 1}/${CONFIG.frameCount}\\r`);
    }
  }
  console.log('  ✅ Frames captured');
  
  await page.close();
  
  // Save frames and create video
  const outputDir = path.join(process.cwd(), CONFIG.outputDir, robot.id);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Save individual frames
  const framesDir = path.join(outputDir, 'frames');
  if (!fs.existsSync(framesDir)) {
    fs.mkdirSync(framesDir, { recursive: true });
  }
  
  for (let i = 0; i < frames.length; i++) {
    const framePath = path.join(framesDir, `frame_${String(i).padStart(3, '0')}.png`);
    fs.writeFileSync(framePath, frames[i]);
  }
  
  // Create WebM video using ffmpeg
  const webmPath = path.join(outputDir, `${robot.outputName}.webm`);
  const mp4Path = path.join(outputDir, `${robot.outputName}.mp4`);
  const gifPath = path.join(outputDir, `${robot.outputName}.gif`);
  
  try {
    console.log('  🎬 Creating WebM video...');
    execSync(`ffmpeg -y -framerate ${CONFIG.fps} -i "${framesDir}/frame_%03d.png" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 1M "${webmPath}"`, { stdio: 'pipe' });
    
    console.log('  🎬 Creating MP4 video...');
    execSync(`ffmpeg -y -framerate ${CONFIG.fps} -i "${framesDir}/frame_%03d.png" -c:v libx264 -pix_fmt yuv420p -b:v 2M "${mp4Path}"`, { stdio: 'pipe' });
    
    console.log('  🎬 Creating GIF...');
    execSync(`ffmpeg -y -framerate ${CONFIG.fps} -i "${framesDir}/frame_%03d.png" -vf "fps=${CONFIG.fps},scale=${CONFIG.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" "${gifPath}"`, { stdio: 'pipe' });
    
    // Also create a static thumbnail from frame 0
    const thumbnailPath = path.join(outputDir, 'thumbnail.png');
    fs.copyFileSync(path.join(framesDir, 'frame_000.png'), thumbnailPath);
    
    console.log(`  ✅ Created: ${webmPath}`);
    console.log(`  ✅ Created: ${mp4Path}`);
    console.log(`  ✅ Created: ${gifPath}`);
    
    // Clean up frames
    fs.rmSync(framesDir, { recursive: true });
    
    return {
      webm: `/previews/${robot.id}/${robot.outputName}.webm`,
      mp4: `/previews/${robot.id}/${robot.outputName}.mp4`,
      gif: `/previews/${robot.id}/${robot.outputName}.gif`,
      thumbnail: `/previews/${robot.id}/thumbnail.png`
    };
    
  } catch (e) {
    console.log('  ⚠️ ffmpeg not available, keeping PNG frames instead');
    return {
      frames: `/previews/${robot.id}/frames/`,
      thumbnail: `/previews/${robot.id}/frames/frame_000.png`
    };
  }
}

async function main() {
  console.log('🤖 Robot Preview Generator');
  console.log('==========================\\n');
  console.log(`Output: ${CONFIG.width}x${CONFIG.height} @ ${CONFIG.fps}fps`);
  console.log(`Frames: ${CONFIG.frameCount}`);
  console.log(`Output directory: ${CONFIG.outputDir}\\n`);
  
  // Create output directory
  const outputDir = path.join(process.cwd(), CONFIG.outputDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Launch browser
  console.log('🚀 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });
  
  const results = {};
  
  for (const robot of ROBOTS) {
    const result = await generatePreview(browser, robot);
    if (result) {
      results[robot.id] = result;
    }
  }
  
  await browser.close();
  
  // Save manifest
  const manifestPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(results, null, 2));
  
  console.log('\\n✅ All previews generated!');
  console.log(`📄 Manifest saved to: ${manifestPath}`);
}

main().catch(console.error);
