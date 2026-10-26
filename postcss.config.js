import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// The pet-function package ships a stylesheet that is ALREADY compiled by
// Tailwind v4 (native @layer rules, no @tailwind directives). Tailwind v3
// would reject it ("@layer utilities is used but no matching @tailwind
// utilities directive"), so it must bypass Tailwind and go through untouched.
const PET_FUNCTION_STYLES = /node_modules[\\/]@mrburdeveloperteam[\\/]pet-function[\\/]/;

const tailwindExceptPetFunction = () => {
  const tailwind = tailwindcss();
  return {
    postcssPlugin: 'tailwindcss-except-pet-function',
    async Once(root, { result }) {
      if (PET_FUNCTION_STYLES.test(root.source?.input?.file || '')) return;
      for (const run of tailwind.plugins) await run(root, result);
    },
  };
};
tailwindExceptPetFunction.postcss = true;

export default {
  plugins: [tailwindExceptPetFunction(), autoprefixer()],
};
