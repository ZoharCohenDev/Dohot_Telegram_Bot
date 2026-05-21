export interface SelectOption {
    label: string;
    value: string;
}
export declare const professionOptions: SelectOption[];
export declare const roleOptions: SelectOption[];
export declare function getProfessionLabel(value: string): string;
export declare function getRoleLabel(value: string): string;
