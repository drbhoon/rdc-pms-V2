/** @type {import('tailwindcss').Config} */
//
// The palette follows the LMS (hr.rdcc.ai/lms) so the two apps read as one
// family. Rather than editing every page, the colour names the pages already
// use are re-pointed here: "blue" is the LMS blue (#2457a6 at 600), the
// darkest slates are the LMS navy, and the lightest greys are its page tint.
const colors = require('tailwindcss/colors');

module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Workflow status colors (matching Google Sheet row colors)
        'status-purple': '#b27ee4',  // Selected / Pending RM
        'status-blue': '#a4c2f4',    // RM Submitted
        'status-green': '#93c47d',   // Finalized / BH Submitted
        navy: '#12233f',
        blue: {
          50: '#eef4fb', 100: '#dce8f7', 200: '#bcd2ef', 300: '#8fb3e3', 400: '#5b8bd0',
          500: '#3a6fbf', 600: '#2457a6', 700: '#1d4889', 800: '#1a3b6e', 900: '#172f57', 950: '#0f1f3a',
        },
        slate: { ...colors.slate, 50: '#f6f8fb', 800: '#1c2d4a', 900: '#12233f' },
        gray: { ...colors.gray, 50: '#f4f6fa' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        sm: '0 1px 2px #12233f0d, 0 2px 10px #12233f0a',
        lift: '0 10px 28px #12233f1f',
      },
    },
  },
  plugins: [],
};
