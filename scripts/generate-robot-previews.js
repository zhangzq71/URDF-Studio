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
      "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    // Full version of our custom URDFLoader classes to match project behavior exactly
    
    // --- Utils ---
    const _tempAxis = new THREE.Vector3();
    const _tempEuler = new THREE.Euler();
    const _tempTransform = new THREE.Matrix4();
    const _tempOrigTransform = new THREE.Matrix4();
    const _tempQuat = new THREE.Quaternion();
    const _tempScale = new THREE.Vector3(1.0, 1.0, 1.0);
    const _tempPosition = new THREE.Vector3();
    
    const tempQuaternion = new THREE.Quaternion();
    const tempEuler = new THREE.Euler();

    function processTuple(val) {
        if (!val) return [0, 0, 0];
        return val.trim().split(/\\s+/g).map(num => parseFloat(num));
    }

    function applyRotation(obj, rpy, additive = false) {
        if (!additive) obj.rotation.set(0, 0, 0);
        tempEuler.set(rpy[0], rpy[1], rpy[2], 'ZYX');
        tempQuaternion.setFromEuler(tempEuler);
        tempQuaternion.multiply(obj.quaternion);
        obj.quaternion.copy(tempQuaternion);
    }

    // --- Classes from URDFClasses.ts ---

    class URDFBase extends THREE.Object3D {
        constructor() {
            super();
            this.urdfNode = null;
            this.urdfName = '';
        }
    }

    class URDFCollider extends URDFBase {
        constructor() {
            super();
            this.isURDFCollider = true;
            this.type = 'URDFCollider';
        }
    }

    class URDFVisual extends URDFBase {
        constructor() {
            super();
            this.isURDFVisual = true;
            this.type = 'URDFVisual';
        }
    }

    class URDFLink extends URDFBase {
        constructor() {
            super();
            this.isURDFLink = true;
            this.type = 'URDFLink';
        }
    }

    class URDFJoint extends URDFBase {
        constructor() {
            super();
            this.isURDFJoint = true;
            this.jointValue = null;
            this.axis = new THREE.Vector3(1, 0, 0);
            this.limit = { lower: 0, upper: 0, effort: 0, velocity: 0 };
            this.ignoreLimits = false;
            this.origPosition = null;
            this.origQuaternion = null;
            this.mimicJoints = [];
            this._jointType = 'fixed';
            this.type = 'URDFJoint';
            this.jointType = 'fixed'; // Set via setter
        }

        get jointType() { return this._jointType; }
        
        set jointType(v) {
            if (this._jointType === v) return;
            this._jointType = v;
            this.matrixWorldNeedsUpdate = true;
            switch (v) {
                case 'fixed': this.jointValue = []; break;
                case 'continuous':
                case 'revolute':
                case 'prismatic': this.jointValue = new Array(1).fill(0); break;
                case 'planar':
                    this.jointValue = new Array(3).fill(0);
                    this.axis = new THREE.Vector3(0, 0, 1);
                    break;
                case 'floating': this.jointValue = new Array(6).fill(0); break;
                default: this.jointValue = []; break;
            }
        }

        get angle() {
            if (!this.jointValue || this.jointValue.length === 0) return 0;
            return this.jointValue[0];
        }

        setJointValue(...values) {
            values = values.map(value => (value === null ? null : parseFloat(value)));

            if (!this.origPosition || !this.origQuaternion) {
                this.origPosition = this.position.clone();
                this.origQuaternion = this.quaternion.clone();
            }

            let didUpdate = false;
            this.mimicJoints.forEach(joint => {
                didUpdate = joint.updateFromMimickedJoint(...values) || didUpdate;
            });

            const currentValues = this.jointValue || [];

            switch (this.jointType) {
                case 'fixed': return didUpdate;
                case 'continuous':
                case 'revolute': {
                    let angle = values[0];
                    if (angle == null) return didUpdate;
                    if (angle === currentValues[0]) return didUpdate;
                    
                    if (!this.ignoreLimits && this.jointType === 'revolute') {
                        angle = Math.min(this.limit.upper, angle);
                        angle = Math.max(this.limit.lower, angle);
                    }
                    this.quaternion.setFromAxisAngle(this.axis, angle).premultiply(this.origQuaternion);
                    if (currentValues[0] !== angle) {
                        currentValues[0] = angle;
                        this.matrixWorldNeedsUpdate = true;
                        return true;
                    }
                    return didUpdate;
                }
                case 'prismatic': {
                    let position = values[0];
                    if (position == null) return didUpdate;
                    if (position === currentValues[0]) return didUpdate;
                    if (!this.ignoreLimits) {
                        position = Math.min(this.limit.upper, position);
                        position = Math.max(this.limit.lower, position);
                    }
                    this.position.copy(this.origPosition);
                    _tempAxis.copy(this.axis).applyEuler(this.rotation);
                    this.position.addScaledVector(_tempAxis, position);
                    if (currentValues[0] !== position) {
                        currentValues[0] = position;
                        this.matrixWorldNeedsUpdate = true;
                        return true;
                    }
                    return didUpdate;
                }
                // (floating and planar omitted for brevity in preview, usually not needed for simple display)
                default: return didUpdate;
            }
        }
    }

    class URDFMimicJoint extends URDFJoint {
        constructor() {
            super();
            this.isURDFMimicJoint = true;
            this.mimicJoint = null;
            this.offset = 0;
            this.multiplier = 1;
            this.type = 'URDFMimicJoint';
        }
        updateFromMimickedJoint(...values) {
            const modifiedValues = values.map(value => (value === null ? null : value * this.multiplier + this.offset));
            return super.setJointValue(...modifiedValues);
        }
    }

    class URDFRobot extends URDFLink {
        constructor() {
            super();
            this.isURDFRobot = true;
            this.urdfRobotNode = null;
            this.robotName = null;
            this.links = {};
            this.joints = {};
            this.colliders = {};
            this.visual = {};
            this.visuals = this.visual;
            this.frames = {};
        }
    }

    // --- Loader from URDFLoader.ts ---

    class URDFLoader {
        constructor(manager) {
            this.manager = manager || new THREE.LoadingManager();
            this.loadMeshCb = this.defaultMeshLoader.bind(this);
            this.parseVisual = true;
            this.parseCollision = true;
            this.packages = '';
            this.workingPath = '';
        }

        parse(content, workingPath = '') {
            const manager = this.manager;
            const linkMap = {};
            const jointMap = {};
            const materialMap = {};

            // Path resolver
            const resolvePath = (path) => {
                if (!/^package:\\/\\//.test(path)) {
                    return workingPath ? workingPath + path : path;
                }
                const [targetPkg, relPath] = path.replace(/^package:\\/\\//, '').split(/\\/(.+)/);
                if (typeof this.packages === 'string') {
                    if (this.packages.endsWith(targetPkg)) return this.packages + '/' + relPath;
                    return this.packages + '/' + targetPkg + '/' + relPath;
                }
                return null;
            };

            const processMaterial = (node) => {
                const matNodes = Array.from(node.children);
                const material = new THREE.MeshPhongMaterial();
                material.name = node.getAttribute('name') || '';

                matNodes.forEach(n => {
                    const type = n.nodeName.toLowerCase();
                    if (type === 'color') {
                        const rgba = (n.getAttribute('rgba') || '').split(/\\s+/g).map(v => parseFloat(v));
                        material.color.setRGB(rgba[0] || 0, rgba[1] || 0, rgba[2] || 0);
                        material.opacity = rgba[3] ?? 1;
                        material.transparent = material.opacity < 1;
                        material.depthWrite = !material.transparent;
                    } else if (type === 'texture') {
                        const filename = n.getAttribute('filename');
                        if (filename) {
                            const loader = new THREE.TextureLoader(manager);
                            const filePath = resolvePath(filename);
                            if (filePath) {
                                material.map = loader.load(filePath);
                                material.map.colorSpace = THREE.SRGBColorSpace;
                            }
                        }
                    }
                });
                return material;
            };

            const processLinkElement = (node, namedMaterialMap = {}) => {
                const isCollisionNode = node.nodeName.toLowerCase() === 'collision';
                const children = Array.from(node.children);
                let material;

                const materialNode = children.find(n => n.nodeName.toLowerCase() === 'material');
                if (materialNode) {
                    const name = materialNode.getAttribute('name');
                    if (name && name in namedMaterialMap) {
                        material = namedMaterialMap[name];
                    } else {
                        material = processMaterial(materialNode);
                    }
                } else {
                    material = new THREE.MeshPhongMaterial();
                }

                const group = isCollisionNode ? new URDFCollider() : new URDFVisual();
                group.urdfNode = node;

                children.forEach(n => {
                    const type = n.nodeName.toLowerCase();
                    if (type === 'geometry') {
                        if (!n.children[0]) return;
                        const geoType = n.children[0].nodeName.toLowerCase();
                        
                        if (geoType === 'mesh') {
                            const filename = n.children[0].getAttribute('filename');
                            if (!filename) return;
                            const filePath = resolvePath(filename);
                            if (filePath !== null) {
                                const scaleAttr = n.children[0].getAttribute('scale');
                                const scale = scaleAttr ? processTuple(scaleAttr) : [1, 1, 1];
                                
                                this.loadMeshCb(filePath, manager, (obj, err) => {
                                    if (obj) {
                                        if (obj instanceof THREE.Mesh) obj.material = material;
                                        // Also apply to children if it's a group/scene
                                        obj.traverse(c => {
                                            if (c.isMesh) c.material = material;
                                        });
                                        obj.position.set(0, 0, 0);
                                        obj.quaternion.identity();
                                        obj.scale.set(scale[0], scale[1], scale[2]); // Apply scale here
                                        group.add(obj);
                                    }
                                });
                            }
                        } else if (geoType === 'box') {
                            const primitive = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
                            const size = processTuple(n.children[0].getAttribute('size'));
                            primitive.scale.set(size[0], size[1], size[2]);
                            group.add(primitive);
                        } else if (geoType === 'sphere') {
                            const primitive = new THREE.Mesh(new THREE.SphereGeometry(1, 30, 30), material);
                            const radius = parseFloat(n.children[0].getAttribute('radius') || '0');
                            primitive.scale.set(radius, radius, radius);
                            group.add(primitive);
                        } else if (geoType === 'cylinder') {
                            const primitive = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 30), material);
                            const radius = parseFloat(n.children[0].getAttribute('radius') || '0');
                            const length = parseFloat(n.children[0].getAttribute('length') || '0');
                            primitive.scale.set(radius, length, radius);
                            primitive.rotation.set(Math.PI / 2, 0, 0);
                            group.add(primitive);
                        }
                    } else if (type === 'origin') {
                        const xyz = processTuple(n.getAttribute('xyz'));
                        const rpy = processTuple(n.getAttribute('rpy'));
                        group.position.set(xyz[0], xyz[1], xyz[2]);
                        group.rotation.set(0, 0, 0);
                        applyRotation(group, rpy);
                    }
                });
                return group;
            };

            const processLink = (linkNode, visualMap, colliderMap, target = null) => {
                const linkTarget = target || new URDFLink();
                const children = Array.from(linkNode.children);
                linkTarget.name = linkNode.getAttribute('name') || '';
                linkTarget.urdfName = linkTarget.name;
                
                if (this.parseVisual) {
                    children.filter(n => n.nodeName.toLowerCase() === 'visual').forEach(vNode => {
                        const visual = processLinkElement(vNode, materialMap);
                        linkTarget.add(visual);
                        if (vNode.hasAttribute('name')) {
                            const name = vNode.getAttribute('name');
                            visual.name = name;
                            visual.urdfName = name;
                            visualMap[name] = visual;
                        }
                    });
                }
                if (this.parseCollision) {
                    children.filter(n => n.nodeName.toLowerCase() === 'collision').forEach(cNode => {
                        const collider = processLinkElement(cNode); // Pass empty map for collider mats usually
                        linkTarget.add(collider);
                        if (cNode.hasAttribute('name')) {
                            const name = cNode.getAttribute('name');
                            collider.name = name;
                            collider.urdfName = name;
                            colliderMap[name] = collider;
                        }
                    });
                }
                return linkTarget;
            };

            const processJoint = (jointNode) => {
                const children = Array.from(jointNode.children);
                const jointType = jointNode.getAttribute('type') || 'fixed';
                let joint;
                
                const mimicTag = children.find(n => n.nodeName.toLowerCase() === 'mimic');
                if (mimicTag) {
                    joint = new URDFMimicJoint();
                    joint.mimicJoint = mimicTag.getAttribute('joint');
                    joint.multiplier = parseFloat(mimicTag.getAttribute('multiplier') || '1');
                    joint.offset = parseFloat(mimicTag.getAttribute('offset') || '0');
                } else {
                    joint = new URDFJoint();
                }

                joint.name = jointNode.getAttribute('name') || '';
                joint.urdfName = joint.name;
                joint.jointType = jointType;

                let parent = null;
                let child = null;
                let xyz = [0, 0, 0];
                let rpy = [0, 0, 0];

                children.forEach(n => {
                    const type = n.nodeName.toLowerCase();
                    if (type === 'origin') {
                        xyz = processTuple(n.getAttribute('xyz'));
                        rpy = processTuple(n.getAttribute('rpy'));
                    } else if (type === 'child') {
                        child = linkMap[n.getAttribute('link')];
                    } else if (type === 'parent') {
                        parent = linkMap[n.getAttribute('link')];
                    } else if (type === 'limit') {
                        joint.limit.lower = parseFloat(n.getAttribute('lower') || '0');
                        joint.limit.upper = parseFloat(n.getAttribute('upper') || '0');
                    } else if (type === 'axis') {
                        const a = processTuple(n.getAttribute('xyz') || '1 0 0');
                        joint.axis.set(a[0], a[1], a[2]).normalize();
                    }
                });

                if (parent && child) {
                    parent.add(joint);
                    joint.add(child);
                }
                
                applyRotation(joint, rpy);
                joint.position.set(xyz[0], xyz[1], xyz[2]);
                return joint;
            };

            // Main Parse Logic
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(content, 'text/xml');
            const robotNode = xmlDoc.querySelector('robot');
            if (!robotNode) throw new Error('URDFLoader: No <robot> node found');

            const robot = new URDFRobot();
            robot.robotName = robotNode.getAttribute('name');
            robot.name = robot.robotName || '';
            
            // Materials
            Array.from(robotNode.querySelectorAll('material')).forEach(n => {
                const name = n.getAttribute('name');
                if (name) materialMap[name] = processMaterial(n);
            });

            // Links
            const visualMap = {};
            const colliderMap = {};
            Array.from(robotNode.querySelectorAll('link')).forEach(node => {
                const name = node.getAttribute('name') || '';
                const isRoot = robotNode.querySelector(\`child[link="\${name}"]\`) === null;
                linkMap[name] = processLink(node, visualMap, colliderMap, isRoot ? robot : null);
            });

            // Joints
            Array.from(robotNode.querySelectorAll('joint')).forEach(node => {
                const name = node.getAttribute('name');
                jointMap[name] = processJoint(node);
            });

            // Mimic Logic
            Object.values(jointMap).forEach(joint => {
                if (joint.isURDFMimicJoint && joint.mimicJoint && jointMap[joint.mimicJoint]) {
                    jointMap[joint.mimicJoint].mimicJoints.push(joint);
                }
            });

            robot.joints = jointMap;
            robot.links = linkMap;
            robot.colliders = colliderMap;
            robot.visual = visualMap;

            return robot;
        }

        defaultMeshLoader(path, manager, done) {
             // Will be overridden in the main script logic
             done(new THREE.Object3D());
        }
    }

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
