import { MedicalKnowledgeProvider, ProviderDocumentMeta } from "../types";

const providerRegistry = new Map<string, MedicalKnowledgeProvider>();

export function registerProvider(provider: MedicalKnowledgeProvider): void {
  providerRegistry.set(provider.slug, provider);
}

export function getProvider(slug: string): MedicalKnowledgeProvider | undefined {
  return providerRegistry.get(slug);
}

export function getAllProviders(): MedicalKnowledgeProvider[] {
  return Array.from(providerRegistry.values());
}

export function getActiveProviders(): MedicalKnowledgeProvider[] {
  return getAllProviders();
}

export async function fetchFromProvider(provider: MedicalKnowledgeProvider): Promise<ProviderDocumentMeta[]> {
  try {
    const isValid = await provider.validateSource();
    if (!isValid) {
      return [];
    }
    return await provider.fetchDocumentList();
  } catch {
    return [];
  }
}

// Utility for creating inline providers
export function createProvider(config: {
  slug: string;
  name: string;
  organization: string;
  description: string;
  fetchDocuments: () => Promise<ProviderDocumentMeta[]>;
  fetchContent: (meta: ProviderDocumentMeta) => Promise<string>;
}): MedicalKnowledgeProvider {
  return {
    slug: config.slug,
    name: config.name,
    organization: config.organization,
    description: config.description,
    fetchDocumentList: config.fetchDocuments,
    fetchDocumentContent: config.fetchContent,
    validateSource: async () => true,
  };
}
