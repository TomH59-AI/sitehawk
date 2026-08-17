import { checkZoning, getZoningDetails, listPermittedUses, runZoningFeasibility } from './zoning.js';

export async function handleToolCall(toolName, toolInput) {
  try {
    let result;
    switch (toolName) {
      case 'checkZoning':          result = await checkZoning(toolInput); break;
      case 'getZoningDetails':     result = await getZoningDetails(toolInput.districtCode, toolInput.jurisdiction); break;
      case 'listPermittedUses':    result = await listPermittedUses(toolInput.districtCode, toolInput.jurisdiction); break;
      case 'runZoningFeasibility': result = await runZoningFeasibility(toolInput); break;
      default: throw new Error(`Unknown tool: ${toolName}`);
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error in ${toolName}: ${err.message}` }], isError: true };
  }
}
