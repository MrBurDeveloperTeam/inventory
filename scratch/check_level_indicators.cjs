const { execSync } = require('child_process');
const fs = require('fs');

const apps = [
  { name: 'Appointment', path: 'C:\\Snabbb-Appointment\\appointment\\src\\VirtualPet\\components\\LevelIndicator.tsx' },
  { name: 'Calculator', path: 'C:\\Snabbb-Calculator\\calculator\\VirtualPet\\components\\LevelIndicator.tsx' },
  { name: 'Todo', path: 'C:\\Snabbb-Todo\\todo\\VirtualPet\\components\\LevelIndicator.tsx' },
  { name: 'Elearning', path: 'C:\\Snabbb-Elearning\\E-learning\\src\\VirtualPet\\components\\LevelIndicator.tsx' },
  { name: 'ImageGenerator', path: 'C:\\Snabbb-ImageGenerator\\Image-generator\\src\\VirtualPet\\components\\LevelIndicator.tsx' },
];

for (const app of apps) {
  if (fs.existsSync(app.path)) {
    const content = fs.readFileSync(app.path, 'utf8');
    const hasColors = content.includes('COLORS');
    const hasPetName = content.includes('petName');
    const hasOnColorChange = content.includes('onColorChange');
    const lineCount = content.split('\n').length;
    console.log(`=== ${app.name} ===`);
    console.log(`  hasColors: ${hasColors}, hasPetName: ${hasPetName}, hasOnColorChange: ${hasOnColorChange}, lines: ${lineCount}`);
  } else {
    console.log(`=== ${app.name} - NOT FOUND ===`);
  }
}
