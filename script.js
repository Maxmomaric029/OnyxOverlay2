/*
    ================================================================================
    ARCHIVO: script.js
    PROPÓSITO: Es el "cerebro" de tu página. Se encarga de toda la interactividad:
               qué pasa cuando haces clic en un botón, cómo se guardan los datos,
               cómo se conecta a Firebase, etc.
    CONCEPTOS CLAVE:
    - import { ... } from "...": Carga las herramientas de Firebase que necesitamos.
    - const: Declara una variable cuyo valor no cambiará.
    - let: Declara una variable que sí puede cambiar.
    - async function / await: Permiten que el código espere a que terminen tareas
      que toman tiempo (como pedir datos a un servidor) sin congelar la página.
    - .addEventListener('evento', funcion): "Escucha" acciones del usuario (clics,
      cambios en sliders) y ejecuta una función como respuesta.
    ================================================================================
*/

// ======================= 1. IMPORTACIONES Y CONFIGURACIÓN DE FIREBASE =======================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, query, where, deleteDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- ¡MUY IMPORTANTE! ---
// Pega aquí la configuración de TU proyecto de Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyAzAVBKwWv3ulyGNuT2h9te-XQONfMYy9I",
  authDomain: "y4blworld.firebaseapp.com",
  projectId: "y4blworld",
  storageBucket: "y4blworld.appspot.com",
  messagingSenderId: "750625998449",
  appId: "1:750625998449:web:e1e34ab33b86adcfb0fdd0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ======================= 2. ESTADO GLOBAL Y VARIABLES =======================
let currentUser = null;
let currentSessionId = null;
let savedWeaponConfigs = {}; // NUEVO: Estado para configuraciones de armas
let selectedWeapon = null; // NUEVO: Arma actualmente seleccionada en calibración

// ======================= 3. EJECUCIÓN INICIAL =======================
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM cargado. Configurando eventos...");
    setupEventListeners();
    setupInterfaceControls();
    applySavedTheme();
    loadWeaponConfigs(); // CARGA CONFIGURACIONES DE ARMAS AL INICIO
});

// ======================= 4. CONFIGURACIÓN DE EVENTOS PRINCIPALES =======================
function setupEventListeners() {
    console.log("Adjuntando listeners a los botones...");
    // Llamamos a la función window.login que definiremos más abajo
    document.getElementById('loginButton').addEventListener('click', window.login); 
    document.getElementById('registerButton').addEventListener('click', registerUser);
    document.getElementById('showRegister').addEventListener('click', (e) => { e.preventDefault(); toggleForms(false); });
    document.getElementById('showLogin').addEventListener('click', (e) => { e.preventDefault(); toggleForms(true); });
    document.getElementById('password').addEventListener('keypress', e => { if (e.key === 'Enter') window.login(); });
    
    document.querySelectorAll('.sidebar-icon').forEach(icon => {
        icon.addEventListener('click', (e) => {
            playSound('click');
            showSection(e.currentTarget.dataset.section, e);
        });
    });

    // --- NUEVO: Event Listeners para la Calibración ---
    document.querySelectorAll('.weapon-card').forEach(card => {
        card.addEventListener('click', (event) => {
            playSound('click');
            document.querySelectorAll('.weapon-card').forEach(c => c.classList.remove('selected'));
            event.currentTarget.classList.add('selected');
            selectWeaponConfig(event.currentTarget.dataset.weapon, event.currentTarget.dataset.name);
        });
    });
    
    document.getElementById('saveWeaponConfigButton')?.addEventListener('click', saveWeaponConfig);
    // ---------------------------------------------------

    document.getElementById('generateSensButton')?.addEventListener('click', generateRandomSensitivity);
}

