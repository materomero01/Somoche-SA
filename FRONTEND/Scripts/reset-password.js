import { resetPassword, showConfirmModal } from './apiPublic.js';

document.addEventListener('DOMContentLoaded', () => {
    // Obtener token de la URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
        setTimeout(() => {
            window.location.href = '/FRONTEND/login.html';
        });
        return;
    }

    document.getElementById('token').value = token;

    // Alternar visibilidad de contraseña
    const toggleNewPassword = document.getElementById('toggle-new-password');
    const newPasswordInput = document.getElementById('newPassword');
    toggleNewPassword.addEventListener('click', () => {
        const type = newPasswordInput.type === 'password' ? 'text' : 'password';
        newPasswordInput.type = type;
        toggleNewPassword.innerHTML = `<i class="bi bi-${type === 'password' ? 'eye-slash' : 'eye'}"></i>`;
    });

    const toggleConfirmPassword = document.getElementById('toggle-confirm-password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    toggleConfirmPassword.addEventListener('click', () => {
        const type = confirmPasswordInput.type === 'password' ? 'text' : 'password';
        confirmPasswordInput.type = type;
        toggleConfirmPassword.innerHTML = `<i class="bi bi-${type === 'password' ? 'eye-slash' : 'eye'}"></i>`;
    });
});

document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = document.getElementById('token').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const newPasswordError = document.getElementById('new-password-error');
    const confirmPasswordError = document.getElementById('confirm-password-error');

    if (newPassword !== confirmPassword) {
        confirmPasswordError.style.display = 'block';
        confirmPasswordError.innerHTML = `<div class="alert alert-danger">Las contraseñas no coinciden</div>`;
        return;
    }

    try {
        const response = await resetPassword(token, newPassword);
        if (response.ok)
            showConfirmModal("Contraseña reestablecida exitosamente");
        else
            showConfirmModal("Ocurrio un error al reestablecer la contraseña");
    } catch (error) {
        console.log(error.message);
        showConfirmModal("Ocurrio un error al reestablecer la contraseña");
    } finally {
        setTimeout(() => {
            window.location.href = '/FRONTEND/login.html';
        }, 2000);
    }
});
