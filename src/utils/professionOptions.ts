export interface SelectOption {
  label: string;
  value: string;
}

export const professionOptions: SelectOption[] = [
  { label: 'גילוי נזילות', value: 'leak_detection' },
  { label: 'אינסטלציה', value: 'plumber' },
  { label: 'חשמלאי', value: 'electrician' },
  { label: 'שיפוצים', value: 'renovation' },
  { label: 'גגות', value: 'roofing' },
  { label: 'מיזוג אוויר', value: 'ac' },
  { label: 'איטום', value: 'waterproofing' },
  { label: 'טכנאי כללי', value: 'general_technician' },
];

export const roleOptions: SelectOption[] = [
  { label: 'טכנאי', value: 'technician' },
  { label: 'מנהל', value: 'admin' },
];

export function getProfessionLabel(value: string): string {
  return professionOptions.find((p) => p.value === value)?.label ?? value;
}

export function getRoleLabel(value: string): string {
  return roleOptions.find((r) => r.value === value)?.label ?? value;
}