// ======================= 5. LÓGICA DE LOS CONTROLES DE UI (CON LAS NUEVAS FUNCIONES) =======================
function setupInterfaceControls() {
    // --- Lógica para mostrar/ocultar las opciones avanzadas de Aim Legit ---
    document.getElementById('aim-legit-switch')?.addEventListener('change', function() {
        document.getElementById('advanced-legit-options')?.classList.toggle('active', this.checked);
    });

    // --- Lógica para el cálculo en tiempo real del DPI ---
    const dpiBaseSlider = document.getElementById('dpi-base-slider');
    const dpiIncreaseSlider = document.getElementById('dpi-increase-slider');
    const finalDpiDisplay = document.getElementById('final-dpi-display');
    const dpiOptionsContainer = document.getElementById('dpi-options');
    const dpiModifierToggle = document.getElementById('dpi-modifier-toggle');

    function updateFinalDpi() {
        if (dpiBaseSlider && dpiIncreaseSlider && finalDpiDisplay) {
            const baseDpi = parseInt(dpiBaseSlider.value);
            const increaseDpi = parseInt(dpiIncreaseSlider.value);
            finalDpiDisplay.textContent = baseDpi + increaseDpi;
        }
    }
    
    dpiBaseSlider?.addEventListener('input', updateFinalDpi);
    dpiIncreaseSlider?.addEventListener('input', updateFinalDpi);

    dpiModifierToggle?.addEventListener('change', function() {
        dpiOptionsContainer?.classList.toggle('active', this.checked);
    });
    
    // --- Lógica para todos los demás sliders y toggles que ya tenías ---
    document.querySelectorAll('.range-input').forEach(input => {
        const valueSpan = input.closest('.slider-container')?.querySelector('.range-value span');
        if (valueSpan) {
            // Actualiza el valor inicial al cargar la página
            const initialValue = input.value;
            if(input.id === 'dpi-increase-slider' && initialValue > 0) {
                 valueSpan.textContent = `+${initialValue}`;
            } else {
                 valueSpan.textContent = initialValue;
            }

            // Añade el listener para cuando el usuario lo mueva
            input.addEventListener('input', (e) => { 
                const currentValue = e.target.value;
                if(e.target.id === 'dpi-increase-slider' && currentValue > 0) {
                    valueSpan.textContent = `+${currentValue}`;
                } else {
                    valueSpan.textContent = currentValue;
                }
                
                // *** NUEVO: Si se mueve un slider de calibración, actualizar su valor en el panel temporal ***
                if (input.id.startsWith('calib-')) {
                    document.getElementById(input.id).value = currentValue;
                    document.getElementById(input.id).dispatchEvent(new Event('input', { bubbles: true }));
                }
            });
        }
    });

    const subOptionToggles = {'aimbone-switch': 'aimbone-options','rcs-switch': 'rcs-options','fakelag-switch': 'fakelag-options'};
    Object.entries(subOptionToggles).forEach(([toggleId, optionsId]) => {
        const toggle = document.getElementById(toggleId);
        const options = document.getElementById(optionsId);
        if (toggle && options) {
            toggle.addEventListener('change', function() { options.classList.toggle('active', this.checked); });
        }
    });

    const espToggles = {'health-esp': '.health-bar','box-esp': '.box-esp','weapon-esp': '.weapon-info','distance-esp': '.distance-info'};
    Object.entries(espToggles).forEach(([toggleId, elementSelector]) => {
        const toggle = document.getElementById(toggleId);
        const element = document.querySelector(elementSelector);
        if (toggle && element) {
            toggle.addEventListener('change', function() { element.style.display = this.checked ? 'block' : 'none'; });
        }
    });

    const soundToggle = document.getElementById('sound-toggle');
    if (soundToggle) {
        soundToggle.checked = localStorage.getItem('soundsEnabled') !== 'false';
        soundToggle.addEventListener('change', () => {
            playSound('toggle');
            localStorage.setItem('soundsEnabled', soundToggle.checked);
        });
    }
    
    // --- NUEVO: Inicializar control global ---
    setupGlobalControls();
}


// ======================= 6. FUNCIONES DEL SISTEMA (LOGIN, FIREBASE, ETC.) =======================

// --- Sistema de Autenticación ---
function toggleForms(showLogin) {
    playSound('click');
    document.getElementById('login-form').style.display = showLogin ? 'block' : 'none';
    document.getElementById('register-form').style.display = showLogin ? 'none' : 'block';
}

function registerUser() {
    playSound('click');
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!username || !password) {
        playSound('error');
        return alert('Usuario y contraseña no pueden estar vacíos.');
    }
    let users = JSON.parse(localStorage.getItem('users')) || [];
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        playSound('error');
        return alert('El nombre de usuario ya existe.');
    }
    users.push({ username, password });
    localStorage.setItem('users', JSON.stringify(users));
    playSound('success');
    alert('¡Registro exitoso! Ahora puedes iniciar sesión.');
    toggleForms(true);
}

