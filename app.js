import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

// Firebase configuration from the relationship app
const firebaseConfig = {
    apiKey: "AIzaSyDAQ5Pl-qcVV85eV2-GxAMP_gyk7pClzIg",
    authDomain: "love-people.firebaseapp.com",
    projectId: "love-people",
    storageBucket: "love-people.appspot.com",
    appId: "1:1040863971619:web:9739dbcc29b6877d436496"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Auth DOM Elements
const loginScreen = document.getElementById('loginScreen');
const appContent = document.getElementById('appContent');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userGreeting = document.getElementById('userGreeting');

// App DOM Elements
const fabAdd = document.getElementById('fabAdd');
const addModal = document.getElementById('addModal');
const closeModal = document.getElementById('closeModal');
const addForm = document.getElementById('addForm');
const photoInput = document.getElementById('photoInput');
const fileNameDisplay = document.getElementById('fileName');
const imagePreview = document.getElementById('imagePreview');
const submitBtn = document.getElementById('submitBtn');
const submitText = document.getElementById('submitText');
const submitLoading = document.getElementById('submitLoading');
const feedContainer = document.getElementById('feedContainer');
const totalCountDisplay = document.getElementById('totalCount');
const totalCaloriesDisplay = document.getElementById('totalCalories');
const totalSugarDisplay = document.getElementById('totalSugar');
const percentileTextDisplay = document.getElementById('percentileText');

// Set default date logic moved to modal open
let unsubscribeSnapshot = null;
let currentUser = null;

// Auth Logic
const provider = new GoogleAuthProvider();

loginBtn.addEventListener('click', async () => {
    if (loginBtn.disabled) return;
    loginBtn.disabled = true;
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login failed", error);
        if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
            alert("Login failed! " + error.message);
        }
    } finally {
        loginBtn.disabled = false;
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Logout failed", error);
    }
});

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        // User is signed in
        loginScreen.classList.add('hidden');
        appContent.classList.remove('hidden');
        const firstName = (user.displayName || user.email || 'friend').split(' ')[0];
        userGreeting.textContent = `Hi ${firstName}!`;
        
        // Start listening to database
        startDatabaseListener();
    } else {
        currentUser = null;
        // User is signed out
        loginScreen.classList.remove('hidden');
        appContent.classList.add('hidden');
        
        if (unsubscribeSnapshot) {
            unsubscribeSnapshot();
            unsubscribeSnapshot = null;
        }
    }
});


// Modal Logic
function resetModalState() {
    addForm.reset();
    document.getElementById('editId').value = '';
    imagePreview.classList.add('hidden');
    imagePreview.removeAttribute('src');
    imagePreview.style.display = '';
    fileNameDisplay.textContent = '📸 Tap to snap a photo!';
    selectedFile = null;
    submitText.textContent = 'Log it! 🍉';
    submitText.classList.remove('hidden');
    submitLoading.classList.add('hidden');
    submitBtn.disabled = false;
}

fabAdd.addEventListener('click', () => {
    resetModalState();
    addModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('dateInput').valueAsDate = new Date();
});

closeModal.addEventListener('click', () => {
    addModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    resetModalState();
});

addModal.addEventListener('click', (e) => {
    if (e.target === addModal) {
        if (confirm("Discard your unlogged watermelon? 🍉🥺")) {
            closeModal.click();
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !addModal.classList.contains('hidden')) {
        closeModal.click();
    }
});

// Image Preview Logic
let selectedFile = null;
const MAX_IMAGE_DIMENSION = 1600;
const COMPRESSION_QUALITY = 0.82;

async function compressImage(file) {
    if (!file.type.startsWith('image/')) return file;
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
                const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            canvas.toBlob(
                (blob) => blob ? resolve(blob) : reject(new Error('Compression failed')),
                'image/jpeg',
                COMPRESSION_QUALITY
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read image'));
        };
        img.src = url;
    });
}

