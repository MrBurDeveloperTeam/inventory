/** @type {import('tailwindcss').Config} */
// Replaces the runtime config that used to be passed to cdn.tailwindcss.com.
// Pinned to Tailwind 3.4.17 (the version the CDN script served) so the
// generated utilities match what the app was styled against.
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './*.{ts,tsx,js,jsx}',
    './{AdminDashboard,VirtualPet,aiExperience,component,components,constants,games,hooks,lib,mutation,petExperience,services,src,types}/**/*.{ts,tsx,js,jsx}',
    // The pet-function package ships its own compiled CSS (imported in index.tsx),
    // so it is intentionally NOT scanned here — scanning it would re-create the
    // gradient-variable collision documented in index.css (INVENTORY-4B).
  ],
  theme: {
    extend: {
      colors: {
        tiffany: { 500: '#14b8a6', 600: '#0abfbc', 700: '#089a98' },
      },
    },
  },
  plugins: [],
};