// *** CAMBIO CLAVE: Función LOGIN definida como global (window.login) ***
window.login = async () => { 
    playSound('click');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (!username || !password) {
        playSound('error'); return alert('Por favor, ingresa usuario y contraseña.');
    }

    const users = JSON.parse(localStorage.getItem('users')) || [];
    const isAdmin = username === 'NomoreDoa' && password === 'world';
    const foundUser = users.find(u => u.username === username && u.password === password);

    if (foundUser || isAdmin) {
        try {
            const ipResponse = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResponse.json();
            const userIp = ipData.ip;
            
            const q = query(collection(db, "userRecords"), where("ip", "==", userIp), where("blocked", "==", true));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                playSound('error');
                return alert('Acceso denegado. Tu IP ha sido bloqueada.');
            }
        } catch (error) {
            console.error("Error al verificar el estado de bloqueo de la IP:", error);
        }

        playSound('success');
        currentUser = username;
        currentSessionId = Date.now() + Math.random().toString(36).substr(2, 9);
        
        document.getElementById('loginScreen').style.opacity = '0';
        setTimeout(() => { document.getElementById('loginScreen').style.display = 'none'; }, 500);
        
        document.getElementById('dashboard').classList.add('active');
        saveUserRecord(true); 
    } else {
        playSound('error');
        alert('Usuario o contraseña incorrectos.');
    }
};


// --- Función para guardar los datos del usuario en FIREBASE ---
async function saveUserRecord(isNewSession = false) {
    if (!currentUser) return;

    let record = {
        username: currentUser,
        sessionId: currentSessionId,
        time: new Date().toISOString(),
        features: [],
        ip: 'obteniendo...',
        loc: 'obteniendo...',
        countryCode: 'XX',
        blocked: false
    };

    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipResponse.json();
        record.ip = ipData.ip;

        const detailsResponse = await fetch(`https://ipapi.co/${record.ip}/json/`);
        const details = await detailsResponse.json();
        record.loc = `${details.city || 'N/A'}, ${details.country_name || 'N/A'}`;
        record.countryCode = details.country_code || 'XX';
    } catch (error) {
        console.error('Error al obtener datos de red:', error);
        record.ip = 'Desconocida';
        record.loc = 'Desconocida';
    }

    try {
        const docRef = await addDoc(collection(db, "userRecords"), record);
        console.log("Registro guardado en Firebase con ID: ", docRef.id);
    } catch (e) {
        console.error("Error al añadir el documento a Firebase: ", e);
    }
}

// --- Funciones del Panel de Administrador ---
async function displayUserRecords() {
    const querySnapshot = await getDocs(collection(db, "userRecords"));
    const records = [];
    querySnapshot.forEach((doc) => {
        records.push({ id: doc.id, ...doc.data() });
    });
    
    const uniqueIPs = [...new Set(records.map(r => r.ip))].filter(ip => ip !== 'obteniendo...');
    const blockedRecords = records.filter(r => r.blocked === true);
    const uniqueBlockedIPs = [...new Set(blockedRecords.map(r => r.ip))];
    
    document.getElementById('total-users-stat').textContent = uniqueIPs.length;
    document.getElementById('blocked-users-stat').textContent = uniqueBlockedIPs.length;
    
    if (records.length > 0) {
        const latestRecord = [...records].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
        document.getElementById('last-active-stat').textContent = `${latestRecord.ip} (${latestRecord.loc})`;
    } else {
        document.getElementById('last-active-stat').textContent = 'N/A';
    }

    // Renderizar Lista de IPs (Sin cambios en la lógica principal)
    const listEl = document.getElementById('ipList');
    if (!listEl) return;
    
    const groupedByIP = records.reduce((acc, r) => {
        if (r.ip !== 'obteniendo...') { (acc[r.ip] = acc[r.ip] || []).push(r); }
        return acc;
    }, {});
    
    listEl.innerHTML = uniqueIPs.map(ip => {
        const ipRecords = groupedByIP[ip] || [];
        const latestRecord = [...ipRecords].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
        const isBlocked = latestRecord.blocked;
        
        const flagHtml = latestRecord.countryCode !== 'XX' && latestRecord.ip !== 'Desconocida'
            ? `<img src="https://flagcdn.com/w20/${latestRecord.countryCode.toLowerCase()}.png" alt="${latestRecord.countryCode}" class="flag-icon">`
            : `<div class="flag-icon"><i class="fas fa-question"></i></div>`;

        return `
            <div class="ip-item ${isBlocked ? 'blocked' : ''}" data-ip="${ip}">
                ${flagHtml}
                <span class="ip-address">${ip}</span>
                <div class="ip-actions">
                    <button class="block-btn ${isBlocked ? 'blocked' : ''}" data-ip="${ip}" title="${isBlocked ? 'Desbloquear' : 'Bloquear'}">
                        <i class="fas ${isBlocked ? 'fa-lock-open' : 'fa-ban'}"></i>
                    </button>
                    <button class="delete-btn" data-ip="${ip}" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </div>`;
    }).join('');

    listEl.querySelectorAll('.ip-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const ip = item.dataset.ip;
            if (e.target.closest('.delete-btn')) { deleteRecord(ip); } 
            else if (e.target.closest('.block-btn')) { toggleBlockIP(ip); } 
            else { showIPDetails(ip); }
        });
    });
    
    // --- NUEVO: Inicializar gestión de usuarios locales ---
    setupLocalUserManagement();
    // --- NUEVO: Inicializar control global ---
    setupGlobalControls();
}