photoInput.addEventListener('change', (e) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];

    if (!file.type.startsWith('image/')) {
        alert('Please pick an image file 🍉');
        photoInput.value = '';
        return;
    }

    selectedFile = file;
    fileNameDisplay.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (ev) => {
        imagePreview.src = ev.target.result;
        imagePreview.style.display = '';
        imagePreview.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
});

// Form Submission
addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    
    // UI Loading state
    submitBtn.disabled = true;
    submitText.classList.add('hidden');
    submitLoading.classList.remove('hidden');

    try {
        const date = document.getElementById('dateInput').value;
        const size = document.getElementById('sizeInput').value;
        const portion = document.getElementById('portionInput').value;
        const location = document.getElementById('locationInput').value;
        const notes = document.getElementById('notesInput').value;
        const both = document.getElementById('bothCheckbox').checked;
        const editId = document.getElementById('editId').value;
        let imageUrl = null;

        // Upload image if exists
        if (selectedFile) {
            submitText.textContent = 'Uploading photo... 📸';
            submitText.classList.remove('hidden');
            submitLoading.classList.add('hidden');

            let blobToUpload = selectedFile;
            try {
                blobToUpload = await compressImage(selectedFile);
            } catch (compressErr) {
                console.warn('Compression failed, uploading original:', compressErr);
            }

            const safeName = (selectedFile.name || 'photo.jpg')
                .replace(/[^a-zA-Z0-9._-]/g, '_')
                .slice(-50);
            const fileRef = ref(storage, `watermelons/${currentUser.uid}/${Date.now()}_${safeName}`);
            const metadata = { contentType: blobToUpload.type || 'image/jpeg' };
            await uploadBytes(fileRef, blobToUpload, metadata);
            imageUrl = await getDownloadURL(fileRef);
        }

        // Save or Update Firestore
        const wmObj = {
            date: date,
            size: size,
            portion: parseFloat(portion),
            location: location,
            eatenBy: both ? "both" : "solo",
            notes: notes,
            updatedAt: new Date()
        };

        if (imageUrl) {
            wmObj.imageUrl = imageUrl;
        }

        if (editId) {
            await updateDoc(doc(db, "watermelons", editId), wmObj);
        } else {
            wmObj.createdAt = new Date();
            wmObj.addedBy = currentUser.displayName || currentUser.email || 'Someone';
            wmObj.userId = currentUser.uid;
            await addDoc(collection(db, "watermelons"), wmObj);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // Close modal and reset
        closeModal.click();
    } catch (error) {
        console.error("Error saving watermelon: ", error);
        let msg = error.message || 'Something went wrong.';
        if (error.code === 'storage/unauthorized') {
            msg = "Couldn't upload photo — Firebase Storage rules are blocking writes. Deploy storage.rules to fix.";
        } else if (error.code === 'storage/canceled') {
            msg = 'Photo upload was canceled.';
        } else if (error.code === 'storage/retry-limit-exceeded') {
            msg = 'Photo upload timed out. Check your connection and try again.';
        }
        alert("Failed to save: " + msg);
    } finally {
        submitBtn.disabled = false;
        submitText.classList.remove('hidden');
        submitLoading.classList.add('hidden');
    }
});

function startDatabaseListener() {
    const q = query(collection(db, "watermelons"), orderBy("date", "desc"));
    unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const watermelons = [];
        snapshot.forEach((doc) => {
            watermelons.push({ id: doc.id, ...doc.data() });
        });
        
        renderFeed(watermelons);
        updateStats(watermelons);
    }, (error) => {
        console.error("Database permission error: ", error);
        feedContainer.innerHTML = `<div class="loading-state">Error loading data. Are your security rules set up properly?</div>`;
    });
}

