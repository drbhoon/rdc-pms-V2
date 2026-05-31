/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Workflow status colors (matching Google Sheet row colors)
        'status-purple': '#b27ee4',  // Selected / Pending RM
        'status-blue': '#a4c2f4',    // RM Submitted
        'status-green': '#93c47d',   // Finalized / BH Submitted
      },
    },
  },
  plugins: [],
};
