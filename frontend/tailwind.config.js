/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#4338CA',
                'primary-600': '#4F46E5',
                'primary-900': '#1e1b4b',
            }
        },
    },
    plugins: [],
}