function renderFeed(watermelons) {
    if (watermelons.length === 0) {
        feedContainer.innerHTML = `
            <div class="loading-state">
                <div class="bounce-emoji" style="font-size: 60px;">🥺</div>
                <p>No watermelons yet! Time to eat some!</p>
            </div>`;
        return;
    }

    feedContainer.innerHTML = '';
    watermelons.forEach(wm => {
        const card = document.createElement('div');
        card.className = 'wm-card glass-panel';
        
        // Parse YYYY-MM-DD as a local date (avoid UTC drift)
        const [y, m, d] = (wm.date || '').split('-').map(Number);
        const dateObj = (y && m && d) ? new Date(y, m - 1, d) : new Date();
        const formattedDate = dateObj.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
        const relativeDate = formatRelativeDate(dateObj);

        let imageHTML = '';
        if (wm.imageUrl) {
            imageHTML = `
                <div class="wm-image-container">
                    <img src="${escapeHTML(wm.imageUrl)}" alt="Watermelon slice" loading="lazy" data-zoom="1">
                </div>
            `;
        } else {
            imageHTML = `
                <div class="wm-image-container wm-image-placeholder">
                    <span class="wm-no-image">🍉</span>
                </div>
            `;
        }
        
        let sizeText = '';
        if (wm.size === 'small') sizeText = 'Small (Personal)';
        else if (wm.size === 'large') sizeText = 'Large';
        else if (wm.size === 'cup') sizeText = 'One Cup';
        else sizeText = 'Standard';
        
        let portionText = '';
        if (wm.portion) {
            portionText = `${Math.round(wm.portion * 100)}% eaten`;
        }

        const authorName = wm.addedBy ? wm.addedBy.split(' ')[0] : 'Someone';

        let badgesHTML = '';
        if (wm.size) badgesHTML += `<span class="wm-badge">${sizeText}</span>`;
        if (wm.portion) badgesHTML += `<span class="wm-badge">${portionText}</span>`;
        
        if (wm.eatenBy === 'solo') {
            badgesHTML += `<span class="wm-badge">👤 ${authorName}</span>`;
        } else {
            badgesHTML += `<span class="wm-badge">👥 Both</span>`;
        }

        let locationHTML = '';
        if (wm.location) {
            locationHTML = `<span class="wm-location">📍 ${escapeHTML(wm.location)}</span>`;
        }

        let actionsHTML = '';
        if (currentUser) {
            actionsHTML = `
                <div class="wm-actions">
                    <button class="action-btn edit-btn" data-id="${wm.id}" title="Edit">✏️</button>
                    <button class="action-btn del-btn" data-id="${wm.id}" title="Delete">🗑️</button>
                </div>
            `;
        }

        card.innerHTML = `
            ${actionsHTML}
            ${imageHTML}
            <div class="wm-details">
                <div class="wm-meta">
                    <span class="wm-date">${formattedDate}</span>
                    ${relativeDate ? `<span class="wm-relative">${relativeDate}</span>` : ''}
                    <span class="wm-author">by ${escapeHTML(authorName)}</span>
                </div>
                ${badgesHTML ? `<div class="wm-badges">${badgesHTML}</div>` : ''}
                ${locationHTML}
                ${wm.notes && wm.notes.trim() ? `<p class="wm-notes">${escapeHTML(wm.notes)}</p>` : ''}
            </div>
        `;

        const zoomImg = card.querySelector('img[data-zoom]');
        if (zoomImg) {
            zoomImg.addEventListener('click', () => openLightbox(zoomImg.src));
        }
        feedContainer.appendChild(card);
        
        if (currentUser) {
            const editBtn = card.querySelector('.edit-btn');
            const delBtn = card.querySelector('.del-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    resetModalState();
                    document.getElementById('editId').value = wm.id;
                    document.getElementById('dateInput').value = wm.date;
                    document.getElementById('sizeInput').value = wm.size || 'standard';
                    document.getElementById('portionInput').value = wm.portion !== undefined ? wm.portion : 1.0;
                    document.getElementById('locationInput').value = wm.location || '';
                    document.getElementById('notesInput').value = wm.notes || '';
                    document.getElementById('bothCheckbox').checked = wm.eatenBy !== 'solo';
                    submitText.textContent = 'Update it! ✨';

                    if (wm.imageUrl) {
                        imagePreview.src = wm.imageUrl;
                        imagePreview.classList.remove('hidden');
                        fileNameDisplay.textContent = 'Keeping existing photo';
                    }

                    addModal.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                });
            }
            if (delBtn) {
                delBtn.addEventListener('click', async () => {
                    if (confirm("Are you sure you want to delete this watermelon? 🍉❌")) {
                        try {
                            await deleteDoc(doc(db, "watermelons", wm.id));
                        } catch (e) {
                            console.error("Delete failed", e);
                            alert("Delete failed: " + e.message);
                        }
                    }
                });
            }
        }
    });
}

