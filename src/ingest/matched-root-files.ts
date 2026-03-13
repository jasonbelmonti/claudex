import type { DiscoveryRootConfig } from "./discovery";
import { readSourceFileState, type SourceFileState } from "./file-state";
import { listDiscoveryRootFiles } from "./root-files";
import { selectRegistryForFile, type RegistrySelection } from "./registry-selection";
import type { IngestProviderRegistry } from "./registry";

export type MatchedRootFile = {
  filePath: string;
  selection: RegistrySelection;
  fileState: SourceFileState;
};

export type UnavailableRootFile = {
  filePath: string;
  selection: RegistrySelection;
};

export type MatchedRootFilesResult = {
  files: MatchedRootFile[];
  unavailableFiles: UnavailableRootFile[];
};

export async function listMatchedRootFiles(
  root: DiscoveryRootConfig,
  registries: IngestProviderRegistry[],
): Promise<MatchedRootFilesResult | null> {
  const files = await listDiscoveryRootFiles(root).catch(() => null);

  if (!files) {
    return null;
  }

  const matchedFiles: MatchedRootFile[] = [];
  const unavailableFiles: UnavailableRootFile[] = [];

  for (const filePath of files) {
    const selection = selectRegistryForFile(registries, root, filePath);

    if (!selection) {
      continue;
    }

    const fileState = await readSourceFileState(filePath);

    if (!fileState) {
      unavailableFiles.push({
        filePath,
        selection,
      });
      continue;
    }

    matchedFiles.push({
      filePath,
      selection,
      fileState,
    });
  }

  return {
    files: matchedFiles,
    unavailableFiles,
  };
}
