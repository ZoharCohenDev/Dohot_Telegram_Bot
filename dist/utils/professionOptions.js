"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roleOptions = exports.professionOptions = void 0;
exports.getProfessionLabel = getProfessionLabel;
exports.getRoleLabel = getRoleLabel;
exports.professionOptions = [
    { label: 'גילוי נזילות', value: 'leak_detection' },
    { label: 'אינסטלציה', value: 'plumber' },
    { label: 'חשמלאי', value: 'electrician' },
    { label: 'שיפוצים', value: 'renovation' },
    { label: 'גגות', value: 'roofing' },
    { label: 'מיזוג אוויר', value: 'ac' },
    { label: 'איטום', value: 'waterproofing' },
    { label: 'טכנאי כללי', value: 'general_technician' },
];
exports.roleOptions = [
    { label: 'טכנאי', value: 'technician' },
    { label: 'מנהל', value: 'admin' },
];
function getProfessionLabel(value) {
    return exports.professionOptions.find((p) => p.value === value)?.label ?? value;
}
function getRoleLabel(value) {
    return exports.roleOptions.find((r) => r.value === value)?.label ?? value;
}
//# sourceMappingURL=professionOptions.js.map