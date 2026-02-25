import React from 'react';
import { Cuboid, File, FileCode, Folder, FolderOpen } from 'lucide-react';
import type { RobotFile } from '@/types';

export interface FileTreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: FileTreeNode[];
  file?: RobotFile;
}

// Build a tree structure from flat file list
export function buildFileTree(files: RobotFile[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const file of files) {
    const parts = file.name.split('/').filter((part) => part.length > 0);
    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      let existing = currentLevel.find((node) => node.name === part);

      if (!existing) {
        const newNode: FileTreeNode = {
          name: part,
          path: currentPath,
          isFolder: !isLast,
          children: isLast ? undefined : [],
          file: isLast ? file : undefined,
        };

        currentLevel.push(newNode);
        existing = newNode;
      }

      if (!isLast && existing.children) {
        currentLevel = existing.children;
      }
    }
  }

  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes
      .sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((node) => ({
        ...node,
        children: node.children ? sortNodes(node.children) : undefined,
      }));
  };

  return sortNodes(root);
}

// Get file icon based on extension
export function getFileIcon(filename: string, isFolder: boolean, isOpen: boolean): React.ReactNode {
  if (isFolder) {
    return isOpen
      ? React.createElement(FolderOpen, { className: 'w-3.5 h-3.5 text-amber-500' })
      : React.createElement(Folder, { className: 'w-3.5 h-3.5 text-amber-500' });
  }

  const ext = filename.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'urdf':
      return React.createElement(FileCode, { className: 'w-3.5 h-3.5 text-system-blue' });
    case 'xacro':
      return React.createElement(FileCode, { className: 'w-3.5 h-3.5 text-text-secondary' });
    case 'xml':
      return React.createElement(FileCode, { className: 'w-3.5 h-3.5 text-orange-500' });
    case 'dae':
    case 'stl':
    case 'obj':
      return React.createElement(Cuboid, { className: 'w-3.5 h-3.5 text-green-500' });
    default:
      return React.createElement(File, { className: 'w-3.5 h-3.5 text-text-tertiary' });
  }
}
