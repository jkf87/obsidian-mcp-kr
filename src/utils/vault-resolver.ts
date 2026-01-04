import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export interface VaultResolutionResult {
  vaultPath: string;
  vaultName: string;
}

export interface DualVaultResolutionResult {
  source: VaultResolutionResult;
  destination: VaultResolutionResult;
  isCrossVault: boolean;
}

export class VaultResolver {
  private vaults: Map<string, string>;
  constructor(vaults: Map<string, string>) {
    if (!vaults || vaults.size === 0) {
      throw new Error("At least one vault is required");
    }
    this.vaults = vaults;
  }

  /**
   * Resolves a single vault name to its path and validates it exists
   */
  resolveVault(vaultName: string): VaultResolutionResult {
    const vaultPath = this.vaults.get(vaultName);

    if (!vaultPath) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown vault: ${vaultName}. Available vaults: ${Array.from(this.vaults.keys()).join(', ')}`
      );
    }

    return { vaultPath, vaultName };
  }

  /**
   * Resolves source and destination vaults for operations that work across vaults
   */
  // NOT IN USE

  /*
  resolveDualVaults(sourceVault: string, destinationVault: string): DualVaultResolutionResult {
    const source = this.resolveVault(sourceVault);
    const destination = this.resolveVault(destinationVault);
    const isCrossVault = sourceVault !== destinationVault;

    return {
      source,
      destination,
      isCrossVault
    };
  }
    */

  /**
   * Returns a list of available vault names
   */
  getAvailableVaults(): string[] {
    return Array.from(this.vaults.keys());
  }
}
