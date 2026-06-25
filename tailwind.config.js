/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta institucional Universidad de Antofagasta
        'ua-blue': '#13509e',       // Azul profundo del fondo
        'ua-blue-dark': '#0e4178',  // Variante oscura para la marca de agua
        'ua-cyan': '#5bb4d8',       // Celeste del banner / botón
        'ua-cyan-dark': '#3f9fc9',  // Hover del botón
      },
    },
  },
  plugins: [],
}
