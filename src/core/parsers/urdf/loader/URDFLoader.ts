import * as THREE from 'three';
import { URDFCollider, URDFJoint, URDFLink, URDFMimicJoint, URDFRobot, URDFVisual } from './URDFClasses';

const tempQuaternion = new THREE.Quaternion();
const tempEuler = new THREE.Euler();

function processTuple(val: string | null) {
    if (!val) return [0, 0, 0];
    return val.trim().split(/\s+/g).map(num => parseFloat(num));
}

function applyRotation(obj: THREE.Object3D, rpy: number[], additive = false) {
    if (!additive) obj.rotation.set(0, 0, 0);

    tempEuler.set(rpy[0], rpy[1], rpy[2], 'ZYX');
    tempQuaternion.setFromEuler(tempEuler);
    tempQuaternion.multiply(obj.quaternion);
    obj.quaternion.copy(tempQuaternion);
}

export interface MeshLoadDoneFunc {
    (mesh: THREE.Object3D, err?: Error): void;
}

export interface MeshLoadFunc {
    (url: string, manager: THREE.LoadingManager, onLoad: MeshLoadDoneFunc): void;
}

export class URDFLoader {
    manager: THREE.LoadingManager;
    loadMeshCb: MeshLoadFunc;
    parseVisual = true;
    parseCollision = false;
    packages: string | Record<string, string> | ((targetPkg: string) => string) = '';
    workingPath = '';
    fetchOptions: RequestInit = {};

    constructor(manager?: THREE.LoadingManager) {
        this.manager = manager || THREE.DefaultLoadingManager;
        this.loadMeshCb = this.defaultMeshLoader.bind(this);
    }

    loadAsync(urdf: string) {
        return new Promise<URDFRobot>((resolve, reject) => {
            this.load(urdf, resolve, undefined, reject);
        });
    }

    load(
        urdf: string,
        onComplete: (robot: URDFRobot) => void,
        onProgress?: (progress?: any) => void,
        onError?: (err?: any) => void
    ) {
        const manager = this.manager;
        const workingPath = THREE.LoaderUtils.extractUrlBase(urdf);
        const urdfPath = this.manager.resolveURL(urdf);

        manager.itemStart(urdfPath);

        fetch(urdfPath, this.fetchOptions)
            .then(response => {
                if (response.ok) {
                    if (onProgress) onProgress(null);
                    return response.text();
                }

                throw new Error(`URDFLoader: Failed to load url '${urdfPath}' with error code ${response.status} : ${response.statusText}.`);
            })
            .then(data => {
                const model = this.parse(data, this.workingPath || workingPath);
                onComplete(model);
                manager.itemEnd(urdfPath);
            })
            .catch(error => {
                if (onError) {
                    onError(error);
                } else {
                    console.error('URDFLoader: Error loading file.', error);
                }
                manager.itemError(urdfPath);
                manager.itemEnd(urdfPath);
            });
    }

