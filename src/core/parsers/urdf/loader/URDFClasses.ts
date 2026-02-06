import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';

const _tempAxis = new Vector3();
const _tempEuler = new Euler();
const _tempTransform = new Matrix4();
const _tempOrigTransform = new Matrix4();
const _tempQuat = new Quaternion();
const _tempScale = new Vector3(1.0, 1.0, 1.0);
const _tempPosition = new Vector3();

class URDFBase extends Object3D {
    urdfNode: Element | null = null;
    urdfName = '';

    copy(source: any, recursive?: boolean): this {
        super.copy(source, recursive);
        this.urdfNode = source.urdfNode;
        this.urdfName = source.urdfName;
        return this;
    }
}

export class URDFCollider extends URDFBase {
    isURDFCollider = true;

    constructor(...args: ConstructorParameters<typeof Object3D>) {
        super(...args);
        this.type = 'URDFCollider';
    }
}

export class URDFVisual extends URDFBase {
    isURDFVisual = true;

    constructor(...args: ConstructorParameters<typeof Object3D>) {
        super(...args);
        this.type = 'URDFVisual';
    }
}

export class URDFLink extends URDFBase {
    isURDFLink = true;

    constructor(...args: ConstructorParameters<typeof Object3D>) {
        super(...args);
        this.type = 'URDFLink';
    }
}

export class URDFJoint extends URDFBase {
    isURDFJoint = true;
    jointValue: number[] | null = null;
    axis = new Vector3(1, 0, 0);
    limit: { lower: number; upper: number; effort?: number; velocity?: number } = { lower: 0, upper: 0 };
    ignoreLimits = false;
    origPosition: Vector3 | null = null;
    origQuaternion: Quaternion | null = null;
    mimicJoints: URDFMimicJoint[] = [];

    private _jointType: 'fixed' | 'continuous' | 'revolute' | 'planar' | 'prismatic' | 'floating' = 'fixed';

    get jointType() {
        return this._jointType;
    }

    set jointType(v: 'fixed' | 'continuous' | 'revolute' | 'planar' | 'prismatic' | 'floating') {
        if (this._jointType === v) return;

        this._jointType = v;
        this.matrixWorldNeedsUpdate = true;

        switch (v) {
            case 'fixed':
                this.jointValue = [];
                break;
            case 'continuous':
            case 'revolute':
            case 'prismatic':
                this.jointValue = new Array(1).fill(0);
                break;
            case 'planar':
                this.jointValue = new Array(3).fill(0);
                this.axis = new Vector3(0, 0, 1);
                break;
            case 'floating':
                this.jointValue = new Array(6).fill(0);
                break;
            default:
                this.jointValue = [];
                break;
        }
    }

    get angle() {
        if (!this.jointValue || this.jointValue.length === 0) return 0;
        return this.jointValue[0];
    }

    constructor(...args: ConstructorParameters<typeof Object3D>) {
        super(...args);
        this.type = 'URDFJoint';
        this.jointType = 'fixed';
    }

    copy(source: any, recursive?: boolean): this {
        super.copy(source, recursive);

        this.jointType = source.jointType;
        this.axis = source.axis.clone();
        this.limit.lower = source.limit.lower;
        this.limit.upper = source.limit.upper;
        this.limit.effort = source.limit.effort;
        this.limit.velocity = source.limit.velocity;
        this.ignoreLimits = false;
        this.jointValue = source.jointValue ? [...source.jointValue] : [];
        this.origPosition = source.origPosition ? source.origPosition.clone() : null;
        this.origQuaternion = source.origQuaternion ? source.origQuaternion.clone() : null;
        this.mimicJoints = [...source.mimicJoints];

        return this;
    }

    setJointValue(...values: (number | null)[]): boolean {
        values = values.map(value => (value === null ? null : parseFloat(String(value))));

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
            case 'fixed':
                return didUpdate;

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
                    this.jointValue = currentValues;
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
                    this.jointValue = currentValues;
                    this.matrixWorldNeedsUpdate = true;
                    return true;
                }