async function toggleBlockIP(ip) {
    playSound('click');
    const q = query(collection(db, "userRecords"), where("ip", "==", ip));
    const querySnapshot = await getDocs(q);
    
    let isCurrentlyBlocked = false;
    querySnapshot.forEach(doc => {
        if (doc.data().blocked) {
            isCurrentlyBlocked = true;
        }
    });

    const newBlockedState = !isCurrentlyBlocked;

    for (const docSnapshot of querySnapshot.docs) {
        await updateDoc(doc(db, "userRecords", docSnapshot.id), {
            blocked: newBlockedState
        });
    }

    alert(`IP ${ip} ha sido ${newBlockedState ? 'BLOQUEADA' : 'DESBLOQUEADA'}.`);
    displayUserRecords();
}

async function deleteRecord(ipToDelete) {
    playSound('click');
    if (confirm(`¿Estás seguro de que quieres eliminar TODOS los registros de ${ipToDelete}?`)) {
        const q = query(collection(db, "userRecords"), where("ip", "==", ipToDelete));
        const querySnapshot = await getDocs(q);
        for (const docSnapshot of querySnapshot.docs) {
            await deleteDoc(doc(db, "userRecords", docSnapshot.id));
        }
        displayUserRecords();
        document.getElementById('ipDetails').innerHTML = '<p class="placeholder">Selecciona una IP...</p>';
    }
}

async function clearRecords() {
    playSound('click');
    if (confirm('¿Estás seguro de que quieres borrar TODOS los registros y bloqueos? Esta acción es irreversible.')) {
        const querySnapshot = await getDocs(collection(db, "userRecords"));
        for (const docSnapshot of querySnapshot.docs) {
            await deleteDoc(doc(db, "userRecords", docSnapshot.id));
        }
        displayUserRecords();
        document.getElementById('ipDetails').innerHTML = '<p class="placeholder">Selecciona una IP...</p>';
    }
}

async function showIPDetails(ip) {
    playSound('click');
    document.querySelectorAll('.ip-item').forEach(item => item.classList.remove('selected'));
    document.querySelector(`.ip-item[data-ip="${ip}"]`)?.classList.add('selected');

    const q = query(collection(db, "userRecords"), where("ip", "==", ip));
    const querySnapshot = await getDocs(q);
    const ipRecords = [];
    querySnapshot.forEach(doc => ipRecords.push(doc.data()));
    
    if (ipRecords.length > 0) {
        const latestRecord = [...ipRecords].sort((a, b) => new Date(b.time) - new Date(a.time))[0];
        const detailsEl = document.getElementById('ipDetails');
        const blockStatus = latestRecord.blocked 
            ? '<span style="color: var(--danger-color); font-weight: 600;"><i class="fas fa-ban"></i> BLOQUEADO</span>' 
            : '<span style="color: var(--success-color); font-weight: 600;"><i class="fas fa-check-circle"></i> Activo</span>';
        
        detailsEl.innerHTML = `
            <h4><i class="fas fa-network-wired"></i> ${ip} - ${latestRecord.loc}</h4>
            <p><strong><i class="fas fa-info-circle"></i> Estado:</strong> ${blockStatus}</p>
            <p><strong><i class="fas fa-user"></i> Último Usuario:</strong> ${latestRecord.username || 'N/A'}</p>
            <p><strong><i class="fas fa-clock"></i> Último Acceso:</strong> ${new Date(latestRecord.time).toLocaleString()}</p>
            <p><strong><i class="fas fa-history"></i> Total de Sesiones Registradas:</strong> ${ipRecords.length}</p>`;
    }
}


