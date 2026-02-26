/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      // Здесь мы добавляем свои кастомные стили или переопределяем стандартные
      fontFamily: {
        // Добавляем Rubik в стек шрифтов без засечек
        sans: ['Rubik', 'sans-serif'],
      },
    },
  },
  plugins: [],
}