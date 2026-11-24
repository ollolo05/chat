/** Tailwind build config: compiles client/styles.src.css -> client/styles.css (npm run build:css) */
module.exports = {
    content: ['./client/index.html', './client/app.js'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                display: ['Orbitron', 'Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                // Dark neon palette. Text colours were chosen for WCAG AA+ contrast on ink-900/ink-950.
                ink: {
                    950: '#070a12',
                    900: '#0d1220',
                    800: '#141b2d',
                    700: '#1c2540',
                    600: '#26324d',
                },
                neon: {
                    cyan: '#22d3ee',
                    magenta: '#e879f9',
                    green: '#4ade80',
                    red: '#f87171',
                },
                bubble: {
                    self: '#0b3440',
                    other: '#161e31',
                },
            },
        },
    },
    plugins: [],
};
