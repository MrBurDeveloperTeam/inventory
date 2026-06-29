const { execSync } = require('child_process');

const dirs = [
  'C:\\Snabbb-Appointment\\appointment',
  'C:\\Snabbb-app\\snabb-superapp',
  'C:\\Snabbb-Calculator\\calculator',
  'C:\\Snabbb-Inventory\\inventory',
  'C:\\Snabbb-Todo\\todo',
  'C:\\Snabbb-Elearning\\E-learning',
  'C:\\Snabbb-ImageGenerator\\Image-generator'
];

for (const dir of dirs) {
  try {
    execSync('git restore .', { cwd: dir });
    console.log(`Restored ${dir}`);
  } catch (e) {
    console.log(`Failed in ${dir}`);
  }
}
