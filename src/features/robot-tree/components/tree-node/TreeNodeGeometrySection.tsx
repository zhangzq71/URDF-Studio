import { memo, type MouseEvent, type RefObject } from 'react';
import { Eye, EyeOff, Shapes, Shield } from 'lucide-react';
import type { TranslationKeys } from '@/shared/i18n';
import { matchesSelection, type Selection } from '@/store/selectionStore';
import { GeometryType, type RobotState } from '@/types';
import type { TreeNodeContextMenuTarget, VisibleCollisionBody } from './types';
import {
  getGeometryVisibilityButtonClass,
  getTreeConnectorElbowClass,
  getTreeConnectorElbowStyle,
  resolveTreeRowStateClass,
} from './presentation';

interface TreeNodeGeometrySectionProps {
  linkId: string;
  link: RobotState['links'][string];
  robotSelection: RobotState['selection'];
  hoveredSelection: Selection;
  attentionSelection: Selection;
  visualRowRef: RefObject<HTMLDivElement | null>;
  primaryCollisionRowRef: RefObject<HTMLDivElement | null>;
  collisionBodyRowRefs: RefObject<Record<number, HTMLDivElement | null>>;
  geometryRowIndentPx: number;
  hasPrimaryCollision: boolean;
  visibleCollisionBodies: VisibleCollisionBody[];
  isLinkSelected: boolean;
  selectedObjectIndex: number;
  t: TranslationKeys;
  onSetHoveredSelection: (selection: Selection) => void;
  onClearHover: () => void;
  onOpenContextMenu: (event: MouseEvent<HTMLDivElement>, target: TreeNodeContextMenuTarget) => void;
  onSelectVisual: () => void;
  onSelectPrimaryCollision: () => void;
  onSelectCollisionBody: (objectIndex: number) => void;
  onToggleVisualVisibility: (event: MouseEvent) => void;
  onTogglePrimaryCollisionVisibility: (event: MouseEvent) => void;
  onToggleCollisionBodyVisibility: (event: MouseEvent, bodyIndex: number) => void;
  readOnly: boolean;
}

