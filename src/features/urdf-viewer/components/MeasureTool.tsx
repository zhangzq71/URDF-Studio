import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { MeasureToolProps, URDFViewerProps } from '../types';
import {
    applyMeasurePick,
    clearActiveMeasureGroup,
    getMeasureStateMeasurements,
    setMeasureHoverTarget,
    undoMeasureState,
    type MeasureMeasurement,
} from '../utils/measurements';
import { resolveRobotMeasureTargetFromSelection } from '../utils/measureTargetResolvers';
import { useSelectionStore } from '@/store/selectionStore';

const MEASURE_LINE_COLOR = '#ef4444';
const MEASURE_AXIS_COLORS = {
    x: '#f97316',
    y: '#22c55e',
    z: '#3b82f6',
} as const;
const MEASURE_AXIS_EPSILON = 1e-6;
const MEASURE_RENDER_ORDER = 2400;
const MEASURE_LABEL_Z_INDEX_RANGE: [number, number] = [4, 0];
const MEASURE_TOTAL_LABEL_DISTANCE_FACTOR = 12;
const MEASURE_AXIS_LABEL_DISTANCE_FACTOR = 14;
const SCENE_LABEL_DECIMALS = 3;
const LABEL_OFFSET_PATTERN = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0.45, 0),
    new THREE.Vector3(-1, 0.75, 0),
    new THREE.Vector3(0.85, -0.1, 0),
    new THREE.Vector3(-0.85, 0.15, 0),
    new THREE.Vector3(0, -0.55, 0),
];

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function getSelectionSignature(selection?: URDFViewerProps['selection']): string {
    if (!selection?.type || !selection?.id) {
        return 'none';
    }

    return [
        selection.type,
        selection.id,
        selection.subType ?? 'none',
        selection.objectIndex ?? -1,
    ].join(':');
}

function buildDecompositionSegments(
    measurement: MeasureMeasurement,
): Array<{ axis: 'x' | 'y' | 'z'; points: [THREE.Vector3, THREE.Vector3] }> {
    const start = measurement.first.point;
    const end = measurement.second.point;
    const afterX = new THREE.Vector3(end.x, start.y, start.z);
    const afterY = new THREE.Vector3(end.x, end.y, start.z);

    const segments: Array<{ axis: 'x' | 'y' | 'z'; points: [THREE.Vector3, THREE.Vector3] }> = [];

    if (Math.abs(measurement.delta.x) > MEASURE_AXIS_EPSILON) {
        segments.push({ axis: 'x', points: [start, afterX] });
    }

    if (Math.abs(measurement.delta.y) > MEASURE_AXIS_EPSILON) {
        segments.push({ axis: 'y', points: [afterX, afterY] });
    }

    if (Math.abs(measurement.delta.z) > MEASURE_AXIS_EPSILON) {
        segments.push({ axis: 'z', points: [afterY, end] });
    }

    return segments;
}

function formatSegmentLength(value: number): string {
    return `${Math.abs(value).toFixed(SCENE_LABEL_DECIMALS)}m`;
}

function formatMeasurementDistance(value: number): string {
    return `${value.toFixed(SCENE_LABEL_DECIMALS)}m`;
}