    parse(content: string | Element | Document, workingPath: string = this.workingPath): URDFRobot {
        const packages = this.packages;
        const loadMeshCb = this.loadMeshCb;
        const parseVisual = this.parseVisual;
        const parseCollision = this.parseCollision;
        const manager = this.manager;
        const linkMap: Record<string, URDFLink> = {};
        const jointMap: Record<string, URDFJoint> = {};
        const materialMap: Record<string, THREE.Material> = {};

        const resolvePath = (path: string): string | null => {
            if (!/^package:\/\//.test(path)) {
                return workingPath ? workingPath + path : path;
            }

            const [targetPkg, relPath] = path.replace(/^package:\/\//, '').split(/\/(.+)/);

            if (typeof packages === 'string') {
                if (packages.endsWith(targetPkg)) {
                    return packages + '/' + relPath;
                }

                return packages + '/' + targetPkg + '/' + relPath;
            }

            if (packages instanceof Function) {
                return packages(targetPkg) + '/' + relPath;
            }

            if (typeof packages === 'object') {
                if (targetPkg in packages) {
                    return packages[targetPkg] + '/' + relPath;
                }

                console.error(`URDFLoader : ${targetPkg} not found in provided package list.`);
                return null;
            }

            return null;
        };

        const processMaterial = (node: Element): THREE.MeshPhongMaterial => {
            const matNodes = Array.from(node.children);
            const material = new THREE.MeshPhongMaterial();

            material.name = node.getAttribute('name') || '';

            matNodes.forEach(n => {
                const type = n.nodeName.toLowerCase();

                if (type === 'color') {
                    const rgba = (n.getAttribute('rgba') || '')
                        .split(/\s+/g)
                        .map(v => parseFloat(v));

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

        const processLinkElement = (node: Element, namedMaterialMap: Record<string, THREE.Material> = {}) => {
            const isCollisionNode = node.nodeName.toLowerCase() === 'collision';
            const children = Array.from(node.children);

            let material: THREE.Material;

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
                            if (scaleAttr) {
                                const scale = processTuple(scaleAttr);
                                group.scale.set(scale[0], scale[1], scale[2]);
                            }

                            loadMeshCb(filePath, manager, (obj, err) => {
                                if (err) {
                                    console.error('URDFLoader: Error loading mesh.', err);
                                } else if (obj) {
                                    if (obj instanceof THREE.Mesh) {
                                        obj.material = material;
                                    }

                                    obj.position.set(0, 0, 0);
                                    obj.quaternion.identity();
                                    group.add(obj);
                                }
                            });
                        }
                    } else if (geoType === 'box') {
                        const primitive = new THREE.Mesh();
                        primitive.geometry = new THREE.BoxGeometry(1, 1, 1);
                        primitive.material = material;

                        const size = processTuple(n.children[0].getAttribute('size'));
                        primitive.scale.set(size[0], size[1], size[2]);
                        group.add(primitive);
                    } else if (geoType === 'sphere') {
                        const primitive = new THREE.Mesh();
                        primitive.geometry = new THREE.SphereGeometry(1, 30, 30);
                        primitive.material = material;

                        const radius = parseFloat(n.children[0].getAttribute('radius') || '0');
                        primitive.scale.set(radius, radius, radius);
                        group.add(primitive);
                    } else if (geoType === 'cylinder') {
                        const primitive = new THREE.Mesh();
                        primitive.geometry = new THREE.CylinderGeometry(1, 1, 1, 30);
                        primitive.material = material;

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

        const processLink = (
            linkNode: Element,
            visualMap: Record<string, URDFVisual>,
            colliderMap: Record<string, URDFCollider>,
            target: URDFLink | URDFRobot | null = null
        ) => {
            const linkTarget = target || new URDFLink();

            const children = Array.from(linkNode.children);
            linkTarget.name = linkNode.getAttribute('name') || '';
            linkTarget.urdfName = linkTarget.name;
            linkTarget.urdfNode = linkNode;

            if (parseVisual) {
                const visualNodes = children.filter(n => n.nodeName.toLowerCase() === 'visual');
                visualNodes.forEach(visualNode => {
                    const visual = processLinkElement(visualNode, materialMap);
                    linkTarget.add(visual);

                    if (visualNode.hasAttribute('name')) {
                        const name = visualNode.getAttribute('name') || '';
                        visual.name = name;
                        visual.urdfName = name;
                        visualMap[name] = visual;
                    }
                });
            }

            if (parseCollision) {
                const collisionNodes = children.filter(n => n.nodeName.toLowerCase() === 'collision');
                collisionNodes.forEach(collisionNode => {
                    const collider = processLinkElement(collisionNode) as URDFCollider;
                    linkTarget.add(collider);

                    if (collisionNode.hasAttribute('name')) {
                        const name = collisionNode.getAttribute('name') || '';
                        collider.name = name;
                        collider.urdfName = name;
                        colliderMap[name] = collider;
                    }
                });
            }

            return linkTarget;
        };

        const processJoint = (jointNode: Element) => {
            const children = Array.from(jointNode.children);
            const jointType = (jointNode.getAttribute('type') || 'fixed') as URDFJoint['jointType'];

            let joint: URDFJoint;
            const mimicTag = children.find(n => n.nodeName.toLowerCase() === 'mimic');
            if (mimicTag) {
                const mimicJoint = new URDFMimicJoint();
                mimicJoint.mimicJoint = mimicTag.getAttribute('joint');
                mimicJoint.multiplier = parseFloat(mimicTag.getAttribute('multiplier') || '1');
                mimicJoint.offset = parseFloat(mimicTag.getAttribute('offset') || '0');
                joint = mimicJoint;
            } else {
                joint = new URDFJoint();
            }

            joint.urdfNode = jointNode;
            joint.name = jointNode.getAttribute('name') || '';
            joint.urdfName = joint.name;
            joint.jointType = jointType;

            let parent: URDFLink | null = null;
            let child: URDFLink | null = null;
            let xyz = [0, 0, 0];
            let rpy = [0, 0, 0];

            children.forEach(n => {
                const type = n.nodeName.toLowerCase();
                if (type === 'origin') {
                    xyz = processTuple(n.getAttribute('xyz'));
                    rpy = processTuple(n.getAttribute('rpy'));
                } else if (type === 'child') {
                    const childName = n.getAttribute('link') || '';
                    child = linkMap[childName] || null;
                } else if (type === 'parent') {
                    const parentName = n.getAttribute('link') || '';
                    parent = linkMap[parentName] || null;
                } else if (type === 'limit') {
                    joint.limit.lower = parseFloat(n.getAttribute('lower') || String(joint.limit.lower));
                    joint.limit.upper = parseFloat(n.getAttribute('upper') || String(joint.limit.upper));
                }
            });

            if (parent && child) {
                parent.add(joint);
                joint.add(child);
            }

            applyRotation(joint, rpy);
            joint.position.set(xyz[0], xyz[1], xyz[2]);

            const axisNode = children.find(n => n.nodeName.toLowerCase() === 'axis');
            if (axisNode) {
                const axisXYZ = (axisNode.getAttribute('xyz') || '1 0 0')
                    .split(/\s+/g)
                    .map(num => parseFloat(num));
                joint.axis = new THREE.Vector3(axisXYZ[0], axisXYZ[1], axisXYZ[2]);
                joint.axis.normalize();
            }

            return joint;
        };

        const processRobot = (robotNode: Element): URDFRobot => {
            const robotChildren = Array.from(robotNode.children);
            const linkNodes = robotChildren.filter(c => c.nodeName.toLowerCase() === 'link');
            const jointNodes = robotChildren.filter(c => c.nodeName.toLowerCase() === 'joint');
            const materialNodes = robotChildren.filter(c => c.nodeName.toLowerCase() === 'material');
            const robot = new URDFRobot();

            robot.robotName = robotNode.getAttribute('name');
            robot.urdfRobotNode = robotNode;
            robot.name = robot.robotName || '';
            robot.urdfName = robot.name;

            materialNodes.forEach(materialNode => {
                const name = materialNode.getAttribute('name');
                if (name) {
                    materialMap[name] = processMaterial(materialNode);
                }
            });

            const visualMap: Record<string, URDFVisual> = {};
            const colliderMap: Record<string, URDFCollider> = {};
            linkNodes.forEach(linkNode => {
                const name = linkNode.getAttribute('name') || '';
                const isRoot = robotNode.querySelector(`child[link="${name}"]`) === null;
                linkMap[name] = processLink(linkNode, visualMap, colliderMap, isRoot ? robot : null);
            });

            jointNodes.forEach(jointNode => {
                const name = jointNode.getAttribute('name') || '';
                jointMap[name] = processJoint(jointNode);
            });

            robot.joints = jointMap;
            robot.links = linkMap;
            robot.colliders = colliderMap;
            robot.visual = visualMap;
            robot.visuals = visualMap;

            const jointList = Object.values(jointMap);
            jointList.forEach(joint => {
                if (joint instanceof URDFMimicJoint && joint.mimicJoint && jointMap[joint.mimicJoint]) {
                    jointMap[joint.mimicJoint].mimicJoints.push(joint);
                }
            });

            jointList.forEach(joint => {
                const uniqueJoints = new Set<URDFJoint>();
                const walk = (currentJoint: URDFJoint) => {
                    if (uniqueJoints.has(currentJoint)) {
                        throw new Error('URDFLoader: Detected an infinite loop of mimic joints.');
                    }

                    uniqueJoints.add(currentJoint);
                    currentJoint.mimicJoints.forEach(mimicJoint => walk(mimicJoint));
                };

                walk(joint);
            });

            robot.frames = {
                ...colliderMap,
                ...visualMap,
                ...linkMap,
                ...jointMap
            };

            return robot;
        };

        const processUrdf = (data: string | Element | Document): URDFRobot => {
            let children: Element[] = [];

            if (data instanceof Document) {
                children = Array.from(data.children);
            } else if (data instanceof Element) {
                children = [data];
            } else {
                const parser = new DOMParser();
                const urdf = parser.parseFromString(data, 'text/xml');
                children = Array.from(urdf.children);
            }

            const robotNode = children.filter(child => child.nodeName.toLowerCase() === 'robot').pop();
            if (!robotNode) {
                throw new Error('URDFLoader: No <robot> node found in URDF content.');
            }

            return processRobot(robotNode);
        };

        return processUrdf(content);
    }

    defaultMeshLoader(path: string, manager: THREE.LoadingManager, done: MeshLoadDoneFunc) {
        if (/\.stl$/i.test(path)) {
            import('three/examples/jsm/loaders/STLLoader.js')
                .then(({ STLLoader }) => {
                    const loader = new STLLoader(manager);
                    loader.load(
                        path,
                        geometry => {
                            const mesh = new THREE.Mesh(geometry, new THREE.MeshPhongMaterial());
                            done(mesh);
                        },
                        undefined,
                        err => done(new THREE.Object3D(), err as Error)
                    );
                })
                .catch(err => done(new THREE.Object3D(), err as Error));
        } else if (/\.dae$/i.test(path)) {
            import('three/examples/jsm/loaders/ColladaLoader.js')
                .then(({ ColladaLoader }) => {
                    const loader = new ColladaLoader(manager);
                    loader.load(path, dae => done(dae.scene), undefined, err => done(new THREE.Object3D(), err as Error));
                })
                .catch(err => done(new THREE.Object3D(), err as Error));
        } else {
            console.warn(`URDFLoader: Could not load model at ${path}.\nNo loader available`);
        }
    }
}

export default URDFLoader;
