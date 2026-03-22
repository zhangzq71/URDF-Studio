import { useEffect, useMemo, useState, type RefObject } from 'react';

type FloatingPanelPosition = {
  top?: string;
  right?: string;
  left?: string;
  bottom?: string;
  transform?: string;
};

interface UseResponsivePanelLayoutOptions {
  containerRef: RefObject<HTMLDivElement>;
  optionsPanelRef: RefObject<HTMLDivElement>;
  jointPanelRef: RefObject<HTMLDivElement>;
  showOptionsPanel: boolean;
  showJointPanel: boolean;
  showJointControls: boolean;
  showToolbar: boolean;
}

interface PanelMetrics {
  containerWidth: number;
  containerHeight: number;
  optionsWidth: number;
  optionsHeight: number;
  jointsWidth: number;
}

const EDGE_GAP = 16;
const PANEL_GAP = 12;
const TOOLBAR_OFFSET_WITH_PANEL = 56;
const TOOLBAR_OFFSET_NO_PANEL = 16;
const FALLBACK_OPTIONS_WIDTH = 208;
const FALLBACK_OPTIONS_HEIGHT = 208;
const FALLBACK_JOINTS_WIDTH = 208;
const MIN_JOINT_PANEL_HEIGHT = 180;

const readPanelMetrics = (
  containerRef: RefObject<HTMLDivElement>,
  optionsPanelRef: RefObject<HTMLDivElement>,
  jointPanelRef: RefObject<HTMLDivElement>
): PanelMetrics => ({
  containerWidth: containerRef.current?.clientWidth ?? 0,
  containerHeight: containerRef.current?.clientHeight ?? 0,
  optionsWidth: optionsPanelRef.current?.offsetWidth ?? FALLBACK_OPTIONS_WIDTH,
  optionsHeight: optionsPanelRef.current?.offsetHeight ?? FALLBACK_OPTIONS_HEIGHT,
  jointsWidth: jointPanelRef.current?.offsetWidth ?? FALLBACK_JOINTS_WIDTH,
});

export function useResponsivePanelLayout({
  containerRef,
  optionsPanelRef,
  jointPanelRef,
  showOptionsPanel,
  showJointPanel,
  showJointControls,
  showToolbar,
}: UseResponsivePanelLayoutOptions) {
  const [metrics, setMetrics] = useState<PanelMetrics>(() =>
    readPanelMetrics(containerRef, optionsPanelRef, jointPanelRef)
  );

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(readPanelMetrics(containerRef, optionsPanelRef, jointPanelRef));
    };

    updateMetrics();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateMetrics);
      return () => window.removeEventListener('resize', updateMetrics);
    }

    const observer = new ResizeObserver(updateMetrics);
    const observedNodes = [containerRef.current, optionsPanelRef.current, jointPanelRef.current].filter(
      (node): node is HTMLDivElement => Boolean(node)
    );

    observedNodes.forEach((node) => observer.observe(node));
    window.addEventListener('resize', updateMetrics);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [
    containerRef,
    jointPanelRef,
    optionsPanelRef,
    showJointControls,
    showJointPanel,
    showOptionsPanel,
  ]);

  return useMemo(() => {
    const toolbarOffset = showToolbar ? TOOLBAR_OFFSET_WITH_PANEL : TOOLBAR_OFFSET_NO_PANEL;
    const shouldStackPanels =
      showOptionsPanel &&
      showJointPanel &&
      showJointControls &&
      metrics.containerWidth > 0 &&
      metrics.containerWidth < metrics.optionsWidth + metrics.jointsWidth + EDGE_GAP * 2 + PANEL_GAP;

    const optionsDefaultPosition: FloatingPanelPosition = shouldStackPanels
      ? { top: `${toolbarOffset}px`, left: `${EDGE_GAP}px`, right: 'auto', transform: 'none' }
      : metrics.containerWidth > 0 && metrics.containerWidth < 520
        ? { top: `${toolbarOffset}px`, right: `${EDGE_GAP}px`, left: 'auto', transform: 'none' }
        : { top: '16px', right: '16px' };

    if (!shouldStackPanels) {
      return {
        optionsDefaultPosition,
        jointsDefaultPosition: { top: '50%', left: '16px', transform: 'translateY(-50%)' } as FloatingPanelPosition,
        jointsPanelMaxHeight: undefined as number | undefined,
      };
    }

    const stackedTop = toolbarOffset + metrics.optionsHeight + PANEL_GAP;
    const stackedHeight = Math.max(
      MIN_JOINT_PANEL_HEIGHT,
      metrics.containerHeight - stackedTop - EDGE_GAP
    );

    return {
      optionsDefaultPosition,
      jointsDefaultPosition: {
        top: `${stackedTop}px`,
        left: `${EDGE_GAP}px`,
        right: 'auto',
        transform: 'none',
      } as FloatingPanelPosition,
      jointsPanelMaxHeight: stackedHeight,
    };
  }, [
    metrics.containerHeight,
    metrics.containerWidth,
    metrics.jointsWidth,
    metrics.optionsHeight,
    metrics.optionsWidth,
    showJointControls,
    showJointPanel,
    showOptionsPanel,
    showToolbar,
  ]);
}
