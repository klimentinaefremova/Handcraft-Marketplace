// Handcraft Marketplace - Main JavaScript

// Utility Functions
function showMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    messageDiv.textContent = message;
    messageDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem;
        background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--danger)' : 'var(--info)'};
        color: white;
        border-radius: 5px;
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    document.body.appendChild(messageDiv);
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatCurrency(amount) {
    return '$' + parseFloat(amount).toFixed(2);
}

// Check authentication status
async function checkAuth() {
    try {
        const response = await fetch('/api/user');
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Auth check failed:', error);
        return { success: false };
    }
}

// Logout function
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });
        const data = await response.json();
        if (data.success) {
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Logout failed:', error);
    }
}

// Load user data for dashboard
async function loadUserData() {
    const auth = await checkAuth();
    if (!auth.success) {
        window.location.href = 'login.html';
        return null;
    }
    return auth.user;
}

// Initialize page based on user type
document.addEventListener('DOMContentLoaded', async () => {
    // Check if we're on a protected page
    const protectedPages = ['dashboard.html', 'admin.html', 'store-owner.html', 'store-employee.html', 'client-dashboard.html'];
    const currentPage = window.location.pathname.split('/').pop();

    if (protectedPages.includes(currentPage)) {
        const user = await loadUserData();
        if (user) {
            // Verify user has access to this page
            if (currentPage === 'admin.html' && user.userType !== 'admin') {
                window.location.href = 'index.html';
            } else if (currentPage === 'store-owner.html' && user.userType !== 'store_owner') {
                window.location.href = 'index.html';
            } else if (currentPage === 'store-employee.html' && user.userType !== 'store_employee') {
                window.location.href = 'index.html';
            } else if (currentPage === 'client-dashboard.html' && user.userType !== 'client') {
                window.location.href = 'index.html';
            }
        }
    }

    // Add logout button to header if logged in
    const auth = await checkAuth();
    if (auth.success) {
        const nav = document.querySelector('nav ul');
        if (nav && !document.getElementById('logout-btn')) {
            const logoutLi = document.createElement('li');
            logoutLi.innerHTML = '<a href="#" id="logout-btn" style="color: var(--danger);">Logout</a>';
            nav.appendChild(logoutLi);

            document.getElementById('logout-btn').addEventListener('click', (e) => {
                e.preventDefault();
                logout();
            });
        }
    }
});

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }

    .message {
        box-shadow: 0 3px 10px rgba(0,0,0,0.2);
    }

    .message-success {
        background: linear-gradient(135deg, var(--success) 0%, #34CE57 100%);
    }

    .message-error {
        background: linear-gradient(135deg, var(--danger) 0%, #FF6B6B 100%);
    }

    .message-info {
        background: linear-gradient(135deg, var(--light-blue) 0%, var(--pink) 100%);
    }
`;
document.head.appendChild(style);