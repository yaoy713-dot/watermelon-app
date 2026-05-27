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
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Login failed", error);
        alert("Login failed! " + error.message);
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
        userGreeting.textContent = `Hi ${user.displayName.split(' ')[0]}!`;
        
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
fabAdd.addEventListener('click', () => {
    addModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    document.getElementById('dateInput').valueAsDate = new Date();
});

closeModal.addEventListener('click', () => {
    addModal.classList.add('hidden');
    document.body.style.overflow = 'auto';
    addForm.reset();
    imagePreview.classList.add('hidden');
    fileNameDisplay.textContent = '📸 Tap to snap a photo!';
    selectedFile = null;
});

addModal.addEventListener('click', (e) => {
    if (e.target === addModal) {
        if (confirm("Discard your unlogged watermelon? 🍉🥺")) {
            closeModal.click();
        }
    }
});

// Image Preview Logic
let selectedFile = null;

photoInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        selectedFile = e.target.files[0];
        fileNameDisplay.textContent = selectedFile.name;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreview.classList.remove('hidden');
        };
        reader.readAsDataURL(selectedFile);
    }
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
            const fileRef = ref(storage, `watermelons/${Date.now()}_${selectedFile.name}`);
            await uploadBytes(fileRef, selectedFile);
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
            wmObj.addedBy = currentUser.displayName;
            wmObj.userId = currentUser.uid;
            await addDoc(collection(db, "watermelons"), wmObj);
        }

        // Close modal and reset
        closeModal.click();
    } catch (error) {
        console.error("Error adding document: ", error);
        alert("Failed to save watermelon! " + error.message);
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
        
        // Format date nicely
        const dateObj = new Date(wm.date);
        const formattedDate = new Date(dateObj.getTime() + Math.abs(dateObj.getTimezoneOffset() * 60000)).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });

        let imageHTML = '';
        if (wm.imageUrl) {
            imageHTML = `
                <div class="wm-image-container">
                    <img src="${wm.imageUrl}" alt="Watermelon slice" loading="lazy">
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
                    <span class="wm-author">by ${authorName}</span>
                </div>
                ${badgesHTML ? `<div class="wm-badges">${badgesHTML}</div>` : ''}
                ${locationHTML}
                ${wm.notes ? `<p class="wm-notes">${escapeHTML(wm.notes)}</p>` : ''}
            </div>
        `;
        feedContainer.appendChild(card);
        
        if (currentUser) {
            const editBtn = card.querySelector('.edit-btn');
            const delBtn = card.querySelector('.del-btn');
            if (editBtn) {
                editBtn.addEventListener('click', () => {
                    document.getElementById('editId').value = wm.id;
                    document.getElementById('dateInput').value = wm.date;
                    document.getElementById('sizeInput').value = wm.size || 'standard';
                    document.getElementById('portionInput').value = wm.portion !== undefined ? wm.portion : 1.0;
                    document.getElementById('locationInput').value = wm.location || '';
                    document.getElementById('notesInput').value = wm.notes || '';
                    document.getElementById('bothCheckbox').checked = wm.eatenBy !== 'solo';
                    document.getElementById('submitBtn').innerHTML = 'Update it! <span class="btn-icon">✨</span>';
                    
                    selectedFile = null;
                    if (wm.imageUrl) {
                        imagePreview.src = wm.imageUrl;
                        imagePreview.style.display = 'block';
                        fileNameDisplay.textContent = 'Keeping existing photo';
                    } else {
                        imagePreview.style.display = 'none';
                        fileNameDisplay.textContent = '📸 Tap to snap a photo!';
                    }

                    addModal.classList.remove('hidden');
                    setTimeout(() => {
                        addModal.querySelector('.modal-content').style.transform = 'translateY(0)';
                    }, 10);
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
    animateValue(totalCountDisplay, parseInt(totalCountDisplay.textContent) || 0, count, 1000);
    
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

    animateValue(totalCaloriesDisplay, parseInt(totalCaloriesDisplay.textContent) || 0, Math.round(totalCals), 1000);
    animateValueWithSuffix(totalSugarDisplay, parseInt(totalSugarDisplay.textContent) || 0, Math.round(totalSugars), 1000, 'g');
    
    let percentile = 0;
    if (count === 0) percentile = 10;
    else if (count < 3) percentile = 30;
    else if (count < 8) percentile = 60;
    else if (count < 15) percentile = 85;
    else if (count < 25) percentile = 95;
    else percentile = 99;

    if (count === 0) {
        percentileTextDisplay.innerHTML = "Eat a slice to join the rankings! ✨";
    } else {
        percentileTextDisplay.innerHTML = `You beat <strong>${percentile}%</strong> of humanity!`;
    }
}

// Utility to animate numbers with a suffix
function animateValueWithSuffix(obj, start, end, duration, suffix) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        obj.innerHTML = Math.floor(easeProgress * (end - start) + start) + suffix;
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Utility to animate numbers
function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        obj.innerHTML = Math.floor(easeProgress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// Utility to escape HTML and prevent XSS
function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag])
    );
}
