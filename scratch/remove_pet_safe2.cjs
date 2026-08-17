const fs = require('fs');

const filesToPatch = [
  'C:\\Snabbb-app\\snabb-superapp\\App.tsx',
  'C:\\Snabbb-Calculator\\calculator\\App.tsx',
  'C:\\Snabbb-Todo\\todo\\src\\pages\\Home.tsx',
  'C:\\Snabbb-Elearning\\E-learning\\src\\components\\layout\\Navbar.tsx',
  'C:\\Snabbb-ImageGenerator\\Image-generator\\src\\components\\layout\\AppNavbar.tsx',
  'C:\\Snabbb-Inventory\\inventory\\Header.tsx',
  'C:\\Snabbb-Appointment\\appointment\\src\\components\\Header.tsx'
];

async function run() {
  for (const filePath of filesToPatch) {
    if (fs.existsSync(filePath)) {
      console.log(`Processing ${filePath}`);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // We will look for the button that switches to the pet menu:
      // setAccountMenuView('pets')
      
      if (content.includes("setAccountMenuView('pets')")) {
          // Remove pet menu button
          content = content.replace(/<button[^>]*onClick=\{\(\) => setAccountMenuView\('pets'\)\}[^>]*>[\s\S]*?<\/button>/, '');
      }

      if (content.includes("{accountMenuView === 'pets' ? (")) {
          // Instead of regex replacing the whole ternary, just replace the 'pets' view content with empty
          const petMenuStart = content.indexOf("{accountMenuView === 'pets' ? (");
          const petMenuElse = content.indexOf(") : (", petMenuStart);
          if (petMenuStart !== -1 && petMenuElse !== -1) {
              const before = content.substring(0, petMenuStart);
              const after = content.substring(petMenuElse + 5); // skip ") : ("
              // Now we have the else block. But it ends with `)}`
              content = before + after;
              
              // We need to remove the closing `)}` that corresponded to the ternary.
              // To do this simply, we will look for `)}` right before `</motion.div>` or `</div>`
              content = content.replace(/<\/>\s*\)\}\s*<\/motion\.div>/g, '</motion.div>');
              content = content.replace(/<\/>\s*\)\}\s*<\/div>/g, '</div>');
              content = content.replace(/\)\}\s*<\/motion\.div>/g, '</motion.div>');
              content = content.replace(/\)\}\s*<\/div>/g, '</div>');
              
              // Remove <> and </> that wraps the else block if they are left over
              content = content.replace(/<>\s*([\s\S]*?)\s*<\/>\s*<\/motion\.div>/, '$1\n</motion.div>');
              content = content.replace(/<>\s*([\s\S]*?)\s*<\/>\s*<\/div>/, '$1\n</div>');
          }
      }

      // Also clean up state if it exists
      content = content.replace(/const \[accountMenuView, setAccountMenuView\] = useState<'main' \| 'pets'>\('main'\);\s*/, '');
      content = content.replace(/const \[selectedPetId, setSelectedPetId\] = useState<PetId>\([^)]+\);\s*/, '');
      content = content.replace(/const \[isSavingPet, setIsSavingPet\] = useState\(false\);\s*/, '');
      
      fs.writeFileSync(filePath, content);
      console.log(`Updated ${filePath}`);
    }
  }
}

run().catch(console.error);