// ======================= LÓGICA DE CALIBRACIÓN DE ARMAS (NUEVO) =======================

function loadWeaponConfigs() {
    // Carga configuraciones guardadas desde localStorage al iniciar
    savedWeaponConfigs = JSON.parse(localStorage.getItem('weaponConfigs')) || {};
    console.log('Configuraciones de armas cargadas:', savedWeaponConfigs);
    
    // Inicializa los listeners para todos los sliders (incluidos los de calibración temporal)
    document.querySelectorAll('.range-input').forEach(input => {
        input.addEventListener('input', (e) => { 
            const valueSpan = input.closest('.slider-container')?.querySelector('.range-value span');
            if (valueSpan) {
                const currentValue = e.target.value;
                if(e.target.id === 'dpi-increase-slider' && currentValue > 0) {
                     valueSpan.textContent = `+${currentValue}`;
                } else {
                     valueSpan.textContent = currentValue;
                }
            }
        });
    });
}

function selectWeaponConfig(weaponKey, weaponName) {
    selectedWeapon = weaponKey;
    document.getElementById('current-weapon-name').textContent = weaponName;
    document.getElementById('weapon-config-panel').style.display = 'block';
    
    const config = savedWeaponConfigs[weaponKey] || { 
        rcs_v: 50, 
        rcs_h: 0, 
        smooth: 50,
        enabled: true 
    };

    // Actualizar Sliders en el Panel Temporal (y disparar evento 'input' para actualizar sus displays)
    document.getElementById('calib-rcs-v').value = config.rcs_v;
    document.getElementById('calib-rcs-v').dispatchEvent(new Event('input'));
    
    document.getElementById('calib-rcs-h').value = config.rcs_h;
    document.getElementById('calib-rcs-h').dispatchEvent(new Event('input'));
    
    document.getElementById('calib-smooth').value = config.smooth;
    document.getElementById('calib-smooth').dispatchEvent(new Event('input'));

    document.getElementById('calib-enabled').checked = config.enabled;
}

function saveWeaponConfig() {
    playSound('click');
    if (!selectedWeapon) {
        playSound('error');
        return alert('Por favor, selecciona un arma primero.');
    }
    
    // Obtener valores actuales del panel temporal
    const rcsV = document.getElementById('calib-rcs-v').value;
    const rcsH = document.getElementById('calib-rcs-h').value;
    const smooth = document.getElementById('calib-smooth').value;
    const enabled = document.getElementById('calib-enabled').checked;

    const newConfig = {
        rcs_v: parseInt(rcsV),
        rcs_h: parseInt(rcsH),
        smooth: parseInt(smooth),
        enabled: enabled
    };

    // Guardar en localStorage
    savedWeaponConfigs[selectedWeapon] = newConfig;
    localStorage.setItem('weaponConfigs', JSON.stringify(savedWeaponConfigs));
    
    playSound('success');
    alert(`Configuración para ${document.getElementById('current-weapon-name').textContent} guardada exitosamente.`);
    console.log(`Configuración guardada para ${selectedWeapon}:`, newConfig);
}


// ======================= NUEVAS FUNCIONES PARA EL ADMIN =======================

// --- Control Global de Funciones ---
function setupGlobalControls() {
    const globalMap = {
        'global-aimbot': 'aimbot_enabled',
        'global-esp': 'esp_enabled',
        'global-fakelag': 'fakelag_enabled'
    };

    // 1. Cargar desde Firebase al iniciar el panel
    loadGlobalSettings(); 

    // 2. Añadir Listeners para guardar en Firebase al cambiar
    Object.entries(globalMap).forEach(([id, dbKey]) => {
        const toggle = document.getElementById(id);
        if (toggle) {
            toggle.addEventListener('change', function() {
                playSound('toggle');
                updateGlobalSetting(dbKey, this.checked);
            });
        }
    });
}

