import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "fs";

export interface VaultResource {
  uri: string;
  name: string;
  mimeType: string;
  description?: string;
  metadata?: {
    path: string;
    isAccessible: boolean;
  };
}

export interface VaultListResource {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
  metadata?: {
    totalVaults: number;
    vaults: Array<{
      name: string;
      path: string;
      isAccessible: boolean;
    }>;
  };
}

export async function getVaultMetadata(vaultPath: string): Promise<{
  isAccessible: boolean;
}> {
  try {
    await fs.access(vaultPath);
    return {
      isAccessible: true
    };
  } catch {
    return {
      isAccessible: false
    };
  }
}

export async function listVaultResources(vaults: Map<string, string>): Promise<(VaultResource | VaultListResource)[]> {
  const resources: (VaultResource | VaultListResource)[] = [];

  // Add root resource that lists all vaults
  const vaultList: VaultListResource = {
    uri: "obsidian-vault://",
    name: "Available Vaults",
    mimeType: "application/json",
    description: "List of all available Obsidian vaults and their access status",
    metadata: {
      totalVaults: vaults.size,
      vaults: []
    }
  };

  // Process each vault
  for (const [vaultName, vaultPath] of vaults.entries()) {
    try {
      const metadata = await getVaultMetadata(vaultPath);

      // Add to vault list
      vaultList.metadata?.vaults.push({
        name: vaultName,
        path: vaultPath,
        isAccessible: metadata.isAccessible
      });

      // Add individual vault resource
      resources.push({
        uri: `obsidian-vault://${vaultName}`,
        name: vaultName,
        mimeType: "application/json",
        description: `Access information for the ${vaultName} vault`,
        metadata: {
          path: vaultPath,
          isAccessible: metadata.isAccessible
        }
      });
    } catch (error) {
      console.error(`Error processing vault ${vaultName}:`, error);
      // Still add to vault list but mark as inaccessible
      vaultList.metadata?.vaults.push({
        name: vaultName,
        path: vaultPath,
        isAccessible: false
      });
    }
  }

  // Add vault list as first resource
  resources.unshift(vaultList);

  return resources;
}

export async function readVaultResource(
  vaults: Map<string, string>,
  uri: string
): Promise<{ uri: string; mimeType: string; text: string }> {
  const vaultName = uri.replace("obsidian-vault://", "");
  const vaultPath = vaults.get(vaultName);

  if (!vaultPath) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Unknown vault: ${vaultName}`
    );
  }

  const metadata = await getVaultMetadata(vaultPath);

  return {
    uri,
    mimeType: "application/json",
    text: JSON.stringify({
      name: vaultName,
      path: vaultPath,
      isAccessible: metadata.isAccessible
    }, null, 2)
  };
}
