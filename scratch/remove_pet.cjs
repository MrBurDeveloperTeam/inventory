const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'C:\\Snabbb-app\\snabb-superapp\\App.tsx',
  'C:\\Snabbb-Calculator\\calculator\\App.tsx',
  'C:\\Snabbb-Todo\\todo\\src\\pages\\Home.tsx',
  'C:\\Snabbb-Elearning\\E-learning\\src\\components\\layout\\Navbar.tsx',
  'C:\\Snabbb-ImageGenerator\\Image-generator\\src\\components\\layout\\AppNavbar.tsx'
];

async function run() {
  for (const filePath of filesToPatch) {
    if (fs.existsSync(filePath)) {
      console.log(`Processing ${filePath}`);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Remove imports
      content = content.replace(/import { PET_OPTIONS.*\} from '.\/VirtualPet\/petOptions';/g, '');
      content = content.replace(/import { PET_OPTIONS.*\} from '\.\/VirtualPet\/petOptions';/g, '');
      content = content.replace(/import { PET_OPTIONS.*\} from '\.\.\/VirtualPet\/petOptions';/g, '');
      content = content.replace(/import { PET_OPTIONS.*\} from '\.\.\/\.\.\/VirtualPet\/petOptions';/g, '');
      
      // Remove states
      content = content.replace(/const \[accountMenuView, setAccountMenuView\] = useState<'main' \| 'pets'>\('main'\);\s*/g, '');
      content = content.replace(/const \[selectedPetId, setSelectedPetId\] = useState.*\n/g, '');
      content = content.replace(/const \[isSavingPet, setIsSavingPet\] = useState\(false\);\s*/g, '');
      content = content.replace(/const selectedPet = getPetOption\(selectedPetId\);\s*/g, '');
      
      // Remove loadPetSelection
      content = content.replace(/const syncPetSelection = async[\s\S]*?}, \[isLoggedIn\]\);\s*/g, '');
      content = content.replace(/const loadPetSelection = async[\s\S]*?}, \[user\?\.id\]\);\s*/g, '');
      
      // Remove handlePetSelect
      content = content.replace(/const handlePetSelect = async[\s\S]*?};/g, '');
      
      // Remove renderPetPreview
      content = content.replace(/const renderPetPreview =[\s\S]*?\);\s*/g, '');
      
      // Remove setAccountMenuView('main')
      content = content.replace(/setAccountMenuView\('main'\);/g, '');
      
      // Remove pet menu button
      content = content.replace(/<button[\s\S]*?onClick=\{\(\) => setAccountMenuView\('pets'\)\}[\s\S]*?<\/button>\s*/g, '');
      
      // Remove pet grid UI
      content = content.replace(/{accountMenuView === 'pets' \? \([\s\S]*?\) : \(\s*<>\s*/g, '');
      
      // Fix ending fragments
      content = content.replace(/<\/>\s*\)\}/g, '');
      
      fs.writeFileSync(filePath, content);
      console.log(`Updated ${filePath}`);
    } else {
        console.log(`Not found ${filePath}`);
    }
  }
}

run().catch(console.error);