const MeasurementItem = memo(({
    measurement,
    measurementIndex,
    showDecomposition,
    isHovered,
    onHover,
    onLeave,
    onDelete,
    deleteTooltip,
}: {
    measurement: MeasureMeasurement;
    measurementIndex: number;
    showDecomposition: boolean;
    isHovered: boolean;
    onHover: () => void;
    onLeave: () => void;
    onDelete: () => void;
    deleteTooltip: string;
}) => {
    const midpoint = useMemo(
        () => new THREE.Vector3().addVectors(measurement.first.point, measurement.second.point).multiplyScalar(0.5),
        [measurement.first.point, measurement.second.point],
    );
    const distance = useMemo(() => formatMeasurementDistance(measurement.distance), [measurement.distance]);
    const decompositionSegments = useMemo(
        () => buildDecompositionSegments(measurement),
        [measurement],
    );
    const endpointRadius = useMemo(
        () => clamp(measurement.distance * 0.01, 0.0028, 0.008),
        [measurement.distance],
    );
    const labelLift = useMemo(
        () => clamp(measurement.distance * 0.028, 0.008, 0.026),
        [measurement.distance],
    );
    const labelOffset = useMemo(() => (
        LABEL_OFFSET_PATTERN[measurementIndex % LABEL_OFFSET_PATTERN.length]
            .clone()
            .multiplyScalar(labelLift * 1.1)
    ), [labelLift, measurementIndex]);
    const totalLabelPosition = useMemo(
        () => midpoint.clone().add(labelOffset).add(new THREE.Vector3(0, labelLift * 1.15, 0)),
        [labelLift, labelOffset, midpoint],
    );
    const decompositionLabels = useMemo(() => (
        decompositionSegments.map((segment, index) => ({
            axis: segment.axis,
            text: `${segment.axis.toUpperCase()} ${formatSegmentLength(measurement.delta[segment.axis])}`,
            position: new THREE.Vector3()
                .addVectors(segment.points[0], segment.points[1])
                .multiplyScalar(0.5)
                .add(labelOffset.clone().multiplyScalar(0.28))
                .add(new THREE.Vector3(0, labelLift * (0.55 + index * 0.42), 0)),
        }))
    ), [decompositionSegments, labelLift, labelOffset, measurement.delta]);

    return (
        <group>
            <mesh position={measurement.first.point} renderOrder={MEASURE_RENDER_ORDER + 2}>
                <sphereGeometry args={[endpointRadius, 18, 18]} />
                <meshBasicMaterial color={MEASURE_LINE_COLOR} depthTest={false} depthWrite={false} transparent opacity={0.98} />
            </mesh>
            <mesh position={measurement.second.point} renderOrder={MEASURE_RENDER_ORDER + 2}>
                <sphereGeometry args={[endpointRadius, 18, 18]} />
                <meshBasicMaterial color={MEASURE_LINE_COLOR} depthTest={false} depthWrite={false} transparent opacity={0.98} />
            </mesh>
            <Line
                points={[measurement.first.point, measurement.second.point]}
                color={MEASURE_LINE_COLOR}
                lineWidth={2.2}
                depthTest={false}
                depthWrite={false}
                transparent
                opacity={0.98}
                renderOrder={MEASURE_RENDER_ORDER}
            />
            {showDecomposition && decompositionSegments.map((segment) => (
                <Line
                    key={`${measurement.id}:${segment.axis}`}
                    points={segment.points}
                    color={MEASURE_AXIS_COLORS[segment.axis]}
                    lineWidth={1.5}
                    depthTest={false}
                    depthWrite={false}
                    transparent
                    opacity={0.95}
                    renderOrder={MEASURE_RENDER_ORDER + 1}
                />
            ))}
            {showDecomposition && decompositionLabels.map((segmentLabel) => (
                <Html
                    key={`${measurement.id}:label:${segmentLabel.axis}`}
                    center
                    position={segmentLabel.position}
                    transform
                    sprite
                    occlude
                    distanceFactor={MEASURE_AXIS_LABEL_DISTANCE_FACTOR}
                    style={{ pointerEvents: 'none' }}
                    zIndexRange={MEASURE_LABEL_Z_INDEX_RANGE}
                >
                    <div
                        className="rounded border border-white/15 px-1 py-px font-mono text-[8px] whitespace-nowrap text-white/95 shadow-lg"
                        style={{ backgroundColor: `${MEASURE_AXIS_COLORS[segmentLabel.axis]}E6` }}
                    >
                        {segmentLabel.text}
                    </div>
                </Html>
            ))}
            <Html
                center
                position={totalLabelPosition}
                transform
                sprite
                occlude
                distanceFactor={MEASURE_TOTAL_LABEL_DISTANCE_FACTOR}
                style={{ pointerEvents: 'none' }}
                zIndexRange={MEASURE_LABEL_Z_INDEX_RANGE}
            >
                <div
                    className={`group flex cursor-pointer items-center gap-1 rounded border border-white/10 bg-red-500/92 px-1 py-px font-mono text-[8px] whitespace-nowrap text-white shadow-lg transition-colors pointer-events-auto ${
                        isHovered ? 'bg-red-600/95' : 'hover:bg-red-600/95'
                    }`}
                    onMouseEnter={onHover}
                    onMouseLeave={onLeave}
                    onClick={(event) => {
                        event.stopPropagation();
                        onDelete();
                    }}
                    title={deleteTooltip}
                >
                    G{measurement.groupIndex} {distance}
                    <svg
                        className={`h-2 w-2 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </div>
            </Html>
        </group>
    );
});

export const MeasureTool: React.FC<MeasureToolProps> = ({
    active,
    robot,
    robotLinks,
    measureState,
    setMeasureState,
    measureAnchorMode,
    showDecomposition,
    deleteTooltip = 'Click to delete this measurement',
    measureTargetResolverRef,
}) => {
    const selection = useSelectionStore((state) => state.selection);
    const hoveredSelection = useSelectionStore((state) => state.hoveredSelection);
    const [hoveredMeasurementId, setHoveredMeasurementId] = useState<string | null>(null);
    const lastSelectionSignatureRef = useRef('none');
    const lastHoverSignatureRef = useRef('none');
    const resolveMeasureTarget = useCallback((
        nextSelection = selection,
        fallbackSelection = hoveredSelection,
    ) => (
        measureTargetResolverRef?.current?.(nextSelection, fallbackSelection, measureAnchorMode)
        ?? resolveRobotMeasureTargetFromSelection(robot, robotLinks, nextSelection, fallbackSelection, measureAnchorMode)
    ), [hoveredSelection, measureAnchorMode, measureTargetResolverRef, robot, robotLinks, selection]);

    useEffect(() => {
        if (!active) {
            setHoveredMeasurementId(null);
            lastSelectionSignatureRef.current = getSelectionSignature(selection);
            lastHoverSignatureRef.current = getSelectionSignature(hoveredSelection);
            setMeasureState((prev) => {
                if (!prev.hoverTarget) {
                    return prev;
                }

                return {
                    ...prev,
                    hoverTarget: null,
                };
            });
        }
    }, [active, hoveredSelection, selection, setMeasureState]);

    useEffect(() => {
        if (!active) {
            return;
        }

        const currentSelectionSignature = getSelectionSignature(selection);
        if (currentSelectionSignature === lastSelectionSignatureRef.current) {
            return;
        }

        lastSelectionSignatureRef.current = currentSelectionSignature;

        const target = resolveMeasureTarget(selection, hoveredSelection);
        if (!target) {
            return;
        }

        setMeasureState((prev) => applyMeasurePick(prev, target));
    }, [
        active,
        robot,
        selection,
        selection?.id,
        selection?.objectIndex,
        selection?.subType,
        selection?.type,
        hoveredSelection,
        hoveredSelection?.id,
        hoveredSelection?.objectIndex,
        hoveredSelection?.subType,
        hoveredSelection?.type,
        resolveMeasureTarget,
        setMeasureState,
    ]);

    useEffect(() => {
        if (!active) {
            return;
        }

        const currentHoverSignature = getSelectionSignature(hoveredSelection);
        if (currentHoverSignature === lastHoverSignatureRef.current) {
            return;
        }

        lastHoverSignatureRef.current = currentHoverSignature;
        const target = resolveMeasureTarget(hoveredSelection, hoveredSelection);

        setMeasureState((prev) => {
            if (!target && !prev.hoverTarget) {
                return prev;
            }

            return setMeasureHoverTarget(prev, target);
        });
    }, [
        active,
        hoveredSelection,
        hoveredSelection?.id,
        hoveredSelection?.objectIndex,
        hoveredSelection?.subType,
        hoveredSelection?.type,
        resolveMeasureTarget,
        setMeasureState,
    ]);

    useEffect(() => {
        if (!active) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMeasureState((prev) => clearActiveMeasureGroup(prev));
                return;
            }

            if (event.key === 'Backspace' || event.key === 'Delete') {
                setMeasureState((prev) => undoMeasureState(prev));
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [active, setMeasureState]);

    const handleDeleteMeasurement = useCallback((measurementId: string) => {
        setMeasureState((prev) => {
            const targetGroup = prev.groups.find((group) => group.id === measurementId);
            if (!targetGroup) {
                return prev;
            }

            return clearActiveMeasureGroup({
                ...prev,
                activeGroupId: targetGroup.id,
            });
        });
    }, [setMeasureState]);

    const measurements = useMemo(
        () => getMeasureStateMeasurements(measureState),
        [measureState],
    );

    return (
        <group>
            {active && measurements.map((measurement, index) => (
                <MeasurementItem
                    key={measurement.id}
                    measurement={measurement}
                    measurementIndex={index}
                    showDecomposition={showDecomposition}
                    isHovered={hoveredMeasurementId === measurement.id}
                    onHover={() => setHoveredMeasurementId(measurement.id)}
                    onLeave={() => setHoveredMeasurementId(null)}
                    onDelete={() => handleDeleteMeasurement(measurement.id)}
                    deleteTooltip={deleteTooltip}
                />
            ))}
        </group>
    );
};
