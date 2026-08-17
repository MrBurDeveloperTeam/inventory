const fs = require('fs');

const inventoryPath = 'c:\\Snabbb-Inventory\\inventory\\VirtualPet\\components\\LevelIndicator.tsx';
const snabbSuperappPath = 'C:\\Snabbb-app\\snabb-superapp\\VirtualPet\\components\\LevelIndicator.tsx';

// Apps using the simple template (like Inventory)
const simpleTemplatePaths = [
  'C:\\Snabbb-Appointment\\appointment\\src\\VirtualPet\\components\\LevelIndicator.tsx',
];

// Apps using the color template (like snabb-superapp)
const colorTemplatePaths = [
  'C:\\Snabbb-Calculator\\calculator\\VirtualPet\\components\\LevelIndicator.tsx',
  'C:\\Snabbb-Todo\\todo\\VirtualPet\\components\\LevelIndicator.tsx',
  'C:\\Snabbb-Elearning\\E-learning\\src\\VirtualPet\\components\\LevelIndicator.tsx',
];

try {
    const simpleTemplate = fs.readFileSync(inventoryPath, 'utf8');
    for (const path of simpleTemplatePaths) {
        if (fs.existsSync(path)) {
            fs.writeFileSync(path, simpleTemplate);
            console.log(`Updated ${path}`);
        }
    }

    const colorTemplate = fs.readFileSync(snabbSuperappPath, 'utf8');
    for (const path of colorTemplatePaths) {
        if (fs.existsSync(path)) {
            fs.writeFileSync(path, colorTemplate);
            console.log(`Updated ${path}`);
        }
    }
} catch (e) {
    console.error(e);
}
