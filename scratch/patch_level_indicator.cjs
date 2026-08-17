const fs = require('fs');
const path = require('path');

const dirs = [
  'C:\\Snabbb-Appointment\\appointment',
  'C:\\Snabbb-app\\snabb-superapp',
  'C:\\Snabbb-Calculator\\calculator',
  'C:\\Snabbb-Inventory\\inventory',
  'C:\\Snabbb-Todo\\todo',
  'C:\\Snabbb-Elearning\\E-learning',
  'C:\\Snabbb-ImageGenerator\\Image-generator'
];

async function run() {
  for (const dir of dirs) {
    const levelIndPath = path.join(dir, 'VirtualPet', 'components', 'LevelIndicator.tsx') || path.join(dir, 'src', 'VirtualPet', 'components', 'LevelIndicator.tsx');
    const possiblePaths = [
      path.join(dir, 'VirtualPet', 'components', 'LevelIndicator.tsx'),
      path.join(dir, 'src', 'VirtualPet', 'components', 'LevelIndicator.tsx')
    ];
    let actualLevelPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        actualLevelPath = p;
        break;
      }
    }

    if (actualLevelPath) {
      console.log(`Processing LevelIndicator in ${actualLevelPath}`);
      let content = fs.readFileSync(actualLevelPath, 'utf8');
      
      if (!content.includes('PET_OPTIONS')) {
        const importsToAdd = `import { useGameState } from '../hooks/useGameState';\nimport { PET_OPTIONS, getPetOption, PetId } from '../petOptions';\n`;
        content = content.replace(/import \{ PetStats \} from '\.\.\/types';/, `import { PetStats } from '../types';\n${importsToAdd}`);
        
        const hooksToAdd = `  const { petName, setPetName } = useGameState();\n  const [isSavingPet, setIsSavingPet] = useState(false);\n  const selectedPet = getPetOption(petName as PetId);\n\n  const handlePetSelect = (petId: PetId) => {\n    if (petId === petName || isSavingPet) return;\n    setIsSavingPet(true);\n    setPetName(petId);\n    setTimeout(() => setIsSavingPet(false), 500);\n  };\n`;
        content = content.replace(/const \[isOpen, setIsOpen\] = useState\(false\);/, `const [isOpen, setIsOpen] = useState(false);\n${hooksToAdd}`);
        
        const popoverUI = `
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <h3 className="text-xs font-bold text-slate-700 tracking-wide mb-3 text-left">Select Pet</h3>
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
                
        // Safer replacement for popover body
        const targetString = `                    </div>\n                </div>\n\n            </div>\n        )}`;
        const replacement = `                    </div>\n                </div>\n${popoverUI}\n            </div>\n        )}`;
        content = content.replace(targetString, replacement);
        
        fs.writeFileSync(actualLevelPath, content);
      }
    }
  }
}
run();
