export type LegalBlock =
  | { type: "text"; text: string }
  | { type: "list"; items: string[] }
  | { type: "contact"; text: string; email: string };

export type LegalSection = { title: string; blocks: LegalBlock[] };

export type LegalDocument = {
  title: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
};
