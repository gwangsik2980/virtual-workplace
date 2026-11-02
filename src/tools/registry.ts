import { deliveryRiskTool } from './deliveryRisk';
import { monthlyReportTool } from './monthlyReport';
import { quoteCompareTool } from './quoteCompare';
import type { ToolDefinition, ToolVersion } from './types';

/**
 * 도구 등록부. 새 도구를 만들면 여기에 추가한다. (docs/TOOL_GUIDE.md 참고)
 */
export const TOOL_REGISTRY: ToolDefinition[] = [quoteCompareTool, monthlyReportTool, deliveryRiskTool];

export function getTool(id: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((t) => t.id === id);
}

export function getToolVersion(id: string, version: string): ToolVersion | undefined {
  return getTool(id)?.versions.find((v) => v.version === version);
}
