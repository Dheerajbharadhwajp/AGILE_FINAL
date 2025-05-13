document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('cosmetic-login-form');
    const themeToggleButton = document.getElementById('theme-toggle-login');

    if (loginForm) {
        loginForm.addEventListener('submit', function (event) {
            event.preventDefault(); // Prevent actual form submission
            // In a real app, you'd validate credentials here.
            // For this cosmetic version, we just navigate.
            console.log('Attempting "login"');
            // Redirect to the main application page
            window.location.href = "/app"; // Matches the route in app.py
        });
    }

    // Theme Toggle Logic
    function applyTheme(theme) {
        if (theme === 'light') {
            document.body.classList.add('light-theme');
            document.body.classList.remove('dark-theme'); // Though dark is default
        } else {
            document.body.classList.remove('light-theme');
            document.body.classList.add('dark-theme');
        }
    }

    // Load saved theme or default to dark
    let currentTheme = localStorage.getItem('theme-login') || 'dark';
    applyTheme(currentTheme);

    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', function () {
            currentTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
            localStorage.setItem('theme-login', currentTheme);
            applyTheme(currentTheme);
        });
    }
});