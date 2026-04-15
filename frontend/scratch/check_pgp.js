import * as openpgp from 'openpgp';
console.log("Elliptic Curve Names:", Object.keys(openpgp.enums.curve || {}));
