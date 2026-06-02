export type Primitive =
  | "string"
  | "integer"
  | "boolean"
  | "bytes"
  | "blob"
  | "cid-link"
  | "cid"
  | "datetime"
  | "at-uri"
  | "uri"
  | "at-identifier"
  | "did";

export type TypeRef =
  | { kind: "primitive"; name: Primitive }
  | { kind: "array"; items: TypeRef }
  | { kind: "ref"; targetId: string }
  | { kind: "union"; options: string[] }
  | { kind: "unknown" };

export interface Field {
  name: string;
  description?: string;
  required: boolean;
  type: TypeRef;
}

export interface NamedType {
  name: string;
  description?: string;
  fields: Field[];
}

export interface Registry {
  types: NamedType[];
  refMap: Map<string, string>;
}
