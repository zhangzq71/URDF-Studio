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
        className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group
          ${
            isLinkSelected
              ? 'bg-blue-500 text-white shadow-sm dark:bg-[#3A3A3C]'
              : 'hover:bg-slate-100 dark:hover:bg-[#3A3A3C] text-slate-700 dark:text-slate-300'
          }`}
        onClick={() => onSelect('link', linkId)}
        onDoubleClick={() => onFocus && onFocus(linkId)}
        style={{ marginLeft: depth > 0 ? '8px' : '0' }}
      >
        {depth > 0 && (
          <div className="absolute -left-2 top-1/2 w-2 h-px bg-slate-300 dark:bg-slate-600" />
        )}

        <div
          className={`w-4 h-4 flex items-center justify-center shrink-0 mr-1 rounded
            ${hasChildren ? 'hover:bg-black/10 dark:hover:bg-[#48484A] cursor-pointer' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              setIsExpanded(!isExpanded);
            }
          }}
        >
          {hasChildren
            && (isExpanded ? (
              <ChevronDown size={12} className={isLinkSelected ? 'text-blue-200' : 'text-slate-400'} />
            ) : (
              <ChevronRight size={12} className={isLinkSelected ? 'text-blue-200' : 'text-slate-400'} />
            ))}
        </div>

        <div
          className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0
            ${isLinkSelected ? 'bg-blue-400 dark:bg-slate-500' : 'bg-blue-100 dark:bg-slate-700'}`}
        >
          <Box size={12} className={isLinkSelected ? 'text-white' : 'text-blue-500 dark:text-slate-300'} />
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
                    ? 'bg-blue-400 text-white'
                    : 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                  : isLinkSelected
                    ? 'text-blue-200 hover:bg-blue-400'
                    : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-blue-500'
              }`}
              title={isGeomExpanded ? t.hideVisualCollision : t.showVisualCollision}
            >
              <Shapes size={12} />
            </button>
          )}

          <button
            className={`p-1 rounded hover:bg-black/10 dark:hover:bg-[#48484A] cursor-pointer
              ${
                isLinkSelected
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
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
              className={`p-1 rounded transition-opacity ${
                isLinkSelected
                  ? 'opacity-100 hover:bg-blue-400'
                  : 'opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-700'
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
          <div className="absolute left-0 top-0 bottom-2 w-px bg-slate-200 dark:bg-slate-700" />

          {(hasVisual || hasCollision) && isGeomExpanded && (
            <div className="space-y-0.5 pb-0.5">
              {hasVisual && (
                <div
                  className={`relative flex items-center gap-2 text-[11px] px-2 py-1 ml-5 rounded-md cursor-pointer transition-colors
                    ${
                      robot.selection.type === 'link'
                      && robot.selection.id === linkId
                      && robot.selection.subType === 'visual'
                        ? 'bg-blue-500 text-white shadow-sm dark:bg-[#3A3A3C]'
                        : 'text-blue-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-[#3A3A3C]'
                    }
                  `}
                  title={`Visual: ${link.visual.type}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect('link', linkId, 'visual');
                  }}
                >
                  <div className="absolute -left-3 top-1/2 w-3 h-px bg-slate-200 dark:bg-slate-700" />
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
                        ? 'bg-[#0060FA] text-white shadow-sm dark:bg-[#3A3A3C]'
                        : 'text-[#0060FA] dark:text-slate-400 hover:bg-[#0060FA]/10 dark:hover:bg-[#3A3A3C]'
                    }
                  `}
                  title={`Collision: ${link.collision.type}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect('link', linkId, 'collision');
                  }}
                >
                  <div className="absolute -left-3 top-1/2 w-3 h-px bg-slate-200 dark:bg-slate-700" />
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
                  className={`relative flex items-center py-1 px-2 mx-1 my-0.5 rounded-md cursor-pointer group
                    ${
                      isJointSelected
                        ? 'bg-orange-500 text-white shadow-sm dark:bg-[#3A3A3C]'
                        : 'hover:bg-slate-100 dark:hover:bg-[#3A3A3C] text-slate-600 dark:text-slate-400'
                    }`}
                  onClick={() => onSelect('joint', joint.id)}
                  style={{ marginLeft: '8px' }}
                >
                  <div className="absolute -left-2 top-1/2 w-2 h-px bg-slate-300 dark:bg-slate-600" />

                  <div
                    className={`w-5 h-5 rounded flex items-center justify-center mr-1.5 shrink-0
                      ${isJointSelected ? 'bg-orange-400 dark:bg-slate-500' : 'bg-orange-100 dark:bg-slate-700'}`}
                  >
                    <ArrowRightLeft
                      size={10}
                      className={isJointSelected ? 'text-white' : 'text-orange-500 dark:text-slate-300'}
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
                        className={`p-0.5 rounded ${
                          isJointSelected
                            ? 'hover:bg-orange-400'
                            : 'hover:bg-slate-200 dark:hover:bg-slate-700'
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
