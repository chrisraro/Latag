/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    colors: {
      bg: "#000000", surface1: "#111111", surface2: "#1A1A1A", hairline: "#262626",
      ink: "#F2F2F2", inkdim: "#ADADAD", inkfaint: "#8A8A8A",
      acid: "#B8F135", acidink: "#141A05", danger: "#FF5A3C", white: "#FFFFFF", black: "#000000", transparent: "transparent",
    },
    extend: { borderRadius: { card: "12px", sheet: "20px" } },
  },
};
