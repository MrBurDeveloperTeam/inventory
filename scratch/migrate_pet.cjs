const fs = require('fs');
const path = require('path');

const dirs = [
  'C:\\Snabbb-Appointment\\appointment\\src',
  'C:\\Snabbb-app\\snabb-superapp',
  'C:\\Snabbb-Calculator\\calculator',
  'C:\\Snabbb-Inventory\\inventory',
  'C:\\Snabbb-Todo\\todo',
  'C:\\Snabbb-Elearning\\E-learning\\src',
  'C:\\Snabbb-ImageGenerator\\Image-generator\\src'
];

async function run() {
  for (const dir of dirs) {
    const headerPath = path.join(dir, 'Header.tsx');
    const levelIndPath = path.join(dir, 'VirtualPet', 'components', 'LevelIndicator.tsx');
    
    if (fs.existsSync(headerPath)) {
      console.log(`Processing Header in ${dir}`);
      let headerContent = fs.readFileSync(headerPath, 'utf8');
      
      // We know they use similar structure
      // Let's replace the whole pet block in Header
      // Remove imports
      headerContent = headerContent.replace(/import { PET_OPTIONS.*\} from '.\/VirtualPet\/petOptions';/g, '');
      headerContent = headerContent.replace(/import { PET_OPTIONS.*\} from '\.\/VirtualPet\/petOptions';/g, '');
      headerContent = headerContent.replace(/import { PET_OPTIONS.*\} from '\.\.\/VirtualPet\/petOptions';/g, '');
      
      // Remove states
      headerContent = headerContent.replace(/const \[accountMenuView, setAccountMenuView\] = useState<'main' \| 'pets'>\('main'\);\s*/g, '');
      headerContent = headerContent.replace(/const \[selectedPetId, setSelectedPetId\] = useState<PetId>\(\(\) => normalizePetId\(localStorage\.getItem\('pet_name'\)\)\);\s*/g, '');
      headerContent = headerContent.replace(/const \[isSavingPet, setIsSavingPet\] = useState\(false\);\s*/g, '');
      headerContent = headerContent.replace(/const selectedPet = getPetOption\(selectedPetId\);\s*/g, '');
      
      // Remove useEffect loadPetSelection (it's a block, better to remove using regex)
      headerContent = headerContent.replace(/useEffect\(\(\) => {\s*let isMounted = true;\s*const loadPetSelection[\s\S]*?}, \[user\?\.id\]\);\s*/g, '');
      
      // Remove handlePetSelect
      headerContent = headerContent.replace(/const handlePetSelect = async[\s\S]*?};/g, '');
      
      // Remove setAccountMenuView('main') in handleClickOutside
      headerContent = headerContent.replace(/setAccountMenuView\('main'\);/g, '');
      
      // Fix rendering
      // The container for isOpen
      headerContent = headerContent.replace(/<div className={`absolute top-full right-0 mt-2 \$\{accountMenuView === 'pets' \? 'w-\[386px\]' : 'w-\[400px\]'\} bg-white/g, '<div className={`absolute top-full right-0 mt-2 w-[400px] bg-white');
      
      // Remove the pet grid
      const petGridRegex = /{accountMenuView === 'pets' \? \([\s\S]*?\) : \(\s*<>\s*/;
      headerContent = headerContent.replace(petGridRegex, '');
      
      // Remove the pet button in the main menu
      const petMenuBtnRegex = /<button[\s\S]*?onClick=\{\(\) => setAccountMenuView\('pets'\)\}[\s\S]*?<\/button>\s*/;
      headerContent = headerContent.replace(petMenuBtnRegex, '');
      
      // Remove the closing tags for the `accountMenuView === 'pets'` conditional
      const closingTagsRegex = /<\/div>\s*<\/div>\s*\)\}\s*<\/div>\s*<\/header >/g;
      // Actually it's just `</>\n)}`
      headerContent = headerContent.replace(/<\/>\s*\)\}/g, '');
      
      fs.writeFileSync(headerPath, headerContent);
      console.log(`Updated ${headerPath}`);
    } else {
        console.log(`Not found Header in ${dir}`);
    }

    if (fs.existsSync(levelIndPath)) {
      console.log(`Processing LevelIndicator in ${dir}`);
      let content = fs.readFileSync(levelIndPath, 'utf8');
      
      // Check if already patched
      if (!content.includes('PET_OPTIONS')) {
        // Add imports
        const importsToAdd = `import { useGameState } from '../hooks/useGameState';\nimport { PET_OPTIONS, getPetOption, PetId } from '../petOptions';\n`;
        content = content.replace(/import { PetStats } from '\.\.\/types';/, `import { PetStats } from '../types';\n${importsToAdd}`);
        
        // Add hooks
        const hooksToAdd = `  const { petName, setPetName } = useGameState();\n  const [isSavingPet, setIsSavingPet] = useState(false);\n  const selectedPet = getPetOption(petName as PetId);\n\n  const handlePetSelect = (petId: PetId) => {\n    if (petId === petName || isSavingPet) return;\n    setIsSavingPet(true);\n    setPetName(petId);\n    setTimeout(() => setIsSavingPet(false), 500);\n  };\n`;
        content = content.replace(/const \[isOpen, setIsOpen\] = useState\(false\);/, `const [isOpen, setIsOpen] = useState(false);\n${hooksToAdd}`);
        
        // Add UI to the popover menu
        const popoverUI = `
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-700 tracking-wide mb-3">Select Pet</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {PET_OPTIONS.map((pet) => {
                      const isSelected = pet.id === petName;
                      return (
                        <button
                          key={pet.id}
                          type="button"
                          disabled={isSavingPet}
                          onClick={() => handlePetSelect(pet.id)}
                          className={\`min-h-[102px] rounded-xl border p-2 flex flex-col items-center justify-center gap-1 text-sm font-bold transition-all \${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/40'
                          } \${isSavingPet ? 'cursor-wait opacity-70' : ''}\`}
                        >
                          <span
                            aria-hidden="true"
                            className="block"
                            style={{
                              width: 38,
                              height: 42,
                              backgroundImage: \`url("\${pet.spriteSheetUrl}")\`,
                              backgroundRepeat: 'no-repeat',
                              backgroundSize: \`\${192 * 8 * 0.2}px \${208 * 9 * 0.2}px\`,
                              backgroundPosition: '0 0',
                              imageRendering: 'pixelated',
                            }}
                          />
                          {pet.label}
                        </button>
                      );
                    })}
                  </div>
                </div>`;
        content = content.replace(/<\/div>\s*<\/div>\s*\)\}/, `${popoverUI}\n            </div>\n        )}`);
        
        fs.writeFileSync(levelIndPath, content);
        console.log(`Updated ${levelIndPath}`);
      }
    } else {
        console.log(`Not found LevelIndicator in ${dir}`);
    }
  }
}

run().catch(console.error);
