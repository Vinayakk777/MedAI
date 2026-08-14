import { AgentDefinition } from "./types";

const agentRegistry = new Map<string, AgentDefinition>();

export function registerAgent(agent: AgentDefinition): void {
  agentRegistry.set(agent.name, agent);
}

export function getAgent(name: string): AgentDefinition | undefined {
  return agentRegistry.get(name);
}

export function getAllAgents(): AgentDefinition[] {
  return Array.from(agentRegistry.values());
}

export function getAgentsByNames(names: string[]): AgentDefinition[] {
  return names.map((n) => agentRegistry.get(n)).filter(Boolean) as AgentDefinition[];
}

export function getPipelineAgents(pipelineStages: string[]): AgentDefinition[] {
  return getAgentsByNames(pipelineStages);
}
