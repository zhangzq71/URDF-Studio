import React, { memo, useState } from 'react';
import {
  ArrowRightLeft,
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Plus,
  Shapes,
  Shield,
  Trash2,
} from 'lucide-react';
import { SelectableText } from '@/shared/components';
import type { TranslationKeys } from '@/shared/i18n';
import type { AppMode, RobotState } from '@/types';

export interface TreeNodeProps {
  linkId: string;
  robot: RobotState;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onFocus?: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  mode: AppMode;
  t: TranslationKeys;
  depth?: number;
}

export const TreeNode = memo(({
  linkId,
  robot,
  onSelect,
  onFocus,
  onAddChild,
  onDelete,
  onUpdate,
  mode,
  t,
  depth = 0,
}: TreeNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isGeomExpanded, setIsGeomExpanded] = useState(false);

  const link = robot.links[linkId];
  if (!link) {
    return null;
  }

  const childJoints = Object.values(robot.joints).filter((joint) => joint.parentLinkId === linkId);
  const hasChildren = childJoints.length > 0;

  const isLinkSelected = robot.selection.type === 'link' && robot.selection.id === linkId;
  const isSkeleton = mode === 'skeleton';

  const isVisible = link.visible !== false;
  const hasVisual = link.visual?.type && link.visual.type !== 'none';
  const hasCollision = link.collision?.type && link.collision.type !== 'none';

  return (
    <div className="relative">
      <div
        className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group transition-colors
          ${
            isLinkSelected
              ? 'bg-system-blue-solid text-white shadow-sm dark:bg-system-blue-solid'
              : 'hover:bg-element-hover text-text-primary dark:text-text-secondary dark:hover:bg-element-hover'
          }`}
        onClick={() => onSelect('link', linkId)}
        onDoubleClick={() => onFocus && onFocus(linkId)}
        style={{ marginLeft: depth > 0 ? '8px' : '0' }}
      >
        {depth > 0 && (
          <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />
        )}

        <div
          className={`w-4 h-4 flex items-center justify-center shrink-0 mr-1 rounded
            ${hasChildren ? 'hover:bg-element-hover cursor-pointer transition-colors' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              setIsExpanded(!isExpanded);
            }
          }}
        >
          {hasChildren
            && (isExpanded ? (
              <ChevronDown size={12} className={isLinkSelected ? 'text-white/90' : 'text-text-tertiary'} />
            ) : (
              <ChevronRight size={12} className={isLinkSelected ? 'text-white/90' : 'text-text-tertiary'} />
            ))}
        </div>

        <div
          className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0
            ${isLinkSelected ? 'bg-white/25' : 'bg-system-blue/10 dark:bg-element-bg'}`}
        >
          <Box size={12} className={isLinkSelected ? 'text-white' : 'text-system-blue'} />
        </div>

        <SelectableText className="text-xs font-medium truncate flex-1">{link.name}</SelectableText>

        <div className="flex items-center gap-0.5 ml-auto">
          {(hasVisual || hasCollision) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsGeomExpanded(!isGeomExpanded);
              }}
              className={`p-1 rounded transition-colors ${
                isGeomExpanded
                  ? isLinkSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-system-blue/10 text-system-blue dark:bg-system-blue/20'
                  : isLinkSelected
                    ? 'text-white/85 hover:bg-white/20'
                    : 'text-text-tertiary hover:bg-element-hover hover:text-system-blue'
              }`}
              title={isGeomExpanded ? t.hideVisualCollision : t.showVisualCollision}
            >
              <Shapes size={12} />
            </button>
          )}

          <button
            className={`p-1 rounded hover:bg-element-hover cursor-pointer transition-colors
              ${
                isLinkSelected
                  ? 'text-white'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
            onClick={(e) => {
              e.stopPropagation();
              onUpdate('link', linkId, { ...link, visible: !isVisible });
            }}
            title={isVisible ? t.hide : t.show}
          >
            {isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>

          {isSkeleton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(linkId);
                setIsExpanded(true);
              }}
              className={`p-1 rounded transition-all ${
                isLinkSelected
                  ? 'opacity-100 hover:bg-white/20'
                  : 'opacity-0 group-hover:opacity-100 hover:bg-element-hover'
              }`}
              title={t.addChildJoint}
            >
              <Plus size={12} />
            </button>
          )}
        </div>
      </div>

      {(hasChildren || ((hasVisual || hasCollision) && isGeomExpanded)) && isExpanded && (
        <div className="relative ml-3">
          <div className="absolute left-0 top-0 bottom-2 w-px bg-border-black" />

          {(hasVisual || hasCollision) && isGeomExpanded && (
            <div className="space-y-0.5 pb-0.5">
              {hasVisual && (
                <div
                  className={`relative flex items-center gap-2 text-[11px] px-2 py-1 ml-5 rounded-md cursor-pointer transition-colors
                    ${
                      robot.selection.type === 'link'
                      && robot.selection.id === linkId
                      && robot.selection.subType === 'visual'
                        ? 'bg-system-blue-solid text-white shadow-sm dark:bg-system-blue-solid'
                        : 'text-system-blue hover:bg-system-blue/10 dark:hover:bg-system-blue/15'
                    }
                  `}
                  title={`Visual: ${link.visual.type}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect('link', linkId, 'visual');
                  }}
                >
                  <div className="absolute -left-3 top-1/2 w-3 h-px bg-border-black" />
                  <Shapes size={12} />
                  <SelectableText className="font-medium">{t.visual}</SelectableText>
                  <SelectableText className="text-[10px] opacity-70 ml-auto">
                    {link.visual.type}
                  </SelectableText>
                </div>
              )}

              {hasCollision && (
                <div
                  className={`relative flex items-center gap-2 text-[11px] px-2 py-1 ml-5 rounded-md cursor-pointer transition-colors
                    ${
                      robot.selection.type === 'link'
                      && robot.selection.id === linkId
                      && robot.selection.subType === 'collision'
                        ? 'bg-system-blue-solid text-white shadow-sm dark:bg-system-blue-solid'
                        : 'text-system-blue hover:bg-system-blue/10 dark:hover:bg-system-blue/15'
                    }
                  `}
                  title={`Collision: ${link.collision.type}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect('link', linkId, 'collision');
                  }}
                >
                  <div className="absolute -left-3 top-1/2 w-3 h-px bg-border-black" />
                  <Shield size={12} />
                  <SelectableText className="font-medium">{t.collision}</SelectableText>
                  <SelectableText className="text-[10px] opacity-70 ml-auto">
                    {link.collision.type}
                  </SelectableText>
                </div>
              )}
            </div>
          )}

          {childJoints.map((joint) => {
            const isJointSelected = robot.selection.type === 'joint' && robot.selection.id === joint.id;

            return (
              <div key={joint.id} className="relative">
                <div
                  className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group transition-colors
                    ${
                      isJointSelected
                        ? 'bg-orange-500 text-white shadow-sm dark:bg-orange-500'
                        : 'hover:bg-element-hover text-text-secondary dark:text-text-tertiary dark:hover:bg-element-hover'
                    }`}
                  onClick={() => onSelect('joint', joint.id)}
                  style={{ marginLeft: '8px' }}
                >
                  <div className="absolute -left-2 top-1/2 w-2 h-px bg-border-black" />

                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0
                      ${isJointSelected ? 'bg-white/25' : 'bg-orange-100 dark:bg-element-bg'}`}
                  >
                    <ArrowRightLeft
                      size={10}
                      className={isJointSelected ? 'text-white' : 'text-orange-600 dark:text-orange-300'}
                    />
                  </div>

                  <SelectableText className="text-[11px] font-medium truncate flex-1">
                    {joint.name}
                  </SelectableText>

                  {isSkeleton && (
                    <div
                      className={`flex items-center gap-0.5 ml-1 ${
                        isJointSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(joint.childLinkId);
                        }}
                        className={`p-0.5 rounded transition-colors ${
                          isJointSelected
                            ? 'hover:bg-white/20'
                            : 'hover:bg-element-hover'
                        }`}
                        title={t.deleteBranch}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                <TreeNode
                  linkId={joint.childLinkId}
                  robot={robot}
                  onSelect={onSelect}
                  onFocus={onFocus}
                  onAddChild={onAddChild}
                  onDelete={onDelete}
                  onUpdate={onUpdate}
                  mode={mode}
                  t={t}
                  depth={depth + 1}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

TreeNode.displayName = 'TreeNode';
