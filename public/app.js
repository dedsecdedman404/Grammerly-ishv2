// --- DOM ELEMENTS ---
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const loginError = document.getElementById('login-error');

const inputText = document.getElementById('input-text');
const humaniseBtn = document.getElementById('humanise-btn');
const copyBtn = document.getElementById('copy-btn');
const outputPlaceholder = document.getElementById('output-placeholder');
const loaderContainer = document.getElementById('loader-container');
const outputText = document.getElementById('output-text');
const apiError = document.getElementById('api-error');

// --- SCREEN HELPERS ---
// These only change what is *shown*. Real access control happens on the server:
// without a valid session cookie, /api/humanise refuses every request.
function showAppScreen(animated) {
    if (!animated) {
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden', 'opacity-0');
        return;
    }
    // Glitch/Fade transition
    loginScreen.classList.add('opacity-0', 'scale-95');
    setTimeout(() => {
        loginScreen.classList.add('hidden');
        appScreen.classList.remove('hidden');
        // Allow DOM to update before fading in
        setTimeout(() => {
            appScreen.classList.remove('opacity-0');
        }, 50);
    }, 600);
}

function showLoginScreen() {
    appScreen.classList.add('hidden', 'opacity-0');
    loginScreen.classList.remove('hidden', 'opacity-0', 'scale-95');
}

function showLoginError(message) {
    loginError.innerText = message;
    loginError.classList.remove('hidden');
}

const API_ERROR_MESSAGES = {
    UNAUTHENTICATED: 'SESSION_EXPIRED',
    TEXT_TOO_LONG: 'TEXT_TOO_LONG',
    EMPTY_TEXT: 'EMPTY_TEXT',
    UPSTREAM_TIMEOUT: 'SERVER_TIMEOUT',
    UPSTREAM_ERROR: 'SERVICE_UNAVAILABLE',
    DATA_PARSE_FAILURE: 'DATA_PARSE_FAILURE',
    NOT_CONFIGURED: 'SERVER_NOT_CONFIGURED',
};

// --- EVENT LISTENERS ---

// Login (checked by the server, never in the browser)
let loginInFlight = false;
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginInFlight) return;
    loginInFlight = true;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
                username: usernameInput.value,
                password: passwordInput.value
            })
        });

        if (response.ok) {
            loginError.classList.add('hidden');
            passwordInput.value = '';
            showAppScreen(true);
        } else if (response.status === 429) {
            showLoginError('TOO MANY ATTEMPTS - TRY LATER');
            passwordInput.value = '';
        } else if (response.status === 500) {
            showLoginError('SERVER NOT CONFIGURED');
            passwordInput.value = '';
        } else {
            showLoginError('ACCESS DENIED');
            passwordInput.value = '';
        }
    } catch (err) {
        console.error(err);
        showLoginError('CONNECTION ERROR');
    } finally {
        loginInFlight = false;
    }
});

// If the visitor already has a valid session, skip the login screen.
(async () => {
    try {
        const response = await fetch('/api/me', { credentials: 'same-origin' });
        if (response.ok) showAppScreen(false);
    } catch (err) {
        // Offline or server down: just stay on the login screen.
    }
})();

// Input observer to toggle execution button state
inputText.addEventListener('input', () => {
    if (inputText.value.trim().length > 0) {
        humaniseBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        humaniseBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }
});

// Copy Button Logic
copyBtn.addEventListener('click', () => {
    const textToCopy = outputText.innerText;
    if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = `<span class="font-mono text-xs text-[#27C93F] glow-green">COPIED</span>`;
            setTimeout(() => { copyBtn.innerHTML = originalHTML; }, 2000);
        });
    }
});

// Primary API Functionality
humaniseBtn.addEventListener('click', async () => {
    const text = inputText.value.trim();
    if (!text) return;

    // Set UI into Active Processing State
    humaniseBtn.disabled = true;
    humaniseBtn.innerHTML = `
        <span class="w-2 h-2 rounded-full bg-pink-500 animate-ping"></span>
        PROCESSING...
    `;
    humaniseBtn.classList.add('opacity-50', 'cursor-wait');

    // Clear outputs and show the sci-fi loading ring
    outputPlaceholder.classList.add('hidden');
    outputText.classList.add('hidden');
    apiError.classList.add('hidden');
    copyBtn.classList.remove('opacity-100');
    copyBtn.classList.add('opacity-0');
    copyBtn.disabled = true;
    loaderContainer.classList.remove('hidden');

    try {
        // The browser only ever talks to our own server. Any upstream URL or
        // API key lives on the server and is never sent to the browser.
        const response = await fetch('/api/humanise', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ text })
        });

        if (!response.ok) {
            let code = `CONNECTION_ERROR_${response.status}`;
            try {
                const err = await response.json();
                if (err && API_ERROR_MESSAGES[err.error]) code = API_ERROR_MESSAGES[err.error];
            } catch (_) { /* keep the generic code */ }

            if (response.status === 401) {
                showLoginError('SESSION EXPIRED - LOG IN AGAIN');
                showLoginScreen();
            }
            throw new Error(code);
        }

        const data = await response.json();
        const rewrittenText = data && data.text;

        if (rewrittenText) {
            // Render Text
            outputText.innerText = rewrittenText;
            outputText.classList.remove('hidden');

            // Show Copy Button
            copyBtn.disabled = false;
            copyBtn.classList.remove('opacity-0', 'hidden');
            copyBtn.classList.add('opacity-100');
        } else {
            throw new Error('DATA_PARSE_FAILURE');
        }

    } catch (err) {
        console.error(err);
        apiError.innerText = `> ERR: ${err.message || 'SERVER_TIMEOUT'}\n> CHECK NETWORK STATUS`;
        apiError.classList.remove('hidden');
        outputPlaceholder.classList.remove('hidden');
    } finally {
        // Reset processing states
        loaderContainer.classList.add('hidden');
        humaniseBtn.disabled = false;
        humaniseBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            EXECUTE // HUMANISE
        `;
        humaniseBtn.classList.remove('opacity-50', 'cursor-wait');
    }
});
