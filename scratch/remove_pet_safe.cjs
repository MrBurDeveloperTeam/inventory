const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'C:\\Snabbb-app\\snabb-superapp\\App.tsx',
  'C:\\Snabbb-Calculator\\calculator\\App.tsx',
  'C:\\Snabbb-Todo\\todo\\src\\pages\\Home.tsx',
  'C:\\Snabbb-Elearning\\E-learning\\src\\components\\layout\\Navbar.tsx',
  'C:\\Snabbb-ImageGenerator\\Image-generator\\src\\components\\layout\\AppNavbar.tsx',
  'C:\\Snabbb-Inventory\\inventory\\Header.tsx',
  'C:\\Snabbb-Inventory\\inventory\\AdminDashboard\\Header.tsx' // if exists
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
      
      // Remove loadPetSelection / syncPetSelection
      content = content.replace(/const syncPetSelection = async[\s\S]*?}, \[isLoggedIn\]\);\s*/g, '');
      content = content.replace(/const loadPetSelection = async[\s\S]*?}, \[user\?\.id\]\);\s*/g, '');
      
      // Remove handlePetSelect
      content = content.replace(/const handlePetSelect = async[\s\S]*?};/g, '');
      
      // Remove renderPetPreview
      content = content.replace(/const renderPetPreview =[\s\S]*?\);\s*/g, '');
      
      // Remove setAccountMenuView('main')
      content = content.replace(/setAccountMenuView\('main'\);/g, '');
      
      // Replace the pet ternary menu
      const startTernary = "{accountMenuView === 'pets' ? (";
      const midTernary = ") : (";
      const startIdx = content.indexOf(startTernary);
      if (startIdx !== -1) {
          const midIdx = content.indexOf(midTernary, startIdx);
          if (midIdx !== -1) {
              // Delete from startTernary up to and including midTernary
              const beforeTernary = content.substring(0, startIdx);
              // Also we need to remove the first `<>` after `) : (`
              const afterMid = content.substring(midIdx + midTernary.length);
              // Find the `)}` that closes the ternary. It should be right before `</motion.div>` or `</div>`
              // To do this safely, let's just use Regex to remove the pet button and the ternary syntax.
          }
      }
      
      // Regex for pet button:
      content = content.replace(/<button\s+type="button"\s+onClick=\{\(\) => setAccountMenuView\('pets'\)\}[\s\S]*?<\/button>\s*/g, '');
      
      // Regex for ternary:
      // We will match `{accountMenuView === 'pets' ? ( <...> ) : (` and remove it.
      content = content.replace(/\{accountMenuView === 'pets' \? \([\s\S]*?\) : \(\s*(?:<>\s*)?/g, '');
      
      // We also need to remove the closing `)}` or `</> )}`.
      content = content.replace(/<\/>\s*\)\}\s*<\/motion\.div>/g, '</motion.div>');
      content = content.replace(/<\/>\s*\)\}\s*<\/div>/g, '</div>');
      content = content.replace(/\)\}\s*<\/motion\.div>/g, '</motion.div>');
      content = content.replace(/\)\}\s*<\/div>/g, '</div>');
      
      fs.writeFileSync(filePath, content);
      console.log(`Updated ${filePath}`);
    }
  }
}

run().catch(console.error);
