const fs = require('fs');

// Apps that have: const [petName, setPetName] = useState(DEFAULT_PET_ID);
// which infers PetId type and needs a wrapper
const contextsToFix = [
  'C:\\Snabbb-Appointment\\appointment\\src\\VirtualPet\\context\\GameStateContext.tsx',
  'C:\\Snabbb-Calculator\\calculator\\VirtualPet\\context\\GameStateContext.tsx',
  'C:\\Snabbb-Todo\\todo\\VirtualPet\\context\\GameStateContext.tsx',
  'C:\\Snabbb-Elearning\\E-learning\\src\\VirtualPet\\context\\GameStateContext.tsx',
];

const TARGET = `    const [petName, setPetName] = useState(DEFAULT_PET_ID);`;
const REPLACEMENT = `    const [petName, _setPetName] = useState(DEFAULT_PET_ID);
    const setPetName = (name: string) => _setPetName(normalizePetId(name));`;

for (const filePath of contextsToFix) {
  if (!fs.existsSync(filePath)) {
    console.log(`Not found: ${filePath}`);
    continue;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('_setPetName')) {
    console.log(`Already patched: ${filePath}`);
    continue;
  }
  if (!content.includes(TARGET)) {
    console.log(`Target not found in: ${filePath}`);
    console.log(`  Looking for: ${TARGET}`);
    // Try to find variations
    const lines = content.split('\n').filter(l => l.includes('petName') && l.includes('useState'));
    console.log(`  Matching lines: ${JSON.stringify(lines)}`);
    continue;
  }
  content = content.replace(TARGET, REPLACEMENT);
  fs.writeFileSync(filePath, content);
  console.log(`Patched: ${filePath}`);
}
