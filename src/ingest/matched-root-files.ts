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

export async function listMatchedRootFiles(
  root: DiscoveryRootConfig,
  registries: IngestProviderRegistry[],
): Promise<MatchedRootFile[] | null> {
  const files = await listDiscoveryRootFiles(root).catch(() => null);

  if (!files) {
    return null;
  }

  const matchedFiles: MatchedRootFile[] = [];

  for (const filePath of files) {
    const selection = selectRegistryForFile(registries, root, filePath);

    if (!selection) {
      continue;
    }

    const fileState = await readSourceFileState(filePath);

    if (!fileState) {
      continue;
    }

    matchedFiles.push({
      filePath,
      selection,
      fileState,
    });
  }

  return matchedFiles;
}
