/** @type {import('tailwindcss').Config} */
const { TAILWIND_COLORS, RADIUS } = require("@latag/tokens");

module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    colors: {
      ...TAILWIND_COLORS,
      white: "#FFFFFF",
      black: "#000000",
      transparent: "transparent",
    },
    extend: {
      borderRadius: {
        card: `${RADIUS.card}px`,
        sheet: `${RADIUS.sheet}px`,
        photo: `${RADIUS.photo}px`,
      },
    },
  },
};
