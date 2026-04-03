import type { Dispatch, MouseEvent, SetStateAction } from 'react';
import {
  getCollisionGeometryByObjectIndex,
  removeCollisionGeometryByObjectIndex,
} from '@/core/robot';
import { matchesSelection, type Selection } from '@/store/selectionStore';
import { GeometryType, type RobotState } from '@/types';
import type {
  TreeNodeContextMenuState,
  TreeNodeContextMenuTarget,
  TreeNodeEditingTarget,
} from './types';

interface UseTreeNodeActionsParams {
  linkId: string;
  link: RobotState['links'][string];
  childJointsById: Record<string, RobotState['joints'][string]>;
  selection: Selection;
  isVisualVisible: boolean;
  isPrimaryCollisionVisible: boolean;
  editingTarget: TreeNodeEditingTarget | null;
  contextMenu: TreeNodeContextMenuState | null;
  onSelect: (type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => void;
  onSelectGeometry?: (
    linkId: string,
    subType: 'visual' | 'collision',
    objectIndex?: number,
  ) => void;
  onAddChild: (parentId: string) => void;
  onAddCollisionBody: (parentId: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (type: 'link' | 'joint', id: string, data: unknown) => void;
  setSelection: (selection: Selection) => void;
  setIsExpanded: Dispatch<SetStateAction<boolean>>;
  setIsGeometryExpanded: Dispatch<SetStateAction<boolean>>;
  setEditingTarget: Dispatch<SetStateAction<TreeNodeEditingTarget | null>>;
  setContextMenu: Dispatch<SetStateAction<TreeNodeContextMenuState | null>>;
}

export function useTreeNodeActions({
  linkId,
  link,
  childJointsById,
  selection,
  isVisualVisible,
  isPrimaryCollisionVisible,
  editingTarget,
  contextMenu,
  onSelect,
  onSelectGeometry,
  onAddChild,
  onAddCollisionBody,
  onDelete,
  onUpdate,
  setSelection,
  setIsExpanded,
  setIsGeometryExpanded,
  setEditingTarget,
  setContextMenu,
}: UseTreeNodeActionsParams) {
  const handleSelectVisual = () => {
    setIsGeometryExpanded(true);
    if (onSelectGeometry) {
      onSelectGeometry(linkId, 'visual', 0);
      return;
    }
    onSelect('link', linkId, 'visual');
  };

  const handleSelectPrimaryCollision = () => {
    setIsGeometryExpanded(true);
    if (onSelectGeometry) {
      onSelectGeometry(linkId, 'collision', 0);
      return;
    }
    onSelect('link', linkId, 'collision');
  };

  const handleSelectCollisionBody = (objectIndex: number) => {
    setIsGeometryExpanded(true);
    if (onSelectGeometry) {
      onSelectGeometry(linkId, 'collision', objectIndex);
      return;
    }
    onSelect('link', linkId, 'collision');
  };

  const toggleVisualVisibility = (event: MouseEvent) => {
    event.stopPropagation();
    onUpdate('link', linkId, {
      ...link,
      visual: {
        ...link.visual,
        visible: !isVisualVisible,
      },
    });
  };

  const togglePrimaryCollisionVisibility = (event: MouseEvent) => {
    event.stopPropagation();
    onUpdate('link', linkId, {
      ...link,
      collision: {
        ...link.collision,
        visible: !isPrimaryCollisionVisible,
      },
    });
  };

  const toggleCollisionBodyVisibility = (event: MouseEvent, bodyIndex: number) => {
    event.stopPropagation();
    const nextBodies = [...(link.collisionBodies || [])];
    const targetBody = nextBodies[bodyIndex];
    if (!targetBody) return;

    nextBodies[bodyIndex] = {
      ...targetBody,
      visible: targetBody.visible === false,
    };

    onUpdate('link', linkId, {
      ...link,
      collisionBodies: nextBodies,
    });
  };

  const beginRenaming = (type: 'link' | 'joint', id: string, currentName: string) => {
    onSelect(type, id);
    setEditingTarget({ type, id, draft: currentName });
  };

  const cancelRenaming = () => {
    setEditingTarget(null);
  };

  const commitRenaming = () => {
    if (!editingTarget) return;

    const nextName = editingTarget.draft.trim();
    if (!nextName) {
      setEditingTarget(null);
      return;
    }

    if (editingTarget.type === 'link') {
      if (editingTarget.id === linkId && link.name !== nextName) {
        onUpdate('link', editingTarget.id, { ...link, name: nextName });
      }
    } else {
      const targetJoint = childJointsById[editingTarget.id];
      if (targetJoint && targetJoint.name !== nextName) {
        onUpdate('joint', editingTarget.id, { ...targetJoint, name: nextName });
      }
    }

    setEditingTarget(null);
  };

  const updateRenameDraft = (value: string) => {
    setEditingTarget((prev) => (prev ? { ...prev, draft: value } : prev));
  };

  const handleNameDoubleClick = (
    event: MouseEvent,
    type: 'link' | 'joint',
    id: string,
    currentName: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    beginRenaming(type, id, currentName);
  };

  const openContextMenu = (event: MouseEvent, target: TreeNodeContextMenuTarget) => {
    event.preventDefault();
    event.stopPropagation();

    const menuWidth = 170;
    const menuHeight = target.type === 'geometry' ? 44 : target.type === 'link' ? 260 : 176;
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);

    setContextMenu({
      target,
      x: Math.min(event.clientX, maxX),
      y: Math.min(event.clientY, maxY),
    });
  };

  const handleRenameMenuAction = () => {
    if (!contextMenu || (contextMenu.target.type !== 'link' && contextMenu.target.type !== 'joint'))
      return;
    beginRenaming(contextMenu.target.type, contextMenu.target.id, contextMenu.target.name);
    setContextMenu(null);
  };

  const resolveContextMenuTargetLinkId = (): string | null => {
    if (!contextMenu) return null;
    if (contextMenu.target.type === 'link') return contextMenu.target.id;
    if (contextMenu.target.type === 'joint') {
      return childJointsById[contextMenu.target.id]?.childLinkId || null;
    }
    return null;
  };

  const handleAddChildMenuAction = () => {
    const targetLinkId = resolveContextMenuTargetLinkId();
    if (!targetLinkId) {
      setContextMenu(null);
      return;
    }
    onAddChild(targetLinkId);
    setIsExpanded(true);
    setContextMenu(null);
  };

  const handleDeleteMenuAction = () => {
    if (!contextMenu) return;

    if (contextMenu.target.type === 'link') {
      onDelete(contextMenu.target.id);
      setContextMenu(null);
      return;
    }

    if (contextMenu.target.type === 'joint') {
      const targetJoint = childJointsById[contextMenu.target.id];
      if (targetJoint) {
        onDelete(targetJoint.childLinkId);
      }
      setContextMenu(null);
    }
  };

  const handleAddCollisionMenuAction = () => {
    const targetLinkId = resolveContextMenuTargetLinkId();
    if (!targetLinkId) {
      setContextMenu(null);
      return;
    }
    onAddCollisionBody(targetLinkId);
    setIsGeometryExpanded(true);
    setContextMenu(null);
  };

  const handleDeleteGeometryMenuAction = () => {
    if (!contextMenu || contextMenu.target.type !== 'geometry') return;

    const { linkId: targetLinkId, subType, objectIndex } = contextMenu.target;
    const targetLink = targetLinkId === linkId ? link : null;
    if (!targetLink) {
      setContextMenu(null);
      return;
    }

    const deletedGeometrySelection = {
      type: 'link' as const,
      id: targetLinkId,
      subType,
      objectIndex,
    };
    const shouldSyncSelection = matchesSelection(selection, deletedGeometrySelection);

    if (subType === 'collision') {
      const {
        link: nextLink,
        removed,
        nextObjectIndex,
      } = removeCollisionGeometryByObjectIndex(targetLink, objectIndex);

      if (!removed) {
        setContextMenu(null);
        return;
      }

      onUpdate('link', targetLinkId, nextLink);
      if (shouldSyncSelection) {
        if (nextObjectIndex === null) {
          setSelection({ type: 'link', id: targetLinkId });
        } else {
          setSelection({
            type: 'link',
            id: targetLinkId,
            subType: 'collision',
            objectIndex: nextObjectIndex,
          });
        }
      }

      setContextMenu(null);
      return;
    }

    const geometry = targetLink.visual;
    if (geometry.type === GeometryType.NONE) {
      setContextMenu(null);
      return;
    }

    onUpdate('link', targetLinkId, {
      ...targetLink,
      visual: {
        ...geometry,
        type: GeometryType.NONE,
        meshPath: undefined,
      },
    });

    if (shouldSyncSelection) {
      setSelection({ type: 'link', id: targetLinkId });
    }

    setContextMenu(null);
  };

  const handleDeleteLinkGeometry = (subType: 'visual' | 'collision') => {
    if (!contextMenu || contextMenu.target.type !== 'link') return;

    const targetLink = contextMenu.target.id === linkId ? link : null;
    if (!targetLink) {
      setContextMenu(null);
      return;
    }

    if (subType === 'collision') {
      const hasAnyCollision =
        targetLink.collision.type !== GeometryType.NONE ||
        (targetLink.collisionBodies || []).some((body) => body.type !== GeometryType.NONE);
      if (!hasAnyCollision) {
        setContextMenu(null);
        return;
      }

      onUpdate('link', contextMenu.target.id, {
        ...targetLink,
        collision: {
          ...targetLink.collision,
          type: GeometryType.NONE,
          meshPath: undefined,
        },
        collisionBodies: [],
      });

      if (
        selection.type === 'link' &&
        selection.id === contextMenu.target.id &&
        selection.subType === 'collision'
      ) {
        setSelection({ type: 'link', id: contextMenu.target.id });
      }

      setContextMenu(null);
      return;
    }

    const geometry = targetLink[subType];
    if (!geometry || geometry.type === GeometryType.NONE) {
      setContextMenu(null);
      return;
    }

    onUpdate('link', contextMenu.target.id, {
      ...targetLink,
      [subType]: {
        ...geometry,
        type: GeometryType.NONE,
        meshPath: undefined,
      },
    });

    if (
      selection.type === 'link' &&
      selection.id === contextMenu.target.id &&
      selection.subType === 'visual'
    ) {
      setSelection({ type: 'link', id: contextMenu.target.id });
    }

    setContextMenu(null);
  };

  return {
    handleSelectVisual,
    handleSelectPrimaryCollision,
    handleSelectCollisionBody,
    toggleVisualVisibility,
    togglePrimaryCollisionVisibility,
    toggleCollisionBodyVisibility,
    commitRenaming,
    cancelRenaming,
    updateRenameDraft,
    handleNameDoubleClick,
    openContextMenu,
    handleRenameMenuAction,
    handleAddChildMenuAction,
    handleDeleteMenuAction,
    handleAddCollisionMenuAction,
    handleDeleteGeometryMenuAction,
    handleDeleteLinkGeometry,
  };
}
