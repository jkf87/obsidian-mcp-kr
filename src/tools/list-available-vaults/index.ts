import { createToolResponse } from "../../utils/responses.js";
import { createToolNoArgs } from "../../utils/tool-factory.js";

export const createListAvailableVaultsTool = (vaults: Map<string, string>) => {
  return createToolNoArgs({
    name: "list-available-vaults",
    description: "Lists all available vaults that can be used with other tools",
    handler: async () => {
      const availableVaults = Array.from(vaults.keys());
      
      if (availableVaults.length === 0) {
        return createToolResponse("No vaults are currently available");
      }
      
      const message = [
        "Available vaults:",
        ...availableVaults.map(vault => `  - ${vault}`)
      ].join('\n');
      
      return createToolResponse(message);
    }
  }, vaults);
}
