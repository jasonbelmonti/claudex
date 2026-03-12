import type { SourceFileState } from "./file-state";
import type { MatchedRootFile } from "./matched-root-files";
import type { RegistrySelection } from "./registry-selection";

export type RootSnapshotEntry = {
  filePath: string;
  selection: RegistrySelection;
  fileState: SourceFileState;
};

export type RootSnapshot = Map<string, RootSnapshotEntry>;

export type RootReconcileResult = {
  discoveredFiles: MatchedRootFile[];
  changedFiles: MatchedRootFile[];
  deletedFiles: RootSnapshotEntry[];
  nextSnapshot: RootSnapshot;
};

export function createRootSnapshot(files: MatchedRootFile[]): RootSnapshot {
  return new Map(files.map((file) => [file.filePath, toSnapshotEntry(file)]));
}

export function reconcileRootSnapshot(
  previousSnapshot: RootSnapshot | undefined,
  currentFiles: MatchedRootFile[],
): RootReconcileResult {
  const priorSnapshot = previousSnapshot ?? new Map<string, RootSnapshotEntry>();
  const nextSnapshot = createRootSnapshot(currentFiles);
  const discoveredFiles: MatchedRootFile[] = [];
  const changedFiles: MatchedRootFile[] = [];
  const deletedFiles: RootSnapshotEntry[] = [];

  for (const file of currentFiles) {
    const previousFile = priorSnapshot.get(file.filePath);

    if (!previousFile) {
      discoveredFiles.push(file);
      continue;
    }

    if (hasFileChanged(previousFile.fileState, file.fileState)) {
      changedFiles.push(file);
    }
  }

  for (const [filePath, priorFile] of priorSnapshot) {
    if (!nextSnapshot.has(filePath)) {
      deletedFiles.push(priorFile);
    }
  }

  return {
    discoveredFiles,
    changedFiles,
    deletedFiles,
    nextSnapshot,
  };
}

function hasFileChanged(previousFile: SourceFileState, currentFile: SourceFileState): boolean {
  return previousFile.fingerprint !== currentFile.fingerprint
    || previousFile.size !== currentFile.size
    || previousFile.modifiedAtMs !== currentFile.modifiedAtMs;
}

function toSnapshotEntry(file: MatchedRootFile): RootSnapshotEntry {
  return {
    filePath: file.filePath,
    selection: file.selection,
    fileState: file.fileState,
  };
}
