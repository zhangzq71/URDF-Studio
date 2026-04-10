import { useCallback, useRef } from 'react';
import { generateURDF } from '@/core/parsers';
import { rewriteRobotMeshPathsForSource } from '@/core/parsers/meshPathUtils';
import type { RobotData, RobotFile } from '@/types';
import { useAssetsStore } from '@/store';
import { parseEditableRobotSourceWithWorker } from './robotImportWorkerBridge';
import type { SourceCodeDocumentChangeTarget } from '@/app/utils/sourceCodeDocuments';

interface UseEditableSourceCodeApplyOptions {
  allFileContents: Record<string, string>;
  availableFiles: RobotFile[];
  selectedFile: RobotFile | null;
  setAllFileContents: (contents: Record<string, string>) => void;
  setAvailableFiles: (files: RobotFile[]) => void;
  setOriginalUrdfContent: (content: string | null) => void;
  setRobot: (
    data: RobotData,
    options?: { label?: string; resetHistory?: boolean; skipHistory?: boolean },
  ) => void;
  setSelectedFile: (file: RobotFile | null) => void;
}

export function useEditableSourceCodeApply({
  allFileContents,
  availableFiles,
  selectedFile,
  setAllFileContents,
  setAvailableFiles,
  setOriginalUrdfContent,
  setRobot,
  setSelectedFile,
}: UseEditableSourceCodeApplyOptions) {
  const editableSourceParseRequestRef = useRef(0);

  const syncSelectedEditableFileContent = useCallback(
    (targetFileName: string, content: string) => {
      if (selectedFile?.name === targetFileName && selectedFile.content !== content) {
        setSelectedFile({
          ...selectedFile,
          content,
        });
      }

      if (
        availableFiles.some((entry) => entry.name === targetFileName && entry.content !== content)
      ) {
        setAvailableFiles(
          availableFiles.map((entry) =>
            entry.name === targetFileName ? { ...entry, content } : entry,
          ),
        );
      }

      if (allFileContents[targetFileName] !== content) {
        setAllFileContents({
          ...allFileContents,
          [targetFileName]: content,
        });
      }
    },
    [
      allFileContents,
      availableFiles,
      selectedFile,
      setAllFileContents,
      setAvailableFiles,
      setSelectedFile,
    ],
  );

  const handleCodeChange = useCallback(
    async (
      newCode: string,
      target: SourceCodeDocumentChangeTarget | undefined = undefined,
    ): Promise<boolean> => {
      if (!selectedFile || selectedFile.format === 'usd') {
        return false;
      }

      const sourceFile = selectedFile;
      const targetFileName = target?.name ?? sourceFile.name;
      const requestId = ++editableSourceParseRequestRef.current;
      const nextAllFileContents =
        allFileContents[targetFileName] === newCode
          ? allFileContents
          : {
              ...allFileContents,
              [targetFileName]: newCode,
            };
      const nextAvailableFiles = availableFiles.map((entry) =>
        entry.name === targetFileName ? { ...entry, content: newCode } : entry,
      );
      const nextSourceContent =
        targetFileName === sourceFile.name
          ? newCode
          : (nextAllFileContents[sourceFile.name] ??
            nextAvailableFiles.find((entry) => entry.name === sourceFile.name)?.content ??
            sourceFile.content);

      try {
        const parsedState = await parseEditableRobotSourceWithWorker({
          file: sourceFile,
          content: nextSourceContent,
          availableFiles: nextAvailableFiles,
          allFileContents: nextAllFileContents,
        });

        if (requestId !== editableSourceParseRequestRef.current) {
          return false;
        }

        if (useAssetsStore.getState().selectedFile?.name !== sourceFile.name) {
          return false;
        }

        const nextState = parsedState
          ? rewriteRobotMeshPathsForSource(parsedState, sourceFile.name)
          : null;
        if (!nextState) {
          return false;
        }

        syncSelectedEditableFileContent(targetFileName, newCode);

        if (sourceFile.format === 'xacro') {
          setOriginalUrdfContent(generateURDF(nextState, { preserveMeshPaths: true }));
        }

        setRobot({
          name: nextState.name,
          links: nextState.links,
          joints: nextState.joints,
          rootLinkId: nextState.rootLinkId,
          materials: nextState.materials,
        });
        return true;
      } catch (error) {
        if (requestId !== editableSourceParseRequestRef.current) {
          return false;
        }

        console.error('[useEditableSourceCodeApply] Failed to parse editable source:', error);
        return false;
      }
    },
    [
      allFileContents,
      availableFiles,
      selectedFile,
      setOriginalUrdfContent,
      setRobot,
      syncSelectedEditableFileContent,
    ],
  );

  return {
    handleCodeChange,
  };
}
