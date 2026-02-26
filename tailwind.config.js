import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  // Указываем, где используются классы Tailwind
  content: [
    "./index.html",
    "./App.tsx",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],

  // В этой секции мы подключаем стандартную тему и расширяем её
  theme: {
    ...defaultTheme, // <-- Вот эта строка подключает все стандартные стили (цвета, отступы и т.д.)
    extend: {
      // А здесь мы добавляем свои кастомные стили или переопределяем стандартные
      fontFamily: {
        // Добавляем Rubik в стек шрифтов без засечек, сохраняя стандартные
        sans: ['Rubik', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
}