function updateStats(watermelons) {
    const count = watermelons.length;
    animateValue(totalCountDisplay, parseInt(totalCountDisplay.textContent, 10) || 0, count, 1000);

    let totalCals = 0;
    let totalSugars = 0;

    watermelons.forEach(wm => {
        let size = wm.size || 'standard';
        let portion = wm.portion !== undefined ? wm.portion : 1.0;

        let baseCal = 2500;
        let baseSugar = 550;

        if (size === 'small') {
            baseCal = 650;
            baseSugar = 140;
        } else if (size === 'large') {
            baseCal = 4000;
            baseSugar = 850;
        } else if (size === 'cup') {
            baseCal = 45;
            baseSugar = 9;
        }

        totalCals += (baseCal * portion);
        totalSugars += (baseSugar * portion);
    });

    animateValue(totalCaloriesDisplay, parseInt(totalCaloriesDisplay.textContent, 10) || 0, Math.round(totalCals), 1000);
    animateValue(totalSugarDisplay, parseInt(totalSugarDisplay.textContent, 10) || 0, Math.round(totalSugars), 1000, 'g');

    let percentile = 0;
    if (count === 0) percentile = 10;
    else if (count < 3) percentile = 30;
    else if (count < 8) percentile = 60;
    else if (count < 15) percentile = 85;
    else if (count < 25) percentile = 95;
    else percentile = 99;

    if (count === 0) {
        percentileTextDisplay.textContent = "Eat a slice to join the rankings! ✨";
    } else {
        percentileTextDisplay.innerHTML = `You beat <strong>${percentile}%</strong> of humanity!`;
    }
}

// Track active animation frames so rapid updates don't stack
const animationFrames = new WeakMap();

function animateValue(obj, start, end, duration, suffix = '') {
    const prev = animationFrames.get(obj);
    if (prev) cancelAnimationFrame(prev);

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        obj.textContent = Math.floor(easeProgress * (end - start) + start) + suffix;
        if (progress < 1) {
            animationFrames.set(obj, requestAnimationFrame(step));
        } else {
            animationFrames.delete(obj);
        }
    };
    animationFrames.set(obj, requestAnimationFrame(step));
}

function formatRelativeDate(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(date);
    target.setHours(0, 0, 0, 0);
    const days = Math.round((today - target) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days === -1) return 'tomorrow';
    if (days > 1 && days < 7) return `${days} days ago`;
    if (days < -1 && days > -7) return `in ${-days} days`;
    if (days >= 7 && days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days >= 30 && days < 365) return `${Math.floor(days / 30)}mo ago`;
    if (days >= 365) return `${Math.floor(days / 365)}y ago`;
    return '';
}

// Utility to escape HTML and prevent XSS
function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>'"]/g,
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}

// Lightbox for full-size photo viewing
function openLightbox(src) {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `
        <button class="lightbox-close" aria-label="Close">×</button>
        <img src="${escapeHTML(src)}" alt="Watermelon photo">
    `;
    const close = () => {
        overlay.classList.add('lightbox-closing');
        setTimeout(() => overlay.remove(), 200);
        document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    overlay.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
}
