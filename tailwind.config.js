/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'kyu-blue': {
          DEFAULT: '#1B5EA9',
          light: '#2A74C7',
          dark: '#124278',
        },
        'kyu-orange': {
          DEFAULT: '#F8B13A',
          light: '#FAD06B',
          dark: '#D99520',
        },
      },
    },
  },
  plugins: [],
}