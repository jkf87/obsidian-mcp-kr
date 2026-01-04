import { promises as fs } from "fs";
import path from "path";
import { getAllMarkdownFiles } from "./files.js";

interface LinkUpdateOptions {
  filePath: string;
  oldPath: string;
  newPath?: string;
  isMovedToOtherVault?: boolean;
  isMovedFromOtherVault?: boolean;
  sourceVaultName?: string;
  destVaultName?: string;
}

/**
 * Updates markdown links in a file
 * @returns true if any links were updated
 */
export async function updateLinksInFile({
  filePath,
  oldPath,
  newPath,
  isMovedToOtherVault,
  isMovedFromOtherVault,
  sourceVaultName,
  destVaultName
}: LinkUpdateOptions): Promise<boolean> {
  const content = await fs.readFile(filePath, "utf-8");
  
  const oldName = path.basename(oldPath, ".md");
  const newName = newPath ? path.basename(newPath, ".md") : null;
  
  let newContent: string;
  
  if (isMovedToOtherVault) {
    // Handle move to another vault - add vault reference
    newContent = content
      .replace(
        new RegExp(`\\[\\[${oldName}(\\|[^\\]]*)?\\]\\]`, "g"),
        `[[${destVaultName}/${oldName}$1]]`
      )
      .replace(
        new RegExp(`\\[([^\\]]*)\\]\\(${oldName}\\.md\\)`, "g"),
        `[$1](${destVaultName}/${oldName}.md)`
      );
  } else if (isMovedFromOtherVault) {
    // Handle move from another vault - add note about original location
    newContent = content
      .replace(
        new RegExp(`\\[\\[${oldName}(\\|[^\\]]*)?\\]\\]`, "g"),
        `[[${newName}$1]] *(moved from ${sourceVaultName})*`
      )
      .replace(
        new RegExp(`\\[([^\\]]*)\\]\\(${oldName}\\.md\\)`, "g"),
        `[$1](${newName}.md) *(moved from ${sourceVaultName})*`
      );
  } else if (!newPath) {
    // Handle deletion - strike through the links
    newContent = content
      .replace(
        new RegExp(`\\[\\[${oldName}(\\|[^\\]]*)?\\]\\]`, "g"),
        `~~[[${oldName}$1]]~~`
      )
      .replace(
        new RegExp(`\\[([^\\]]*)\\]\\(${oldName}\\.md\\)`, "g"),
        `~~[$1](${oldName}.md)~~`
      );
  } else {
    // Handle move/rename within same vault
    newContent = content
      .replace(
        new RegExp(`\\[\\[${oldName}(\\|[^\\]]*)?\\]\\]`, "g"),
        `[[${newName}$1]]`
      )
      .replace(
        new RegExp(`\\[([^\\]]*)\\]\\(${oldName}\\.md\\)`, "g"),
        `[$1](${newName}.md)`
      );
  }

  if (content !== newContent) {
    await fs.writeFile(filePath, newContent, "utf-8");
    return true;
  }
  
  return false;
}

/**
 * Updates all markdown links in the vault after a note is moved or deleted
 * @returns number of files updated
 */
export async function updateVaultLinks(
  vaultPath: string,
  oldPath: string | null | undefined,
  newPath: string | null | undefined,
  sourceVaultName?: string,
  destVaultName?: string
): Promise<number> {
  const files = await getAllMarkdownFiles(vaultPath);
  let updatedFiles = 0;

  // Determine the type of operation
  const isMovedToOtherVault: boolean = Boolean(oldPath !== null && newPath === null && sourceVaultName && destVaultName);
  const isMovedFromOtherVault: boolean = Boolean(oldPath === null && newPath !== null && sourceVaultName && destVaultName);

  for (const file of files) {
    // Skip the target file itself if it's a move operation
    if (newPath && file === path.join(vaultPath, newPath)) continue;
    
    if (await updateLinksInFile({
      filePath: file,
      oldPath: oldPath || "",
      newPath: newPath || undefined,
      isMovedToOtherVault,
      isMovedFromOtherVault,
      sourceVaultName,
      destVaultName
    })) {
      updatedFiles++;
    }
  }

  return updatedFiles;
}