export const TreeNodeGeometrySection = memo(function TreeNodeGeometrySection({
  linkId,
  link,
  robotSelection,
  hoveredSelection,
  attentionSelection,
  visualRowRef,
  primaryCollisionRowRef,
  collisionBodyRowRefs,
  geometryRowIndentPx,
  hasPrimaryCollision,
  visibleCollisionBodies,
  isLinkSelected,
  selectedObjectIndex,
  t,
  onSetHoveredSelection,
  onClearHover,
  onOpenContextMenu,
  onSelectVisual,
  onSelectPrimaryCollision,
  onSelectCollisionBody,
  onToggleVisualVisibility,
  onTogglePrimaryCollisionVisibility,
  onToggleCollisionBodyVisibility,
  readOnly,
}: TreeNodeGeometrySectionProps) {
  const isVisualSelected =
    isLinkSelected &&
    robotSelection.subType === 'visual' &&
    (robotSelection.objectIndex === undefined || selectedObjectIndex === 0);
  const isVisualHovered = matchesSelection(hoveredSelection, {
    type: 'link',
    id: linkId,
    subType: 'visual',
    objectIndex: 0,
  });
  const isVisualAttentionHighlighted = matchesSelection(attentionSelection, {
    type: 'link',
    id: linkId,
    subType: 'visual',
    objectIndex: 0,
  });
  const isPrimaryCollisionSelected =
    isLinkSelected && robotSelection.subType === 'collision' && selectedObjectIndex === 0;
  const isPrimaryCollisionHovered = matchesSelection(hoveredSelection, {
    type: 'link',
    id: linkId,
    subType: 'collision',
    objectIndex: 0,
  });
  const isPrimaryCollisionAttentionHighlighted = matchesSelection(attentionSelection, {
    type: 'link',
    id: linkId,
    subType: 'collision',
    objectIndex: 0,
  });
  const isLinkVisible = link.visible !== false;
  const isVisualVisible = link.visual.visible !== false;
  const isPrimaryCollisionVisible = link.collision.visible !== false;
  const isVisualInheritedHidden = !isLinkVisible && isVisualVisible;
  const isVisualEffectivelyVisible = isLinkVisible && isVisualVisible;
  const isPrimaryCollisionInheritedHidden = !isLinkVisible && isPrimaryCollisionVisible;
  const isPrimaryCollisionEffectivelyVisible = isLinkVisible && isPrimaryCollisionVisible;

  return (
    <>
      {link.visual?.type && link.visual.type !== GeometryType.NONE && (
        <div
          ref={visualRowRef}
          className={`relative flex items-center py-0.5 px-2 mx-1 my-0.5 rounded-md transition-all duration-200 ${readOnly ? 'cursor-default' : 'cursor-pointer'} ${resolveTreeRowStateClass(
            'text-text-secondary dark:text-text-tertiary',
            {
              isHovered: isVisualHovered,
              isSelected: isVisualSelected,
              isAttentionHighlighted: isVisualAttentionHighlighted,
            },
          )}`}
          onClick={readOnly ? undefined : onSelectVisual}
          onContextMenu={
            readOnly
              ? undefined
              : (event) => {
                  onOpenContextMenu(event, {
                    type: 'geometry',
                    linkId,
                    subType: 'visual',
                    objectIndex: 0,
                  });
                }
          }
          onMouseEnter={
            readOnly
              ? undefined
              : () =>
                  onSetHoveredSelection({
                    type: 'link',
                    id: linkId,
                    subType: 'visual',
                    objectIndex: 0,
                  })
          }
          onMouseLeave={readOnly ? undefined : onClearHover}
          style={{ marginLeft: `${geometryRowIndentPx}px` }}
          title={t.visualGeometry}
        >
          <div
            className={getTreeConnectorElbowClass(
              isVisualSelected || isVisualHovered || isVisualAttentionHighlighted,
            )}
            style={getTreeConnectorElbowStyle(geometryRowIndentPx)}
          />
          <div
            className={`w-3.5 h-3.5 rounded flex items-center justify-center mr-1 shrink-0 border transition-colors ${isVisualSelected || isVisualHovered || isVisualAttentionHighlighted ? 'bg-emerald-500/15 dark:bg-emerald-400/15 border-emerald-500/20 dark:border-emerald-400/20' : 'bg-emerald-500/10 dark:bg-emerald-400/10 border-transparent'}`}
          >
            <Shapes
              size={9}
              className={
                isVisualSelected || isVisualHovered || isVisualAttentionHighlighted
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-emerald-500 dark:text-emerald-400'
              }
            />
          </div>
          <span className="text-[10px] font-medium truncate flex-1 min-w-0">
            {t.visualGeometry}
          </span>
          {!readOnly && (
            <button
              type="button"
              className={getGeometryVisibilityButtonClass(isVisualEffectivelyVisible, {
                inheritedHidden: isVisualInheritedHidden,
              })}
              onClick={onToggleVisualVisibility}
              title={isVisualVisible ? t.hide : t.show}
              aria-label={isVisualVisible ? t.hide : t.show}
              data-visibility-source={isVisualInheritedHidden ? 'inherited' : 'local'}
            >
              {isVisualEffectivelyVisible ? <Eye size={10} /> : <EyeOff size={10} />}
            </button>
          )}
        </div>
      )}

      {link.collision?.type && link.collision.type !== GeometryType.NONE && (
        <div
          ref={primaryCollisionRowRef}
          className={`relative flex items-center py-0.5 px-2 mx-1 my-0.5 rounded-md transition-all duration-200 ${readOnly ? 'cursor-default' : 'cursor-pointer'} ${resolveTreeRowStateClass(
            'text-text-secondary dark:text-text-tertiary',
            {
              isHovered: isPrimaryCollisionHovered,
              isSelected: isPrimaryCollisionSelected,
              isAttentionHighlighted: isPrimaryCollisionAttentionHighlighted,
            },
          )}`}
          onClick={readOnly ? undefined : onSelectPrimaryCollision}
          onContextMenu={
            readOnly
              ? undefined
              : (event) => {
                  onOpenContextMenu(event, {
                    type: 'geometry',
                    linkId,
                    subType: 'collision',
                    objectIndex: 0,
                  });
                }
          }
          onMouseEnter={
            readOnly
              ? undefined
              : () =>
                  onSetHoveredSelection({
                    type: 'link',
                    id: linkId,
                    subType: 'collision',
                    objectIndex: 0,
                  })
          }
          onMouseLeave={readOnly ? undefined : onClearHover}
          style={{ marginLeft: `${geometryRowIndentPx}px` }}
          title={t.collision}
        >
          <div
            className={getTreeConnectorElbowClass(
              isPrimaryCollisionSelected ||
                isPrimaryCollisionHovered ||
                isPrimaryCollisionAttentionHighlighted,
            )}
            style={getTreeConnectorElbowStyle(geometryRowIndentPx)}
          />
          <div
            className={`w-3.5 h-3.5 rounded flex items-center justify-center mr-1 shrink-0 border transition-colors ${isPrimaryCollisionSelected || isPrimaryCollisionHovered || isPrimaryCollisionAttentionHighlighted ? 'bg-amber-500/15 dark:bg-amber-400/15 border-amber-500/20 dark:border-amber-400/20' : 'bg-amber-500/10 dark:bg-amber-400/10 border-transparent'}`}
          >
            <Shield
              size={9}
              className={
                isPrimaryCollisionSelected ||
                isPrimaryCollisionHovered ||
                isPrimaryCollisionAttentionHighlighted
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-amber-500 dark:text-amber-400'
              }
            />
          </div>
          <span className="text-[10px] font-medium truncate flex-1 min-w-0">{t.collision}</span>
          {!readOnly && (
            <button
              type="button"
              className={getGeometryVisibilityButtonClass(isPrimaryCollisionEffectivelyVisible, {
                inheritedHidden: isPrimaryCollisionInheritedHidden,
              })}
              onClick={onTogglePrimaryCollisionVisibility}
              title={isPrimaryCollisionVisible ? t.hide : t.show}
              aria-label={isPrimaryCollisionVisible ? t.hide : t.show}
              data-visibility-source={isPrimaryCollisionInheritedHidden ? 'inherited' : 'local'}
            >
              {isPrimaryCollisionEffectivelyVisible ? <Eye size={10} /> : <EyeOff size={10} />}
            </button>
          )}
        </div>
      )}

      {visibleCollisionBodies.map(({ body, bodyIndex, objectIndex }, index) => {
        const isCollisionBodyHovered = matchesSelection(hoveredSelection, {
          type: 'link',
          id: linkId,
          subType: 'collision',
          objectIndex,
        });
        const isCollisionBodyAttentionHighlighted = matchesSelection(attentionSelection, {
          type: 'link',
          id: linkId,
          subType: 'collision',
          objectIndex,
        });
        const isCollisionBodySelected =
          isLinkSelected &&
          robotSelection.subType === 'collision' &&
          selectedObjectIndex === objectIndex;
        const isCollisionBodyVisible = body.visible !== false;
        const isCollisionBodyInheritedHidden = !isLinkVisible && isCollisionBodyVisible;
        const isCollisionBodyEffectivelyVisible = isLinkVisible && isCollisionBodyVisible;

        return (
          <div
            ref={(element) => {
              collisionBodyRowRefs.current[objectIndex] = element;
            }}
            key={`collision-extra-${bodyIndex}`}
            className={`relative flex items-center py-0.5 px-2 mx-1 my-0.5 rounded-md transition-all duration-200 ${readOnly ? 'cursor-default' : 'cursor-pointer'} ${resolveTreeRowStateClass(
              'text-text-secondary dark:text-text-tertiary',
              {
                isHovered: isCollisionBodyHovered,
                isSelected: isCollisionBodySelected,
                isAttentionHighlighted: isCollisionBodyAttentionHighlighted,
              },
            )}`}
            onClick={readOnly ? undefined : () => onSelectCollisionBody(objectIndex)}
            onContextMenu={
              readOnly
                ? undefined
                : (event) => {
                    onOpenContextMenu(event, {
                      type: 'geometry',
                      linkId,
                      subType: 'collision',
                      objectIndex,
                    });
                  }
            }
            onMouseEnter={
              readOnly
                ? undefined
                : () =>
                    onSetHoveredSelection({
                      type: 'link',
                      id: linkId,
                      subType: 'collision',
                      objectIndex,
                    })
            }
            onMouseLeave={readOnly ? undefined : onClearHover}
            style={{ marginLeft: `${geometryRowIndentPx}px` }}
            title={`${t.collision} ${index + (hasPrimaryCollision ? 2 : 1)}`}
          >
            <div
              className={getTreeConnectorElbowClass(
                isCollisionBodySelected ||
                  isCollisionBodyHovered ||
                  isCollisionBodyAttentionHighlighted,
              )}
              style={getTreeConnectorElbowStyle(geometryRowIndentPx)}
            />
            <div
              className={`w-3.5 h-3.5 rounded flex items-center justify-center mr-1 shrink-0 border transition-colors ${
                isCollisionBodySelected ||
                isCollisionBodyHovered ||
                isCollisionBodyAttentionHighlighted
                  ? 'bg-amber-500/15 dark:bg-amber-400/15 border-amber-500/20 dark:border-amber-400/20'
                  : 'bg-amber-500/10 dark:bg-amber-400/10 border-transparent'
              }`}
            >
              <Shield
                size={9}
                className={
                  isCollisionBodySelected ||
                  isCollisionBodyHovered ||
                  isCollisionBodyAttentionHighlighted
                    ? 'text-amber-700 dark:text-amber-300'
                    : 'text-amber-500 dark:text-amber-400'
                }
              />
            </div>
            <span className="text-[10px] font-medium truncate flex-1 min-w-0">
              {`${t.collision} ${index + (hasPrimaryCollision ? 2 : 1)}`}
            </span>
            {!readOnly && (
              <button
                type="button"
                className={getGeometryVisibilityButtonClass(isCollisionBodyEffectivelyVisible, {
                  inheritedHidden: isCollisionBodyInheritedHidden,
                })}
                onClick={(event) => onToggleCollisionBodyVisibility(event, bodyIndex)}
                title={isCollisionBodyVisible ? t.hide : t.show}
                aria-label={isCollisionBodyVisible ? t.hide : t.show}
                data-visibility-source={isCollisionBodyInheritedHidden ? 'inherited' : 'local'}
              >
                {isCollisionBodyEffectivelyVisible ? <Eye size={10} /> : <EyeOff size={10} />}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
});
