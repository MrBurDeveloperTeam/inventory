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
    const res = execSync(`powershell -Command "Get-ChildItem -Path '${dir}' -Recurse -Filter '*.tsx' -ErrorAction SilentlyContinue | Select-String 'PET_OPTIONS' | Select-Object -ExpandProperty Path -Unique"`, { encoding: 'utf8' });
    console.log(`--- ${dir} ---`);
    console.log(res);
  } catch (e) {
    console.log(`Failed in ${dir}`);
  }
}