const GLOBAL_SETTINGS_DOC = doc(db, "globalSettings", "config");

async function loadGlobalSettings() {
    try {
        const docSnap = await getDoc(GLOBAL_SETTINGS_DOC);
        if (docSnap.exists()) {
            const settings = docSnap.data();
            console.log("Configuración global cargada de Firebase:", settings);
            
            // 1. Actualizar Toggles en el Panel Admin
            document.getElementById('global-aimbot').checked = settings.aimbot_enabled !== false;
            document.getElementById('global-esp').checked = settings.esp_enabled !== false;
            document.getElementById('global-fakelag').checked = settings.fakelag_enabled !== false;

            // 2. Guardar en localStorage (para que la UI reaccione inmediatamente sin recargar)
            localStorage.setItem('global_Aimbot', settings.aimbot_enabled);
            localStorage.setItem('global_ESP', settings.esp_enabled);
            localStorage.setItem('global_FakeLag', settings.fakelag_enabled);
            
        } else {
            console.warn("Documento de configuración global no encontrado. Usando valores por defecto.");
        }
    } catch (error) {
        console.error("Error al cargar configuración global:", error);
    }
}

async function updateGlobalSetting(key, value) {
    try {
        await updateDoc(GLOBAL_SETTINGS_DOC, {
            [key]: value // Usa la sintaxis de propiedad computada para actualizar el campo
        });
        console.log(`${key} actualizado globalmente a ${value}`);
        // Sincronizar con localStorage para reacción inmediata
        localStorage.setItem(`global_${key.replace('_enabled', '')}`, value); 
    } catch (error) {
        console.error(`Error al actualizar ${key}:`, error);
    }
}


// --- Gestión de Usuarios Locales (localStorage) ---
function setupLocalUserManagement() {
    const userListEl = document.getElementById('localUserList');
    const addUserBtn = document.getElementById('addNewLocalUserBtn');

    if (userListEl) {
        renderLocalUsers();
        addUserBtn.addEventListener('click', promptAddNewUser);
    }
}

function renderLocalUsers() {
    const userListEl = document.getElementById('localUserList');
    const users = JSON.parse(localStorage.getItem('users')) || [];
    
    if (users.length === 0) {
        userListEl.innerHTML = '<p class="placeholder">No hay usuarios locales registrados (además del admin).</p>';
        return;
    }

    userListEl.innerHTML = users.map(user => `
        <div class="ip-item" data-username="${user.username}">
            <i class="fas fa-user-circle flag-icon" style="color: var(--accent-color); font-size: 20px;"></i>
            <span class="ip-address">${user.username}</span>
            <div class="ip-actions">
                <button class="delete-btn" data-username="${user.username}" title="Eliminar Usuario Local"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
    `).join('');
    
    userListEl.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const username = e.currentTarget.dataset.username;
            deleteLocalUser(username);
        });
    });
}

function promptAddNewUser() {
    playSound('click');
    const username = prompt('Introduce el nuevo nombre de usuario:');
    if (username && username.trim()) {
        const password = prompt(`Introduce la contraseña para ${username.trim()}:`);
        if (password) {
            const users = JSON.parse(localStorage.getItem('users')) || [];
            if (users.some(u => u.username.toLowerCase() === username.trim().toLowerCase())) {
                playSound('error');
                alert('Ese usuario ya existe.');
                return;
            }
            users.push({ username: username.trim(), password: password });
            localStorage.setItem('users', JSON.stringify(users));
            playSound('success');
            renderLocalUsers();
        } else {
            playSound('error');
            alert('La contraseña no puede estar vacía.');
        }
    }
}

function deleteLocalUser(usernameToDelete) {
    playSound('click');
    if (usernameToDelete === 'NomoreDoa') {
        playSound('error');
        return alert('No se puede eliminar la cuenta de Administrador.');
    }
    if (confirm(`¿Estás seguro de que quieres eliminar el usuario local "${usernameToDelete}"?`)) {
        let users = JSON.parse(localStorage.getItem('users')) || [];
        users = users.filter(u => u.username !== usernameToDelete);
        localStorage.setItem('users', JSON.stringify(users));
        playSound('success');
        renderLocalUsers();
    }
}


