import { requestPasswordReset, showConfirmModal } from './apiPublic.js';

document.getElementById('forgot-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const cuil = document.getElementById('cuil').value;
    const cuilError = document.getElementById('cuil-error');

    try {
        const response = await requestPasswordReset(cuil);
        const data = await response.json();
        if (response.ok) 
            showConfirmModal(`Se envio un mail al correo electronico asignado al usuario con cuil ${cuil}`);
        else
            showConfirmModal(data.message);
    } catch (error) {
        showConfirmModal("Ocurrio un error al enviar el mail de recuperación");
        console.log(error.message);
    } finally {
        setTimeout(() => {
            window.location.href = '/FRONTEND/login.html';
        }, 2000);
    }
});