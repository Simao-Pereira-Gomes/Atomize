export type AtoFieldType =
  | 'string'    // String (0), PlainText (3), Html (4)
  | 'integer'   // Integer (1), PicklistInteger (12)
  | 'decimal'   // Double (7), PicklistDouble (13)
  | 'boolean'   // Boolean (9)
  | 'identity'  // Identity (10)
  | 'datetime'  // DateTime (2)

export interface ADoFieldSchema {
  referenceName: string;
  name: string;
  type: AtoFieldType;
  isCustom: boolean;
  isReadOnly: boolean;
  isMultiline: boolean;
  isPicklist: boolean;
  allowedValues?: string[];
}
