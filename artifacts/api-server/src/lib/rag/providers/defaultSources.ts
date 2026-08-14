import { registerProvider, createProvider } from "./knowledgeSourceProvider";

// WHO Guidelines
registerProvider(createProvider({
  slug: "who",
  name: "WHO Guidelines",
  organization: "World Health Organization",
  description: "WHO clinical practice guidelines and evidence-based recommendations",
  fetchDocuments: async () => [],
  fetchContent: async () => "WHO guideline content will be populated via document upload.",
}));

// CDC Guidelines
registerProvider(createProvider({
  slug: "cdc",
  name: "CDC Guidelines",
  organization: "Centers for Disease Control and Prevention",
  description: "CDC clinical guidelines, health alerts, and prevention recommendations",
  fetchDocuments: async () => [],
  fetchContent: async () => "CDC guideline content will be populated via document upload.",
}));

// NICE Clinical Guidelines
registerProvider(createProvider({
  slug: "nice",
  name: "NICE Clinical Guidelines",
  organization: "National Institute for Health and Care Excellence",
  description: "NICE evidence-based clinical guidelines and quality standards",
  fetchDocuments: async () => [],
  fetchContent: async () => "NICE guideline content will be populated via document upload.",
}));

// NIH Resources
registerProvider(createProvider({
  slug: "nih",
  name: "NIH Resources",
  organization: "National Institutes of Health",
  description: "NIH health information, research findings, and medical guidelines",
  fetchDocuments: async () => [],
  fetchContent: async () => "NIH resource content will be populated via document upload.",
}));

// MedlinePlus
registerProvider(createProvider({
  slug: "medlineplus",
  name: "MedlinePlus",
  organization: "U.S. National Library of Medicine",
  description: "MedlinePlus trusted health information and medical encyclopedia",
  fetchDocuments: async () => [],
  fetchContent: async () => "MedlinePlus content will be populated via document upload.",
}));

// Open Medical Textbooks
registerProvider(createProvider({
  slug: "open-textbooks",
  name: "Open Medical Textbooks",
  organization: "Open Medical Education",
  description: "Open-access medical textbooks and educational resources",
  fetchDocuments: async () => [],
  fetchContent: async () => "Textbook content will be populated via document upload.",
}));