                return didUpdate;
            }

            case 'floating': {
                if (
                    currentValues.length === 6 &&
                    currentValues.every((value, index) => values[index] === value || values[index] === null)
                ) {
                    return didUpdate;
                }

                currentValues[0] = values[0] !== null ? values[0]! : currentValues[0];
                currentValues[1] = values[1] !== null ? values[1]! : currentValues[1];
                currentValues[2] = values[2] !== null ? values[2]! : currentValues[2];
                currentValues[3] = values[3] !== null ? values[3]! : currentValues[3];
                currentValues[4] = values[4] !== null ? values[4]! : currentValues[4];
                currentValues[5] = values[5] !== null ? values[5]! : currentValues[5];
                this.jointValue = currentValues;

                _tempOrigTransform.compose(this.origPosition, this.origQuaternion, _tempScale);
                _tempQuat.setFromEuler(_tempEuler.set(currentValues[3], currentValues[4], currentValues[5], 'XYZ'));
                _tempPosition.set(currentValues[0], currentValues[1], currentValues[2]);
                _tempTransform.compose(_tempPosition, _tempQuat, _tempScale);

                _tempOrigTransform.premultiply(_tempTransform);
                this.position.setFromMatrixPosition(_tempOrigTransform);
                this.rotation.setFromRotationMatrix(_tempOrigTransform);

                this.matrixWorldNeedsUpdate = true;
                return true;
            }

            case 'planar': {
                if (
                    currentValues.length === 3 &&
                    currentValues.every((value, index) => values[index] === value || values[index] === null)
                ) {
                    return didUpdate;
                }

                currentValues[0] = values[0] !== null ? values[0]! : currentValues[0];
                currentValues[1] = values[1] !== null ? values[1]! : currentValues[1];
                currentValues[2] = values[2] !== null ? values[2]! : currentValues[2];
                this.jointValue = currentValues;

                _tempOrigTransform.compose(this.origPosition, this.origQuaternion, _tempScale);
                _tempQuat.setFromAxisAngle(this.axis, currentValues[2]);
                _tempPosition.set(currentValues[0], currentValues[1], 0.0);
                _tempTransform.compose(_tempPosition, _tempQuat, _tempScale);

                _tempOrigTransform.premultiply(_tempTransform);
                this.position.setFromMatrixPosition(_tempOrigTransform);
                this.rotation.setFromRotationMatrix(_tempOrigTransform);

                this.matrixWorldNeedsUpdate = true;
                return true;
            }

            default:
                return didUpdate;
        }
    }
}

export class URDFMimicJoint extends URDFJoint {
    isURDFMimicJoint = true;
    mimicJoint: string | null = null;
    offset = 0;
    multiplier = 1;

    constructor(...args: ConstructorParameters<typeof Object3D>) {
        super(...args);
        this.type = 'URDFMimicJoint';
    }

    updateFromMimickedJoint(...values: (number | null)[]) {
        const modifiedValues = values.map(value => (value === null ? null : value * this.multiplier + this.offset));
        return super.setJointValue(...modifiedValues);
    }

    copy(source: any, recursive?: boolean): this {
        super.copy(source, recursive);
        this.mimicJoint = source.mimicJoint;
        this.offset = source.offset;
        this.multiplier = source.multiplier;
        return this;
    }
}

export class URDFRobot extends URDFLink {
    isURDFRobot = true;
    urdfRobotNode: Element | null = null;
    robotName: string | null = null;
    links: { [key: string]: URDFLink } = {};
    joints: { [key: string]: URDFJoint } = {};
    colliders: { [key: string]: URDFCollider } = {};
    visual: { [key: string]: URDFVisual } = {};
    visuals: { [key: string]: URDFVisual } = {};
    frames: { [key: string]: Object3D } = {};

    copy(source: any, recursive?: boolean): this {
        super.copy(source, recursive);

        this.urdfRobotNode = source.urdfRobotNode;
        this.robotName = source.robotName;

        this.links = {};
        this.joints = {};
        this.colliders = {};
        this.visual = {};
        this.visuals = this.visual;

        this.traverse((child: any) => {
            if (child.isURDFJoint && child.urdfName in source.joints) {
                this.joints[child.urdfName] = child;
            }

            if (child.isURDFLink && child.urdfName in source.links) {
                this.links[child.urdfName] = child;
            }

            if (child.isURDFCollider && child.urdfName in source.colliders) {
                this.colliders[child.urdfName] = child;
            }

            if (child.isURDFVisual && child.urdfName in source.visual) {
                this.visual[child.urdfName] = child;
            }
        });

        Object.keys(this.joints).forEach(jointName => {
            this.joints[jointName].mimicJoints = this.joints[jointName].mimicJoints.map((mimicJoint: any) => this.joints[mimicJoint.name]);
        });

        this.frames = {
            ...this.colliders,
            ...this.visual,
            ...this.links,
            ...this.joints
        };

        return this;
    }

    getFrame(name: string) {
        return this.frames[name];
    }

    getJoint(name: string) {
        return this.joints[name];
    }

    getLink(name: string) {
        return this.links[name];
    }

    setJointValue(jointName: string, ...values: number[]) {
        const joint = this.joints[jointName];
        if (joint) {
            return joint.setJointValue(...values);
        }

        return false;
    }

    setJointValues(values: { [key: string]: number | number[] }) {
        let didChange = false;
        Object.keys(values).forEach(name => {
            const value = values[name];
            if (Array.isArray(value)) {
                didChange = this.setJointValue(name, ...value) || didChange;
            } else {
                didChange = this.setJointValue(name, value) || didChange;
            }
        });
        return didChange;
    }
}