// ======================= 7. HACER FUNCIONES GLOBALES PARA EL HTML (MODIFICADO) =======================
window.checkAdminPass = async () => {
    playSound('click');
    // 'ZmxvY2t6' es 'flockz' en base64
    if (document.getElementById('adminPassInput').value === atob('ZmxvY2t6')) { 
        playSound('success');
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        await displayUserRecords(); // Llama a displayUserRecords que ahora inicializa lo nuevo
    } else {
        playSound('error');
        alert('Contraseña de administrador incorrecta');
    }
};
window.clearRecords = clearRecords;
window.changeTheme = changeTheme;

// --- Funciones Auxiliares (Declaradas como funciones normales para ser usadas en el módulo) ---

function playSound(soundId) {
    if (document.getElementById('sound-toggle')?.checked === false) return;
    const audio = document.getElementById(`audio-${soundId}`);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn("Error al reproducir audio:", e));
    }
}

function showSection(sectionName, event) {
    document.querySelectorAll('.menu-section').forEach(s => s.classList.remove('active'));
    document.getElementById(sectionName)?.classList.add('active');
    
    if (event) {
        document.querySelectorAll('.sidebar-icon').forEach(i => i.classList.remove('active'));
        event.currentTarget.classList.add('active');
    }
    
    // Ocultar panel de calibracion si se cambia de sección
    if (sectionName !== 'calibration') {
        document.getElementById('weapon-config-panel').style.display = 'none';
        selectedWeapon = null;
        document.querySelectorAll('.weapon-card').forEach(c => c.classList.remove('selected'));
    }
}

function applySavedTheme() {
    const root = document.documentElement;
    const savedTheme = localStorage.getItem('selectedTheme');
    const themes = {
        'dark': {'--primary-bg': '#0a0a0f','--secondary-bg': '#13131a','--accent-color': '#6366f1','--glass-bg': 'rgba(25, 25, 35, 0.4)'},
        'red': {'--primary-bg': '#1f0d0d','--secondary-bg': '#2e1414','--accent-color': '#ef4444','--glass-bg': 'rgba(46, 20, 20, 0.4)'},
        'blue': {'--primary-bg': '#0d111f','--secondary-bg': '#141a2e','--accent-color': '#3b82f6','--glass-bg': 'rgba(20, 26, 46, 0.4)'},
        'green': {'--primary-bg': '#0d1f0d','--secondary-bg': '#142e14','--accent-color': '#10b981','--glass-bg': 'rgba(20, 46, 20, 0.4)'}
    };
    
    let finalTheme = savedTheme || 'dark';
    if (themes[finalTheme]) {
        for (const [key, value] of Object.entries(themes[finalTheme])) {
            root.style.setProperty(key, value);
        }
    }
    localStorage.setItem('selectedTheme', finalTheme);
}

function changeTheme(theme) {
    playSound('click');
    const root = document.documentElement;
    const themes = {
        'dark': {'--primary-bg': '#0a0a0f','--secondary-bg': '#13131a','--accent-color': '#6366f1','--glass-bg': 'rgba(25, 25, 35, 0.4)'},
        'red': {'--primary-bg': '#1f0d0d','--secondary-bg': '#2e1414','--accent-color': '#ef4444','--glass-bg': 'rgba(46, 20, 20, 0.4)'},
        'blue': {'--primary-bg': '#0d111f','--secondary-bg': '#141a2e','--accent-color': '#3b82f6','--glass-bg': 'rgba(20, 26, 46, 0.4)'},
        'green': {'--primary-bg': '#0d1f0d','--secondary-bg': '#142e14','--accent-color': '#10b981','--glass-bg': 'rgba(20, 46, 20, 0.4)'}
    };
    if (themes[theme]) {
        for (const [key, value] of Object.entries(themes[theme])) {
            root.style.setProperty(key, value);
        }
        localStorage.setItem('selectedTheme', theme);
    }
}

function generateRandomSensitivity() {
    playSound('click');
    const sliders = document.querySelectorAll('#sensitivity .range-input');
    sliders.forEach(slider => {
        const min = parseInt(slider.min, 10);
        const max = parseInt(slider.max, 10);
        const randomValue = Math.floor(Math.random() * (max - min + 1)) + min;
        slider.value = randomValue;
        slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    playSound('success');
}