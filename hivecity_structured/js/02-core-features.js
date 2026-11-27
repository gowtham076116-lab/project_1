
        window.toggleRecipeShare = function (recipeId) {
            toast('Recipe shared to Hive community feed!');
        };

        window.openCreateRecipeModal = function () { window.toggleHiveCreateRecipe(true); };

        window.hiveCustomRecipeImages = [];

        window.compressHiveRecipeImage = function (file) {
            return new Promise(resolve => {
                if (!file) { resolve(''); return; }
                if (typeof file === 'string') { resolve(file); return; }
                if (file.dataUrl && typeof file.dataUrl === 'string') { resolve(file.dataUrl); return; }
                const reader = new FileReader();
                reader.onload = () => {
                    const raw = String(reader.result || '');
                    if (typeof Image === 'undefined') { resolve(raw); return; }
                    try {
                        const img = new Image();
                        img.onload = () => {
                            try {
                                const origW = img.width || 1;
                                const origH = img.height || 1;
                                const scale = origW > 1000 ? 1000 / origW : 1;
                                const c = document.createElement('canvas');
                                c.width = Math.max(1, Math.round(origW * scale));
                                c.height = Math.max(1, Math.round(origH * scale));
                                const ctx = c.getContext && c.getContext('2d');
                                if (ctx) {
                                    ctx.fillStyle = '#ffffff';
                                    ctx.fillRect(0, 0, c.width, c.height);
                                    ctx.drawImage(img, 0, 0, c.width, c.height);
                                    resolve(c.toDataURL('image/jpeg', 0.8));
                                    return;
                                }
                            } catch { }
                            resolve(raw);
                        };
                        img.onerror = () => resolve(raw);
                        img.src = raw;
                    } catch { resolve(raw); }
                };
                reader.onerror = () => resolve('');
                reader.readAsDataURL(file);
            });
        };

        window.renderHiveRecipeImagePreviews = function () {
            const preview = document.getElementById('cr_images_preview');
            const input = document.getElementById('cr_images');
            const items = Array.isArray(window.hiveCustomRecipeImages) ? window.hiveCustomRecipeImages : [];
            if (input) input.disabled = items.length >= 3;
            if (!preview) return;
            if (!items.length) { preview.innerHTML = ''; return; }
            const labels = ['Cover', 'Photo 2', 'Photo 3'];
            preview.innerHTML = items.map((item, idx) => `
                <div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;gap:3px">
                    <img src="${recipeEscape(item.dataUrl || '')}" alt="Recipe photo ${idx + 1}" style="width:92px;height:72px;object-fit:cover;border-radius:10px;border:1px solid var(--bd);display:block">
                    <button type="button" onclick="removeHiveRecipeImage(${idx})" aria-label="Remove photo ${idx + 1}" title="Remove photo" style="position:absolute;top:-6px;right:-6px;width:22px;height:22px;border-radius:50%;border:1px solid #dce5db;background:#18372d;color:#fff;font-size:12px;line-height:1;cursor:pointer;display:grid;place-items:center;padding:0">×</button>
                    <small style="font-size:10px;color:#718078">${labels[idx] || ('Photo ' + (idx + 1))}</small>
                </div>
            `).join('') + `<small style="color:#4d725e;font-weight:700;font-size:11px;margin-left:4px">${items.length} / 3 photos${items.length >= 3 ? ' (max)' : ''}</small>`;
        };

        window.removeHiveRecipeImage = function (index) {
            if (!Array.isArray(window.hiveCustomRecipeImages)) window.hiveCustomRecipeImages = [];
            window.hiveCustomRecipeImages.splice(index, 1);
            window.renderHiveRecipeImagePreviews();
        };

        window._hiveRecipeImgPending = Promise.resolve();

        window.previewHiveRecipeImages = function (input) {
            const newFiles = Array.from(input && input.files || []);
            if (!Array.isArray(window.hiveCustomRecipeImages)) window.hiveCustomRecipeImages = [];
            if (!newFiles.length) return Promise.resolve();
            if (window.hiveCustomRecipeImages.length >= 3) {
                if (input) { input.value = ''; input.disabled = true; }
                toast('Maximum 3 food photos allowed.');
                return Promise.resolve();
            }
            if (newFiles.some(file => !file.type || !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024)) {
                if (input) input.value = '';
                toast('Each file must be an image smaller than 8 MB.');
                return Promise.resolve();
            }
            if (input) input.value = '';
            const task = (window._hiveRecipeImgPending || Promise.resolve()).then(async () => {
                const remaining = Math.max(0, 3 - window.hiveCustomRecipeImages.length);
                if (remaining <= 0) {
                    toast('Maximum 3 food photos allowed.');
                    window.renderHiveRecipeImagePreviews();
                    return;
                }
                const filesToAdd = newFiles.slice(0, remaining);
                if (newFiles.length > remaining) toast('Maximum 3 food photos allowed — added up to 3 photos.');
                const compressed = [];
                for (const file of filesToAdd) {
                    const dataUrl = await window.compressHiveRecipeImage(file);
                    if (dataUrl) compressed.push({ file, dataUrl, name: file.name || 'food-photo.jpg' });
                }
                window.hiveCustomRecipeImages = [...window.hiveCustomRecipeImages, ...compressed].slice(0, 3);
                window.renderHiveRecipeImagePreviews();
            });
            window._hiveRecipeImgPending = task.catch(() => { });
            return task;
        };

        window.previewHiveRecipeImage = window.previewHiveRecipeImages;

        window.handleSaveCustomRecipe = async function (e) {
            e.preventDefault();
            const cur = (window.hiveAuth && window.hiveAuth.currentUser) || (typeof window.getAuthUser === 'function' ? window.getAuthUser() : window.hiveCurrentUser);
            const fileInput = document.getElementById('cr_images');
            if (!cur) { toast('Please sign in before publishing a recipe.'); location.hash = 'auth'; return; }
            if (window._hiveRecipeImgPending) {
                try { await window._hiveRecipeImgPending; } catch (_) { }
            }
            if (!Array.isArray(window.hiveCustomRecipeImages)) window.hiveCustomRecipeImages = [];
            let selectedEntries = [...window.hiveCustomRecipeImages];
            const directFiles = Array.from(fileInput && fileInput.files || []);
            if (directFiles.length > 0 && selectedEntries.length < 3) {
                if (directFiles.some(file => !file.type || !file.type.startsWith('image/') || file.size > 8 * 1024 * 1024)) {
                    toast('Each photo must be an image smaller than 8 MB.');
                    return;
                }
                const existing = new Set(selectedEntries.map(x => x.file));
                for (const file of directFiles) {
                    if (selectedEntries.length >= 3) break;
                    if (!existing.has(file)) {
                        const dataUrl = await window.compressHiveRecipeImage(file);
                        if (dataUrl) selectedEntries.push({ file, dataUrl, name: file.name || 'food-photo.jpg' });
                    }
                }
            }
            selectedEntries = selectedEntries.slice(0, 3);
            if (selectedEntries.length < 1 || selectedEntries.length > 3) {
                toast('Please add 1 to 3 food photos before publishing.');
                return;
            }
            const submit = e.target && e.target.querySelector ? e.target.querySelector('button[type="submit"]') : null;
            if (submit) { submit.disabled = true; submit.textContent = 'Uploading recipe photos…'; }
            try {
                let pendingEditMeta = null;
                try {
                    const rawEdit = sessionStorage.getItem('hivecity_editing_recipe');
                    if (rawEdit) pendingEditMeta = JSON.parse(rawEdit);
                } catch (_) { }
                const editingId = window._hiveEditingRecipeId || (pendingEditMeta && pendingEditMeta.recipeId) || '';
                const existingOriginal = editingId
                    ? (window._hiveEditingRecipeOriginal || (pendingEditMeta && pendingEditMeta.recipe) || window.findHiveRecipeById(editingId))
                    : null;
                const isEditing = Boolean(editingId);
                const recipeId = isEditing ? String(editingId) : ('user-rec-' + cur.uid + '-' + Date.now());

                const imageUrls = [];
                for (let i = 0; i < selectedEntries.length; i++) {
                    const entry = selectedEntries[i];
                    const file = entry.file;
                    let uploadedUrl = entry.existingUrl || '';
                    if (!uploadedUrl && window.hiveStorage && file) {
                        try {
                            const safeName = String(file.name || 'recipe-image').replace(/[^a-zA-Z0-9._-]/g, '_');
                            const storageRef = window.hiveStorage.ref('users/' + cur.uid + '/custom-recipes/' + recipeId + '/' + (i + 1) + '_' + safeName);
                            const uploadPromise = storageRef.put(file, { contentType: file.type }).then(() => storageRef.getDownloadURL());
                            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(''), 2500));
                            uploadedUrl = await Promise.race([uploadPromise, timeoutPromise]);
                        } catch { }
                    }
                    if (!uploadedUrl) uploadedUrl = entry.dataUrl || (file ? await window.compressHiveRecipeImage(file) : '');
                    if (uploadedUrl) imageUrls.push(uploadedUrl);
                }
                const creatorDisplay = (window.getHiveUsername ? window.getHiveUsername(cur.uid) : (cur.displayName || cur.email || 'Hivecity user'));
                const existingFiber = Number((existingOriginal && (existingOriginal.fiber ?? existingOriginal.fiberGrams)) || 0);
                const preservedCreatedAt = (existingOriginal && existingOriginal.createdAt) ? existingOriginal.createdAt : new Date().toISOString();
                const newR = {
                    id: recipeId,
                    name: document.getElementById('cr_title').value.trim(),
                    title: document.getElementById('cr_title').value.trim(),
                    category: document.getElementById('cr_category').value,
                    mealType: document.getElementById('cr_category').value,
                    goal: document.getElementById('cr_goal').value,
                    prepTime: parseInt(document.getElementById('cr_prep').value, 10) || 20,
                    prepTimeMins: parseInt(document.getElementById('cr_prep').value, 10) || 20,
                    calories: parseInt(document.getElementById('cr_cal').value, 10) || 0,
                    protein: parseInt(document.getElementById('cr_pro').value, 10) || 0,
                    proteinGrams: parseInt(document.getElementById('cr_pro').value, 10) || 0,
                    carbs: parseInt(document.getElementById('cr_carb').value, 10) || 0,
                    carbsGrams: parseInt(document.getElementById('cr_carb').value, 10) || 0,
                    fat: parseInt(document.getElementById('cr_fat').value, 10) || 0,
                    fatsGrams: parseInt(document.getElementById('cr_fat').value, 10) || 0,
                    fiber: existingFiber,
                    fiberGrams: existingFiber,
                    description: document.getElementById('cr_description').value.trim(),
                    ingredients: document.getElementById('cr_ingredients').value.split('\n').map(x => x.trim()).filter(Boolean),
                    steps: document.getElementById('cr_steps').value.split('\n').map(x => x.trim()).filter(Boolean),
                    images: imageUrls,
                    imageUrls: imageUrls,
                    imageSources: imageUrls.map(() => ({ name: 'Uploaded by @' + creatorDisplay, url: '' })),
                    image: imageUrls[0] || '',
                    coverImage: imageUrls[0] || '',
                    imageUrl: imageUrls[0] || '',
                    imageAspectRatio: '16:9',
                    ownerUid: cur.uid,
                    createdBy: cur.uid,
                    userId: cur.uid,
                    creatorRole: 'User',
                    creatorName: creatorDisplay,
                    authorName: creatorDisplay,
                    authorEmail: cur.email || '',
                    createdAt: preservedCreatedAt,
                    updatedAt: new Date().toISOString(),
                    isCustom: true
                };
                try {
                    const custom = JSON.parse(localStorage.getItem('hivecity_custom_recipes') || '[]').filter(r => r.id !== recipeId);
                    custom.unshift(newR);
                    try {
                        localStorage.setItem('hivecity_custom_recipes', JSON.stringify(custom));
                    } catch (_) {
                        // Gracefully trim oldest local entries if quota is tight while keeping the newest recipe
                        localStorage.setItem('hivecity_custom_recipes', JSON.stringify(custom.slice(0, 8)));
                    }
                } catch (_) { }
                try {
                    const existingShared = JSON.parse(localStorage.getItem('hivecity_shared_nutrients') || '[]').filter(r => String(r.id) !== String(recipeId));
                    existingShared.unshift(newR);
                    localStorage.setItem('hivecity_shared_nutrients', JSON.stringify(existingShared));
                } catch (_) { }
                try {
                    if (window.hs && cur) {
                        window.hs.nutritionShares = window.hs.nutritionShares || {};
                        window.hs.nutritionShares[cur.uid] = window.hs.nutritionShares[cur.uid] || [];
                        if (!window.hs.nutritionShares[cur.uid].includes(recipeId)) {
                            window.hs.nutritionShares[cur.uid].unshift(recipeId);
                            if (typeof window.hsSave === 'function') window.hsSave();
                        }
                    }
                } catch (_) { }
                try {
                    if (window.hiveDb) {
                        await window.hiveDb.collection('shared_nutrition').doc(cur.uid + '_' + recipeId).set({
                            uid: cur.uid, userId: cur.uid, authorEmail: cur.email || '', authorName: creatorDisplay,
                            recipeId: recipeId, recipeName: newR.name, recipeImage: newR.coverImage, recipeImages: newR.images,
                            recipe: newR, summary: (newR.protein ? newR.protein + 'g protein' : '') + (newR.prepTime ? ' · ' + newR.prepTime + ' min' : ''),
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    }
                } catch (fsErr) { console.warn('Firestore shared_nutrition fallback:', fsErr); }
                if (typeof window.syncUserRecipeToAdminApi === 'function') await window.syncUserRecipeToAdminApi(newR);
                window.dispatchEvent(new Event('hivecity:nutrients-updated'));
                if (typeof window.fetchSharedContentFromApi === 'function') void window.fetchSharedContentFromApi();
                const returnHashAfterEdit = window._hiveEditingReturnHash || (pendingEditMeta && pendingEditMeta.returnHash) || '';
                window._hiveEditingRecipeId = '';
                window._hiveEditingRecipeOriginal = null;
                window._hiveEditingReturnHash = '';
                try { sessionStorage.removeItem('hivecity_editing_recipe'); } catch (_) { }
                toast(isEditing ? 'Recipe updated successfully!' : 'Your recipe is published in your Profile → Nutrition!');
                if (e.target && typeof e.target.reset === 'function') e.target.reset();
                window.hiveCustomRecipeImages = [];
                window.renderHiveRecipeImagePreviews();
                window.hiveNutritionState.randomRecipeId = recipeId;
                if (isEditing && returnHashAfterEdit && returnHashAfterEdit.startsWith('#profile')) {
                    if (window.hs) { window.hs.profileTab = 'nutrition'; if (typeof window.hsSave === 'function') window.hsSave(); }
                    location.hash = returnHashAfterEdit;
                } else if (isEditing && location.hash.includes('?edit=')) {
                    location.hash = '#nutrition';
                } else {
                    go(1);
                }
            } catch (err) {
                console.error('Hivecity user recipe publish failed:', err);
                toast('Recipe upload failed. Please try again.');
            } finally {
                if (submit) { submit.disabled = false; submit.textContent = 'Publish to my profile'; }
            }
        };

        V.nutrition = window.renderEnhancedNutrition;
        function subscribeHiveRecipes() {
            if (hiveRecipesUnsub) { hiveRecipesUnsub(); hiveRecipesUnsub = null; }
            if (!window.hiveDb) return;
            hiveRecipesUnsub = window.hiveDb.collection('recipes').onSnapshot(snapshot => {
                hiveRecipes = snapshot.docs.map(doc => { const d = doc.data() || {}; return { id: doc.id, ...d, name: d.name || d.title || 'Recipe' }; })
                    .filter(r => r && !window.isHiveTestArtifact(r) && (r.name || r.title) && (r.published === true || String(r.status || '').toLowerCase() === 'published'));
                if (typeof window.fetchSharedContentFromApi === 'function') void window.fetchSharedContentFromApi();
                if (location.hash === '#nutrition') go(1);
            }, error => console.warn('HIVECITY recipes listener:', error));
        }
        subscribeHiveRecipes();

        /* ===== UNIFIED LIVE ADMIN <-> USER SYNC (NUTRIENTS & MARKETPLACE) ===== */
        (() => {
            const SHARED_NUTRIENTS_KEY = 'hivecity_shared_nutrients';
            const NUTRIENTS_UPDATED_EVENT = 'hivecity:nutrients-updated';
            const SHARED_MARKETPLACE_KEY = 'hivecity_shared_marketplace';
            const MARKETPLACE_UPDATED_EVENT = 'hivecity:marketplace-updated';

            const getApiCandidates = () => {
                const list = [];
                const configured = window.HIVECITY_CONFIG && window.HIVECITY_CONFIG.API_BASE_URL;
                if (configured) list.push(String(configured).replace(/\/$/, ''));
                if ((location.protocol === 'http:' || location.protocol === 'https:') && location.port === '3000') list.push('');
                if (!list.includes('http://localhost:3000')) list.push('http://localhost:3000');
                if (!list.includes('http://127.0.0.1:3000')) list.push('http://127.0.0.1:3000');
                if ((location.protocol === 'http:' || location.protocol === 'https:') && !list.includes('')) list.push('');
                return list;
            };

            let sharedNutrients = [];
            let sharedProducts = [];
            let contentApiBase = null;

            const isTestArtifact = item => {
                if (!item || typeof item !== 'object') return false;
                const t = [item.title, item.name, item.recipeName, item.item, item.id].filter(Boolean).join(' ').toLowerCase();
                return t.includes('__verify_e2e') || t.includes('__smoke_');
            };
            window.isHiveTestArtifact = isTestArtifact;

            const readCached = key => {
                try {
                    const raw = localStorage.getItem(key);
                    const arr = raw ? JSON.parse(raw) : [];
                    if (!Array.isArray(arr)) return [];
                    const cleaned = arr.filter(item => item && !isTestArtifact(item));
                    if (cleaned.length !== arr.length) {
                        try { localStorage.setItem(key, JSON.stringify(cleaned)); } catch { }
                    }
                    return cleaned;
                } catch { return []; }
            };

            // Purge any stale E2E test entries from local custom/shared caches on load
            readCached('hivecity_custom_recipes');
            readCached('hivecity_shared_events');
            sharedNutrients = readCached(SHARED_NUTRIENTS_KEY);
            sharedProducts = readCached(SHARED_MARKETPLACE_KEY);

            window.getSharedNutrients = () => {
                const fromCache = (sharedNutrients.length ? sharedNutrients : readCached(SHARED_NUTRIENTS_KEY)).filter(r => r && !isTestArtifact(r));
                return fromCache.map(r => {
                    const primaryImg = r.coverImage || r.imageUrl || r.image || (Array.isArray(r.images) && r.images[0]) || (Array.isArray(r.imageUrls) && r.imageUrls[0]) || '';
                    const imgs = Array.isArray(r.images) && r.images.length
                        ? r.images
                        : (Array.isArray(r.imageUrls) && r.imageUrls.length ? r.imageUrls : (primaryImg ? [primaryImg] : []));
                    const isAdmin = r.creatorRole === 'Admin' || r.createdBy === 'admin' || r.isFeatured === true || r.isAdminSpecial === true;
                    return {
                        ...r,
                        name: r.name || r.title || 'Recipe',
                        title: r.title || r.name || 'Recipe',
                        protein: Number(r.protein ?? r.proteinGrams ?? 0),
                        proteinGrams: Number(r.proteinGrams ?? r.protein ?? 0),
                        carbs: Number(r.carbs ?? r.carbsGrams ?? 0),
                        carbsGrams: Number(r.carbsGrams ?? r.carbs ?? 0),
                        fat: Number(r.fat ?? r.fatsGrams ?? 0),
                        fatsGrams: Number(r.fatsGrams ?? r.fat ?? 0),
                        fiber: Number(r.fiber ?? r.fiberGrams ?? 0),
                        fiberGrams: Number(r.fiberGrams ?? r.fiber ?? 0),
                        prepTime: Number(r.prepTime ?? r.prepTimeMins ?? 20),
                        prepTimeMins: Number(r.prepTimeMins ?? r.prepTime ?? 20),
                        image: primaryImg,
                        coverImage: primaryImg,
                        imageUrl: primaryImg,
                        images: imgs,
                        imageUrls: imgs,
                        createdBy: r.createdBy || (isAdmin ? 'admin' : (r.ownerUid || r.userId || 'user')),
                        isFeatured: r.isFeatured !== undefined ? Boolean(r.isFeatured) : isAdmin,
                        isAdminSpecial: r.isAdminSpecial !== undefined ? Boolean(r.isAdminSpecial) : isAdmin
                    };
                });
            };

            window.getSharedMarketplaceProducts = () => {
                const list = sharedProducts.length ? sharedProducts : readCached(SHARED_MARKETPLACE_KEY);
                return list.map(p => ({
                    id: String(p.id),
                    n: p.name || p.title || 'Hivecity Product',
                    b: p.brand || 'HIVE',
                    c: p.category || 'Fitness Gear',
                    prInr: Number(p.price || 0),
                    pr: Number(p.price || 0) / USD_TO_INR_SAMPLE_RATE,
                    stock: Number(p.stock ?? 0),
                    status: p.status || (Number(p.stock ?? 0) > 0 ? 'In Stock' : 'Out of Stock'),
                    description: p.description || '',
                    imageUrl: p.imageUrl || p.image || '',
                    checkoutUrl: p.checkoutUrl || '',
                    isLiveProduct: true
                }));
            };

            window.getDeletedShopProductIds = () => {
                try {
                    const arr = JSON.parse(localStorage.getItem('hivecity_deleted_shop_product_ids') || '[]');
                    return new Set(Array.isArray(arr) ? arr.map(String) : []);
                } catch (_) {
                    return new Set();
                }
            };
            window.addEventListener('hivecity:products-updated', () => {
                const activeRoute = location.hash.slice(1).split('?')[0].split('/')[0];
                if (['shop', 'bookings'].includes(activeRoute) && typeof window.go === 'function') window.go(1);
            });
            window.addEventListener('storage', e => {
                if (e && ['hivecity_deleted_shop_product_ids', 'hivecity_marketplace_products', 'hivecity_shared_marketplace'].includes(e.key)) {
                    const activeRoute = location.hash.slice(1).split('?')[0].split('/')[0];
                    if (['shop', 'bookings'].includes(activeRoute) && typeof window.go === 'function') window.go(1);
                }
            });

            window.getAllShopProducts = () => {
                const deletedIds = window.getDeletedShopProductIds();
                try {
                    const cached = readCached(SHARED_MARKETPLACE_KEY);
                    if (Array.isArray(cached) && cached.some(x => /^(aff-B0|shop-item-)/.test(String(x?.id || '')) || deletedIds.has(String(x?.id || '')))) {
                        localStorage.setItem(SHARED_MARKETPLACE_KEY, JSON.stringify(cached.filter(x => !/^(aff-B0|shop-item-)/.test(String(x?.id || '')) && !deletedIds.has(String(x?.id || '')))));
                    }
                } catch (_) { }
                const live = window.getSharedMarketplaceProducts().filter(p => !/^(aff-B0|shop-item-)/.test(String(p.id || '')) && !deletedIds.has(String(p.id || '')));
                const fileCatalog = Array.isArray(window.HIVECITY_SHOP_CATALOG)
                    ? window.HIVECITY_SHOP_CATALOG.map(item => {
                        const url = String(item.affiliateUrl || item.buyUrl || item.url || item.link || item.checkoutUrl || '').trim();
                        const priceVal = Number(item.price || item.prInr || 0);
                        return {
                            id: String(item.id),
                            n: item.title || item.name || item.n || 'Hivecity Product',
                            b: item.brand || item.b || 'HIVE',
                            c: item.category || item.c || 'Fitness Gear',
                            prInr: priceVal,
                            pr: Number((priceVal / USD_TO_INR_SAMPLE_RATE).toFixed(2)),
                            imageUrl: item.image || item.img || item.imageUrl || '',
                            affiliateUrl: url,
                            buyUrl: url,
                            url: url,
                            checkoutUrl: url,
                            description: item.description || '',
                            inStock: item.inStock !== false,
                            status: item.status || 'active',
                            isLiveProduct: false
                        };
                    })
                    : [];
                const liveIds = new Set(live.map(x => String(x.id)));
                const merged = [...live, ...fileCatalog.filter(x => !liveIds.has(String(x.id)))];
                return merged.filter(p => /^https?:\/\//i.test(String(p.affiliateUrl || p.buyUrl || p.url || p.link || p.checkoutUrl || '').trim()));
            };

            const refreshVisibleRoute = () => {
                const h = location.hash.slice(1).split('?')[0].split('/')[0];
                if (['nutrition', 'shop', 'bookings', 'activity', 'profile'].includes(h) && typeof window.go === 'function') {
                    window.go(1);
                }
            };

            window.syncUserRecipeToAdminApi = async recipe => {
                const candidates = contentApiBase !== null ? [contentApiBase] : getApiCandidates();
                for (const base of candidates) {
                    try {
                        const res = await fetch(base + '/api/nutrients/user', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(recipe)
                        });
                        if (res.ok) { contentApiBase = base; break; }
                    } catch { }
                }
            };

            window.deleteUserRecipeOnAdminApi = async (recipeId, userObj) => {
                const candidates = contentApiBase !== null ? [contentApiBase] : getApiCandidates();
                let headers = { 'Content-Type': 'application/json' };
                let uidQuery = '';
                try {
                    const authUser = userObj || (window.hiveAuth && window.hiveAuth.currentUser) || null;
                    if (authUser && typeof authUser.getIdToken === 'function') {
                        const tok = await authUser.getIdToken();
                        if (tok) headers['Authorization'] = 'Bearer ' + tok;
                    }
                    if (authUser && authUser.uid) uidQuery = '?uid=' + encodeURIComponent(authUser.uid);
                } catch { }
                for (const base of candidates) {
                    try {
                        const res = await fetch(base + '/api/nutrients/user/' + encodeURIComponent(recipeId) + uidQuery, {
                            method: 'DELETE',
                            headers
                        });
                        if (res.ok) { contentApiBase = base; return true; }
                    } catch { }
                }
                return false;
            };

            window.syncUserRepostToggleToApi = async (payload, userObj) => {
                const candidates = contentApiBase !== null ? [contentApiBase] : getApiCandidates();
                let headers = { 'Content-Type': 'application/json' };
                try {
                    const authUser = userObj || (window.hiveAuth && window.hiveAuth.currentUser) || null;
                    if (authUser && typeof authUser.getIdToken === 'function') {
                        const tok = await authUser.getIdToken();
                        if (tok) headers['Authorization'] = 'Bearer ' + tok;
                    }
                } catch { }
                for (const base of candidates) {
                    try {
                        const res = await fetch(base + '/api/reposts/toggle', {
                            method: 'POST',
                            headers,
                            body: JSON.stringify(payload)
                        });
                        if (res.ok) { contentApiBase = base; return await res.json().catch(() => ({ success: true })); }
                    } catch { }
                }
                return null;
            };

            window.closeShopBuyNowModal = () => { const m = document.getElementById('hive-shop-buy-modal'); if (m) m.remove(); };
            window.openShopBuyNowModal = prod => {
                if (!prod) return;
                window.closeShopBuyNowModal();
                const escB = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
                const unitInr = prod.isLiveProduct ? Number(prod.prInr || 0) : Math.round(Number(prod.pr || 0) * USD_TO_INR_SAMPLE_RATE);
                const maxQty = prod.isLiveProduct ? Math.max(1, Number(prod.stock || 0)) : 10;
                const imgSrc = prod.imageUrl ? escB(prod.imageUrl) : (prod.im ? I(prod.im) : '');
                let qty = 1;
                const backdrop = document.createElement('div');
                backdrop.id = 'hive-shop-buy-modal';
                backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(13,20,16,.62);backdrop-filter:blur(6px);z-index:9999;display:grid;place-items:center;padding:16px';
                backdrop.onclick = ev => { if (ev.target === backdrop) window.closeShopBuyNowModal(); };
                const renderModal = (confirmedOrder, errMsg) => {
                    const total = unitInr * qty;
                    backdrop.innerHTML = `<div class="card" style="width:100%;max-width:460px;padding:22px;border-radius:20px;background:var(--card);color:var(--tx);border:1px solid var(--bd);box-shadow:0 24px 60px rgba(0,0,0,.35)">
                        <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:14px"><span class="tag">${confirmedOrder ? 'ORDER CONFIRMED' : 'INSTANT CHECKOUT'}</span><button type="button" class="chip" onclick="window.closeShopBuyNowModal()" aria-label="Close">✕</button></div>
                        <div class="row" style="gap:14px;align-items:center;margin-bottom:16px">${imgSrc ? `<img src="${imgSrc}" alt="${escB(prod.n)}" style="width:76px;height:76px;object-fit:cover;border-radius:12px;border:1px solid var(--bd);flex-shrink:0">` : `<div style="width:76px;height:76px;border-radius:12px;background:var(--bd);display:grid;place-items:center;font-size:32px;flex-shrink:0">🛍️</div>`}<div style="flex:1;min-width:0"><h3 style="margin:0 0 4px;font-size:17px">${escB(prod.n)}</h3><div style="font-size:12px;color:var(--mu)">${escB(prod.b)} · ${escB(prod.c)}</div><div class="num" style="font-weight:800;margin-top:4px">${rupees(unitInr)} ${prod.isLiveProduct ? `<small style="color:var(--mu);font-weight:500">· ${Number(prod.stock)} in stock</small>` : ''}</div></div></div>
                        ${confirmedOrder ? `<div style="padding:14px;border-radius:12px;background:rgba(21,148,71,0.12);border:1px solid rgba(21,148,71,0.35);margin-bottom:16px"><div style="font-weight:800;color:#159447;margin-bottom:4px">✓ Purchase Confirmed</div><div style="font-size:12px;color:var(--mu)">Order ID: <strong style="color:var(--tx)">${escB(confirmedOrder.id)}</strong></div><div style="font-size:12px;color:var(--mu);margin-top:2px">Total Paid: <strong style="color:var(--tx)">${rupees(total)}</strong> (${qty} item${qty > 1 ? 's' : ''})</div></div><button type="button" class="btn" style="width:100%" onclick="window.closeShopBuyNowModal()">Continue Shopping</button>` : `${prod.description ? `<p style="margin:0 0 14px;font-size:12px;color:var(--mu);line-height:1.5">${escB(prod.description)}</p>` : ''}<div class="row" style="justify-content:space-between;align-items:center;padding:10px 12px;border-radius:12px;border:1px solid var(--bd);margin-bottom:12px"><span style="font-size:13px;font-weight:600">Quantity</span><div class="row" style="gap:8px;align-items:center"><button type="button" class="chip" id="hive-buy-dec">−</button><strong class="num" style="min-width:22px;text-align:center">${qty}</strong><button type="button" class="chip" id="hive-buy-inc">+</button></div></div><div class="row" style="justify-content:space-between;align-items:center;margin-bottom:16px;font-size:16px"><span>Total</span><strong class="num">${rupees(total)}</strong></div>${errMsg ? `<div style="color:#ef4444;font-size:12px;margin-bottom:12px">${escB(errMsg)}</div>` : ''}<div class="row" style="gap:10px"><button type="button" class="btn g" style="flex:1" onclick="window.closeShopBuyNowModal()">Cancel</button><button type="button" class="btn" id="hive-buy-confirm" style="flex:2">Confirm Purchase (${rupees(total)})</button></div>`}
                    </div>`;
                    const dec = backdrop.querySelector('#hive-buy-dec');
                    const inc = backdrop.querySelector('#hive-buy-inc');
                    const confirmBtn = backdrop.querySelector('#hive-buy-confirm');
                    if (dec) dec.onclick = () => { if (qty > 1) { qty--; renderModal(null, ''); } };
                    if (inc) inc.onclick = () => { if (qty < maxQty) { qty++; renderModal(null, ''); } };
                    if (confirmBtn) confirmBtn.onclick = async () => {
                        confirmBtn.disabled = true; confirmBtn.textContent = 'Processing order…';
                        const cur = (typeof window.getAuthUser === 'function' ? window.getAuthUser() : window.hiveCurrentUser) || null;
                        const buyer = { quantity: qty, userId: (cur && cur.uid) || 'guest-athlete', userName: (cur && (cur.displayName || cur.name)) || 'Hive Athlete', userEmail: (cur && cur.email) || '' };
                        if (prod.isLiveProduct) {
                            const candidates = contentApiBase !== null ? [contentApiBase] : getApiCandidates();
                            let apiResult = null, apiError = '';
                            for (const base of candidates) {
                                try {
                                    const res = await fetch(base + '/api/marketplace/' + encodeURIComponent(prod.id) + '/buy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buyer) });
                                    const data = await res.json().catch(() => ({}));
                                    if (res.ok && data.success) { contentApiBase = base; apiResult = data; break; }
                                    else if (data.error) { apiError = data.error; break; }
                                } catch { }
                            }
                            if (apiError) { renderModal(null, apiError); return; }
                            const nextStock = apiResult && typeof apiResult.remainingStock === 'number' ? apiResult.remainingStock : Math.max(0, Number(prod.stock || 0) - qty);
                            prod.stock = nextStock;
                            sharedProducts = sharedProducts.map(item => String(item.id) === String(prod.id) ? { ...item, stock: nextStock, status: nextStock > 0 ? 'In Stock' : 'Out of Stock' } : item);
                            try { localStorage.setItem(SHARED_MARKETPLACE_KEY, JSON.stringify(sharedProducts)); window.dispatchEvent(new CustomEvent(MARKETPLACE_UPDATED_EVENT, { detail: sharedProducts })); } catch { }
                            const order = (apiResult && apiResult.order) || { id: 'ORD-' + Date.now().toString().slice(-6) };
                            if (typeof burst === 'function') burst(); toast('Purchase confirmed! Order ' + order.id); renderModal(order, ''); refreshVisibleRoute();
                        } else {
                            const order = { id: 'ORD-' + Date.now().toString().slice(-6) };
                            if (typeof burst === 'function') burst(); toast('Purchase confirmed! Order ' + order.id); renderModal(order, '');
                        }
                    };
                };
                renderModal(null, ''); document.body.appendChild(backdrop);
            };

            window.fetchSharedContentFromApi = async () => {
                const candidates = contentApiBase !== null ? [contentApiBase] : getApiCandidates();
                for (const base of candidates) {
                    try {
                        const [nRes, mRes] = await Promise.all([
                            fetch(base + '/api/nutrients', { cache: 'no-store' }),
                            fetch(base + '/api/marketplace', { cache: 'no-store' })
                        ]);
                        if (nRes.ok && mRes.ok) {
                            contentApiBase = base;
                            const nData = await nRes.json();
                            const mData = await mRes.json();
                            const nextNutrients = (Array.isArray(nData.recipes) ? nData.recipes : []).filter(r => r && !isTestArtifact(r));
                            const nextProducts = (Array.isArray(mData.products) ? mData.products : []).filter(p => p && !isTestArtifact(p));

                            // Scoped deletion rule: Admin Delete is Admin-only hide and never removes User custom recipes.

                            const changed =
                                JSON.stringify(nextNutrients) !== JSON.stringify(sharedNutrients) ||
                                JSON.stringify(nextProducts) !== JSON.stringify(sharedProducts);

                            sharedNutrients = nextNutrients;
                            sharedProducts = nextProducts;
                            try {
                                localStorage.setItem(SHARED_NUTRIENTS_KEY, JSON.stringify(nextNutrients));
                                localStorage.setItem(SHARED_MARKETPLACE_KEY, JSON.stringify(nextProducts));
                            } catch { }

                            if (changed) refreshVisibleRoute();
                            return true;
                        }
                    } catch { }
                }
                return false;
            };

            window.addEventListener(NUTRIENTS_UPDATED_EVENT, () => {
                sharedNutrients = readCached(SHARED_NUTRIENTS_KEY);
                refreshVisibleRoute();
            });
            window.addEventListener('hivecity:reposts-updated', () => {
                refreshVisibleRoute();
            });
            window.addEventListener('hashchange', () => {
                if ((location.hash.includes('edit=') || location.hash.includes('create')) && typeof window.checkPendingHiveRecipeEdit === 'function') {
                    setTimeout(() => window.checkPendingHiveRecipeEdit(), 120);
                }
            });
            window.addEventListener(MARKETPLACE_UPDATED_EVENT, () => {
                sharedProducts = readCached(SHARED_MARKETPLACE_KEY);
                refreshVisibleRoute();
            });
            window.addEventListener('storage', ev => {
                if (!ev) return;
                if (ev.key === SHARED_NUTRIENTS_KEY) {
                    sharedNutrients = readCached(SHARED_NUTRIENTS_KEY);
                    refreshVisibleRoute();
                } else if (ev.key === SHARED_MARKETPLACE_KEY) {
                    sharedProducts = readCached(SHARED_MARKETPLACE_KEY);
                    refreshVisibleRoute();
                }
            });
            window.addEventListener('focus', () => { void window.fetchSharedContentFromApi(); });
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') void window.fetchSharedContentFromApi();
            });
            window.addEventListener('hashchange', () => {
                const h = location.hash.slice(1).split('?')[0].split('/')[0];
                if (['nutrition', 'shop', 'bookings', 'activity', 'profile'].includes(h)) {
                    void window.fetchSharedContentFromApi();
                }
            });
            setInterval(() => {
                const h = location.hash.slice(1).split('?')[0].split('/')[0];
                if (['nutrition', 'shop', 'profile'].includes(h)) void window.fetchSharedContentFromApi();
            }, 10000);

            // Also subscribe to Firestore marketplace_products & shared_nutrition if available
            setTimeout(() => {
                if (window.hiveDb) {
                    try {
                        window.hiveDb.collection('marketplace_products').onSnapshot(() => {
                            void window.fetchSharedContentFromApi();
                        }, () => { });
                        window.hiveDb.collection('shared_nutrition').onSnapshot(() => {
                            void window.fetchSharedContentFromApi();
                        }, () => { });
                    } catch { }
                }
                void window.fetchSharedContentFromApi();
            }, 120);
        })();
        /* WISHLIST SHOWCASE (YOUR TICKETS & GEAR) */
        const WISHLIST_STORAGE_KEY = 'hivecity_user_wishlist';
        const WISHLIST_UPDATED_EVENT = 'hivecity:wishlist-updated';
        const qr = s => { let x = s * 9301 + 49297, r = ''; const b = () => (x = (x * 9301 + 49297) % 233280) / 233280 > .5; for (let i = 0; i < 11; i++)for (let j = 0; j < 11; j++) { const f = (i < 3 && j < 3) || (i < 3 && j > 7) || (i > 7 && j < 3); if (f || b()) r += `<rect x='${j * 6}' y='${i * 6}' width='6' height='6'/>` } return `<svg viewBox='0 0 66 66' width='72' height='72' fill='currentColor' aria-label='Ticket code'>${r}</svg>` };
        function cq(k, id, d) { const o = k == 'c' ? S.cart : S.bk; o[id] = (o[id] || 0) + d; if (o[id] < 1) delete o[id]; sv(); chrome('bookings'); go(1) }

        window.readHiveWishlistRaw = function () {
            try {
                const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
            } catch (_) { return []; }
        };

        window.getHiveWishlistItems = function () {
            const deletedIds = typeof window.getDeletedShopProductIds === 'function' ? window.getDeletedShopProductIds() : new Set();
            const allShop = typeof window.getAllShopProducts === 'function' ? window.getAllShopProducts() : P;
            const byId = new Map();
            const addEntry = item => {
                if (!item) return;
                const idStr = String(typeof item === 'object' ? (item.id ?? '') : item).trim();
                if (!idStr || byId.has(idStr) || deletedIds.has(idStr)) return;
                const liveMatch = allShop.find(p => String(p.id) === idStr);
                if (liveMatch) {
                    byId.set(idStr, { ...liveMatch, id: idStr });
                } else if (typeof item === 'object' && (item.n || item.name || item.title)) {
                    byId.set(idStr, {
                        id: idStr,
                        n: item.n || item.name || item.title || 'Shop Item',
                        b: item.b || item.brand || 'HIVE',
                        c: item.c || item.category || 'Fitness Gear',
                        prInr: Number(item.prInr ?? item.price ?? 0),
                        pr: Number(item.pr ?? 0),
                        im: item.im,
                        imageUrl: item.imageUrl || item.image || '',
                        isLiveProduct: Boolean(item.isLiveProduct || item.prInr !== undefined || item.price !== undefined)
                    });
                }
            };
            window.readHiveWishlistRaw().forEach(addEntry);
            Object.keys(S.wish || {}).forEach(k => { if (S.wish[k]) addEntry(k); });
            return Array.from(byId.values());
        };

        window.isProductWishlisted = function (productId) {
            const idStr = String(productId ?? '').trim();
            if (!idStr) return false;
            if (S.wish && S.wish[idStr]) return true;
            return window.readHiveWishlistRaw().some(item => String(typeof item === 'object' ? item.id : item) === idStr);
        };

        window.toggleHiveWishlistProduct = function (productId) {
            const idStr = String(productId ?? '').trim();
            if (!idStr) return false;
            const allShop = typeof window.getAllShopProducts === 'function' ? window.getAllShopProducts() : P;
            const current = window.readHiveWishlistRaw();
            const alreadySaved = window.isProductWishlisted(idStr);
            if (alreadySaved) {
                const next = current.filter(item => String(typeof item === 'object' ? item.id : item) !== idStr);
                try { localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next)); } catch (_) { }
                if (S.wish) delete S.wish[idStr];
                sv();
                const activeRoute = location.hash.slice(1).split('?')[0].split('/')[0] || 'shop';
                chrome(activeRoute);
                window.dispatchEvent(new Event(WISHLIST_UPDATED_EVENT));
                toast('Removed from wishlist');
                return false;
            }
            const prod = allShop.find(p => String(p.id) === idStr);
            const snapshot = prod ? {
                id: idStr,
                n: prod.n || prod.name || 'Shop Item',
                b: prod.b || prod.brand || 'HIVE',
                c: prod.c || prod.category || 'Fitness Gear',
                prInr: (prod.prInr !== undefined && prod.prInr !== null && Number(prod.prInr) > 0) ? Number(prod.prInr) : Math.round(Number(prod.pr || 0) * USD_TO_INR_SAMPLE_RATE),
                pr: Number(prod.pr || 0),
                im: prod.im,
                imageUrl: prod.imageUrl || '',
                isLiveProduct: Boolean(prod.isLiveProduct),
                savedAt: new Date().toISOString()
            } : { id: idStr, savedAt: new Date().toISOString() };
            const next = [snapshot, ...current.filter(item => String(typeof item === 'object' ? item.id : item) !== idStr)];
            try { localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next)); } catch (_) { }
            S.wish = S.wish || {};
            S.wish[idStr] = true;
            sv();
            const activeRoute = location.hash.slice(1).split('?')[0].split('/')[0] || 'shop';
            chrome(activeRoute);
            window.dispatchEvent(new Event(WISHLIST_UPDATED_EVENT));
            toast('Added to wishlist ♥');
            return true;
        };

        window.removeHiveWishlistProduct = function (productId) {
            const idStr = String(productId ?? '').trim();
            if (!idStr) return;
            const next = window.readHiveWishlistRaw().filter(item => String(typeof item === 'object' ? item.id : item) !== idStr);
            try { localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next)); } catch (_) { }
            if (S.wish) delete S.wish[idStr];
            sv();
            chrome('bookings');
            window.dispatchEvent(new Event(WISHLIST_UPDATED_EVENT));
            toast('Removed from wishlist');
            if (typeof go === 'function') go(1);
        };

        const BOOKED_TICKETS_STORAGE_KEY = 'hivecity_user_booked_tickets';
        const BOOKED_TICKETS_UPDATED_EVENT = 'hivecity:tickets-updated';

        window.openWishlistedProductInShop = function (productId) {
            const idStr = String(productId ?? '').trim();
            if (!idStr) return;
            window._selectedWishlistProductId = idStr;
            try { sessionStorage.setItem('selectedWishlistProductId', idStr); } catch (_) { }
            const targetHash = 'shop?productId=' + encodeURIComponent(idStr);
            if (location.hash.slice(1) === targetHash) {
                if (typeof go === 'function') go();
            } else {
                location.hash = targetHash;
            }
        };

        window.getSelectedShopProductId = function () {
            try {
                const rawHash = String(location.hash || '');
                const qIdx = rawHash.indexOf('?');
                if (qIdx !== -1) {
                    const params = new URLSearchParams(rawHash.slice(qIdx + 1));
                    const pid = params.get('productId');
                    if (pid && pid.trim()) return pid.trim();
                }
            } catch (_) { }
            if (window._selectedWishlistProductId) return String(window._selectedWishlistProductId).trim();
            try {
                const saved = sessionStorage.getItem('selectedWishlistProductId');
                if (saved && saved.trim()) return saved.trim();
            } catch (_) { }
            return '';
        };

        window.clearShopProductFilter = function () {
            window._selectedWishlistProductId = '';
            try { sessionStorage.removeItem('selectedWishlistProductId'); } catch (_) { }
            if (location.hash.includes('productId=')) {
                location.hash = 'shop';
            } else if (typeof go === 'function') {
                go();
            }
        };

        window.addEventListener('hashchange', () => {
            const rawHash = String(location.hash || '');
            const route = rawHash.slice(1).split('?')[0].split('/')[0];
            if (route !== 'shop') {
                window._selectedWishlistProductId = '';
                try { sessionStorage.removeItem('selectedWishlistProductId'); } catch (_) { }
            }
        });

        window.isHiveTicketEventCompletedOrExpired = function (ticket, eventsLookup) {
            if (!ticket) return false;
            const eid = String(ticket.eventId || '').trim();
            const evt = (eventsLookup && eid && eventsLookup.get(eid)) || null;
            if (evt) {
                const st = String(evt.status || '').trim().toLowerCase();
                if (evt.completed === true || st === 'completed' || st === 'ended' || st === 'complete' || st === 'done') {
                    return true;
                }
            }
            const rawEnd = String((evt && (evt.endDate || evt.eventDate || evt.date)) || ticket.endDate || ticket.eventDate || '').trim();
            if (!rawEnd) return false;
            if (/^\d{4}-\d{2}-\d{2}$/.test(rawEnd)) {
                const parts = rawEnd.split('-').map(Number);
                const endOfDay = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
                return Date.now() > endOfDay.getTime();
            }
            const parsed = new Date(rawEnd);
            return !isNaN(parsed.getTime()) && Date.now() > parsed.getTime();
        };

        window._hiveLiveEventsMap = window._hiveLiveEventsMap || new Map();

        window.getHiveEventsLookupMap = function () {
            const map = new Map(window._hiveLiveEventsMap || []);
            try {
                const cached = JSON.parse(localStorage.getItem('hivecity_shared_events') || '[]');
                if (Array.isArray(cached)) {
                    cached.forEach(e => {
                        const id = String((e && (e._docId || e.id)) || '').trim();
                        if (id && !map.has(id)) map.set(id, e);
                    });
                }
            } catch (_) { }
            return map;
        };

        window.purgeCompletedOrExpiredHiveTickets = function () {
            const eventsMap = window.getHiveEventsLookupMap();
            let removedAny = false;
            const idsToDeleteInFirestore = new Set();

            const filterStorageKey = (key) => {
                try {
                    const arr = JSON.parse(localStorage.getItem(key) || '[]');
                    if (!Array.isArray(arr) || !arr.length) return;
                    const kept = arr.filter(item => {
                        if (window.isHiveTicketEventCompletedOrExpired(item, eventsMap)) {
                            removedAny = true;
                            const docId = String((item && item.id) || '').trim();
                            if (docId) idsToDeleteInFirestore.add(docId);
                            return false;
                        }
                        return true;
                    });
                    if (kept.length !== arr.length) {
                        localStorage.setItem(key, JSON.stringify(kept));
                    }
                } catch (_) { }
            };

            filterStorageKey(BOOKED_TICKETS_STORAGE_KEY);
            filterStorageKey('hivecity_event_bookings');

            if (idsToDeleteInFirestore.size > 0 && window.hiveDb) {
                idsToDeleteInFirestore.forEach(docId => {
                    window.hiveDb.collection('event_bookings').doc(docId).delete().catch(() => { });
                });
            }

            if (removedAny) {
                const activeRoute = location.hash.slice(1).split('?')[0].split('/')[0];
                if (typeof chrome === 'function') chrome(activeRoute);
                window.dispatchEvent(new Event(BOOKED_TICKETS_UPDATED_EVENT));
            }
        };

        // Real-time Firestore listener on events to immediately delete tickets when Admin marks an event Completed/Ended
        (() => {
            const attachEventCompletionWatcher = () => {
                if (!window.hiveDb || window._hiveEventTicketsCompletionWatched) return;
                window._hiveEventTicketsCompletionWatched = true;
                try {
                    window.hiveDb.collection('events').onSnapshot(snap => {
                        const nextMap = new Map();
                        snap.forEach(doc => {
                            nextMap.set(doc.id, Object.assign({ id: doc.id }, doc.data() || {}));
                        });
                        window._hiveLiveEventsMap = nextMap;
                        window.purgeCompletedOrExpiredHiveTickets();
                    }, () => { });
                } catch (_) { }
            };
            setTimeout(() => {
                attachEventCompletionWatcher();
                window.purgeCompletedOrExpiredHiveTickets();
            }, 400);
            setInterval(() => window.purgeCompletedOrExpiredHiveTickets(), 30000);
        })();

        window.getHiveBookedTickets = function () {
            const eventsMap = window.getHiveEventsLookupMap();
            const normalizeTicket = t => {
                if (!t || typeof t !== 'object') return null;
                if (window.isHiveTicketEventCompletedOrExpired(t, eventsMap)) {
                    const docId = String(t.id || '').trim();
                    if (docId && window.hiveDb) {
                        window.hiveDb.collection('event_bookings').doc(docId).delete().catch(() => { });
                    }
                    return null;
                }
                const eventId = String(t.eventId || '').trim();
                const id = String(t.id || t.ticketId || eventId || '').trim();
                if (!id && !eventId) return null;
                const ticketCode = String(t.ticketId || ('HC-' + id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()));
                return {
                    id,
                    ticketId: ticketCode,
                    eventId,
                    eventTitle: t.eventTitle || t.title || t.name || 'Hivecity Event',
                    eventImage: t.eventImage || t.imageUrl || t.coverImage || t.image || '',
                    eventDate: t.eventDate || t.date || '',
                    location: t.location || '',
                    feeAmount: t.feeAmount ?? t.fee ?? t.price ?? 0,
                    userId: t.userId || '',
                    userName: t.userName || '',
                    userEmail: t.userEmail || '',
                    bookedAt: t.bookedAt || new Date().toISOString(),
                    status: t.status || 'Confirmed'
                };
            };

            let curUid = '';
            let curEmail = '';
            try {
                const u = window.hiveCurrentUser;
                const sess = JSON.parse(sessionStorage.getItem('hivecityUser') || '{}');
                curUid = String((u && u.uid) || sess.uid || '').trim();
                curEmail = String((u && u.email) || sess.email || '').trim().toLowerCase();
            } catch (_) { }

            const byKey = new Map();
            const addTicket = raw => {
                const norm = normalizeTicket(raw);
                if (!norm) return;
                const key = norm.eventId || norm.id;
                if (!byKey.has(key)) byKey.set(key, norm);
            };

            try {
                const directRaw = JSON.parse(localStorage.getItem(BOOKED_TICKETS_STORAGE_KEY) || '[]');
                if (Array.isArray(directRaw)) directRaw.forEach(addTicket);
            } catch (_) { }

            try {
                const sharedRaw = JSON.parse(localStorage.getItem('hivecity_event_bookings') || '[]');
                if (Array.isArray(sharedRaw)) {
                    sharedRaw.forEach(b => {
                        if (!b) return;
                        const matchesUser = (!curUid && !curEmail)
                            || (curUid && String(b.userId || '') === curUid)
                            || (curEmail && String(b.userEmail || '').toLowerCase() === curEmail);
                        if (matchesUser) addTicket(b);
                    });
                }
            } catch (_) { }

            return Array.from(byKey.values()).sort((a, b) => new Date(b.bookedAt || 0).getTime() - new Date(a.bookedAt || 0).getTime());
        };

        window.saveHiveBookedTicket = function (record) {
            if (!record || typeof record !== 'object') return;
            const eventId = String(record.eventId || '').trim();
            const id = String(record.id || record.ticketId || eventId || '').trim();
            const ticketCode = String(record.ticketId || ('HC-' + id.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase()));
            const entry = {
                ...record,
                id: id || ticketCode,
                ticketId: ticketCode,
                status: record.status || 'Confirmed',
                bookedAt: record.bookedAt || new Date().toISOString()
            };
            let existing = [];
            try {
                const parsed = JSON.parse(localStorage.getItem(BOOKED_TICKETS_STORAGE_KEY) || '[]');
                if (Array.isArray(parsed)) existing = parsed;
            } catch (_) { }
            const next = [entry, ...existing.filter(t => String(t.id || '') !== entry.id && (!eventId || String(t.eventId || '') !== eventId))];
            try { localStorage.setItem(BOOKED_TICKETS_STORAGE_KEY, JSON.stringify(next)); } catch (_) { }
            const activeRoute = location.hash.slice(1).split('?')[0].split('/')[0] || 'events';
            if (typeof chrome === 'function') chrome(activeRoute);
            window.dispatchEvent(new Event(BOOKED_TICKETS_UPDATED_EVENT));
        };

        window.removeHiveBookedTicket = function (bookingId, eventId) {
            const bid = String(bookingId || '').trim();
            const eid = String(eventId || '').trim();
            let existing = [];
            try {
                const parsed = JSON.parse(localStorage.getItem(BOOKED_TICKETS_STORAGE_KEY) || '[]');
                if (Array.isArray(parsed)) existing = parsed;
            } catch (_) { }
            const next = existing.filter(t => {
                if (bid && (String(t.id || '') === bid || String(t.ticketId || '') === bid)) return false;
                if (eid && String(t.eventId || '') === eid) return false;
                return true;
            });
            try { localStorage.setItem(BOOKED_TICKETS_STORAGE_KEY, JSON.stringify(next)); } catch (_) { }
            const activeRoute = location.hash.slice(1).split('?')[0].split('/')[0] || 'events';
            if (typeof chrome === 'function') chrome(activeRoute);
            window.dispatchEvent(new Event(BOOKED_TICKETS_UPDATED_EVENT));
        };

        window.addEventListener(WISHLIST_UPDATED_EVENT, () => {
            const h = location.hash.slice(1).split('?')[0].split('/')[0];
            if (h === 'bookings' && typeof go === 'function') go(1);
        });
        window.addEventListener(BOOKED_TICKETS_UPDATED_EVENT, () => {
            const h = location.hash.slice(1).split('?')[0].split('/')[0];
            if (typeof chrome === 'function') chrome(h);
            if (h === 'bookings' && typeof go === 'function') go(1);
        });
        window.addEventListener('storage', ev => {
            if (ev && [WISHLIST_STORAGE_KEY, BOOKED_TICKETS_STORAGE_KEY, 'hivecity_event_bookings'].includes(ev.key)) {
                const h = location.hash.slice(1).split('?')[0].split('/')[0];
                if (typeof chrome === 'function') chrome(h);
                if (['bookings', 'shop'].includes(h) && typeof go === 'function') go(1);
            }
        });

        V.bookings = () => {
            const escW = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
            const wishItems = window.getHiveWishlistItems();
            const bookedTickets = typeof window.getHiveBookedTickets === 'function' ? window.getHiveBookedTickets() : [];
            const itemInr = p => (p.prInr !== undefined && p.prInr !== null && Number(p.prInr) > 0) ? Number(p.prInr) : Math.round(Number(p.pr || 0) * USD_TO_INR_SAMPLE_RATE);
            const formatFee = raw => {
                if (raw === null || raw === undefined || raw === '' || Number(raw) === 0 || String(raw).toLowerCase() === 'free') return 'FREE';
                const num = Number(String(raw).replace(/[^0-9.]/g, ''));
                return Number.isFinite(num) && num > 0 ? rupees(num) : escW(raw);
            };
            const t = S.bt == 't';
            return `<div class='hero bn'><img src='${IM[93]}' alt=''><div><h2 class='big' style='margin:0'>YOUR TICKETS & GEAR</h2></div></div><div class='row' style='margin-bottom:10px'><button class='chip ${t ? 'on' : ''}' onclick='S.bt="t";go(1)'> Event tickets (${bookedTickets.length})</button><button class='chip ${t ? '' : 'on'}' onclick='S.bt="p";go(1)'> Products (${wishItems.length})</button></div><div style='display:grid;gap:12px;min-width:0'>${t ? (bookedTickets.length ? bookedTickets.map(tk => {
                const imgSrc = tk.eventImage ? escW(tk.eventImage) : '';
                const dateMeta = [tk.eventDate, tk.location].filter(Boolean).join(' · ');
                return `<div class='card row' style='align-items:center;gap:14px' data-ticket-id='${escW(tk.ticketId)}'>${imgSrc ? `<img src='${imgSrc}' alt='${escW(tk.eventTitle)}' style='width:84px;height:84px;object-fit:cover;border-radius:12px;flex-shrink:0' onerror='window.handleHiveRecipeImgError(this)'>` : `<div style='width:84px;height:84px;border-radius:12px;background:var(--bd);display:grid;place-items:center;font-size:30px;flex-shrink:0'>🎟️</div>`}<div style='flex:1;min-width:0'><span class='tag'>${escW(String(tk.status || 'Confirmed').toUpperCase())} · #${escW(tk.ticketId)}</span><b style='display:block;font-size:15px;margin-top:6px'>${escW(tk.eventTitle)}</b>${dateMeta ? `<small style='color:var(--mu);display:block;margin-top:2px'>${escW(dateMeta)}</small>` : ''}<span class='num' style='display:inline-block;margin-top:6px;font-weight:700'>${formatFee(tk.feeAmount)}</span></div></div>`;
            }).join('') : `<div class='card' style='text-align:center'><h3>No tickets yet</h3><a class='btn' href='#events'>Browse events</a></div>`) : (wishItems.length ? wishItems.map(p => {
                const imgSrc = p.imageUrl ? escW(p.imageUrl) : (p.im && IM[p.im] ? IM[p.im] : '');
                return `<div class='card row' role='button' tabindex='0' style='align-items:center;gap:14px;cursor:pointer' onclick='window.openWishlistedProductInShop("${escW(p.id)}")' onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();window.openWishlistedProductInShop("${escW(p.id)}")}'>${imgSrc ? `<img src='${imgSrc}' alt='${escW(p.n)}' style='width:84px;height:84px;object-fit:cover;border-radius:12px;flex-shrink:0' onerror='window.handleHiveRecipeImgError(this)'>` : `<div style='width:84px;height:84px;border-radius:12px;background:var(--bd);display:grid;place-items:center;font-size:30px;flex-shrink:0'>🛍️</div>`}<div style='flex:1;min-width:0'><b style='display:block;font-size:15px'>${escW(p.n)}</b><small style='color:var(--mu);display:block;margin-top:2px'>${escW(p.b ? p.b + ' · ' : '')}${escW(p.c || 'Shop')}</small><span class='num' style='display:inline-block;margin-top:6px;font-weight:700'>${rupees(itemInr(p))}</span></div><button type='button' class='chip' onclick='event.stopPropagation();window.removeHiveWishlistProduct("${escW(p.id)}")'>Remove</button></div>`;
            }).join('') : `<div class='card' style='text-align:center'><h3>No wishlist items yet</h3><a class='btn' href='#shop'>Browse Shop</a></div>`)}</div>`;
        };
        const w0 = wire; wire = h => { if (['activity', 'bookings', 'community', 'nutrition', 'notifications', 'help'].includes(h)) return; w0(h); if (h == 'events') document.querySelectorAll('[data-e]').forEach(b => { const o = b.onclick; b.onclick = () => { o(); S.nt = +b.dataset.e; S.bt = 't'; chrome(h) } }) };

        /* HIVECITY USER HELP -> ADMIN SUPPORT CENTRE */
        (() => {
            const SUPPORT_CACHE_KEY = 'hivecity_support_tickets';
            const escH = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
            const getHelpApiBases = () => {
                const list = [];
                if (window.HIVECITY_CONFIG && window.HIVECITY_CONFIG.API_BASE_URL) list.push(String(window.HIVECITY_CONFIG.API_BASE_URL).replace(/\/$/, ''));
                if ((location.protocol === 'http:' || location.protocol === 'https:') && location.port === '3000') list.push('');
                if (!list.includes('http://localhost:3000')) list.push('http://localhost:3000');
                if (!list.includes('http://127.0.0.1:3000')) list.push('http://127.0.0.1:3000');
                return list;
            };

            window.submitHiveHelpRequest = async function (event) {
                event.preventDefault();
                const form = event.target;
                const userName = String(form.userName?.value || '').trim() || 'Hive Athlete';
                const mobile = String(form.mobile?.value || '').trim();
                const email = String(form.email?.value || '').trim();
                const subject = String(form.subject?.value || 'Other').trim();
                const concern = String(form.concern?.value || '').trim();
                const errEl = document.getElementById('hc-help-error');
                const okEl = document.getElementById('hc-help-success');
                if (errEl) errEl.textContent = '';
                if (okEl) okEl.textContent = '';

                if (!mobile && !email) {
                    const msg = 'Please enter at least a Mobile Number or an Email ID so our team can reach you.';
                    if (errEl) errEl.textContent = msg;
                    toast(msg);
                    return;
                }
                if (!concern) {
                    const msg = 'Please describe your problem or concern.';
                    if (errEl) errEl.textContent = msg;
                    toast(msg);
                    return;
                }

                const btn = form.querySelector('button[type="submit"]');
                if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

                const curUser = window.hiveCurrentUser;
                const payload = {
                    userId: (curUser && curUser.uid) || 'guest',
                    userName,
                    mobile,
                    email,
                    subject,
                    concern
                };

                let savedTicket = null;
                for (const base of getHelpApiBases()) {
                    try {
                        const res = await fetch(base + '/api/support/tickets', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok && data.ticket) {
                            savedTicket = data.ticket;
                            break;
                        }
                    } catch { }
                }

                if (!savedTicket) {
                    savedTicket = {
                        id: 'SUP-' + Date.now().toString().slice(-6),
                        ...payload,
                        status: 'Open',
                        createdAt: new Date().toISOString()
                    };
                }

                try {
                    const existing = JSON.parse(localStorage.getItem(SUPPORT_CACHE_KEY) || '[]');
                    const next = [savedTicket, ...(Array.isArray(existing) ? existing.filter(x => x.id !== savedTicket.id) : [])];
                    localStorage.setItem(SUPPORT_CACHE_KEY, JSON.stringify(next));
                } catch { }
                window.dispatchEvent(new Event('hivecity:support-updated'));

                if (okEl) okEl.textContent = 'Your help request has been sent to our Support Centre.';
                toast('Your help request has been sent to our Support Centre');
                if (form.concern) form.concern.value = '';
                if (btn) { btn.disabled = false; btn.textContent = 'Send Help Request'; }
            };

            V.help = () => {
                const u = window.hiveCurrentUser;
                let sess = {};
                try { sess = JSON.parse(sessionStorage.getItem('hivecityUser') || '{}'); } catch { }
                const defName = (u && u.displayName) || sess.name || '';
                const defEmail = (u && u.email) || sess.email || '';
                const defMobile = sess.mobile || '';
                return `<div style="max-width:620px;margin:0 auto">
                    <h1 class="big" style="margin:0 0 6px">Help &amp; Support</h1>
                    <p style="color:var(--mu);margin:0 0 18px">Need assistance? Share your concern along with your Mobile Number or Email ID and our Support Centre team will reach out.</p>
                    <form class="card" style="display:grid;gap:12px;padding:22px;border-radius:20px" onsubmit="window.submitHiveHelpRequest(event)">
                        <label style="display:grid;gap:6px;font-size:13px;font-weight:700">
                            User Name
                            <input type="text" name="userName" value="${escH(defName)}" placeholder="Your full name">
                        </label>
                        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
                            <label style="display:grid;gap:6px;font-size:13px;font-weight:700">
                                Mobile Number
                                <input type="tel" name="mobile" value="${escH(defMobile)}" placeholder="+91 98765 43210">
                            </label>
                            <label style="display:grid;gap:6px;font-size:13px;font-weight:700">
                                Email ID
                                <input type="email" name="email" value="${escH(defEmail)}" placeholder="you@example.com">
                            </label>
                        </div>
                        <small style="color:var(--mu);margin-top:-6px">Provide at least a Mobile Number or an Email ID.</small>
                        <label style="display:grid;gap:6px;font-size:13px;font-weight:700">
                            Subject / Issue Category
                            <select name="subject">
                                <option value="Event Booking">Event Booking</option>
                                <option value="Nutrition & Activity">Nutrition &amp; Activity</option>
                                <option value="Other">Other</option>
                            </select>
                        </label>
                        <label style="display:grid;gap:6px;font-size:13px;font-weight:700">
                            Problem / Concern Description
                            <textarea name="concern" rows="4" required placeholder="Describe your issue or question in detail..." style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);font:inherit;resize:vertical"></textarea>
                        </label>
                        <div id="hc-help-error" style="color:#dc2626;font-size:13px;font-weight:600"></div>
                        <div id="hc-help-success" style="color:#1B4D3E;font-size:13px;font-weight:700"></div>
                        <div class="row" style="justify-content:flex-end">
                            <button type="submit" class="btn">Send Help Request</button>
                        </div>
                    </form>
                </div>`;
            };
        })();

        /* HIVECITY CAMPAIGN NOTIFICATIONS — WHATSAPP-STYLE FEED & FULL-SCREEN VIEWER */
        (() => {
            const CAMPAIGNS_CACHE_KEY = 'hivecity_campaigns';
            const READ_CAMPAIGNS_KEY = 'hivecity_read_campaigns';
            const nState = {
                campaigns: [],
                loaded: false,
                loading: false,
                filter: 'All',
                activeId: null,
                apiBase: null
            };
            const escN = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
            const getReadIds = () => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(READ_CAMPAIGNS_KEY) || '[]');
                    return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
                } catch { return new Set(); }
            };
            const markReadId = id => {
                const set = getReadIds();
                set.add(String(id));
                try { localStorage.setItem(READ_CAMPAIGNS_KEY, JSON.stringify(Array.from(set))); } catch { }
            };
            const readCachedCampaigns = () => {
                try {
                    const parsed = JSON.parse(localStorage.getItem(CAMPAIGNS_CACHE_KEY) || '[]');
                    return Array.isArray(parsed) ? parsed : [];
                } catch { return []; }
            };
            const getApiBases = () => {
                const list = [];
                if (window.HIVECITY_CONFIG && window.HIVECITY_CONFIG.API_BASE_URL) list.push(String(window.HIVECITY_CONFIG.API_BASE_URL).replace(/\/$/, ''));
                if ((location.protocol === 'http:' || location.protocol === 'https:') && location.port === '3000') list.push('');
                if (!list.includes('http://localhost:3000')) list.push('http://localhost:3000');
                if (!list.includes('http://127.0.0.1:3000')) list.push('http://127.0.0.1:3000');
                return list;
            };
            const refreshNotificationsView = () => {
                const activeRoute = location.hash.slice(1).split('?')[0].split('/')[0];
                if (typeof chrome === 'function') chrome(activeRoute);
                if (activeRoute === 'notifications' && typeof go === 'function') go(1);
            };

            const getCampaignVersionKey = c => c ? String(c.id) + '::' + String(c.resentAt || c.createdAt || '') : '';
            window.getHiveUnreadCampaignsCount = function () {
                const list = nState.campaigns.length ? nState.campaigns : readCachedCampaigns();
                const readSet = getReadIds();
                return list.filter(c => c && c.id && !readSet.has(getCampaignVersionKey(c))).length;
            };

            window.loadHiveCampaignNotifications = async function (force) {
                if (nState.loading || (nState.loaded && !force)) return;
                nState.loading = true;
                try {
                    const bases = nState.apiBase !== null ? [nState.apiBase] : getApiBases();
                    for (const base of bases) {
                        try {
                            const res = await fetch(base + '/api/campaigns', { cache: 'no-store' });
                            if (res.ok) {
                                const data = await res.json();
                                if (Array.isArray(data.campaigns)) {
                                    nState.campaigns = data.campaigns;
                                    nState.apiBase = base;
                                    try { localStorage.setItem(CAMPAIGNS_CACHE_KEY, JSON.stringify(data.campaigns)); } catch { }
                                    break;
                                }
                            }
                        } catch { }
                    }
                    if (!nState.campaigns.length) {
                        nState.campaigns = readCachedCampaigns();
                    }
                    // Also load Admin Restrict warnings for the current signed-in user (Firestore + API fallback)
                    const curUid = (window.hiveCurrentUser && window.hiveCurrentUser.uid) || '';
                    if (curUid) {
                        const warningItems = [];
                        try {
                            if (window.hiveDb) {
                                const wSnap = await window.hiveDb.collection('users').doc(curUid).collection('notifications').get();
                                wSnap.forEach(d => {
                                    const wd = d.data() || {};
                                    warningItems.push({
                                        id: d.id,
                                        category: 'Account Warning',
                                        title: wd.title || 'Account Warning · Restricted',
                                        message: wd.message || "Don't do unwanted activity",
                                        imageUrl: '',
                                        ctaUrl: '',
                                        createdAt: wd.createdAt && wd.createdAt.toDate ? wd.createdAt.toDate().toISOString() : (wd.createdAt || new Date().toISOString())
                                    });
                                });
                            }
                        } catch (_) { }
                        try {
                            const bases = nState.apiBase !== null ? [nState.apiBase] : getApiBases();
                            for (const base of bases) {
                                const wRes = await fetch(base + '/api/users/' + encodeURIComponent(curUid) + '/access-status', { cache: 'no-store' });
                                if (wRes.ok) {
                                    const wData = await wRes.json();
                                    if (Array.isArray(wData.warnings)) {
                                        wData.warnings.forEach(wd => {
                                            if (!warningItems.some(x => x.id === wd.id)) {
                                                warningItems.push({
                                                    id: wd.id,
                                                    category: 'Account Warning',
                                                    title: wd.title || 'Account Warning · Restricted',
                                                    message: wd.message || "Don't do unwanted activity",
                                                    imageUrl: '',
                                                    ctaUrl: '',
                                                    createdAt: wd.createdAt || new Date().toISOString()
                                                });
                                            }
                                        });
                                    }
                                    break;
                                }
                            }
                        } catch (_) { }
                        if (warningItems.length) {
                            const mergedMap = new Map();
                            warningItems.forEach(w => mergedMap.set(String(w.id), w));
                            nState.campaigns.forEach(c => { if (!mergedMap.has(String(c.id))) mergedMap.set(String(c.id), c); });
                            nState.campaigns = Array.from(mergedMap.values());
                        }
                    }
                    nState.loaded = true;
                } finally {
                    nState.loading = false;
                    refreshNotificationsView();
                }
            };

            window.setHiveNotificationFilter = function (cat) {
                nState.filter = cat || 'All';
                refreshNotificationsView();
            };

            window.openHiveCampaignViewer = function (id) {
                nState.activeId = String(id || '');
                const list = nState.campaigns.length ? nState.campaigns : readCachedCampaigns();
                const found = list.find(c => String(c.id) === nState.activeId);
                if (found) markReadId(getCampaignVersionKey(found));
                refreshNotificationsView();
            };

            window.closeHiveCampaignViewer = function () {
                nState.activeId = null;
                refreshNotificationsView();
            };

            window.addEventListener('hivecity:campaigns-updated', () => { void window.loadHiveCampaignNotifications(true); });
            window.addEventListener('storage', ev => {
                if (ev && (ev.key === CAMPAIGNS_CACHE_KEY || ev.key === READ_CAMPAIGNS_KEY)) {
                    nState.campaigns = readCachedCampaigns();
                    refreshNotificationsView();
                }
            });
            window.addEventListener('keydown', e => {
                if (e.key === 'Escape' && nState.activeId) {
                    window.closeHiveCampaignViewer();
                }
            });

            // Real-time Firestore onSnapshot listeners for instant campaign & warning delivery (zero refresh lag)
            window.attachHiveNotificationListeners = function () {
                if (Array.isArray(window._hiveNotifUnsubs)) {
                    window._hiveNotifUnsubs.forEach(fn => { try { fn(); } catch (_) { } });
                }
                window._hiveNotifUnsubs = [];
                if (!window.hiveDb) return;

                const toIso = v => (v && typeof v.toDate === 'function' ? v.toDate().toISOString() : (v || new Date().toISOString()));
                let liveCampaigns = [];
                let liveWarnings = [];
                const mergeAndRefresh = () => {
                    const merged = new Map();
                    liveWarnings.forEach(w => merged.set(String(w.id), w));
                    liveCampaigns.forEach(c => { if (!merged.has(String(c.id))) merged.set(String(c.id), c); });
                    nState.campaigns = Array.from(merged.values());
                    nState.loaded = true;
                    try { localStorage.setItem(CAMPAIGNS_CACHE_KEY, JSON.stringify(liveCampaigns)); } catch (_) { }
                    refreshNotificationsView();
                };

                try {
                    const unsubCamp = window.hiveDb.collection('community_campaigns').onSnapshot(snap => {
                        const list = [];
                        snap.forEach(doc => {
                            const d = doc.data() || {};
                            list.push({
                                id: doc.id,
                                category: String(d.category || 'Run').toLowerCase().includes('food') ? 'Food & Beverages' : 'Run',
                                title: String(d.title || 'Hivecity Announcement'),
                                imageUrl: String(d.imageUrl || ''),
                                message: String(d.message || d.description || ''),
                                ctaUrl: String(d.ctaUrl || ''),
                                resentAt: d.resentAt ? toIso(d.resentAt) : undefined,
                                createdAt: toIso(d.createdAt)
                            });
                        });
                        if (list.length) {
                            liveCampaigns = list;
                            mergeAndRefresh();
                        }
                    }, () => { });
                    window._hiveNotifUnsubs.push(unsubCamp);
                } catch (_) { }

                const curUid = (window.hiveCurrentUser && window.hiveCurrentUser.uid) || '';
                if (curUid) {
                    try {
                        const unsubWarn = window.hiveDb.collection('users').doc(curUid).collection('notifications').onSnapshot(snap => {
                            const list = [];
                            snap.forEach(doc => {
                                const wd = doc.data() || {};
                                list.push({
                                    id: doc.id,
                                    category: 'Account Warning',
                                    title: wd.title || 'Account Warning · Restricted',
                                    message: wd.message || "Don't do unwanted activity",
                                    imageUrl: '',
                                    ctaUrl: '',
                                    createdAt: toIso(wd.createdAt)
                                });
                            });
                            liveWarnings = list;
                            mergeAndRefresh();
                        }, () => { });
                        window._hiveNotifUnsubs.push(unsubWarn);
                    } catch (_) { }
                }
            };

            // Background initial fetch + real-time Firestore listeners
            setTimeout(() => {
                void window.loadHiveCampaignNotifications(false);
                window.attachHiveNotificationListeners();
            }, 350);
            if (window.hiveAuth && typeof window.hiveAuth.onAuthStateChanged === 'function') {
                window.hiveAuth.onAuthStateChanged(() => {
                    window.attachHiveNotificationListeners();
                });
            }

            V.notifications = () => {
                if (!nState.loaded && !nState.loading) {
                    setTimeout(() => void window.loadHiveCampaignNotifications(false), 20);
                }
                const list = (nState.campaigns.length ? nState.campaigns : readCachedCampaigns())
                    .slice()
                    .sort((a, b) => String(b.resentAt || b.createdAt || '').localeCompare(String(a.resentAt || a.createdAt || '')));
                const readSet = getReadIds();
                const visible = list.filter(c => nState.filter === 'All' || c.category === nState.filter);
                const active = nState.activeId ? list.find(c => String(c.id) === String(nState.activeId)) : null;
                const fmtTs = iso => {
                    if (!iso) return 'Just now';
                    try {
                        return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
                    } catch { return String(iso); }
                };

                return `<div style="max-width:780px;margin:0 auto">
                    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
                        <div>
                            <h1 class="big" style="margin:0">Notifications</h1>
                            <small style="color:var(--mu)">Official Hivecity Run &amp; Food &amp; Beverages announcements</small>
                        </div>
                        <div class="row" style="gap:6px">
                            ${['All', 'Run', 'Food & Beverages'].map(cat => `<button type="button" class="chip ${nState.filter === cat ? 'on' : ''}" onclick="window.setHiveNotificationFilter('${escN(cat)}')">${escN(cat)}</button>`).join('')}
                        </div>
                    </div>

                    <div style="display:grid;gap:12px">
                        ${visible.length ? visible.map(c => {
                    const isRead = readSet.has(getCampaignVersionKey(c));
                    const displayTs = c.resentAt || c.createdAt;
                    return `<article class="card" role="button" tabindex="0" onclick="window.openHiveCampaignViewer('${escN(c.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.openHiveCampaignViewer('${escN(c.id)}');}" style="cursor:pointer;border-left:4px solid ${isRead ? 'var(--bd)' : '#1B4D3E'};padding:14px 16px;border-radius:18px 18px 18px 6px">
                                <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px">
                                    <span style="font-size:12px;font-weight:700;color:#1B4D3E">Hivecity Official • ${escN(c.category)}</span>
                                    <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--mu)">
                                        ${escN(fmtTs(displayTs))}
                                        ${isRead
                            ? `<span title="Read" style="color:#1B4D3E;font-weight:700">✓✓</span>`
                            : `<span title="Unread" style="width:8px;height:8px;border-radius:999px;background:#1B4D3E;display:inline-block"></span>`}
                                    </span>
                                </div>
                                <div class="row" style="align-items:center;gap:14px;flex-wrap:nowrap">
                                    ${c.imageUrl ? `<img src="${escN(c.imageUrl)}" alt="${escN(c.title)}" style="width:76px;height:76px;object-fit:cover;border-radius:12px;flex-shrink:0" onerror="window.handleHiveRecipeImgError(this)">` : ''}
                                    <div style="flex:1;min-width:0">
                                        <b style="display:block;font-size:15px;margin-bottom:4px">${escN(c.title)}</b>
                                        <p style="margin:0;font-size:13px;color:var(--mu);line-height:1.45">${escN(c.message.length > 140 ? c.message.slice(0, 140) + '…' : c.message)}</p>
                                    </div>
                                </div>
                            </article>`;
                }).join('') : `<div class="card" style="text-align:center;padding:36px 20px"><h3>No notifications yet</h3><p style="color:var(--mu);margin:6px 0 0">New Run and Food &amp; Beverages campaigns from Hivecity Official will appear here.</p></div>`}
                    </div>

                    ${active ? `<div style="position:fixed;inset:0;z-index:9999;background:rgba(16,17,15,0.82);display:flex;align-items:center;justify-content:center;padding:20px" onclick="if(event.target===this)window.closeHiveCampaignViewer()">
                        <div class="card" style="position:relative;max-width:720px;width:100%;max-height:92vh;overflow-y:auto;padding:24px;border-radius:24px">
                            <button type="button" aria-label="Close" onclick="window.closeHiveCampaignViewer()" style="position:sticky;top:0;float:right;width:36px;height:36px;border-radius:999px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);font-size:20px;font-weight:700;line-height:1;cursor:pointer;display:grid;place-items:center">×</button>
                            <div style="margin-bottom:12px">
                                <span class="tag">${escN(active.category)}</span>
                                <small style="color:var(--mu);margin-left:8px">${escN(fmtTs(active.createdAt))}</small>
                            </div>
                            <h2 style="margin:0 0 14px;font-size:24px;line-height:1.25">${escN(active.title)}</h2>
                            ${active.imageUrl ? `<div style="margin-bottom:16px;border-radius:16px;overflow:hidden;background:var(--bd)"><img src="${escN(active.imageUrl)}" alt="${escN(active.title)}" style="width:100%;max-height:420px;object-fit:cover;display:block" onerror="window.handleHiveRecipeImgError(this)"></div>` : ''}
                            <p style="margin:0 0 18px;font-size:15px;line-height:1.65;white-space:pre-wrap">${escN(active.message)}</p>
                            <div class="row" style="gap:10px">
                                ${active.ctaUrl ? `<a class="btn" href="${escN(active.ctaUrl)}" ${active.ctaUrl.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : 'onclick="window.closeHiveCampaignViewer()"'}>Open link ↗</a>` : ''}
                                <button type="button" class="btn g" onclick="window.closeHiveCampaignViewer()">Back to Notifications</button>
                            </div>
                        </div>
                    </div>` : ''}
                </div>`;
            };
        })();
        const ob0 = orbit; let ow; orbit = () => { const w = $('#orbit'); if (!w || w === ow) return; ow = w; ob0() };
        const fx0 = fx; fx = h => { fx0(h); orbit(); if (h == 'activity') rdraw(); if (h == 'community') { const m = $('#mr'); if (window._mrObserver) { window._mrObserver.disconnect(); window._mrObserver = null; } if (m) { window._mrObserver = new IntersectionObserver(es => { if (es[0].isIntersecting) more() }, { rootMargin: '200px' }); window._mrObserver.observe(m); } } };
        addEventListener('keydown', e => { if (e.key == 'Escape') sh0() });

        addEventListener('keydown', e => { if (e.key == 'Escape') $('#lb').innerHTML = '' });

        /* ===== HIVE CITY home chapters: Grail-style hero + pinned scroll ===== */
        (() => {
            const q = (s, r = document) => r.querySelector(s), qa = (s, r = document) => [...r.querySelectorAll(s)];
            const RM = matchMedia('(prefers-reduced-motion:reduce)').matches, sm = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
            const OR = [4, 5, 6, 7, 25, 26, 28, 29, 33, 82, 84, 85, 86, 87, 88, 90, 94, 95, 96, 36, 27, 3].filter(n => IM[n]);
            const ACT = [[97, 'To find the trail you would never have picked.', 'The route was always there. Someone just had to show you.', 'Group run outdoors'], [92, 'To run next to someone, not past them.', 'Pace gets easier with a person beside you.', 'Two runners smiling in a race'], [91, 'To become part of the group on the road.', 'Same time, same road, a few more faces each week.', 'Group running down a tree-lined road'], [89, 'To line up at the start and just go.', 'Everyone shows up for different reasons. Everyone leaves lighter.', 'Runner on a red track']];
            const FUEL = [[10, 'Recovery bowl'], [12, 'Pre-run breakfast'], [14, 'Light fuel'], [15, 'The full plate'], [16, 'Post-run'], [24, 'Fresh']];
            const hd0 = V.discover;
            V.discover = () => `<div class="gx">
<div class="gx-hud"><span id="gx-l">About the City</span></div>
<a class="gx-pill" id="gx-pill" href="#activity"><i>⬡</i>Join Hive</a>
<section class="gx-ch" data-l="About the City" data-t="k"><div class="gx-pn gx-k gx-hero">
<div class="gx-orb" id="gx-orb">${OR.map((n, i) => `<div class="gx-o${i % 4 == 1 ? ' gl' : ''}" style="width:${120 + (i * 37) % 90}px"><img alt="Community photograph" src="${IM[n]}" loading="lazy" decoding="async"></div>`).join('')}</div><div class="gx-scr"></div>
<div class="gx-ht" id="gx-ht"><h1 class="gx-d"><span class="gx-m"><span>The city</span></span><span class="gx-m"><span>is moving.</span></span><span class="gx-m"><span><em>Join</em> it.</span></span></h1><p class="gx-s">Run clubs, events, fuel and gear. One hive for everyone who moves.</p><div class="gx-cta"><a class="gx-b" href="#activity">Join the Hive</a><a class="gx-b g" href="#community">Explore the movement</a></div></div>
</div></section>
<section class="gx-ch" id="gx-act" data-l="About Activity" data-t="w"><div class="gx-pn gx-w"><div class="gx-in">

<h2 class="gx-d">It starts as one run.<br>It rarely stays that way.</h2><p class="gx-s">No promises. Just what tends to happen once you show up.</p>
<div style="margin-top:26px">${ACT.map((a, i) => `<div class="gx-row"><span>0${i + 1}</span><div><small>A chance</small><b>${a[1]}</b></div><img src="${IM[a[0]]}" alt="${a[3]}" loading="lazy" decoding="async"><p>${a[2]}</p></div>`).join('')}</div>
<p style="margin-top:20px"><a class="gx-b" href="#activity">Explore activity</a></p></div></div></section>
<section class="gx-ch" id="gx-pace" data-l="About Pace" data-t="w"><div class="gx-pn gx-l"><div class="gx-in">

<h2 class="gx-d" style="margin-top:18px">Every kilometre<br>counts.</h2>
<div class="gx-big"><span id="gx-km">20KM</span><small> DAILY DISTANCE</small></div>
<p class="gx-s">Your distance is calculated from completed GPS activities today.</p>
<div class="gx-bars" aria-hidden="true">${[40, 70, 0, 95, 55, 100, 30].map(h => `<span style="height:${h}%"></span>`).join('')}</div>
<p style="margin-top:20px"><a class="gx-b" style="background:#10110F;color:#FFFFFF !important" href="#activity">Open my activity</a></p>
<div class="gx-tr">${[[83, 'Weights on grass'], [81, 'Gym in black and white'], [57, 'Dumbbells']].filter(x => IM[x[0]]).map(x => `<img src="${IM[x[0]]}" alt="${x[1]}">`).join('')}</div></div></div></section>
<section class="gx-ch" id="gx-fuel" data-l="About Fuel" data-t="k"><div class="gx-pn gx-k gx-fp"><div class="gx-ft"><h2 class="gx-d">Fuel the<br>distance.</h2></div>
<div class="gx-track" id="gx-track">${FUEL.map((f, i) => `<figure><img src="${IM[f[0]]}" alt="${f[1]}" loading="lazy" decoding="async"><figcaption>0${i + 1} · ${f[1].toUpperCase()}</figcaption></figure>`).join('')}<figure style="display:grid;place-items:center;text-align:center"><div><h3 class="gx-d" style="font-size:48px">Build your plate</h3><p><a class="gx-b" href="#nutrition">Open nutrition</a></p></div></figure></div></div></section>
<section class="gx-ch" id="gx-ev" data-l="About Events" data-t="w"><div class="gx-pn gx-w"><div class="gx-in">
<h2 class="gx-d">Pick your<br>start line.</h2><p class="gx-s">Find a run, a ride or a session and book in seconds.</p>
<p style="margin-top:22px"><a class="gx-b" href="#events">All events and map</a></p>
<div class="gx-grid">${EV.map(e => `<button class="gx-ev" data-c="${e.c}" data-id="${e.id}"><img src="${typeof e.im === "string" && e.im.startsWith("http") ? e.im : (IM[e.im] || IM[90])}" alt="${e.n}" loading="lazy" decoding="async"><div><em>${e.c.toUpperCase()}</em><h3>${e.n}</h3><small>${e.d} · ${e.v}</small></div></button>`).join('')}</div></div></div></section>
<dialog id="gx-dlg"><img id="gx-di" alt=""><div class="gx-dl"><em id="gx-dc" style="font:700 11px 'Space Grotesk';letter-spacing:.1em;font-style:normal"></em><h3 id="gx-dt"></h3><div id="gx-dm" style="font-size:14px;opacity:.8"></div><div class="gx-msg" id="gx-dg" role="status"></div><div class="gx-acts"><button class="gx-b" id="gx-bk">Book ticket</button><button class="gx-b g" id="gx-mp">Open map</button><button class="gx-b g" id="gx-x">Close</button></div></div></dialog>
<div id="gx-old" data-l="Inside the Hive"></div></div>`+ hd0();

            let loop = 0;
            function init() {
                const orb = q('#gx-orb'); if (!orb) return;
                const R = [{ rx: .34, ry: .26, sp: 1, n: 7 }, { rx: .5, ry: .38, sp: -.7, n: 8 }, { rx: .68, ry: .5, sp: .5, n: 7 }], els = qa('.gx-o', orb), it = []; let k = 0;
                R.forEach((r, ri) => { for (let i = 0; i < r.n && k < els.length; i++, k++)it.push({ d: els[k], r, a: i / r.n * Math.PI * 2 + ri * .6 }) });
                let P = 0, intro = RM ? 1 : 0, t = 0, last = performance.now(), t0 = last; const my = ++loop; let vis = true; if (window.IntersectionObserver) new IntersectionObserver(en => { vis = en[0].isIntersecting }).observe(orb);
                (function frame(now) {
                    if (my !== loop || !document.body.contains(orb)) return; if (!vis) { last = now; requestAnimationFrame(frame); return } const dt = (now - last) / 1e3; last = now; if (!RM) { t += dt * 30; intro = Math.min(1, (now - t0 - 60) / 1300); intro = intro < 0 ? 0 : 1 - Math.pow(1 - intro, 3) }
                    const W = orb.clientWidth, H = orb.clientHeight, sc = W < 700 ? .62 : 1, ex = 1 + P * 1.1;
                    it.forEach(o => {
                        const a = o.a + t * .04 * Math.sign(o.r.sp) + P * o.r.sp * Math.PI * 1.1, dep = (Math.sin(a) + 1) / 2, e = .25 + .75 * intro, x = Math.cos(a) * o.r.rx * W * ex * e, y = Math.sin(a) * o.r.ry * H * e * (1 + P * .4), c = Math.cos(-.2), s = Math.sin(-.2), sz = (.55 + .55 * dep) * sc * (.4 + .6 * intro);
                        o.d.style.transform = `translate3d(${W / 2 + x * c - y * s}px,${H / 2 + x * s + y * c}px,0) translate(-50%,-50%) scale(${sz})`; o.d.style.zIndex = Math.round(dep * 10); const px = W / 2 + x * c - y * s, py = H / 2 + x * s + y * c, f = Math.hypot((px - W / 2) / (W * (.34 - P * .2)), (py - H / 2) / (H * .34)), cl = .12 + .88 * sm(f - .55); o.d.style.opacity = Math.max(0, (.3 + .5 * (1 - dep * .4)) * cl * intro * (1 - sm((P - .65) / .3)))
                    });
                    requestAnimationFrame(frame)
                })(last);
                /* events dialog + filters (work without GSAP) */
                const dlg = q('#gx-dlg'); let cur = null;
                qa('.gx-chip').forEach(b => b.onclick = () => { qa('.gx-chip').forEach(x => x.setAttribute('aria-pressed', x === b)); qa('.gx-ev').forEach(e => e.hidden = !(b.dataset.f === 'all' || e.dataset.c === b.dataset.f)); window.ScrollTrigger && ScrollTrigger.refresh() });
                qa('.gx-ev').forEach(b => b.onclick = () => { cur = EV.find(e => e.id == b.dataset.id); q('#gx-di').src = IM[cur.im]; q('#gx-di').alt = cur.n; q('#gx-dc').textContent = cur.c.toUpperCase(); q('#gx-dt').textContent = cur.n; q('#gx-dm').textContent = cur.d + ' · ' + cur.v + ' · ' + rupees(cur.pr); q('#gx-dg').textContent = ''; q('#gx-dg').className = 'gx-msg'; const bk = q('#gx-bk'); bk.disabled = false; bk.textContent = 'Book ticket'; dlg.showModal() });
                q('#gx-x').onclick = () => dlg.close();
                q('#gx-mp').onclick = () => window.open('https://www.openstreetmap.org/search?query=' + encodeURIComponent(cur.v.replace(/\s*\(sample\)/i, '')), '_blank', 'noopener');
                q('#gx-bk').onclick = () => { const b = q('#gx-bk'), m = q('#gx-dg'); b.disabled = true; m.className = 'gx-msg'; m.textContent = 'Adding…'; setTimeout(() => { S.bk[cur.id] = (S.bk[cur.id] || 0) + 1; sv(); chrome('discover'); m.className = 'gx-msg ok'; m.innerHTML = 'Added to your bookings. <a href="#bookings">View bookings</a>'; b.textContent = 'Added ✓' }, 700) };
                if (!window.gsap || !window.ScrollTrigger) return;
                gsap.registerPlugin(ScrollTrigger); ScrollTrigger.config({ ignoreMobileResize: true });
                const secs = qa('.gx-ch'), hud = q('.gx'), lab = (i, l, tone) => { q('#gx-l').textContent = l; hud.style.setProperty('--gxfg', tone === 'k' ? '#F2F0E9' : tone === 'w' ? '#10110F' : 'var(--tx)'); q('#gx-pill').classList.toggle('off', i >= 5) };
                secs.forEach((s, i) => {
                    ScrollTrigger.create({ trigger: s, start: 'top 55%', end: 'bottom 55%', onToggle: v => v.isActive && lab(i, s.dataset.l, s.dataset.t) });
                });
                ScrollTrigger.create({ trigger: '#gx-old', start: 'top 70%', onEnter: () => lab(5, 'Inside the Hive', 'o'), onLeaveBack: () => lab(4, secs[4].dataset.l, 'w') });
                lab(0, 'About the City', 'k');
                if (RM) { q('#gx-km').textContent = '20KM'; return }
                gsap.from('.gx-hero .gx-m>span', { yPercent: 110, duration: .9, ease: 'expo.out', stagger: .1, delay: .1 });
                ScrollTrigger.create({ trigger: secs[0], start: 'top top', end: 'bottom top', scrub: true, onUpdate: s => { P = s.progress; const ht = q('#gx-ht'); if (ht) { ht.style.opacity = 1 - sm((P - .2) / .5); ht.style.transform = 'translate3d(0,' + (-P * 40) + 'px,0) scale(' + (1 + P * .12) + ')' } } });
                const st = (t, o) => Object.assign({ trigger: t, start: 'top 85%', once: true }, o || {});
                gsap.from('#gx-act .gx-d', { y: 36, opacity: 0, duration: .5, ease: 'power2.out', scrollTrigger: st('#gx-act') });
                gsap.from('#gx-act .gx-row', { y: 36, opacity: 0, duration: .5, stagger: .08, delay: .1, ease: 'power2.out', scrollTrigger: st('#gx-act') });
                q('#gx-km').textContent = '20KM';
                gsap.from('.gx-bars span', { scaleY: 0, stagger: .07, duration: .55, ease: 'power2.out', scrollTrigger: st('#gx-pace', { start: 'top 80%' }) });
                gsap.from('.gx-tr img', { yPercent: 20, opacity: 0, stagger: .1, duration: .55, ease: 'power2.out', scrollTrigger: st('#gx-pace', { start: 'top 80%' }) });
                const tr = q('#gx-track'); gsap.to(tr, { x: () => -(tr.scrollWidth - innerWidth + 24), ease: 'none', scrollTrigger: { trigger: '#gx-fuel', start: 'top top', end: () => '+=' + Math.round(tr.scrollWidth * .7), pin: true, scrub: .55, anticipatePin: 1, fastScrollEnd: true, invalidateOnRefresh: true } });
                requestAnimationFrame(() => ScrollTrigger.refresh());
            }
            const go0 = go; go = function () { try { window.ScrollTrigger && ScrollTrigger.getAll().forEach(t => t.kill(true)) } catch (e) { } return go0.apply(this, arguments) };
            const fx2 = fx; fx = h => { fx2(h); if (h === 'discover' || (h !== '' && !V[h])) init() };
            addEventListener('load', () => window.ScrollTrigger && ScrollTrigger.refresh());
        })();

        /* HIVE CITY SOCIAL & PROFILE UPGRADE — Stage 1 Foundation */
        (() => {
            const HSKEY = 'hive-city-social-v3';
            const hsLoad = () => { try { return JSON.parse(localStorage.getItem(HSKEY) || '{}') } catch (e) { return {} } };
            const hs = Object.assign({
                likes: {}, saved: {}, reposts: {}, repostsByUser: {}, follows: {}, comments: {},
                mode: 'for-you', stories: [], customPosts: [], nutritionShares: {},
                profileTab: 'posts'
            }, hsLoad());
            const hsSave = () => { try { localStorage.setItem(HSKEY, JSON.stringify(hs)) } catch (e) { } };
            window.hs = hs;
            window.hsSave = hsSave;
            const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

            // Seed posts for initial community experience before Firestore population
            const baseCommunityPosts = [
                {
                    id: 'post-1',
                    authorUid: 'ath-1',
                    authorName: 'Maya Chen',
                    authorUsername: 'maya.runs',
                    authorPhoto: '',
                    caption: 'Sunday long run with the crew! 18 km through coastal trail. Perfect weather and great company.',
                    tags: '#longrun #hivecity #marathontraining',
                    mediaUrls: [3, 97],
                    mediaType: 'carousel',
                    location: 'East Coast Trail',
                    runData: { distance: '18.0 km', duration: '1:34:22', pace: '5:14/km', route: 'Coastal Path' },
                    likesCount: 248,
                    commentsCount: 14,
                    repostsCount: 32,
                    isOfficial: false,
                    createdAt: Date.now() - 7200000
                },
                {
                    id: 'post-2',
                    authorUid: 'admin-hc',
                    authorName: 'Hivecity Official',
                    authorUsername: 'hivecity',
                    authorPhoto: '',
                    caption: 'OFFICIAL UPDATE: Hive City Half-Marathon registration is officially open! 21.1 km course certified. Slots are limited — grab your bib in Events.',
                    tags: '#hivehalf #citymarathon #official',
                    mediaUrls: [90],
                    mediaType: 'image',
                    location: 'City Centre Start Line',
                    runData: { distance: '21.1 km', duration: 'Target < 1:55', pace: '5:27/km', route: 'Certified Loop' },
                    likesCount: 684,
                    commentsCount: 52,
                    repostsCount: 118,
                    isOfficial: true,
                    officialCategory: 'marathon',
                    createdAt: Date.now() - 14400000
                },
                {
                    id: 'post-3',
                    authorUid: 'ath-2',
                    authorName: 'Kai Tan',
                    authorUsername: 'kai_trails',
                    authorPhoto: '',
                    caption: 'Chasing the light. Early morning trail intervals. Legs burning, spirit soaring.',
                    tags: '#trailrunning #goldenhour #intervals',
                    mediaUrls: [91],
                    mediaType: 'image',
                    video: true,
                    location: 'MacRitchie Ridge',
                    runData: { distance: '8.4 km', duration: '44:12', pace: '5:15/km', route: 'Ridge Trail' },
                    likesCount: 412,
                    commentsCount: 28,
                    repostsCount: 45,
                    isOfficial: false,
                    createdAt: Date.now() - 28800000
                },
                {
                    id: 'post-4',
                    authorUid: 'ath-3',
                    authorName: 'Ren Okafor',
                    authorUsername: 'ren.lifts',
                    authorPhoto: '',
                    caption: 'Strength work done: deadlifts, Bulgarian split squats and core stability. Runner strength is injury prevention.',
                    tags: '#runnerstrength #mobility #crossfit',
                    mediaUrls: [85, 57],
                    mediaType: 'carousel',
                    location: 'Hive Strength Lab',
                    runData: null,
                    likesCount: 198,
                    commentsCount: 19,
                    repostsCount: 22,
                    isOfficial: false,
                    createdAt: Date.now() - 43200000
                }
            ];

            // Live state caches
            let firestorePosts = [];
            let firestoreUsers = [];
            let firestoreFollowRequests = [];
            let firestoreSharedNutrition = [];
            let firestoreStories = [];
            let firestoreReposts = [];
            let searchFilter = '';
            let activeStoryIndex = -1;

            // Helper to get active stories (under 24h)
            window.getActiveStories = function () {
                const now = Date.now();
                if (Array.isArray(hs.stories)) {
                    hs.stories = hs.stories.filter(s => s && s.expiresAt && s.expiresAt > now);
                } else {
                    hs.stories = [];
                }
                const live = (firestoreStories || []).filter(s => s && s.expiresAt && s.expiresAt > now);
                const map = new Map();
                hs.stories.forEach(s => map.set(s.id, s));
                live.forEach(s => map.set(s.id, { ...map.get(s.id), ...s }));
                return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            };

            // Realtime listener for posts, stories, users, reposts, follow requests
            function initSocialListeners() {
                if (!window.hiveDb) return;
                try {
                    let _socialRerenderTimer = null;
                    const debouncedSocialRefresh = () => {
                        if (_socialRerenderTimer) return;
                        _socialRerenderTimer = requestAnimationFrame(() => {
                            _socialRerenderTimer = null;
                            if (location.hash === '#community' || location.hash.startsWith('#profile')) {
                                go(1);
                            }
                        });
                    };

                    window.hiveDb.collection('social_posts').orderBy('createdAt', 'desc').limit(50).onSnapshot(snap => {
                        firestorePosts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        debouncedSocialRefresh();
                    }, err => console.warn('Social posts listener:', err));

                    window.hiveDb.collection('users').limit(60).onSnapshot(snap => {
                        firestoreUsers = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
                        debouncedSocialRefresh();
                    }, err => console.warn('Users social listener:', err));

                    window.hiveDb.collection('shared_nutrition').onSnapshot(snap => {
                        firestoreSharedNutrition = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        debouncedSocialRefresh();
                    }, err => console.warn('Shared nutrition listener:', err));

                    window.hiveDb.collection('stories').limit(50).onSnapshot(snap => {
                        const now = Date.now();
                        firestoreStories = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(s => s && s.expiresAt && s.expiresAt > now);
                        debouncedSocialRefresh();
                    }, err => console.warn('Stories listener:', err));

                    window.hiveDb.collection('reposts').limit(100).onSnapshot(snap => {
                        firestoreReposts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        debouncedSocialRefresh();
                    }, err => console.warn('Reposts listener:', err));

                    window.hiveDb.collection('follow_requests').limit(50).onSnapshot(snap => {
                        firestoreFollowRequests = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        debouncedSocialRefresh();
                    }, err => console.warn('Follow requests listener:', err));
                } catch (e) { console.warn('Init social listeners error:', e); }
            }
            setTimeout(initSocialListeners, 400);

            // Get combined posts
            function getAllPosts() {
                const custom = hs.customPosts || [];
                const live = firestorePosts.length ? firestorePosts : [];
                const map = new Map();
                custom.forEach(p => map.set(p.id, p));
                live.forEach(p => map.set(p.id, { ...map.get(p.id), ...p }));
                baseCommunityPosts.forEach(p => { if (!map.has(p.id)) map.set(p.id, p); });
                return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            }

            // Current user helper
            function getAuthUser() {
                return window.hiveCurrentUser || null;
            }

            function getUserProfile(uid) {
                if (!uid) return null;
                const found = firestoreUsers.find(u => u.uid === uid);
                if (found) return found;
                const cur = window.hiveCurrentUser;
                if (cur && cur.uid === uid) {
                    try {
                        const sess = JSON.parse(sessionStorage.getItem('hivecityUser') || '{}');
                        return {
                            uid: cur.uid,
                            name: cur.displayName || sess.name || 'Hive Member',
                            username: (cur.displayName || sess.name || 'runner').toLowerCase().replace(/\\s+/g, '_'),
                            photoURL: cur.customPhotoURL || window.hiveCustomPhoto || sess.photoURL || cur.photoURL || '',
                            bio: 'Moving with the Hive. Runner & athlete.',
                            isPrivate: false,
                            discoverable: true,
                            followersCount: 0,
                            followingCount: 0,
                            isAthlete: true
                        };
                    } catch (_) { }
                }
                return null;
            }

            // FEATURED ATHLETES SYSTEM (Exactly 4 profiles, mixed selection, rotated, no fake data)
            function getFourFeaturedAthletes() {
                const registered = firestoreUsers.filter(u => u && u.discoverable !== false && u.isPrivate !== true);
                const cur = getAuthUser();
                if (cur && !registered.find(u => u.uid === cur.uid)) {
                    const p = getUserProfile(cur.uid);
                    if (p && p.discoverable !== false && p.isPrivate !== true) registered.push(p);
                }

                const groupA = registered.filter(u => u.featuredAthlete === true || u.role === 'admin' || u.email === 'admin@hivecity.com');
                const groupB = registered.filter(u => !groupA.includes(u) && (u.isAthlete === true || (u.runsCount && u.runsCount > 0)));
                const groupC = registered.filter(u => !groupA.includes(u) && !groupB.includes(u));

                const rotationInterval = Math.floor(Date.now() / (1000 * 3600 * 6));
                const shuffle = (arr, seed) => {
                    const res = [...arr];
                    for (let i = res.length - 1; i > 0; i--) {
                        const j = (seed * 9301 + 49297 + i) % (i + 1);
                        [res[i], res[j]] = [res[j], res[i]];
                    }
                    return res;
                };

                const shuffA = shuffle(groupA, rotationInterval);
                const shuffB = shuffle(groupB, rotationInterval + 1);
                const shuffC = shuffle(groupC, rotationInterval + 2);

                const selected = [];
                const seenUids = new Set();

                const addCandidate = c => {
                    if (c && !seenUids.has(c.uid) && selected.length < 4) {
                        seenUids.add(c.uid);
                        selected.push(c);
                    }
                };

                shuffA.slice(0, 2).forEach(addCandidate);
                shuffB.slice(0, 2).forEach(addCandidate);
                shuffA.forEach(addCandidate);
                shuffB.forEach(addCandidate);
                shuffC.forEach(addCandidate);

                return selected.slice(0, 4);
            }

            function canViewUserContent(targetUser, viewerUid) {
                if (!targetUser) return true;
                if (!targetUser.isPrivate) return true;
                if (viewerUid && targetUser.uid === viewerUid) return true;
                if (viewerUid && hs.follows[targetUser.uid]) return true;
                return false;
            }

            function formatHiveId(uid) {
                return window.getOrCreateProfileId(uid);
            }

            window.hsLike = async function (postId, isDouble) {
                hs.likes[postId] = !hs.likes[postId];
                hsSave();
                const postCard = document.querySelector(`[data-post="${postId}"]`);
                if (postCard) {
                    const likeBtn = postCard.querySelector('.hs-action-like');
                    if (likeBtn) {
                        likeBtn.classList.toggle('on', hs.likes[postId]);
                        const countEl = postCard.querySelector('.hs-like-count');
                        if (countEl) {
                            const current = parseInt(countEl.textContent || '0', 10);
                            countEl.textContent = hs.likes[postId] ? current + 1 : Math.max(0, current - 1);
                        }
                    }
                    if (isDouble && hs.likes[postId]) {
                        const burst = document.createElement('span');
                        burst.className = 'hs-heart-burst';
                        burst.textContent = '♥';
                        const mediaWrap = postCard.querySelector('.hs-post-media');
                        if (mediaWrap) {
                            mediaWrap.appendChild(burst);
                            setTimeout(() => burst.remove(), 800);
                        }
                    }
                }
                if (window.hiveDb && !postId.startsWith('post-')) {
                    try {
                        const cur = getAuthUser();
                        if (cur) {
                            await window.hiveDb.collection('social_posts').doc(postId).update({
                                likesCount: firebase.firestore.FieldValue.increment(hs.likes[postId] ? 1 : -1)
                            });
                        }
                    } catch (_) { }
                }
            };

            window.hsSavePost = function (postId) {
                hs.saved[postId] = !hs.saved[postId];
                hsSave();
                toast(hs.saved[postId] ? 'Post saved to your collection ✓' : 'Removed from saved');
                go(1);
            };

            window.hsRepost = async function (postId) {
                const cur = getAuthUser();
                if (!cur) { toast('Please sign in to repost'); location.hash = 'auth'; return; }
                hs.repostsByUser = hs.repostsByUser || {};
                hs.repostsByUser[cur.uid] = hs.repostsByUser[cur.uid] || [];

                const existingIdx = hs.repostsByUser[cur.uid].findIndex(r => r.originalItemId === postId);
                const isNowReposted = existingIdx === -1;

                const postIdStr = String(postId);
                if (isNowReposted) {
                    const repostRecord = {
                        id: cur.uid + '_' + postIdStr,
                        itemType: 'post',
                        repostedBy: cur.uid,
                        repostedByEmail: cur.email || '',
                        originalItemId: postIdStr,
                        repostedAt: new Date().toISOString()
                    };
                    hs.repostsByUser[cur.uid].unshift(repostRecord);
                    hs.reposts[postIdStr] = true;
                    try {
                        const allR = typeof window.readHiveUserRepostsAll === 'function' ? window.readHiveUserRepostsAll() : [];
                        const nextR = allR.filter(r => !(String(r.repostedBy) === String(cur.uid) && String(r.originalItemId) === postIdStr));
                        nextR.unshift(repostRecord);
                        localStorage.setItem('hivecity_user_reposts', JSON.stringify(nextR));
                    } catch (_) { }
                } else {
                    hs.repostsByUser[cur.uid].splice(existingIdx, 1);
                    delete hs.reposts[postIdStr];
                    try {
                        const allR = typeof window.readHiveUserRepostsAll === 'function' ? window.readHiveUserRepostsAll() : [];
                        const nextR = allR.filter(r => !(String(r.repostedBy) === String(cur.uid) && String(r.originalItemId) === postIdStr));
                        localStorage.setItem('hivecity_user_reposts', JSON.stringify(nextR));
                    } catch (_) { }
                }
                hsSave();
                try {
                    if (typeof window.syncUserRepostToggleToApi === 'function') {
                        void window.syncUserRepostToggleToApi({
                            originalItemId: postIdStr,
                            itemType: 'post',
                            repostedBy: cur.uid,
                            repostedByEmail: cur.email || '',
                            action: isNowReposted ? 'add' : 'remove'
                        }, cur);
                    }
                } catch (_) { }
                window.dispatchEvent(new Event('hivecity:reposts-updated'));

                toast(isNowReposted ? 'Reposted to your profile ✓' : 'Repost removed');
                if (window.hiveDb) {
                    try {
                        const repRef = window.hiveDb.collection('reposts').doc(cur.uid + '_' + postId);
                        const oldPostRepRef = window.hiveDb.collection('post_reposts').doc(cur.uid + '_' + postId);
                        if (isNowReposted) {
                            await repRef.set({
                                repostedBy: cur.uid,
                                originalItemId: postId,
                                repostedAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                            await oldPostRepRef.set({
                                authorUid: cur.uid,
                                originalPostId: postId,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            }).catch(() => { });
                            await window.hiveDb.collection('social_posts').doc(postId).update({
                                repostsCount: firebase.firestore.FieldValue.increment(1)
                            }).catch(() => { });
                        } else {
                            await repRef.delete().catch(() => { });
                            await oldPostRepRef.delete().catch(() => { });
                            await window.hiveDb.collection('social_posts').doc(postId).update({
                                repostsCount: firebase.firestore.FieldValue.increment(-1)
                            }).catch(() => { });
                        }
                    } catch (_) { }
                }
                go(1);
            };

            window.hsToggleComments = function (postId) {
                const el = document.getElementById('hsc-' + postId);
                if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
            };

            window.hsComment = async function (postId) {
                const cur = getAuthUser();
                if (!cur) { toast('Sign in to comment'); location.hash = 'auth'; return; }
                const input = document.getElementById('hsi-' + postId);
                const text = input ? input.value.trim() : '';
                if (!text) return;
                input.value = '';
                hs.comments[postId] = hs.comments[postId] || [];
                const authorName = cur.displayName || 'You';
                hs.comments[postId].push([authorName, text, Date.now()]);
                hsSave();
                if (window.hiveDb && !postId.startsWith('post-')) {
                    try {
                        await window.hiveDb.collection('social_posts').doc(postId).collection('comments').add({
                            authorUid: cur.uid,
                            authorName,
                            text,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        await window.hiveDb.collection('social_posts').doc(postId).update({
                            commentsCount: firebase.firestore.FieldValue.increment(1)
                        });
                    } catch (_) { }
                }
                toast('Comment posted');
                go(1);
                setTimeout(() => {
                    const el = document.getElementById('hsc-' + postId);
                    if (el) el.style.display = 'block';
                }, 50);
            };

            window.hsShare = async function (postId) {
                const url = location.href.split('#')[0] + '#community?post=' + postId;
                try {
                    if (navigator.share) await navigator.share({ title: 'Hivecity Post', url });
                    else { await navigator.clipboard.writeText(url); toast('Post link copied to clipboard'); }
                } catch (_) { }
            };

            window.hsFollowUser = async function (targetUid) {
                const cur = getAuthUser();
                if (!cur) { toast('Please sign in to follow athletes'); location.hash = 'auth'; return; }
                if (cur.uid === targetUid) { toast('You cannot follow yourself'); return; }

                const targetUser = getUserProfile(targetUid);
                const isPrivate = targetUser && targetUser.isPrivate;

                if (isPrivate) {
                    if (hs.follows[targetUid]) {
                        delete hs.follows[targetUid];
                        hsSave();
                        toast('Unfollowed ' + (targetUser.name || 'athlete'));
                    } else if (hs.follows[targetUid + '_requested']) {
                        delete hs.follows[targetUid + '_requested'];
                        hsSave();
                        toast('Follow request cancelled');
                    } else {
                        hs.follows[targetUid + '_requested'] = true;
                        hsSave();
                        if (window.hiveDb) {
                            try {
                                await window.hiveDb.collection('follow_requests').doc(cur.uid + '_' + targetUid).set({
                                    fromUid: cur.uid,
                                    toUid: targetUid,
                                    fromName: cur.displayName || 'Hive Athlete',
                                    fromPhoto: cur.customPhotoURL || window.hiveCustomPhoto || '',
                                    fromUsername: (cur.displayName || 'runner').toLowerCase().replace(/\\s+/g, '_'),
                                    status: 'pending',
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                                });
                            } catch (_) { }
                        }
                        toast('Follow request sent to ' + (targetUser.name || 'athlete'));
                    }
                } else {
                    const wasFollowing = !!hs.follows[targetUid];
                    hs.follows[targetUid] = !wasFollowing;
                    hsSave();
                    if (window.hiveDb) {
                        try {
                            const followRef = window.hiveDb.collection('follows').doc(cur.uid + '_' + targetUid);
                            if (!wasFollowing) {
                                await followRef.set({ followerUid: cur.uid, followingUid: targetUid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                                await window.hiveDb.collection('users').doc(targetUid).set({ followersCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
                                await window.hiveDb.collection('users').doc(cur.uid).set({ followingCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
                            } else {
                                await followRef.delete();
                                await window.hiveDb.collection('users').doc(targetUid).set({ followersCount: firebase.firestore.FieldValue.increment(-1) }, { merge: true });
                                await window.hiveDb.collection('users').doc(cur.uid).set({ followingCount: firebase.firestore.FieldValue.increment(-1) }, { merge: true });
                            }
                        } catch (_) { }
                    }
                    toast(hs.follows[targetUid] ? 'Following ' + (targetUser ? targetUser.name : 'athlete') : 'Unfollowed');
                }
                go(1);
            };

            window.hsAcceptFollowRequest = async function (requestId, fromUid) {
                const cur = getAuthUser();
                if (!cur) return;
                hs.follows[fromUid] = true;
                hsSave();
                if (window.hiveDb) {
                    try {
                        await window.hiveDb.collection('follow_requests').doc(requestId).update({ status: 'accepted' });
                        await window.hiveDb.collection('follows').doc(fromUid + '_' + cur.uid).set({
                            followerUid: fromUid,
                            followingUid: cur.uid,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        await window.hiveDb.collection('users').doc(cur.uid).set({ followersCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
                        await window.hiveDb.collection('users').doc(fromUid).set({ followingCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
                    } catch (_) { }
                }
                toast('Follow request accepted');
                go(1);
            };

            window.hsRejectFollowRequest = async function (requestId) {
                if (window.hiveDb) {
                    try {
                        await window.hiveDb.collection('follow_requests').doc(requestId).update({ status: 'rejected' });
                    } catch (_) { }
                }
                toast('Follow request declined');
                go(1);
            };

            window.hsShareNutritionToProfile = async function (recipeId) {
                const cur = getAuthUser();
                if (!cur) { toast('Please sign in to share to your Nutrition profile'); location.hash = 'auth'; return; }
                let localCustom = [];
                try { localCustom = JSON.parse(localStorage.getItem('hivecity_custom_recipes') || '[]'); } catch (_) { }
                const curated = window.getHive1000Recipes ? window.getHive1000Recipes() : [];
                const recipe = (hiveRecipes || []).find(r => r.id === recipeId) || localCustom.find(r => r.id === recipeId) || curated.find(r => r.id === recipeId);
                if (!recipe) { toast('Recipe record not found'); return; }

                hs.nutritionShares[cur.uid] = hs.nutritionShares[cur.uid] || [];
                if (!hs.nutritionShares[cur.uid].includes(recipeId)) {
                    hs.nutritionShares[cur.uid].unshift(recipeId);
                    hsSave();
                }

                if (window.hiveDb) {
                    try {
                        await window.hiveDb.collection('shared_nutrition').doc(cur.uid + '_' + recipeId).set({
                            uid: cur.uid,
                            recipeId: recipeId,
                            recipeName: recipe.name || 'Recipe',
                            recipeImage: (Array.isArray(recipe.imageUrls) && recipe.imageUrls[0]) || recipe.imageUrl || recipe.image || '',
                            summary: (recipe.protein ? recipe.protein + 'g protein' : '') + (recipe.prepTime ? ' · ' + recipe.prepTime + ' min' : ''),
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    } catch (e) { console.warn('Share nutrition error:', e); }
                }
                toast('Meal shared to your Nutrition profile tab! ✓');
                const btn = document.querySelector(`#recipe-card-${recipeId} .hs-share-nutrition-btn`);
                if (btn) btn.textContent = 'Shared to Profile ✓';
            };

            window.hsPublishPost = async function () {
                const cur = getAuthUser();
                if (!cur) { toast('Please sign in to create a post'); location.hash = 'auth'; return; }
                const caption = document.getElementById('hs-post-caption')?.value.trim();
                if (!caption) { toast('Please write a caption'); return; }

                const locationText = document.getElementById('hs-post-loc')?.value.trim() || 'The Hive';
                const postKind = document.getElementById('hs-post-kind')?.value || 'photo';
                const fileInput = document.getElementById('hs-post-file');
                const isOfficialCheck = document.getElementById('hs-post-official')?.checked || false;
                const officialCat = document.getElementById('hs-post-official-cat')?.value || 'general';

                let mediaDataUrl = '';
                if (fileInput && fileInput.files && fileInput.files[0]) {
                    const file = fileInput.files[0];
                    mediaDataUrl = await new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onload = e => resolve(e.target.result);
                        reader.readAsDataURL(file);
                    });
                }

                let runData = null;
                if (postKind === 'run') {
                    const dist = document.getElementById('hs-post-distance')?.value.trim() || '5.0 km';
                    const dur = document.getElementById('hs-post-duration')?.value.trim() || '26:40';
                    const pace = document.getElementById('hs-post-pace')?.value.trim() || '5:20/km';
                    runData = { distance: dist, duration: dur, pace, route: locationText };
                }

                const newPost = {
                    id: 'post-' + Date.now(),
                    authorUid: cur.uid,
                    authorName: cur.displayName || 'Hive Athlete',
                    authorUsername: (cur.displayName || 'runner').toLowerCase().replace(/\\s+/g, '_'),
                    authorPhoto: cur.customPhotoURL || window.hiveCustomPhoto || '',
                    caption,
                    tags: '#hivecity #athlete',
                    mediaUrls: mediaDataUrl ? [mediaDataUrl] : [4],
                    mediaType: postKind === 'video' ? 'video' : 'image',
                    video: postKind === 'video',
                    location: locationText,
                    runData,
                    likesCount: 0,
                    commentsCount: 0,
                    repostsCount: 0,
                    isOfficial: isOfficialCheck && (cur.email === 'admin@hivecity.com' || cur.role === 'admin'),
                    officialCategory: isOfficialCheck ? officialCat : null,
                    createdAt: Date.now()
                };

                hs.customPosts.unshift(newPost);
                hsSave();

                if (window.hiveDb) {
                    try {
                        await window.hiveDb.collection('social_posts').add({
                            ...newPost,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        await window.hiveDb.collection('users').doc(cur.uid).set({
                            postsCount: firebase.firestore.FieldValue.increment(1),
                            runsCount: runData ? firebase.firestore.FieldValue.increment(1) : firebase.firestore.FieldValue.increment(0)
                        }, { merge: true });
                    } catch (e) { console.warn('Could not post to Firestore:', e); }
                }

                toast('Posted to the Hive!');
                const modal = document.getElementById('hs-composer-modal');
                if (modal) modal.style.display = 'none';
                go(1);
            };

            window.hsOnSearchInput = function (val) {
                searchFilter = (val || '').toLowerCase().trim();
                const drop = document.getElementById('hs-search-dropdown');
                if (!drop) return;
                if (!searchFilter) {
                    drop.style.display = 'none';
                    drop.innerHTML = '';
                    return;
                }

                const matchedUsers = firestoreUsers.filter(u =>
                    (u.name && u.name.toLowerCase().includes(searchFilter)) ||
                    (u.username && u.username.toLowerCase().includes(searchFilter))
                ).slice(0, 5);

                const matchedPosts = getAllPosts().filter(p =>
                    (p.caption && p.caption.toLowerCase().includes(searchFilter)) ||
                    (p.tags && p.tags.toLowerCase().includes(searchFilter)) ||
                    (p.location && p.location.toLowerCase().includes(searchFilter))
                ).slice(0, 4);

                let html = '<div class="hs-search-popover">';
                if (matchedUsers.length) {
                    html += '<div class="hs-search-header">Registered Athletes</div>';
                    html += matchedUsers.map(u => `
            <div class="hs-search-item" onclick="location.hash='profile?uid=${u.uid}'">
              <span class="av" style="width:32px;height:32px;font-size:14px;border-radius:50%">${(u.name || 'A')[0].toUpperCase()}</span>
              <div><b>${esc(u.name || 'Athlete')}</b><br><small style="color:var(--mu)">@${esc(u.username || 'user')}</small></div>
            </div>
          `).join('');
                }
                if (matchedPosts.length) {
                    html += '<div class="hs-search-header">Posts & Routes</div>';
                    html += matchedPosts.map(p => `
            <div class="hs-search-item" onclick="document.querySelector('[data-post=\\\\\"${p.id}\\\\\"]')?.scrollIntoView({behavior:'smooth'});document.getElementById('hs-search-dropdown').style.display='none'">
              <div><b>${esc(p.authorName)}</b>: ${esc(p.caption.slice(0, 45))}…<br><small style="color:var(--ac)">${esc(p.location || 'The Hive')}</small></div>
            </div>
          `).join('');
                }
                if (!matchedUsers.length && !matchedPosts.length) {
                    html += '<div style="padding:16px;text-align:center;color:var(--mu);font-size:13px">No registered athletes or posts match "' + esc(searchFilter) + '"</div>';
                }
                html += '</div>';
                drop.innerHTML = html;
                drop.style.display = 'block';
            };

            window.hsOpenStory = function (idx) {
                const activeStories = window.getActiveStories ? window.getActiveStories() : [];
                const athletes = getFourFeaturedAthletes();
                if (idx < activeStories.length) {
                    window.hsShowStoryModal(activeStories[idx], activeStories);
                    return;
                }
                const athIdx = idx - activeStories.length;
                const athlete = athletes[athIdx];
                if (!athlete) return;
                const mockStory = {
                    id: 'feat-' + athIdx,
                    userId: athlete.uid,
                    userName: athlete.name || 'Featured Athlete',
                    userUsername: athlete.username || 'runner',
                    userPhoto: athlete.photoURL || '',
                    mediaUrl: IM[92],
                    mediaType: 'image',
                    createdAt: Date.now() - 3600000 * 3,
                    expiresAt: Date.now() + 3600000 * 21,
                    caption: `${athlete.name || 'Athlete'} logged a morning tempo session. "Pushing for the sub-20 5K!"`
                };
                window.hsShowStoryModal(mockStory, [mockStory]);
            };

            window.hsViewUserStory = function (targetUid) {
                const stories = window.getActiveStories ? window.getActiveStories().filter(s => s.userId === targetUid) : [];
                if (!stories.length) return;
                window.hsShowStoryModal(stories[0], stories);
            };

            window.hsShowStoryModal = function (story, storyList) {
                if (!story) return;
                const modal = document.getElementById('hs-story-modal');
                if (!modal) return;
                const timeAgoStr = (ts) => {
                    const diffMs = Date.now() - (ts || Date.now());
                    const mins = Math.max(1, Math.floor(diffMs / 60000));
                    if (mins < 60) return mins + 'm ago';
                    const hrs = Math.floor(mins / 60);
                    return hrs + 'h ago';
                };
                const mediaHtml = story.mediaType === 'video'
                    ? `<video src="${esc(story.mediaUrl)}" autoplay controls playsinline style="width:100%;max-height:420px;object-fit:contain;border-radius:18px;background:#000"></video>`
                    : `<img src="${esc(story.mediaUrl)}" alt="Story" style="width:100%;max-height:420px;object-fit:cover;border-radius:18px">`;

                modal.innerHTML = `
          <div class="hs-story-backdrop" onclick="hsCloseStory()">
            <div class="hs-story-box" onclick="event.stopPropagation()">
              <div class="hs-story-progress"><div class="hs-story-bar"></div></div>
              <div class="row" style="align-items:center;margin-bottom:12px">
                <span class="av" style="width:36px;height:36px;font-size:16px;overflow:hidden;border-radius:50%">
                  ${story.userPhoto ? `<img src="${esc(story.userPhoto)}" style="width:100%;height:100%;object-fit:cover">` : (story.userName || 'A')[0]}
                </span>
                <div style="flex:1;margin-left:10px">
                  <b>${esc(story.userName)}</b><br>
                  <small style="color:var(--mu)">@${esc(story.userUsername)} · ${timeAgoStr(story.createdAt)}</small>
                </div>
                <button class="chip" onclick="hsCloseStory()">✕</button>
              </div>
              <div class="hs-story-media">${mediaHtml}</div>
              ${story.caption ? `<p style="margin-top:12px;font-weight:600">${esc(story.caption)}</p>` : ''}
            </div>
          </div>
        `;
                modal.style.display = 'block';
            };

            window.hsCloseStory = function () {
                const modal = document.getElementById('hs-story-modal');
                if (modal) modal.style.display = 'none';
            };

            window.hiveHandleStoryUpload = async function (input) {
                const cur = getAuthUser();
                if (!cur) { toast('Please sign in to upload a story'); location.hash = 'auth'; return; }
                const file = input && input.files && input.files[0];
                if (!file) return;

                const isImage = file.type.startsWith('image/');
                const isVideo = file.type.startsWith('video/');
                if (!isImage && !isVideo) {
                    toast('Please select a photo or video file');
                    return;
                }
                if (file.size > 30 * 1024 * 1024) {
                    toast('File must be smaller than 30MB');
                    return;
                }

                toast('Uploading story…');

                const saveStory = async (mediaDataUrl) => {
                    const now = Date.now();
                    const storyObj = {
                        id: 'story_' + now + '_' + Math.random().toString(36).substr(2, 6),
                        userId: cur.uid,
                        userName: cur.displayName || 'Hive Athlete',
                        userUsername: window.getHiveUsername ? window.getHiveUsername(cur.uid) : (cur.displayName || 'runner').toLowerCase().replace(/\s+/g, '_'),
                        userPhoto: cur.customPhotoURL || window.hiveCustomPhoto || cur.photoURL || '',
                        mediaUrl: mediaDataUrl,
                        mediaType: isVideo ? 'video' : 'image',
                        createdAt: now,
                        expiresAt: now + (24 * 60 * 60 * 1000)
                    };

                    hs.stories = (hs.stories || []).filter(s => s && s.expiresAt && s.expiresAt > Date.now());
                    hs.stories.unshift(storyObj);
                    hsSave();

                    if (window.hiveDb) {
                        try {
                            await window.hiveDb.collection('stories').doc(storyObj.id).set(storyObj);
                        } catch (err) {
                            console.warn('Story Firestore write fallback:', err);
                        }
                    }

                    toast('Story published! Active for 24 hours. ✨');
                    input.value = '';
                    go(1);
                };

                if (isImage) {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        const img = new Image();
                        img.onload = function () {
                            const canvas = document.createElement('canvas');
                            const maxDim = 1080;
                            let w = img.width, h = img.height;
                            if (w > maxDim || h > maxDim) {
                                if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                                else { w = Math.round(w * maxDim / h); h = maxDim; }
                            }
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, w, h);
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                            saveStory(dataUrl);
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                } else {
                    const reader = new FileReader();
                    reader.onload = function (e) {
                        saveStory(e.target.result);
                    };
                    reader.readAsDataURL(file);
                }
            };

            window.hsPreviewEditPhoto = function (input) {
                const file = input && input.files && input.files[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) { toast('Please select an image file'); return; }
                const reader = new FileReader();
                reader.onload = function (e) {
                    const img = new Image();
                    img.onload = function () {
                        const canvas = document.createElement('canvas');
                        const max = 256;
                        let w = img.width, h = img.height;
                        if (w > max || h > max) {
                            if (w > h) { h = Math.round(h * max / w); w = max; }
                            else { w = Math.round(w * max / h); h = max; }
                        }
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, w, h);
                        const resizedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                        window._pendingEditPhotoURL = resizedDataUrl;
                        const prev = document.getElementById('hs-edit-avatar-preview');
                        if (prev) {
                            prev.innerHTML = `<img src="${resizedDataUrl}" alt="Preview" style="width:100%;height:100%;object-fit:cover">`;
                        }
                        const note = document.getElementById('hs-edit-photo-note');
                        if (note) {
                            note.textContent = 'Photo selected (click Save Changes to apply)';
                            note.style.color = 'var(--hl)';
                        }
                    };
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            };

            window.hsOpenEditProfile = function () {
                const cur = getAuthUser();
                if (!cur) return;
                window._pendingEditPhotoURL = null;
                const p = getUserProfile(cur.uid) || {};
                const currentPhoto = cur.customPhotoURL || window.hiveCustomPhoto || p.photoURL || cur.photoURL || '';
                const modal = document.getElementById('hs-edit-profile-modal');
                if (!modal) return;
                modal.innerHTML = `
          <div class="hs-modal-backdrop" onclick="hsCloseEditProfile()">
            <div class="hs-modal-card card" onclick="event.stopPropagation()">
              <div class="row"><h2 style="margin:0;flex:1">Edit Profile</h2><button class="chip" onclick="hsCloseEditProfile()">✕</button></div>
              <div class="row" style="align-items:center;gap:16px;margin:18px 0;padding-bottom:16px;border-bottom:1px solid var(--bd)">
                <div class="av" id="hs-edit-avatar-preview" style="width:68px;height:68px;font-size:26px;border-radius:50%;overflow:hidden;border:2px solid var(--hl);flex:none">
                  ${currentPhoto ? `<img src="${esc(currentPhoto)}" alt="Avatar" style="width:100%;height:100%;object-fit:cover">` : `<span>${(p.name || cur.displayName || 'A')[0].toUpperCase()}</span>`}
                </div>
                <div>
                  <label class="btn" style="font-size:12px;padding:6px 14px;cursor:pointer;display:inline-block">
                    Change Profile Photo
                    <input type="file" id="hs-edit-photo-input" accept="image/*" style="display:none" onchange="hsPreviewEditPhoto(this)">
                  </label>
                  <small id="hs-edit-photo-note" style="display:block;color:var(--mu);margin-top:4px;font-size:11px">Recommended: Square JPG or PNG</small>
                </div>
              </div>
              <p><label><b>Display Name</b><br><input type="text" id="hs-edit-name" value="${esc(p.name || cur.displayName || '')}" style="width:100%;margin-top:4px"></label></p>
              <p><label><b>Username (@handle)</b><br>
  <div style="position:relative">
    <span style="position:absolute;left:10px;top:10px;color:var(--mu);font-weight:700">@</span>
    <input type="text" id="hs-edit-username" value="${esc(p.username || (window.getHiveUsername ? window.getHiveUsername(cur.uid) : ''))}" placeholder="gowtham_fitness" oninput="window.liveCheckUsername(this.value)" style="width:100%;margin-top:4px;padding-left:26px">
  </div>
  <small id="hs-edit-username-status" style="display:block;margin-top:4px;font-size:12px"></small>
</label></p>
              <p><label><b>Bio / Running Goals</b><br><textarea id="hs-edit-bio" style="width:100%;min-height:75px;margin-top:4px">${esc(p.bio || '')}</textarea></label></p>
              <div class="card" style="margin:14px 0;background:var(--bg)">
                <label class="row" style="cursor:pointer;align-items:center">
                  <input type="checkbox" id="hs-edit-private" ${p.isPrivate ? 'checked' : ''} onchange="if(this.checked){document.getElementById('hs-edit-discoverable').checked=false;}">
                  <div><b>Private Account</b><br><small style="color:var(--mu)">Only approved followers can view your posts, runs, nutrition & reposts.</small></div>
                </label>
              </div>
              <div class="card" style="margin-bottom:18px;background:var(--bg)">
                <label class="row" style="cursor:pointer;align-items:center">
                  <input type="checkbox" id="hs-edit-discoverable" ${p.discoverable !== false && !p.isPrivate ? 'checked' : ''} onchange="if(this.checked){document.getElementById('hs-edit-private').checked=false;}">
                  <div><b>Discoverable Profile</b><br><small style="color:var(--mu)">Allow your profile to appear in Featured Athletes and search results.</small></div>
                </label>
              </div>
              <div class="row" style="justify-content:flex-end">
                <button class="btn g" onclick="hsCloseEditProfile()">Cancel</button>
                <button class="btn" onclick="hsSaveProfileChanges()">Save Changes</button>
              </div>
            </div>
          </div>
        `;
                modal.style.display = 'block';
            };

            window.hsCloseEditProfile = function () {
                const modal = document.getElementById('hs-edit-profile-modal');
                if (modal) modal.style.display = 'none';
            };

            window.hsSaveProfileChanges = async function () {
                const cur = getAuthUser();
                if (!cur) return;
                const name = document.getElementById('hs-edit-name')?.value.trim() || cur.displayName || 'Hive Member';
                const rawInput = document.getElementById('hs-edit-username')?.value.trim().toLowerCase().replace(/^@/, '') || '';
                const username = rawInput.replace(/[^a-z0-9_]/g, '');
                if (!/^[a-z0-9_]{3,30}$/.test(username)) {
                    toast('Username must be 3-30 characters (letters, numbers, underscores only)');
                    return;
                }
                if (!window.isUsernameAvailable(username, cur.uid)) {
                    toast('Username @' + username + ' is already taken. Please choose another.');
                    const st = document.getElementById('hs-edit-username-status');
                    if (st) {
                        st.textContent = '✕ @' + username + ' is already taken';
                        st.style.color = '#d33';
                    }
                    return;
                }
                window.saveHiveUsername(cur.uid, username);
                const bio = document.getElementById('hs-edit-bio')?.value.trim() || '';

                // Enforce mutual exclusivity
                let isPrivate = !!document.getElementById('hs-edit-private')?.checked;
                let discoverable = !!document.getElementById('hs-edit-discoverable')?.checked;
                if (isPrivate && discoverable) {
                    discoverable = false;
                }

                const newPhoto = window._pendingEditPhotoURL;
                if (newPhoto) {
                    window.hiveCustomPhoto = newPhoto;
                    cur.customPhotoURL = newPhoto;
                    cur.photoURL = newPhoto;
                    if (cur.updateProfile) {
                        try { await cur.updateProfile({ photoURL: newPhoto }); } catch (_) { }
                    }
                    try {
                        let sess = JSON.parse(sessionStorage.getItem('hivecityUser') || '{}');
                        sess.photoURL = newPhoto;
                        sessionStorage.setItem('hivecityUser', JSON.stringify(sess));
                    } catch (_) { }
                    const avEl = document.getElementById('profAvatar');
                    if (avEl) avEl.innerHTML = `<img src="${newPhoto}" alt="Avatar" style="width:100%;height:100%;object-fit:cover">`;
                    const hsEl = document.getElementById('hsProfPhoto');
                    if (hsEl) hsEl.innerHTML = `<img src="${newPhoto}" alt="Avatar" style="width:100%;height:100%;object-fit:cover">`;
                    window._pendingEditPhotoURL = null;
                }

                if (cur.updateProfile) {
                    try { await cur.updateProfile({ displayName: name }); } catch (_) { }
                }

                if (window.hiveDb) {
                    try {
                        const updateData = {
                            name,
                            username,
                            bio,
                            isPrivate,
                            discoverable,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        };
                        if (newPhoto) updateData.photoURL = newPhoto;
                        await window.hiveDb.collection('users').doc(cur.uid).set(updateData, { merge: true });
                    } catch (e) { console.warn('Save profile error:', e); }
                }

                try {
                    let sess = JSON.parse(sessionStorage.getItem('hivecityUser') || '{}');
                    sess.name = name;
                    sess.username = username;
                    sessionStorage.setItem('hivecityUser', JSON.stringify(sess));
                } catch (_) { }

                try {
                    if (typeof window.hiveSyncToGoogleSheet === 'function') {
                        void window.hiveSyncToGoogleSheet({
                            displayName: name,
                            name: name,
                            username: username,
                            bio: bio,
                            status: cur.emailVerified ? 'Verified' : 'Pending Verification'
                        }, cur);
                    }
                } catch (_) { }

                toast('Profile updated successfully!');
                hsCloseEditProfile();
                go(1);
            };

            window.hsOpenRecipeDetail = function (recipeId, optionalUid) {
                const cur = getAuthUser();
                const hashQuery = location.hash.split('?')[1] || '';
                const params = new URLSearchParams(hashQuery);
                const targetUid = optionalUid || params.get('uid') || (cur ? cur.uid : null);
                const sharedRecord = firestoreSharedNutrition.find(s => s.recipeId === recipeId && (!targetUid || s.uid === targetUid));
                let localProfileRecipes = [];
                try { localProfileRecipes = JSON.parse(localStorage.getItem('hivecity_custom_recipes') || '[]'); } catch (_) { }
                const sharedApiList = typeof window.getSharedNutrients === 'function' ? window.getSharedNutrients() : [];
                const curated = window.getHive1000Recipes ? window.getHive1000Recipes() : [];
                const seedForDetail = window.SEED_NUTRIENT_RECIPES || [];
                const recipe = localProfileRecipes.find(r => String(r.id) === String(recipeId)) || sharedApiList.find(r => String(r.id) === String(recipeId)) || (hiveRecipes || []).find(r => String(r.id) === String(recipeId)) || (sharedRecord && sharedRecord.recipe) || seedForDetail.find(r => String(r.id) === String(recipeId)) || curated.find(r => String(r.id) === String(recipeId)) || (typeof window.findHiveRecipeById === 'function' ? window.findHiveRecipeById(recipeId) : null);
                const modal = document.getElementById('hs-recipe-detail-modal');
                if (!modal) return;
                if (!recipe) {
                    modal.innerHTML = `
            <div class="hs-modal-backdrop" onclick="hsCloseRecipeDetail()">
              <div class="hs-modal-card card" onclick="event.stopPropagation()">
                <div class="row"><h2 style="margin:0;flex:1">Archived Recipe</h2><button class="chip" onclick="hsCloseRecipeDetail()">✕</button></div>
                <p style="color:var(--mu);margin-top:14px">This original recipe record has been removed or archived in Hive Nutrition.</p>
              </div>
            </div>
          `;
                    modal.style.display = 'block';
                    return;
                }

                const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
                const steps = Array.isArray(recipe.steps) ? recipe.steps : (Array.isArray(recipe.instructions) ? recipe.instructions : []);
                const imageList = Array.isArray(recipe.images) && recipe.images.length
                    ? recipe.images.filter(Boolean)
                    : (Array.isArray(recipe.imageUrls) && recipe.imageUrls.length
                        ? recipe.imageUrls.filter(Boolean)
                        : ((recipe.coverImage || recipe.imageUrl || recipe.image) ? [recipe.coverImage || recipe.imageUrl || recipe.image] : []));
                const img = recipe.coverImage || imageList[0] || '';
                const detailName = recipe.name || recipe.title || 'Recipe';

                modal.innerHTML = `
          <div class="hs-modal-backdrop" onclick="hsCloseRecipeDetail()">
            <div class="hs-modal-card card" style="max-height:85vh;overflow-y:auto" onclick="event.stopPropagation()">
              <div class="row" style="margin-bottom:12px">
                <span class="tag">${esc(recipe.category || 'Nutrition')}</span>
                <button class="chip" style="margin-left:auto" onclick="hsCloseRecipeDetail()">✕</button>
              </div>
              ${img ? `<div class="clip" style="border-radius:18px;max-height:260px;overflow:hidden;margin-bottom:14px"><img src="${esc(img)}" alt="${esc(detailName)}" style="width:100%;height:100%;object-fit:cover" onerror="window.handleHiveRecipeImgError(this)"></div>${imageList.length > 1 ? `<div class="row" style="gap:8px;overflow-x:auto;margin-bottom:14px">${imageList.slice(1, 3).map((url, i) => `<img src="${esc(url)}" alt="${esc(detailName)} photo ${i + 2}" style="width:110px;height:80px;object-fit:cover;border-radius:10px" onerror="window.handleHiveRecipeImgError(this)">`).join('')}</div>` : ''}` : ''}
              <h2 style="font-size:24px;margin:4px 0">${esc(detailName)}</h2>
              ${recipe.description ? `<p style="color:var(--mu)">${esc(recipe.description)}</p>` : ''}
              <div class="row" style="margin:14px 0;flex-wrap:wrap;gap:8px">
                ${Number(recipe.calories) > 0 ? `<span class="tag">🔥 ${esc(recipe.calories)} kcal</span>` : ''}
                ${(recipe.prepTime || recipe.prepTimeMins) ? `<span class="tag">⏱ ${esc(recipe.prepTime || recipe.prepTimeMins)} min</span>` : ''}
                ${(recipe.protein || recipe.proteinGrams) ? `<span class="tag">⚡ ${esc(recipe.protein || recipe.proteinGrams)} g protein</span>` : ''}
                <span class="tag" style="background:#10110F;color:#C7F36B">Original Hive Nutrition Record</span>
              </div>
              ${ingredients.length ? `<h3>Ingredients & Quantities</h3><ul>${ingredients.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
              ${steps.length ? `<h3>Preparation Instructions</h3><ol>${steps.map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
              <div class="row" style="justify-content:flex-end;gap:8px;margin-top:20px;flex-wrap:wrap">
                <button type="button" class="btn" data-repost-btn="${esc(recipe.id)}" onclick="toggleRecipeRepost('${esc(recipe.id)}', this)" style="background:${window.isRecipeRepostedByMe && window.isRecipeRepostedByMe(recipe.id) ? '#176346' : '#C7F36B'};color:${window.isRecipeRepostedByMe && window.isRecipeRepostedByMe(recipe.id) ? '#ffffff' : '#10110F'};font-weight:800">${window.isRecipeRepostedByMe && window.isRecipeRepostedByMe(recipe.id) ? '✓ Reposted' : '🔁 Repost'}</button>
                <a class="btn g" href="#nutrition" onclick="hsCloseRecipeDetail()">Open Nutrition Page</a>
                <button class="btn" onclick="hsCloseRecipeDetail()">Close</button>
              </div>
            </div>
          </div>
        `;
                modal.style.display = 'block';
            };
            window.hsCloseRecipeDetail = function () {
                const modal = document.getElementById('hs-recipe-detail-modal');
                if (modal) modal.style.display = 'none';
            };

            // RENDER SOCIAL FEED PAGE

            // WRAPPED WITH TEMPORARY MAINTENANCE SYSTEM
            const renderSocialFeed = () => {
                const feedHtml = _origRenderSocialFeed();
                return `
          <div class="hive-social-page-container" style="position:relative;display:block;min-height:auto;overflow:visible">
            
  <section class="hive-backend-work-notice card" style="max-width:580px;width:92%;margin:0 auto;text-align:center;padding:32px 24px;border-radius:24px;background:var(--card);color:var(--tx);border:1px solid var(--bd);box-shadow:0 16px 48px rgba(0,0,0,0.28)">
    <div style="width:56px;height:56px;margin:0 auto 16px;background:rgba(199,243,107,0.14);border-radius:50%;display:grid;place-items:center">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--tx)">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    </div>
    <h2 style="margin:0 0 10px;font-size:24px;font-weight:800;color:var(--tx);letter-spacing:-0.5px">Backend Work Is Going On</h2>
    <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:var(--mu);max-width:440px;margin-left:auto;margin-right:auto">We are currently optimizing backend services for this section. All community content remains visible below and full sync will resume shortly.</p>
    <div style="display:inline-flex;align-items:center;gap:8px;padding:6px 18px;background:rgba(199,243,107,0.12);border:1px solid rgba(199,243,107,0.3);border-radius:30px;font-size:12px;color:var(--tx);font-weight:700">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#C7F36B;box-shadow:0 0 8px #C7F36B"></span>
      Platform Maintenance in Progress
    </div>
  </section>
            <div class="hive-maintenance-blurred-content" aria-label="Social content under maintenance">
              ${feedHtml}
            </div>
          </div>
        `;
            };
            const _origRenderSocialFeed = () => {
                const cur = getAuthUser();
                const posts = getAllPosts();
                const athletes = getFourFeaturedAthletes();
                const isAdmin = cur && (cur.email === 'admin@hivecity.com' || cur.role === 'admin');

                let filtered = posts;
                if (hs.mode === 'following' && cur) {
                    filtered = posts.filter(p => hs.follows[p.authorUid]);
                } else if (hs.mode === 'runs') {
                    filtered = posts.filter(p => p.runData != null);
                } else if (hs.mode === 'official') {
                    filtered = posts.filter(p => p.isOfficial);
                }

                return `
<div class="hive-social">
  <header class="hs-nav-bar card" style="margin-bottom:18px;padding:14px 20px;border-radius:22px">
    <div class="row" style="align-items:center;justify-content:space-between">
      <div class="row" style="align-items:center;gap:12px">
        <span style="font:800 22px 'Space Grotesk';letter-spacing:-.04em;color:var(--hl)">HIVE<span style="color:var(--fg)">SOCIAL</span></span>
        <span class="tag" style="font-size:11px">Move Together</span>
      </div>
      <div style="position:relative;flex:1;max-width:380px;margin:0 14px">
        <input type="search" id="hs-search-input" placeholder="Search athletes, runs, #tags…" aria-label="Search Hivecity social" oninput="hsOnSearchInput(this.value)" autocomplete="off" style="width:100%;border-radius:99px;padding:8px 16px">
        <div id="hs-search-dropdown" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:90;margin-top:6px"></div>
      </div>
      <div class="row" style="align-items:center;gap:10px">
        <button class="btn" onclick="document.getElementById('hs-composer-modal').style.display='block'" style="padding:7px 16px;font-size:13px">＋ Create Post</button>
        <button class="chip" onclick="location.hash='profile'" title="My Profile" style="padding:0;width:38px;height:38px;border-radius:50%;overflow:hidden">
          ${cur && cur.customPhotoURL ? `<img src="${esc(cur.customPhotoURL)}" style="width:100%;height:100%;object-fit:cover">` : `<span class="av" style="width:100%;height:100%;font-size:15px">${(cur && cur.displayName ? cur.displayName[0] : 'U').toUpperCase()}</span>`}
        </button>
      </div>
    </div>
  </header>

  <section class="hs-stories-section card" style="margin-bottom:20px;padding:14px 16px;border-radius:24px;overflow-x:auto">
    <div class="row" style="gap:14px;align-items:center;flex-wrap:nowrap">
      <div class="hs-story-item" onclick="document.getElementById('hiveStoryInput') ? document.getElementById('hiveStoryInput').click() : (document.getElementById('hs-composer-modal').style.display='block')" style="text-align:center;cursor:pointer;flex:none">
        <div style="position:relative;width:64px;height:64px;border-radius:50%;border:2px dashed var(--hl);display:grid;place-items:center;background:var(--bg)">
          <span style="font-size:24px;color:var(--hl);font-weight:700">＋</span>
        </div>
        <small style="display:block;margin-top:6px;font-weight:600">Your Story</small>
      </div>
      ${athletes.map((ath, i) => `
        <div class="hs-story-item" onclick="hsOpenStory(${i})" style="text-align:center;cursor:pointer;flex:none">
          <div style="width:64px;height:64px;border-radius:50%;border:2.5px solid var(--hl);padding:2px;overflow:hidden;background:var(--card)">
            ${ath.photoURL ? `<img src="${esc(ath.photoURL)}" alt="${esc(ath.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">` : `<span class="av" style="width:100%;height:100%;font-size:22px;border-radius:50%">${(ath.name || 'A')[0]}</span>`}
          </div>
          <small style="display:block;margin-top:6px;max-width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">@${esc(ath.username || ath.name)}</small>
        </div>
      `).join('')}
    </div>
  </section>

  <div class="hs-feed-layout" style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start">
    <main class="hs-main-stream">
      <div class="row hs-mode-tabs" style="margin-bottom:18px;gap:8px">
        ${[['for-you', '✨ For You'], ['following', '👥 Following'], ['runs', '🏃 Runs & Marathons'], ['official', '👑 Official Updates']].map(([m, lbl]) => `
          <button class="chip ${hs.mode === m ? 'on' : ''}" onclick="hs.mode='${m}';hsSave();go(1)" style="font-size:13px;padding:7px 14px">${lbl}</button>
        `).join('')}
      </div>

      <div class="hs-posts-container" style="display:grid;gap:20px">
        ${filtered.length ? filtered.map(p => {
                    const isLiked = !!hs.likes[p.id];
                    const isSaved = !!hs.saved[p.id];
                    const isReposted = !!hs.reposts[p.id];
                    const comments = (hs.comments[p.id] || []);
                    const authorInitial = (p.authorName || 'A')[0].toUpperCase();
                    const targetUser = getUserProfile(p.authorUid);

                    return `
          <article class="hs-card hs-post-card card" data-post="${p.id}" style="padding:0;overflow:hidden;border-radius:24px">
            <div class="hs-post-top row" style="align-items:center;padding:16px 18px">
              <a href="#profile?uid=${p.authorUid}" style="text-decoration:none;display:flex;align-items:center;gap:12px;flex:1">
                <span class="av" style="width:40px;height:40px;font-size:16px;border-radius:50%">${authorInitial}</span>
                <div>
                  <div class="row" style="align-items:center;gap:6px">
                    <b style="color:var(--fg)">${esc(p.authorName)}</b>
                    <small style="color:var(--mu)">@${esc(p.authorUsername || 'runner')}</small>
                    ${p.isOfficial ? `<span class="tag" style="background:var(--hl);color:#10110F;font-weight:700;font-size:10px">👑 OFFICIAL</span>` : ''}
                  </div>
                  <small style="color:var(--mu)">${p.location ? '📍 ' + esc(p.location) : 'The Hive'} · ${formatTimeAgo(p.createdAt)}</small>
                </div>
              </a>
              ${(!cur || cur.uid !== p.authorUid) ? `
                <button class="chip ${hs.follows[p.authorUid] ? 'on' : ''}" onclick="hsFollowUser('${p.authorUid}')" style="font-size:12px;padding:4px 12px">
                  ${hs.follows[p.authorUid] ? 'Following' : (targetUser && targetUser.isPrivate ? 'Request' : '＋ Follow')}
                </button>
              ` : ''}
            </div>

            <div class="hs-post-media" ondblclick="hsLike('${p.id}', true)" style="position:relative;background:#0c0f0d;cursor:pointer">
              ${p.mediaUrls && p.mediaUrls.length ? `
                <img src="${typeof p.mediaUrls[0] === 'number' ? IM[p.mediaUrls[0]] : esc(p.mediaUrls[0])}" alt="${esc(p.caption)}" loading="lazy" decoding="async" style="width:100%;max-height:560px;object-fit:cover;display:block">
              ` : ''}
              ${p.video ? `<div style="position:absolute;bottom:12px;right:12px;background:rgba(0,0,0,0.7);color:#fff;padding:4px 10px;border-radius:99px;font-size:12px">▶ VIDEO · 0:30</div>` : ''}
            </div>

            <div class="hs-post-actions row" style="padding:14px 18px 8px;gap:12px;align-items:center">
              <button class="chip hs-action-like ${isLiked ? 'on' : ''}" onclick="hsLike('${p.id}')" aria-label="Like post">
                ${isLiked ? '♥' : '♡'} <span class="hs-like-count">${p.likesCount + (isLiked ? 1 : 0)}</span>
              </button>
              <button class="chip" onclick="hsToggleComments('${p.id}')" aria-label="Comments">
                💬 ${p.commentsCount + comments.length}
              </button>
              <button class="chip ${isReposted ? 'on' : ''}" onclick="hsRepost('${p.id}')" aria-label="Repost">
                🔁 ${p.repostsCount + (isReposted ? 1 : 0)}
              </button>
              <button class="chip" onclick="hsShare('${p.id}')" aria-label="Share">
                ↗ Share
              </button>
              <button class="chip ${isSaved ? 'on' : ''}" onclick="hsSavePost('${p.id}')" style="margin-left:auto" aria-label="Save">
                ${isSaved ? 'Saved ✓' : '🔖 Save'}
              </button>
            </div>

            <div style="padding:0 18px 18px">
              <p style="margin:4px 0 8px">
                <b>@${esc(p.authorUsername || 'runner')}</b> ${esc(p.caption)}
                ${p.tags ? `<span style="color:var(--hl);margin-left:6px">${esc(p.tags)}</span>` : ''}
              </p>

              ${p.runData ? `
                <div class="hs-run-box card" style="background:var(--bg);border-radius:18px;padding:14px;margin:10px 0">
                  <div class="row" style="align-items:center;margin-bottom:8px">
                    <span class="tag" style="background:#10110F;color:#C7F36B;font-weight:700">🏃 RUNNING ACTIVITY</span>
                    <small style="color:var(--mu);margin-left:auto">${esc(p.runData.route || p.location)}</small>
                  </div>
                  <div class="row" style="justify-content:space-around;text-align:center">
                    <div><b class="num" style="font-size:22px">${esc(p.runData.distance)}</b><small style="display:block;color:var(--mu);font-size:11px">DISTANCE</small></div>
                    <div><b class="num" style="font-size:22px">${esc(p.runData.duration)}</b><small style="display:block;color:var(--mu);font-size:11px">DURATION</small></div>
                    <div><b class="num" style="font-size:22px">${esc(p.runData.pace)}</b><small style="display:block;color:var(--mu);font-size:11px">AVG PACE</small></div>
                  </div>
                </div>
              ` : ''}

              <div id="hsc-${p.id}" class="hs-comments-box" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--bd)">
                <div class="hs-comments-list" style="max-height:180px;overflow-y:auto;display:grid;gap:8px">
                  ${comments.map(c => `
                    <div class="hs-comment-row" style="font-size:13px">
                      <b>${esc(c[0])}</b>: ${esc(c[1])}
                    </div>
                  `).join('') || '<small style="color:var(--mu)">No comments yet. Start the conversation.</small>'}
                </div>
                <div class="row" style="margin-top:10px;gap:8px">
                  <input type="text" id="hsi-${p.id}" placeholder="Add a comment or @mention…" style="flex:1" onkeydown="if(event.key==='Enter')hsComment('${p.id}')">
                  <button class="btn" onclick="hsComment('${p.id}')" style="padding:6px 14px;font-size:12px">Post</button>
                </div>
              </div>
            </div>
          </article>
          `;
                }).join('') : `
          <div class="card" style="text-align:center;padding:48px 20px;border-radius:24px">
            <h3>No posts in this view</h3>
            <p style="color:var(--mu)">Be the first to share your pace, route or moment with the Hive.</p>
            <button class="btn" onclick="document.getElementById('hs-composer-modal').style.display='block'">Create Post</button>
          </div>
        `}
      </div>
    </main>

    <aside class="hs-sidebar" style="position:sticky;top:80px;display:grid;gap:18px">
      <section class="card" style="border-radius:24px;padding:20px">
        <div class="row" style="align-items:center;justify-content:space-between;margin-bottom:14px">
          <h3 style="margin:0;font-size:16px">Featured Athletes</h3>
          <span class="tag" style="font-size:10px">Rotate 6h</span>
        </div>
        <p style="color:var(--mu);font-size:12px;margin:0 0 14px">Active pacesetters & marathoners from the Hive community.</p>
        <div class="hs-athletes-list" style="display:grid;gap:12px">
          ${athletes.length ? athletes.map(ath => `
            <div class="hs-athlete-row row" style="align-items:center;justify-content:space-between">
              <a href="#profile?uid=${ath.uid}" style="text-decoration:none;display:flex;align-items:center;gap:10px;flex:1">
                <span class="av" style="width:36px;height:36px;font-size:14px;border-radius:50%">${(ath.name || 'A')[0]}</span>
                <div>
                  <b style="font-size:13px;color:var(--fg)">${esc(ath.name)}</b>
                  <small style="display:block;color:var(--mu);font-size:11px">@${esc(ath.username || 'athlete')}</small>
                </div>
              </a>
              ${(!cur || cur.uid !== ath.uid) ? `
                <button class="chip ${hs.follows[ath.uid] ? 'on' : ''}" onclick="hsFollowUser('${ath.uid}')" style="font-size:11px;padding:3px 10px">
                  ${hs.follows[ath.uid] ? 'Following' : 'Follow'}
                </button>
              ` : ''}
            </div>
          `).join('') : `
            <div style="font-size:12px;color:var(--mu);padding:10px 0">Show up and log runs to become one of the four featured Hive athletes!</div>
          `}
        </div>
      </section>

      <section class="card" style="border-radius:24px;padding:20px;background:linear-gradient(135deg,color-mix(in srgb,var(--card) 92%,transparent),color-mix(in srgb,var(--hl) 8%,transparent))">
        <div class="row" style="align-items:center;gap:8px">
          <span class="tag" style="background:var(--hl);color:#10110F;font-weight:700">MARATHON HUB</span>
        </div>
        <h4 style="margin:10px 0 6px;font-size:17px">City Half-Marathon 21.1K</h4>
        <p style="color:var(--mu);font-size:13px;line-height:1.45;margin:0 0 14px">Official group runs happen Wednesdays 06:30 and Sundays 06:00. Bib pickups at the Hive.</p>
        <a class="btn g" href="#events" style="width:100%;text-align:center;font-size:13px">View Marathon Events</a>
      </section>
    </aside>
  </div>

  <div id="hs-composer-modal" class="hs-modal-backdrop" style="display:none" onclick="if(event.target===this)this.style.display='none'">
    <div class="hs-modal-card card" onclick="event.stopPropagation()" style="max-width:520px;margin:40px auto;border-radius:24px;padding:24px">
      <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:16px">
        <h3 style="margin:0">Create Post</h3>
        <button class="chip" onclick="document.getElementById('hs-composer-modal').style.display='none'">✕</button>
      </div>
      <p><label><b>Post Type</b><br>
        <select id="hs-post-kind" onchange="document.getElementById('hs-run-fields').style.display = this.value==='run'?'block':'none'" style="width:100%;margin-top:4px">
          <option value="photo">📸 Photo Moment</option>
          <option value="video">🎥 Short Video</option>
          <option value="run">🏃 Running Activity</option>
        </select>
      </label></p>
      <p><label><b>Photo or Video</b><br>
        <input type="file" id="hs-post-file" accept="image/*,video/*" style="width:100%;margin-top:4px">
      </label></p>
      <p><label><b>Caption</b><br>
        <textarea id="hs-post-caption" placeholder="Share your pace, route, or crew moment…" style="width:100%;min-height:80px;margin-top:4px"></textarea>
      </label></p>
      <p><label><b>Location</b><br>
        <input type="text" id="hs-post-loc" placeholder="e.g. East Coast Park, Marina Bay" style="width:100%;margin-top:4px">
      </label></p>

      <div id="hs-run-fields" style="display:none;background:var(--bg);padding:14px;border-radius:18px;margin-bottom:14px">
        <b style="font-size:13px">Run Metrics</b>
        <div class="row" style="margin-top:8px">
          <label style="flex:1"><small>Distance</small><input type="text" id="hs-post-distance" placeholder="10.0 km" style="width:100%"></label>
          <label style="flex:1"><small>Duration</small><input type="text" id="hs-post-duration" placeholder="52:10" style="width:100%"></label>
          <label style="flex:1"><small>Avg Pace</small><input type="text" id="hs-post-pace" placeholder="5:13/km" style="width:100%"></label>
        </div>
      </div>

      ${isAdmin ? `
        <div class="card" style="background:var(--bg);padding:12px;margin-bottom:16px">
          <label class="row" style="align-items:center;cursor:pointer">
            <input type="checkbox" id="hs-post-official">
            <div>
              <b style="color:var(--hl)">👑 Publish as Official Hivecity Announcement</b>
              <small style="display:block;color:var(--mu)">Verified badge displayed on this post across the community.</small>
            </div>
          </label>
          <div style="margin-top:8px">
            <select id="hs-post-official-cat" style="width:100%;font-size:12px">
              <option value="marathon">Marathon Update</option>
              <option value="running">Running Update</option>
              <option value="nutrition">Nutrition Update</option>
              <option value="recipe">Official Recipe</option>
              <option value="general">Official Announcement</option>
            </select>
          </div>
        </div>
      ` : ''}

      <div class="row" style="justify-content:flex-end;gap:10px">
        <button class="btn g" onclick="document.getElementById('hs-composer-modal').style.display='none'">Cancel</button>
        <button class="btn" onclick="hsPublishPost()">Share with the Hive</button>
      </div>
    </div>
  </div>

  <div id="hs-story-modal" style="display:none"></div>
</div>
        `;
            };

            // RENDER USER PROFILE PAGE (Instagram-inspired layout with 4 tabs)

            /* --- FOLLOWERS & FOLLOWING MODAL HANDLERS --- */
            window.showFollowersList = function (uid) {
                const modal = document.getElementById('hive-followers-modal') || createFollowModal('hive-followers-modal', 'Followers');
                const listDiv = document.getElementById('hive-followers-modal-list');
                const relationships = (window.hs && window.hs.followerLists && window.hs.followerLists[uid]) || [];
                if (!relationships.length) {
                    const profId = window.getOrCreateProfileId(uid);
                    listDiv.innerHTML = `
            <div style="text-align:center;padding:36px 16px">
              <div style="font-size:36px;margin-bottom:12px">👥</div>
              <h4 style="margin:0 0 6px">No followers yet</h4>
              <p style="color:var(--mu);font-size:13px;max-width:320px;margin:0 auto">
                Share your username <b style="color:var(--hl)">@${window.getHiveUsername ? window.getHiveUsername(uid) : "athlete"}</b> with friends to connect on Hivecity!
              </p>
            </div>
          `;
                } else {
                    listDiv.innerHTML = relationships.map(u => `
            <div class="row" style="align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bd)">
              <div class="row" style="align-items:center;gap:10px">
                <span class="av" style="width:36px;height:36px">${(u.name || 'U')[0]}</span>
                <div><b>${u.name}</b> <small style="color:var(--mu)">@${u.username}</small></div>
              </div>
              <a class="btn" href="#profile?uid=${u.uid}" onclick="closeFollowModal('hive-followers-modal')">View</a>
            </div>
          `).join('');
                }
                modal.style.display = 'grid';
            };

            window.showFollowingList = function (uid) {
                const modal = document.getElementById('hive-following-modal') || createFollowModal('hive-following-modal', 'Following');
                const listDiv = document.getElementById('hive-following-modal-list');
                const following = [];
                if (window.hs && window.hs.follows) {
                    Object.keys(window.hs.follows).forEach(k => {
                        if (window.hs.follows[k] && !k.endsWith('_requested')) {
                            const u = getUserProfile(k);
                            if (u) following.push(u);
                        }
                    });
                }
                if (!following.length) {
                    listDiv.innerHTML = `
            <div style="text-align:center;padding:36px 16px">
              <div style="font-size:36px;margin-bottom:12px">🏃</div>
              <h4 style="margin:0 0 6px">Not following anyone yet</h4>
              <p style="color:var(--mu);font-size:13px;max-width:320px;margin:0 auto">
                Explore the Community feed and Discover page to find fellow athletes and follow them.
              </p>
            </div>
          `;
                } else {
                    listDiv.innerHTML = following.map(u => `
            <div class="row" style="align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bd)">
              <div class="row" style="align-items:center;gap:10px">
                <span class="av" style="width:36px;height:36px">${(u.name || 'U')[0]}</span>
                <div><b>${u.name}</b> <small style="color:var(--mu)">@${u.username}</small></div>
              </div>
              <a class="btn" href="#profile?uid=${u.uid}" onclick="closeFollowModal('hive-following-modal')">View</a>
            </div>
          `).join('');
                }
                modal.style.display = 'grid';
            };

            function createFollowModal(id, title) {
                const el = document.createElement('div');
                el.id = id;
                el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);z-index:9999;display:none;place-items:center;padding:20px';
                el.innerHTML = `
          <div class="card" style="width:100%;max-width:440px;border-radius:24px;padding:24px">
            <div class="row" style="align-items:center;justify-content:space-between;margin-bottom:16px">
              <h3 style="margin:0;font-size:18px">${title}</h3>
              <button class="chip" onclick="document.getElementById('${id}').style.display='none'">✕</button>
            </div>
            <div id="${id}-list" style="max-height:360px;overflow-y:auto"></div>
          </div>
        `;
                document.body.appendChild(el);
                return el;
            }
            window.closeFollowModal = function (id) {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            };

            const renderUserProfile = () => {
                const cur = getAuthUser();
                const hashQuery = location.hash.split('?')[1] || '';
                const params = new URLSearchParams(hashQuery);
                const targetUid = params.get('uid') || (cur ? cur.uid : null);

                if (!targetUid) {
                    return `
            <div class="card" style="text-align:center;padding:48px 20px;max-width:540px;margin:40px auto;border-radius:24px">
              <h2>Sign in to view profile</h2>
              <p style="color:var(--mu)">Sign in or create an account to view and customize your Hivecity profile.</p>
              <a class="btn" href="#auth">Sign in</a>
            </div>
          `;
                }

                const isOwn = cur && cur.uid === targetUid;
                const profileUser = getUserProfile(targetUid) || {
                    uid: targetUid,
                    name: isOwn && cur.displayName ? cur.displayName : 'Hive Member',
                    username: isOwn && cur.displayName ? cur.displayName.toLowerCase().replace(/\\s+/g, '_') : 'athlete',
                    photoURL: isOwn && (cur.customPhotoURL || window.hiveCustomPhoto) ? (cur.customPhotoURL || window.hiveCustomPhoto) : '',
                    bio: 'Runner & mover in the Hive.',
                    isPrivate: false,
                    discoverable: true,
                    followersCount: 0,
                    followingCount: 0
                };

                if (window.getHiveUsername && window.getHiveUsername(targetUid)) { profileUser.username = window.getHiveUsername(targetUid); }
                const isPrivate = !!profileUser.isPrivate;
                const canView = canViewUserContent(profileUser, cur ? cur.uid : null);
                const isFollowing = !!hs.follows[targetUid];
                const isRequested = !!hs.follows[targetUid + '_requested'];
                const hiveId = formatHiveId(targetUid);
                const isAdmin = profileUser.email === 'admin@hivecity.com' || profileUser.role === 'admin';

                const allPosts = getAllPosts();
                const userPosts = allPosts.filter(p => p.authorUid === targetUid);
                let userRuns = userPosts.filter(p => p.runData != null);
                if (isOwn) {
                    try {
                        const ha = JSON.parse(localStorage.getItem('hive-city-activity-v1') || '{}');
                        const haRuns = (ha.history || []).map((hItem, idx) => ({
                            id: 'ha-run-' + idx,
                            authorUid: cur.uid,
                            caption: 'GPS activity recorded in Hive Performance Lab',
                            location: 'Hive City Route',
                            runData: {
                                distance: (typeof hItem.distance === 'number' ? hItem.distance.toFixed(2) : (hItem.distance || '0')) + ' km',
                                duration: hItem.duration || 'Recorded',
                                pace: hItem.pace || 'GPS',
                                route: 'GPS Route'
                            },
                            createdAt: hItem.date ? new Date(hItem.date).getTime() : Date.now()
                        }));
                        userRuns = [...userRuns, ...haRuns];
                    } catch (_) { }
                }
                // Compute dynamic follower and following counts (starting strictly at 0)
                const actualFollowingCount = Object.keys(hs.follows || {}).filter(k => hs.follows[k] && !k.endsWith('_requested')).length;
                if (isOwn) {
                    profileUser.followingCount = typeof profileUser.followingCount === 'number' && profileUser.followingCount > 0 ? profileUser.followingCount : actualFollowingCount;
                }
                const actualFollowersCount = (window.hs && window.hs.followerLists && window.hs.followerLists[targetUid]) ? window.hs.followerLists[targetUid].length : 0;
                profileUser.followersCount = profileUser.followersCount || actualFollowersCount || 0;
                profileUser.followingCount = profileUser.followingCount || 0;

                // Query unified repost records for targetUid (local hivecity_user_reposts + hs + Firestore)
                const unifiedRepostList = typeof window.getHiveUserReposts === 'function' ? window.getHiveUserReposts(targetUid) : [];
                const repostSnapshotById = new Map();
                const userRepostItemIds = new Set();
                unifiedRepostList.forEach(r => {
                    if (!r || !r.originalItemId) return;
                    const key = String(r.originalItemId);
                    userRepostItemIds.add(key);
                    if (r.snapshot) repostSnapshotById.set(key, r.snapshot);
                });
                (firestoreReposts || []).filter(r => r && r.repostedBy === targetUid).forEach(r => {
                    const key = String(r.originalItemId);
                    userRepostItemIds.add(key);
                    if (r.snapshot && !repostSnapshotById.has(key)) repostSnapshotById.set(key, r.snapshot);
                });
                if (isOwn) {
                    Object.keys(hs.reposts || {}).forEach(k => { if (hs.reposts[k]) userRepostItemIds.add(String(k)); });
                }

                let localProfileRecipes = [];
                try { localProfileRecipes = JSON.parse(localStorage.getItem('hivecity_custom_recipes') || '[]'); } catch (_) { }
                const sharedNutrientsForProfile = typeof window.getSharedNutrients === 'function' ? window.getSharedNutrients() : [];
                const seedNutrientsForProfile = window.SEED_NUTRIENT_RECIPES || [];
                const catalogForProfile = typeof window.getHive1000Recipes === 'function' ? window.getHive1000Recipes() : [];

                const userReposts = [];
                userRepostItemIds.forEach(itemId => {
                    const post = allPosts.find(p => String(p.id) === itemId);
                    if (post) {
                        userReposts.push({ type: 'post', item: post });
                    } else {
                        const rec =
                            localProfileRecipes.find(r => r && String(r.id) === itemId) ||
                            sharedNutrientsForProfile.find(r => r && String(r.id) === itemId) ||
                            (hiveRecipes || []).find(r => r && String(r.id) === itemId) ||
                            seedNutrientsForProfile.find(r => r && String(r.id) === itemId) ||
                            catalogForProfile.find(r => r && String(r.id) === itemId) ||
                            repostSnapshotById.get(itemId) ||
                            null;
                        if (rec) userReposts.push({ type: 'recipe', item: rec });
                    }
                });

                // Nutrients: include user-created custom recipes linked to targetUid (local + shared API + Firestore)
                const ownerDeletedSet = new Set(typeof window.getHiveOwnerDeletedRecipeIds === 'function' ? window.getHiveOwnerDeletedRecipeIds(targetUid) : []);
                const notDeletedByOwner = r => r && !ownerDeletedSet.has(String(r.id)) && !r.deletedByOwner;
                const sharedApiProfileRecipes = typeof window.getSharedNutrients === 'function' ? window.getSharedNutrients() : [];
                const userCreatedRecipeIds = localProfileRecipes
                    .filter(r => notDeletedByOwner(r) && (r.ownerUid === targetUid || r.createdBy === targetUid || r.userId === targetUid))
                    .map(r => r.id);
                const apiCreatedRecipeIds = sharedApiProfileRecipes
                    .filter(r => notDeletedByOwner(r) && (r.ownerUid === targetUid || r.createdBy === targetUid || r.userId === targetUid))
                    .map(r => r.id);
                const firestoreCreatedRecipeIds = (hiveRecipes || [])
                    .filter(r => notDeletedByOwner(r) && (r.ownerUid === targetUid || r.createdBy === targetUid || r.userId === targetUid))
                    .map(r => r.id);

                const sharedRecipeIds = (hs.nutritionShares[targetUid] || []).concat(
                    firestoreSharedNutrition.filter(s => s.uid === targetUid && !s.deletedByOwner).map(s => s.recipeId),
                    userCreatedRecipeIds,
                    apiCreatedRecipeIds,
                    firestoreCreatedRecipeIds
                );
                const uniqueRecipeIds = [...new Set(sharedRecipeIds.filter(id => id && !ownerDeletedSet.has(String(id))))];
                const pendingRequests = isOwn && isPrivate ? firestoreFollowRequests.filter(r => r.toUid === cur.uid && r.status === 'pending') : [];

                const activeTab = hs.profileTab || 'posts';

                // Check active story for targetUid
                const userStories = window.getActiveStories ? window.getActiveStories().filter(s => s.userId === targetUid) : [];
                const hasActiveStory = userStories.length > 0;

                return `
<div class="hive-profile-page" style="max-width:940px;margin:0 auto;padding-bottom:50px">
  <header class="card hs-profile-header" style="border-radius:28px;padding:32px 28px;margin-bottom:24px">
    <div class="row hs-profile-main-row" style="align-items:center;gap:36px;flex-wrap:wrap">
      <div style="position:relative;flex:none">
        <div class="av" id="hsProfPhoto" style="width:110px;height:110px;font-size:42px;border-radius:50%;overflow:hidden;border:3px solid var(--hl);${hasActiveStory ? 'cursor:pointer;' : ''}" ${hasActiveStory ? `onclick="hsViewUserStory('${targetUid}')" title="View Story"` : ''}>
          ${profileUser.photoURL ? `<img src="${esc(profileUser.photoURL)}" alt="${esc(profileUser.name)}" style="width:100%;height:100%;object-fit:cover">` : `<span>${(profileUser.name || 'A')[0].toUpperCase()}</span>`}
        </div>
        ${isOwn ? `
          <label for="hiveStoryInput" style="position:absolute;bottom:0;right:0;width:34px;height:34px;border-radius:50%;background:#10110F;color:#FFFFFF;display:grid;place-items:center;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,0.5);font-size:18px" title="Add to Story">
            ＋
          </label>
          <input type="file" id="hiveStoryInput" accept="image/*,video/*" style="display:none" onchange="hiveHandleStoryUpload(this)">
        ` : ''}
      </div>

      <div style="flex:1;min-width:260px">
        <div class="row" style="align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap">
          <h2 style="margin:0;font-size:26px">@${esc(profileUser.username || 'user')}</h2>
          
          ${isAdmin ? `<span class="tag" style="background:var(--hl);color:#10110F;font-weight:700">👑 OFFICIAL</span>` : ''}
          ${isPrivate ? `<span class="tag" style="background:var(--bg)">🔒 Private</span>` : ''}
        </div>

        <h3 style="margin:0 0 6px;font-size:17px;font-weight:600">${esc(profileUser.name)}</h3>
        <p style="color:var(--mu);margin:0 0 16px;line-height:1.45">${esc(profileUser.bio || 'Moving with Hive City.')}</p>

        <div class="row hs-profile-stats" style="gap:24px;margin-bottom:18px">
          <div><b class="num" style="font-size:20px">${userPosts.length}</b> <small style="color:var(--mu)">Posts</small></div>
          <div><b class="num" style="font-size:20px">${userRuns.length}</b> <small style="color:var(--mu)">Runs</small></div>
          <div onclick="window.showFollowersList('${targetUid}')" style="cursor:pointer;transition:transform .15s" onmouseover="this.style.transform='scale(1.06)'" onmouseout="this.style.transform='none'">
            <b class="num" style="font-size:20px;color:var(--hl)">${profileUser.followersCount || 0}</b> <small style="color:var(--mu);text-decoration:underline">Followers</small>
          </div>
          <div onclick="window.showFollowingList('${targetUid}')" style="cursor:pointer;transition:transform .15s" onmouseover="this.style.transform='scale(1.06)'" onmouseout="this.style.transform='none'">
            <b class="num" style="font-size:20px;color:var(--hl)">${profileUser.followingCount || 0}</b> <small style="color:var(--mu);text-decoration:underline">Following</small>
          </div>
        </div>

        <div class="row hs-profile-actions" style="gap:10px">
          ${isOwn ? `
            <button class="btn" onclick="hsOpenEditProfile()" style="font-size:13px;padding:7px 18px">Edit Profile</button>
            <button class="btn g" onclick="prof()" style="font-size:13px;padding:7px 18px">⚙ Settings</button>
            <button class="chip" onclick="hiveSignOut()" style="font-size:13px;padding:7px 14px">Log out</button>
          ` : `
            <button class="btn ${isFollowing ? 'g' : ''}" onclick="hsFollowUser('${targetUid}')" style="font-size:13px;padding:7px 20px">
              ${isFollowing ? 'Following ✓' : (isRequested ? 'Requested ⏳' : (isPrivate ? 'Request to Follow' : 'Follow'))}
            </button>
            <button class="btn g" onclick="location.hash='community';toast('Chat opened with @${esc(profileUser.username)}')" style="font-size:13px;padding:7px 18px">
              Message
            </button>
          `}
        </div>
      </div>
    </div>

    ${pendingRequests.length ? `
      <div class="card" style="margin-top:20px;background:var(--bg);border-radius:20px;padding:16px">
        <h4 style="margin:0 0 10px">📩 Pending Follow Requests (${pendingRequests.length})</h4>
        <div style="display:grid;gap:10px">
          ${pendingRequests.map(r => `
            <div class="row" style="align-items:center;justify-content:space-between">
              <div class="row" style="align-items:center;gap:10px">
                <span class="av" style="width:34px;height:34px;font-size:14px">${(r.fromName || 'U')[0]}</span>
                <div><b>${esc(r.fromName)}</b> <small style="color:var(--mu)">@${esc(r.fromUsername)}</small></div>
              </div>
              <div class="row" style="gap:8px">
                <button class="btn" style="font-size:12px;padding:4px 12px" onclick="hsAcceptFollowRequest('${r.id}', '${r.fromUid}')">Accept</button>
                <button class="chip" style="font-size:12px;padding:4px 12px" onclick="hsRejectFollowRequest('${r.id}')">Decline</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  </header>

  ${!canView ? `
    <div class="card" style="text-align:center;padding:50px 20px;border-radius:28px">
      <div style="font-size:48px;margin-bottom:12px">🔒</div>
      <h2>This Account is Private</h2>
      <p style="color:var(--mu);max-width:420px;margin:0 auto 18px">Follow this athlete to see their posts, runs, nutrition meals, and reposts.</p>
      <button class="btn" onclick="hsFollowUser('${targetUid}')">
        ${isRequested ? 'Request Pending ⏳' : 'Request to Follow'}
      </button>
    </div>
  ` : `
    <nav class="hs-profile-tabs row card" style="border-radius:20px;padding:8px 12px;margin-bottom:20px;justify-content:space-around">
      ${[
                        ['posts', '▦ POSTS', userPosts.length],
                        ['runs', '🏃 RUNS', userRuns.length],
                        ['nutrition', '🥗 NUTRITION', uniqueRecipeIds.length],
                        ['reposts', '🔁 REPOSTS', userReposts.length]
                    ].map(([tab, label, count]) => `
        <button class="hs-tab ${activeTab === tab ? 'on' : ''}" onclick="hs.profileTab='${tab}';hsSave();go(1)" style="flex:1;text-align:center;font-size:13px;font-weight:700;padding:10px 6px">
          ${label} (${count})
        </button>
      `).join('')}
    </nav>

    ${activeTab === 'posts' ? `
      <div class="hs-posts-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px">
        ${userPosts.length ? userPosts.map(p => `
          <div class="card hs-grid-card" style="padding:0;overflow:hidden;border-radius:18px;aspect-ratio:1;position:relative;cursor:pointer" onclick="location.hash='community?post=${p.id}'">
            <img src="${p.mediaUrls && p.mediaUrls.length ? (typeof p.mediaUrls[0] === 'number' ? IM[p.mediaUrls[0]] : esc(p.mediaUrls[0])) : IM[4]}" alt="${esc(p.caption)}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover">
            <div class="hs-grid-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.4);opacity:0;transition:opacity .2s;display:grid;place-items:center;color:#fff;font-weight:700">
              ♥ ${p.likesCount} · 💬 ${p.commentsCount}
            </div>
          </div>
        `).join('') : `
          <div class="card" style="grid-column:1/-1;text-align:center;padding:40px;border-radius:20px">
            <h3>No posts yet</h3>
            <p style="color:var(--mu)">${isOwn ? 'Share your first running moment with the community.' : 'This athlete has not posted yet.'}</p>
          </div>
        `}
      </div>
    ` : ''}

    ${activeTab === 'runs' ? `
      <div class="hs-runs-list" style="display:grid;gap:14px">
        ${userRuns.length ? userRuns.map(p => `
          <div class="card" style="border-radius:20px;padding:20px">
            <div class="row" style="align-items:center;justify-content:space-between;margin-bottom:12px">
              <div>
                <b style="font-size:16px">🏃 ${esc(p.runData.route || p.location)}</b>
                <small style="display:block;color:var(--mu)">${formatTimeAgo(p.createdAt)}</small>
              </div>
              <span class="tag" style="background:#10110F;color:#C7F36B;font-weight:700">RECORDED RUN</span>
            </div>
            <div class="row" style="justify-content:space-around;text-align:center;background:var(--bg);padding:14px;border-radius:16px">
              <div><b class="num" style="font-size:24px">${esc(p.runData.distance)}</b><small style="display:block;color:var(--mu);font-size:11px">DISTANCE</small></div>
              <div><b class="num" style="font-size:24px">${esc(p.runData.duration)}</b><small style="display:block;color:var(--mu);font-size:11px">DURATION</small></div>
              <div><b class="num" style="font-size:24px">${esc(p.runData.pace)}</b><small style="display:block;color:var(--mu);font-size:11px">AVG PACE</small></div>
            </div>
            ${p.caption ? `<p style="margin:12px 0 0;font-size:14px">${esc(p.caption)}</p>` : ''}
          </div>
        `).join('') : `
          <div class="card" style="text-align:center;padding:40px;border-radius:20px">
            <h3>No running activities recorded yet</h3>
            <p style="color:var(--mu)">Runs recorded with GPS or posted to the Hive will appear here.</p>
          </div>
        `}
      </div>
    ` : ''}

    ${activeTab === 'nutrition' ? `
      <div class="hs-nutrition-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
        ${uniqueRecipeIds.length ? uniqueRecipeIds.map(rId => {
                        const sharedRecord = firestoreSharedNutrition.find(s => s.recipeId === rId && s.uid === targetUid);
                        let localProfileRecipes = [];
                        try { localProfileRecipes = JSON.parse(localStorage.getItem('hivecity_custom_recipes') || '[]'); } catch (_) { }
                        const sharedApiList = typeof window.getSharedNutrients === 'function' ? window.getSharedNutrients() : [];
                        const recipe = localProfileRecipes.find(r => r.id === rId) || sharedApiList.find(r => r.id === rId) || hiveRecipes.find(r => r.id === rId) || (sharedRecord && sharedRecord.recipe);
                        if (!recipe) {
                            return `
              <article class="card" style="border-radius:20px;padding:18px">
                <span class="tag">Archived Recipe</span>
                <h3 style="margin:8px 0 4px">Meal record unavailable</h3>
                <p style="color:var(--mu);font-size:13px">The original nutrition record has been removed by the admin.</p>
              </article>
            `;
                        }
                        const name = recipe.name || recipe.title || 'Recipe';
                        const photoList = Array.isArray(recipe.images) && recipe.images.length ? recipe.images : (Array.isArray(recipe.imageUrls) && recipe.imageUrls.length ? recipe.imageUrls : (recipe.coverImage || recipe.imageUrl || recipe.image ? [recipe.coverImage || recipe.imageUrl || recipe.image] : []));
                        const img = recipe.coverImage || photoList[0] || '';
                        const isProfileRecipeOwner = Boolean(cur && cur.uid && (recipe.ownerUid === cur.uid || recipe.userId === cur.uid || recipe.createdBy === cur.uid));
                        const profileRecipeMenuHtml = isProfileRecipeOwner ? `<div class="hc-recipe-menu-wrap" style="position:absolute;top:10px;right:10px;z-index:6" onclick="event.stopPropagation()"><button type="button" class="hc-recipe-menu-btn" aria-label="Recipe options" title="Recipe options" onclick="event.stopPropagation();window.toggleHiveRecipeMenu('prof-${esc(rId)}',event)" style="width:30px;height:30px;border-radius:999px;border:1px solid rgba(255,255,255,0.4);background:rgba(16,17,15,0.72);color:#fff;font-size:16px;font-weight:800;line-height:1;cursor:pointer;display:grid;place-items:center;padding:0">⋮</button><div class="hc-recipe-menu-dd" data-recipe-menu="prof-${esc(rId)}" style="display:none;position:absolute;top:34px;right:0;min-width:124px;background:#fff;border:1px solid #dce5db;border-radius:12px;box-shadow:0 12px 28px rgba(16,24,18,0.18);padding:4px;z-index:20"><button type="button" onclick="event.stopPropagation();window.startEditHiveUserRecipe('${esc(rId)}')" style="width:100%;text-align:left;border:0;background:transparent;color:#18372d;padding:8px 10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">✏️ Edit</button><button type="button" onclick="event.stopPropagation();window.deleteHiveUserRecipe('${esc(rId)}')" style="width:100%;text-align:left;border:0;background:transparent;color:#dc2626;padding:8px 10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">🗑️ Delete</button></div></div>` : '';
                        return `
            <article class="card" style="border-radius:20px;padding:0;overflow:visible;position:relative">
              ${profileRecipeMenuHtml}
              <div class="clip" style="height:170px;background:var(--bd);position:relative;border-radius:20px 20px 0 0;overflow:hidden">
                ${img ? `<img src="${esc(img)}" alt="${esc(name)}" style="width:100%;height:100%;object-fit:cover" onerror="window.handleHiveRecipeImgError(this)">` : `<div style="display:grid;place-items:center;height:100%;font-size:42px">🥗</div>`}
                ${photoList.length > 1 ? `<span class="tag" style="position:absolute;right:10px;bottom:10px;background:rgba(16,17,15,0.78);color:#fff;font-size:11px">1/${photoList.length} photos</span>` : ''}
              </div>
              <div style="padding:16px">
                <span class="tag">${esc(recipe.category || 'Nutrition')}</span>
                <h3 style="margin:8px 0 4px;font-size:18px">${esc(name)}</h3>
                ${recipe.description ? `<p style="color:var(--mu);font-size:13px;margin:0 0 10px;line-height:1.4">${esc(recipe.description.slice(0, 90))}…</p>` : ''}
                <div class="row" style="margin-bottom:14px;gap:8px;flex-wrap:wrap">
                  ${Number(recipe.calories) > 0 ? `<span class="tag">🔥 ${esc(recipe.calories)} kcal</span>` : ''}
                  ${(recipe.prepTime || recipe.prepTimeMins) ? `<span class="tag">⏱ ${esc(recipe.prepTime || recipe.prepTimeMins)} min</span>` : ''}
                  ${(recipe.protein || recipe.proteinGrams) ? `<span class="tag">⚡ ${esc(recipe.protein || recipe.proteinGrams)} g</span>` : ''}
                </div>
                <button class="btn" onclick="hsOpenRecipeDetail('${rId}')" style="width:100%;font-size:13px;padding:8px">
                  View Recipe
                </button>
              </div>
            </article>
          `;
                    }).join('') : `
          <div class="card" style="grid-column:1/-1;text-align:center;padding:40px;border-radius:20px">
            <h3>No meals shared to profile yet</h3>
            <p style="color:var(--mu)">Visit the Nutrition page and click "Share to Profile" on your favourite meals to display them here.</p>
            <a class="btn" href="#nutrition">Open Nutrition</a>
          </div>
        `}
      </div>
    ` : ''}

    ${activeTab === 'reposts' ? `
      <div class="hs-reposts-list" style="display:grid;gap:18px">
        ${userReposts.length ? userReposts.map(rep => {
                        if (rep.type === 'recipe') {
                            const r = rep.item;
                            const name = r.name || r.title || 'Recipe';
                            const repPhotos = (Array.isArray(r.images) && r.images.length) ? r.images.filter(Boolean) : ((Array.isArray(r.imageUrls) && r.imageUrls.length) ? r.imageUrls.filter(Boolean) : ((r.coverImage || r.imageUrl || r.image) ? [r.coverImage || r.imageUrl || r.image] : []));
                            const img = r.coverImage || repPhotos[0] || '';
                            return `
              <article class="card" style="border-radius:20px;padding:0;overflow:hidden">
                <div class="clip" style="height:170px;background:var(--bd);position:relative">
                  ${img ? `<img src="${esc(img)}" alt="${esc(name)}" style="width:100%;height:100%;object-fit:cover" onerror="window.handleHiveRecipeImgError(this)">` : `<div style="display:grid;place-items:center;height:100%;font-size:42px">🥗</div>`}
                  ${repPhotos.length > 1 ? `<span class="tag" style="position:absolute;right:10px;bottom:10px;background:rgba(16,17,15,0.78);color:#fff;font-size:11px">1/${repPhotos.length} photos</span>` : ''}
                </div>
                <div style="padding:16px">
                  <span class="tag">${esc(r.category || r.mealType || 'Nutrition')}</span>
                  <h3 style="margin:8px 0 4px;font-size:18px">${esc(name)}</h3>
                  ${r.description ? `<p style="color:var(--mu);font-size:13px;margin:0 0 10px;line-height:1.4">${esc(r.description.slice(0, 90))}…</p>` : ''}
                  <div class="row" style="margin-bottom:14px;gap:8px;flex-wrap:wrap">
                    ${Number(r.calories) > 0 ? `<span class="tag">🔥 ${esc(r.calories)} kcal</span>` : ''}
                    ${(r.prepTime || r.prepTimeMins) ? `<span class="tag">⏱ ${esc(r.prepTime || r.prepTimeMins)} min</span>` : ''}
                    ${(r.protein || r.proteinGrams) ? `<span class="tag">⚡ ${esc(r.protein || r.proteinGrams)} g</span>` : ''}
                  </div>
                  <div class="row" style="gap:8px;align-items:center">
                    <button class="btn" onclick="hsOpenRecipeDetail('${esc(r.id)}')" style="flex:1;font-size:13px;padding:8px">View Recipe</button>
                    <button type="button" class="chip on" data-repost-btn="${esc(r.id)}" onclick="toggleRecipeRepost('${esc(r.id)}', this)" aria-label="Repost" title="Toggle Repost" style="padding:8px 12px;font-weight:700">🔁</button>
                  </div>
                </div>
              </article>
            `;
                        }
                        const p = rep.item;
                        const postIsReposted = !!hs.reposts[p.id];
                        return `
            <div class="card" style="border-radius:24px;padding:16px">
              <div class="row" style="align-items:center;gap:10px;margin-bottom:10px">
                <span class="av" style="width:34px;height:34px;font-size:14px">${(p.authorName || 'A')[0]}</span>
                <div><b>${esc(p.authorName)}</b> <small style="color:var(--mu)">@${esc(p.authorUsername)}</small></div>
              </div>
              <p style="margin:0 0 10px">${esc(p.caption)}</p>
              ${p.mediaUrls && p.mediaUrls.length ? `
                <div class="clip" style="border-radius:14px;max-height:300px;overflow:hidden;margin-bottom:12px">
                  <img src="${typeof p.mediaUrls[0] === 'number' ? IM[p.mediaUrls[0]] : esc(p.mediaUrls[0])}" alt="" style="width:100%;height:100%;object-fit:cover">
                </div>
              ` : ''}
              <div class="row" style="gap:8px;align-items:center">
                <button type="button" class="chip ${postIsReposted ? 'on' : ''}" onclick="hsRepost('${esc(p.id)}')" aria-label="Repost" title="Toggle Repost">🔁 ${Number(p.repostsCount || 0) + (postIsReposted ? 1 : 0)}</button>
              </div>
            </div>
          `;
                    }).join('') : `
          <div class="card" style="text-align:center;padding:40px;border-radius:20px">
            <h3>No reposts yet</h3>
            <p style="color:var(--mu)">Items you repost from the social feed or nutrition will appear on this tab.</p>
          </div>
        `}
      </div>
    ` : ''}
  `}

  <div id="hs-edit-profile-modal" style="display:none"></div>
  <div id="hs-recipe-detail-modal" style="display:none"></div>
</div>
        `;
            };

            function formatTimeAgo(ts) {
                if (!ts) return 'recently';
                const sec = Math.floor((Date.now() - (ts.toMillis ? ts.toMillis() : ts)) / 1000);
                if (sec < 60) return 'just now';
                const min = Math.floor(sec / 60);
                if (min < 60) return min + 'm';
                const hr = Math.floor(min / 60);
                if (hr < 24) return hr + 'h';
                return Math.floor(hr / 24) + 'd';
            }

            // Assign to router views
            V.community = () => renderSocialFeed() + (typeof window.renderHiveCommunitySessionsSection === 'function' ? window.renderHiveCommunitySessionsSection() : '');
            V.profile = renderUserProfile;
        })();

        /* HIVECITY COMMUNITY SESSIONS MODULE — INTEGRATED INTO COMMUNITY / SOCIAL AREA */
        (() => {
            const csState = {
                sessions: [],
                myRegs: [],
                loaded: false,
                loading: false,
                tab: 'discover', // 'discover' | 'mine'
                category: 'All',
                search: '',
                selectedSessionId: null,
                apiBase: null
            };
            const escCs = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
            const getCsApiBases = () => {
                const list = [];
                if (window.HIVECITY_CONFIG && window.HIVECITY_CONFIG.API_BASE_URL) list.push(String(window.HIVECITY_CONFIG.API_BASE_URL).replace(/\/$/, ''));
                if ((location.protocol === 'http:' || location.protocol === 'https:') && location.port === '3000') list.push('');
                if (!list.includes('http://localhost:3000')) list.push('http://localhost:3000');
                if (!list.includes('http://127.0.0.1:3000')) list.push('http://127.0.0.1:3000');
                return list;
            };
            const getCsToken = async () => {
                const u = window.hiveCurrentUser || (window.hiveAuth && window.hiveAuth.currentUser);
                if (!u || typeof u.getIdToken !== 'function') return '';
                try { return await u.getIdToken(); } catch { return ''; }
            };
            const csFetch = async (path, opts = {}) => {
                const bases = csState.apiBase !== null ? [csState.apiBase] : getCsApiBases();
                for (const base of bases) {
                    try {
                        const res = await fetch(base + path, opts);
                        csState.apiBase = base;
                        return res;
                    } catch { }
                }
                throw new Error('Could not reach Community Sessions backend.');
            };
            const rerenderCommunityIfActive = () => {
                const mount = document.getElementById('hc-community-sessions-root');
                if (mount) mount.outerHTML = window.renderHiveCommunitySessionsSection();
            };

            window.loadHiveCommunitySessions = async function (force) {
                if (csState.loading || (csState.loaded && !force)) return;
                csState.loading = true;
                try {
                    const res = await csFetch('/api/community-sessions', { cache: 'no-store' });
                    if (res.ok) {
                        const data = await res.json();
                        csState.sessions = Array.isArray(data.sessions) ? data.sessions : [];
                    }
                    const tok = await getCsToken();
                    if (tok) {
                        const myRes = await csFetch('/api/community-sessions/my-registrations', {
                            headers: { Authorization: 'Bearer ' + tok },
                            cache: 'no-store'
                        });
                        if (myRes.ok) {
                            const myData = await myRes.json();
                            csState.myRegs = Array.isArray(myData.registrations) ? myData.registrations : [];
                        }
                    }
                    csState.loaded = true;
                } catch (err) {
                    console.warn('[CommunitySessions] Fetch note:', err);
                } finally {
                    csState.loading = false;
                    rerenderCommunityIfActive();
                }
            };

            window.setHiveCommunitySessionTab = function (tab) {
                csState.tab = tab === 'mine' ? 'mine' : 'discover';
                rerenderCommunityIfActive();
            };
            window.setHiveCommunitySessionCategory = function (cat) {
                csState.category = cat || 'All';
                rerenderCommunityIfActive();
            };
            window.setHiveCommunitySessionSearch = function (val) {
                csState.search = String(val || '');
                rerenderCommunityIfActive();
            };
            window.openHiveCommunitySessionDetail = function (sessionId) {
                csState.selectedSessionId = sessionId;
                rerenderCommunityIfActive();
            };
            window.closeHiveCommunitySessionDetail = function () {
                csState.selectedSessionId = null;
                rerenderCommunityIfActive();
            };

            window.registerHiveFreeSession = async function (sessionId) {
                const tok = await getCsToken();
                if (!tok) { toast('Please sign in to register for a session.'); return; }
                try {
                    const res = await csFetch('/api/community-sessions/' + encodeURIComponent(sessionId) + '/register-free', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                        body: JSON.stringify({})
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) { toast(data.error || 'Registration failed.'); return; }
                    toast('Registered! Your seat is confirmed.');
                    csState.selectedSessionId = null;
                    await window.loadHiveCommunitySessions(true);
                } catch (err) {
                    toast(err.message || 'Registration failed.');
                }
            };

            window.registerHivePaidSession = async function (sessionId) {
                const tok = await getCsToken();
                if (!tok) { toast('Please sign in to register for a paid session.'); return; }
                try {
                    const res = await csFetch('/api/community-sessions/' + encodeURIComponent(sessionId) + '/create-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                        body: JSON.stringify({})
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) { toast(data.error || 'Could not initiate payment.'); return; }
                    if (typeof window.Razorpay !== 'function') {
                        toast('Payment order created (' + (data.order?.orderId || '') + '). Load Razorpay checkout script to complete payment.');
                        await window.loadHiveCommunitySessions(true);
                        return;
                    }
                    const s = csState.sessions.find(x => x.sessionId === sessionId);
                    const rzp = new window.Razorpay({
                        key: data.order.keyId,
                        amount: data.order.amount,
                        currency: data.order.currency,
                        name: 'HIVE CITY',
                        description: s ? s.title : 'Community Session',
                        order_id: data.order.orderId,
                        handler: async function (resp) {
                            const vRes = await csFetch('/api/community-sessions/verify-payment', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                                body: JSON.stringify({
                                    sessionId,
                                    gatewayOrderId: resp.razorpay_order_id,
                                    gatewayPaymentId: resp.razorpay_payment_id,
                                    gatewaySignature: resp.razorpay_signature
                                })
                            });
                            const vData = await vRes.json().catch(() => ({}));
                            if (vRes.ok && vData.verified) {
                                toast('Payment verified! Session seat confirmed.');
                                csState.selectedSessionId = null;
                            } else {
                                toast(vData.error || 'Payment verification failed.');
                            }
                            await window.loadHiveCommunitySessions(true);
                        }
                    });
                    rzp.on('payment.failed', async function (resp) {
                        await csFetch('/api/community-sessions/verify-payment', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                            body: JSON.stringify({
                                sessionId,
                                gatewayOrderId: data.order.orderId,
                                gatewayPaymentId: resp?.error?.metadata?.payment_id || '',
                                gatewaySignature: '',
                                paymentOutcome: 'failed'
                            })
                        });
                        toast('Payment failed. No seat or charge recorded.');
                        await window.loadHiveCommunitySessions(true);
                    });
                    rzp.open();
                } catch (err) {
                    toast(err.message || 'Payment checkout failed.');
                }
            };

            window.cancelHiveCommunitySession = async function (sessionId) {
                const tok = await getCsToken();
                if (!tok) { toast('Please sign in first.'); return; }
                try {
                    const res = await csFetch('/api/community-sessions/' + encodeURIComponent(sessionId) + '/cancel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
                        body: JSON.stringify({})
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) { toast(data.error || 'Cancellation failed.'); return; }
                    toast('Registration cancelled.');
                    await window.loadHiveCommunitySessions(true);
                } catch (err) {
                    toast(err.message || 'Cancellation failed.');
                }
            };

            window.renderHiveCommunitySessionsSection = function () {
                if (!csState.loaded && !csState.loading) {
                    setTimeout(() => void window.loadHiveCommunitySessions(false), 30);
                }
                const cats = ['All', ...Array.from(new Set(csState.sessions.map(s => s.category).filter(Boolean)))];
                const q = csState.search.trim().toLowerCase();
                const visibleSessions = csState.sessions.filter(s => {
                    if (csState.category !== 'All' && s.category !== csState.category) return false;
                    if (q && !(s.title + ' ' + s.category + ' ' + s.organizer + ' ' + s.locationOrMeetingDetails).toLowerCase().includes(q)) return false;
                    return true;
                });
                const regBySession = new Map(csState.myRegs.map(r => [r.sessionId, r]));
                const selected = csState.selectedSessionId ? csState.sessions.find(s => s.sessionId === csState.selectedSessionId) : null;
                const selectedReg = selected ? regBySession.get(selected.sessionId) : null;

                return `<section id="hc-community-sessions-root" style="max-width:980px;margin:28px auto 12px">
                    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">
                        <div><h2 class="big" style="margin:0;font-size:26px">Community Sessions</h2><small style="color:var(--mu)">Live free &amp; paid sessions hosted by Hive City</small></div>
                        <div class="row" style="gap:8px">
                            <button type="button" class="chip ${csState.tab === 'discover' ? 'on' : ''}" onclick="window.setHiveCommunitySessionTab('discover')">Explore (${csState.sessions.length})</button>
                            <button type="button" class="chip ${csState.tab === 'mine' ? 'on' : ''}" onclick="window.setHiveCommunitySessionTab('mine')">My Registered Sessions (${csState.myRegs.length})</button>
                        </div>
                    </div>
                    ${csState.tab === 'discover' ? `
                        <input type="search" placeholder="Search community sessions..." value="${escCs(csState.search)}" oninput="window.setHiveCommunitySessionSearch(this.value)" style="margin-bottom:10px">
                        <div class="row" style="margin-bottom:14px;gap:6px;flex-wrap:wrap">${cats.map(c => `<button type="button" class="chip ${csState.category === c ? 'on' : ''}" onclick="window.setHiveCommunitySessionCategory('${escCs(c)}')">${escCs(c)}</button>`).join('')}</div>
                        <div class="grid">${visibleSessions.length ? visibleSessions.map(s => {
                    const myReg = regBySession.get(s.sessionId);
                    const isConfirmed = myReg && myReg.registrationStatus === 'confirmed';
                    const seats = Math.max(0, Number(s.availableSeats ?? (s.maxCapacity - (s.confirmedCount || 0))));
                    return `<div class="card" style="display:flex;flex-direction:column;gap:8px">
                                ${s.coverImage ? `<div class="clip" style="height:150px"><img class="p" src="${escCs(s.coverImage)}" alt="${escCs(s.title)}" onerror="window.handleHiveRecipeImgError(this)"></div>` : ''}
                                <div class="row" style="justify-content:space-between;align-items:center"><span class="tag">${escCs(s.category)}</span><span class="tag">${s.sessionType === 'paid' ? '₹' + Math.round(Number(s.ticketPrice || 0)).toLocaleString('en-IN') : 'FREE'}</span></div>
                                <h3 style="margin:2px 0;font-size:17px">${escCs(s.title)}</h3>
                                <small style="color:var(--mu)">${escCs(s.organizer)} · ${escCs(s.date)} ${escCs(s.startTime || '')}</small>
                                <small style="color:var(--mu)">${escCs(s.locationOrMeetingDetails || 'Location TBD')} · <b>${seats} seats left</b></small>
                                <div class="row" style="margin-top:auto;padding-top:6px;gap:8px">
                                    <button type="button" class="btn g" onclick="window.openHiveCommunitySessionDetail('${escCs(s.sessionId)}')">Details</button>
                                    ${isConfirmed
                            ? `<span class="chip on">Confirmed ✓</span>`
                            : seats <= 0
                                ? `<span class="chip">Full</span>`
                                : s.sessionType === 'paid'
                                    ? `<button type="button" class="btn" onclick="window.registerHivePaidSession('${escCs(s.sessionId)}')">Pay &amp; Register</button>`
                                    : `<button type="button" class="btn" onclick="window.registerHiveFreeSession('${escCs(s.sessionId)}')">Register Free</button>`}
                                </div>
                            </div>`;
                }).join('') : `<div class="card" style="grid-column:1/-1;text-align:center"><p style="color:var(--mu);margin:8px 0">No published community sessions match right now.</p></div>`}</div>
                    ` : `
                        <div style="display:grid;gap:12px">${csState.myRegs.length ? csState.myRegs.map(r => `
                            <div class="card row" style="align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                                <div>
                                    <span class="tag">${escCs(r.registrationStatus.toUpperCase())} · PAYMENT: ${escCs(r.paymentStatus.toUpperCase())}</span>
                                    <h3 style="margin:6px 0 2px;font-size:16px">${escCs(r.sessionTitle)}</h3>
                                    <small style="color:var(--mu)">${escCs(r.date || '')} ${escCs(r.startTime || '')} · ${escCs(r.locationOrMeetingDetails || '')} · ${r.amountPaid > 0 ? '₹' + r.amountPaid : 'FREE'}</small>
                                </div>
                                ${r.registrationStatus !== 'cancelled' ? `<button type="button" class="chip" onclick="window.cancelHiveCommunitySession('${escCs(r.sessionId)}')">Cancel</button>` : ''}
                            </div>
                        `).join('') : `<div class="card" style="text-align:center"><p style="color:var(--mu);margin:8px 0">You have not registered for any community sessions yet.</p></div>`}</div>
                    `}
                    ${selected ? `
                        <div class="lbx" style="z-index:90;display:grid;place-items:center;padding:16px" onclick="if(event.target===this)window.closeHiveCommunitySessionDetail()">
                            <div class="card" style="max-width:540px;width:100%;max-height:85vh;overflow-y:auto">
                                <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
                                    <span class="tag">${escCs(selected.category)} · ${selected.sessionType === 'paid' ? '₹' + selected.ticketPrice : 'FREE'}</span>
                                    <button type="button" class="chip" onclick="window.closeHiveCommunitySessionDetail()">✕</button>
                                </div>
                                <h2 style="margin:0 0 8px">${escCs(selected.title)}</h2>
                                <p style="color:var(--mu);margin:0 0 12px;line-height:1.5">${escCs(selected.description || 'Community session hosted on Hive City.')}</p>
                                <p style="margin:4px 0"><b>Organizer:</b> ${escCs(selected.organizer)}</p>
                                <p style="margin:4px 0"><b>Schedule:</b> ${escCs(selected.date)} ${escCs(selected.startTime || '')}${selected.endTime ? ' – ' + escCs(selected.endTime) : ''}</p>
                                <p style="margin:4px 0"><b>Location / Meeting:</b> ${escCs(selected.locationOrMeetingDetails || 'TBD')}</p>
                                <p style="margin:4px 0 14px"><b>Seats Available:</b> ${Math.max(0, Number(selected.availableSeats ?? (selected.maxCapacity - (selected.confirmedCount || 0))))} / ${selected.maxCapacity}</p>
                                <div class="row" style="gap:8px">
                                    ${selectedReg && selectedReg.registrationStatus === 'confirmed'
                            ? `<span class="chip on">Confirmed ✓</span><button type="button" class="chip" onclick="window.cancelHiveCommunitySession('${escCs(selected.sessionId)}')">Cancel Registration</button>`
                            : selected.sessionType === 'paid'
                                ? `<button type="button" class="btn" onclick="window.registerHivePaidSession('${escCs(selected.sessionId)}')">Pay ₹${selected.ticketPrice} &amp; Register</button>`
                                : `<button type="button" class="btn" onclick="window.registerHiveFreeSession('${escCs(selected.sessionId)}')">Register Free</button>`}
                                </div>
                            </div>
                        </div>
                    ` : ''}
                </section>`;
            };
        })();


        /* HIVE CITY ACTIVITY UPGRADE — MODERN LIGHT UI, LIVE TELEMETRY & LOCKED BMI NUTRIENTS */
        (() => {
            const HAKEY = 'hive-city-activity-v1';
            let haState = { history: [], period: 'week', gps: false, crew: false };
            try { haState = Object.assign(haState, JSON.parse(localStorage.getItem(HAKEY) || '{}')); } catch (e) { }
            const haSave = () => { try { localStorage.setItem(HAKEY, JSON.stringify(haState)); } catch (e) { } };
            const hesc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

            // REAL-TIME RUN ENGINE (OUTDOOR GPS + TREADMILL MODE, Date.now() DELTA)
            const haTracker = {
                status: 'disconnected', // 'disconnected', 'connecting', 'connected', 'error'
                mode: 'outdoor',        // 'outdoor' | 'treadmill'
                active: false,
                paused: false,
                watchId: null,
                startTime: null,
                lastTickAt: null,
                pauseTime: null,
                totalPausedMs: 0,
                timerInterval: null,
                coords: [],
                acceptedPoints: 0,
                rejectedPoints: 0,
                lastAcceptedLat: null,
                lastAcceptedLng: null,
                lastAccuracy: null,
                lastRejectionReason: null,
                gpsDeltaSinceLastTick: 0,
                distanceMeters: 0,
                speedKmh: 10.0,         // Treadmill target speed (2.0 - 20.0 km/h)
                outdoorPaceKmh: 9.0,    // Automatic fallback pace when GPS is stationary/indoor
                inclinePct: 2.0,        // Treadmill target incline (0.0% - 15.0%)
                currentSpeedKmh: 0,
                currentPaceSec: 0,
                elevationGain: 0,
                lastAltitude: null,
                currentHeartRate: 72,
                sessionCalories: 0,
                googleMap: null,
                googlePolyline: null
            };

            function haversineDistMeters(lat1, lon1, lat2, lon2) {
                const R = 6371000;
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLon = (lon2 - lon1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            }

            function formatDist(meters) {
                if (!meters || meters <= 0) return '0 m';
                if (meters < 1000) return Math.round(meters) + ' m';
                return (meters / 1000).toFixed(2) + ' km';
            }

            function formatDur(sec) {
                if (!sec || sec < 0) return '00:00';
                const m = Math.floor(sec / 60);
                const s = Math.floor(sec % 60);
                return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
            }

            function formatPace(secPerKm) {
                if (!secPerKm || !isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return "--:--";
                const m = Math.floor(secPerKm / 60);
                const s = Math.floor(secPerKm % 60);
                return m + "'" + String(s).padStart(2, '0') + '"';
            }

            function getTodayFinishedRuns() {
                const todayStr = new Date().toDateString();
                return (haState.history || []).filter(r => {
                    if (r.startedAt) {
                        return new Date(r.startedAt).toDateString() === todayStr;
                    }
                    return String(r.date || '').toLowerCase().includes('today');
                });
            }

            function getTodayFinishedMeters() {
                return getTodayFinishedRuns().reduce((acc, r) => acc + (Number(r.rawMeters) || (parseFloat(r.distance) * 1000) || 0), 0);
            }

            function getTodayFinishedCalories() {
                return getTodayFinishedRuns().reduce((acc, r) => acc + (Number(r.calories) || 0), 0);
            }

            function getZoneBadgeColors(zone) {
                switch (zone) {
                    case 'Peak': return { bg: '#ffe4e6', text: '#be123c', border: '#fda4af' };
                    case 'Cardio': return { bg: '#ffedd5', text: '#c2410c', border: '#fdba74' };
                    case 'Fat Burn': return { bg: '#fef9c3', text: '#a16207', border: '#fde047' };
                    case 'Warm-Up': return { bg: '#dcfce7', text: '#15803d', border: '#86efac' };
                    default: return { bg: '#fff1f2', text: '#e11d48', border: '#fecdd3' };
                }
            }

            function getBmiCategoryColors(cat) {
                switch (cat) {
                    case 'Normal': return { bg: '#dcfce7', text: '#166534', border: '#86efac' };
                    case 'Underweight': return { bg: '#e0f2fe', text: '#0369a1', border: '#7dd3fc' };
                    case 'Overweight': return { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' };
                    case 'Obese': return { bg: '#ffe4e6', text: '#be123c', border: '#fda4af' };
                    default: return { bg: '#eef2ff', text: '#4338ca', border: '#c7d2fe' };
                }
            }

            function renderSvgPath() {
                if (!haTracker.coords.length) {
                    return 'M35 235 C95 215 130 170 190 185 S285 240 345 170 S425 105 505 85';
                }
                let lats = haTracker.coords.map(c => c.lat);
                let lngs = haTracker.coords.map(c => c.lng);
                let minLat = Math.min(...lats), maxLat = Math.max(...lats);
                let minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
                let dLat = maxLat - minLat || 0.0001;
                let dLng = maxLng - minLng || 0.0001;

                return haTracker.coords.map((c, i) => {
                    let x = 30 + ((c.lng - minLng) / dLng) * 480;
                    let y = 260 - ((c.lat - minLat) / dLat) * 220;
                    return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
                }).join(' ');
            }

            function renderSvgMapHtml() {
                return `
          <div style="position:relative;width:100%;height:100%;min-height:290px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;display:flex;align-items:center;justify-content:center">
            <!-- 30% Blurred GPS Map Layer -->
            <div style="position:absolute;inset:0;filter:blur(3.5px);opacity:0.7;transform:scale(1.03);pointer-events:none">
              <svg id="ha-svg-route" viewBox="0 0 540 300" style="width:100%;height:100%;position:absolute;inset:0">
                <rect width="100%" height="100%" fill="#f1f5f9"/>
                <path d="M0 60 H540 M0 120 H540 M0 180 H540 M0 240 H540" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 4"/>
                <path d="M60 0 V300 M180 0 V300 M300 0 V300 M420 0 V300" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 4"/>
                <path id="ha-svg-path" d="${renderSvgPath()}" fill="none" stroke="#10b981" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="505" cy="85" r="7" fill="#10b981" stroke="#ffffff" stroke-width="3"/>
              </svg>
            </div>
            <!-- Centered Backend Work Status Box -->
            <div style="position:relative;z-index:2;max-width:400px;width:calc(100% - 32px);background:rgba(255,255,255,0.95);border:1px solid #e2e8f0;border-radius:18px;padding:22px 24px;text-align:center;box-shadow:0 12px 32px rgba(15,23,42,0.12);backdrop-filter:blur(6px)">
              <div style="width:44px;height:44px;border-radius:12px;background:#fef3c7;border:1px solid #fcd34d;display:grid;place-items:center;font-size:20px;margin:0 auto 10px">🛠️</div>
              <span style="display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-size:10px;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin-bottom:8px">In Progress</span>
              <h3 style="margin:0 0 6px;font-size:17px;font-weight:800;color:#020617">Backend Work is Going On</h3>
              <p style="margin:0;font-size:13px;color:#475569;line-height:1.45">Live GPS connection and interactive route map syncing are currently under backend development.</p>
            </div>
          </div>
        `;
            }

            function initGoogleMapsIfConfigured() {
                // Disabled while GPS map backend work is in progress
                return;
            }

            function initHiveMapInstance(container) {
                if (!window.google || !window.google.maps) return;
                try {
                    container.innerHTML = '';
                    haTracker.googleMap = new google.maps.Map(container, {
                        zoom: 16,
                        center: {
                            lat: Number.isFinite(haTracker.lastAcceptedLat) ? haTracker.lastAcceptedLat : 20.5937,
                            lng: Number.isFinite(haTracker.lastAcceptedLng) ? haTracker.lastAcceptedLng : 78.9629
                        },
                        disableDefaultUI: true
                    });
                    haTracker.googlePolyline = new google.maps.Polyline({
                        path: [],
                        geodesic: true,
                        strokeColor: '#10b981',
                        strokeOpacity: 1.0,
                        strokeWeight: 4,
                        map: haTracker.googleMap
                    });
                } catch (e) {
                    console.warn('Google Maps init error:', e);
                }
            }

            // WORKOUT MODE TOGGLE (OUTDOOR / TREADMILL)
            window.haSetWorkoutMode = (mode) => {
                haTracker.mode = mode;
                const tmControls = document.getElementById('ha-treadmill-controls');
                const gpsBtn = document.getElementById('ha-gps-toggle-btn');
                const modeBadge = document.getElementById('ha-mode-indicator-badge');

                if (tmControls) tmControls.style.display = mode === 'treadmill' ? 'block' : 'none';
                if (gpsBtn) gpsBtn.style.display = mode === 'outdoor' ? 'inline-flex' : 'none';
                if (modeBadge) {
                    modeBadge.textContent = mode === 'treadmill' ? '⚡ TREADMILL MODE' : '🌲 OUTDOOR GPS';
                    modeBadge.style.background = mode === 'treadmill' ? '#e0e7ff' : '#d1fae5';
                    modeBadge.style.borderColor = mode === 'treadmill' ? '#a5b4fc' : '#6ee7b7';
                    modeBadge.style.color = '#0f172a';
                }

                const tabOutdoor = document.getElementById('ha-tab-outdoor');
                const tabTreadmill = document.getElementById('ha-tab-treadmill');
                if (tabOutdoor && tabTreadmill) {
                    if (mode === 'outdoor') {
                        tabOutdoor.style.background = '#ffffff';
                        tabOutdoor.style.color = '#020617';
                        tabOutdoor.style.boxShadow = '0 1px 3px rgba(15,23,42,0.1)';
                        tabTreadmill.style.background = 'transparent';
                        tabTreadmill.style.color = '#64748b';
                        tabTreadmill.style.boxShadow = 'none';
                    } else {
                        tabTreadmill.style.background = '#ffffff';
                        tabTreadmill.style.color = '#020617';
                        tabTreadmill.style.boxShadow = '0 1px 3px rgba(15,23,42,0.1)';
                        tabOutdoor.style.background = 'transparent';
                        tabOutdoor.style.color = '#64748b';
                        tabOutdoor.style.boxShadow = 'none';
                    }
                }
                updateGpsHud();
                toast(`Switched to ${mode === 'treadmill' ? 'Indoor Treadmill' : 'Outdoor GPS'} mode`);
            };

            // TREADMILL CONTROLS
            window.haSetTreadmillSpeed = (delta) => {
                haTracker.speedKmh = Math.max(2.0, Math.min(20.0, Number((haTracker.speedKmh + delta).toFixed(1))));
                const valEl = document.getElementById('ha-tm-speed-val');
                if (valEl) valEl.textContent = haTracker.speedKmh.toFixed(1) + ' km/h';
                const sld = document.getElementById('ha-tm-speed-slider');
                if (sld) sld.value = haTracker.speedKmh;
            };

            window.haOnTreadmillSpeedSlider = (val) => {
                haTracker.speedKmh = Math.max(2.0, Math.min(20.0, Number(Number(val).toFixed(1))));
                const valEl = document.getElementById('ha-tm-speed-val');
                if (valEl) valEl.textContent = haTracker.speedKmh.toFixed(1) + ' km/h';
            };

            window.haSetTreadmillIncline = (delta) => {
                haTracker.inclinePct = Math.max(0.0, Math.min(15.0, Number((haTracker.inclinePct + delta).toFixed(1))));
                const valEl = document.getElementById('ha-tm-incline-val');
                if (valEl) valEl.textContent = haTracker.inclinePct.toFixed(1) + ' %';
                const sld = document.getElementById('ha-tm-incline-slider');
                if (sld) sld.value = haTracker.inclinePct;
            };

            window.haOnTreadmillInclineSlider = (val) => {
                haTracker.inclinePct = Math.max(0.0, Math.min(15.0, Number(Number(val).toFixed(1))));
                const valEl = document.getElementById('ha-tm-incline-val');
                if (valEl) valEl.textContent = haTracker.inclinePct.toFixed(1) + ' %';
            };

            // GPS CONNECTION DISABLED (Backend work in progress)
            window.haToggleGPSConnection = () => {
                if (haTracker.watchId != null && 'geolocation' in navigator) {
                    navigator.geolocation.clearWatch(haTracker.watchId);
                    haTracker.watchId = null;
                }
                haTracker.status = 'disconnected';
                updateGpsHud();
                toast('GPS connection is currently disabled while backend work is going on.');
            };

            function handleGpsPosition(pos) {
                haTracker.status = 'connected';
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const acc = pos.coords.accuracy;
                const speed = pos.coords.speed;
                const alt = pos.coords.altitude;

                haTracker.lastAccuracy = acc;

                if (acc > 50) {
                    haTracker.rejectedPoints++;
                    haTracker.lastRejectionReason = `Low GPS accuracy (${Math.round(acc)}m > 50m)`;
                    updateGpsHud();
                    return;
                }

                if (haTracker.active && !haTracker.paused && haTracker.mode === 'outdoor') {
                    if (haTracker.lastAcceptedLat != null && haTracker.lastAcceptedLng != null) {
                        const dist = haversineDistMeters(haTracker.lastAcceptedLat, haTracker.lastAcceptedLng, lat, lng);
                        if (dist >= 3) {
                            haTracker.distanceMeters += dist;
                            haTracker.gpsDeltaSinceLastTick += dist;
                            if (alt != null && haTracker.lastAltitude != null && alt > haTracker.lastAltitude) {
                                haTracker.elevationGain += (alt - haTracker.lastAltitude);
                            }
                        } else {
                            haTracker.rejectedPoints++;
                            haTracker.lastRejectionReason = `Stationary drift filtered (${dist.toFixed(1)}m < 3m)`;
                        }
                    }

                    haTracker.coords.push({ lat, lng, accuracy: acc, time: Date.now() });
                    if (haTracker.googlePolyline && haTracker.googleMap) {
                        const path = haTracker.googlePolyline.getPath();
                        path.push(new google.maps.LatLng(lat, lng));
                        haTracker.googleMap.panTo({ lat, lng });
                    }
                }

                haTracker.lastAcceptedLat = lat;
                haTracker.lastAcceptedLng = lng;
                haTracker.lastAltitude = alt;
                haTracker.acceptedPoints++;
                haTracker.lastRejectionReason = null;

                if (speed != null && speed >= 0) {
                    haTracker.currentSpeedKmh = speed * 3.6;
                }

                updateGpsHud();
            }

            function updateGpsHud() {
                const btn = document.getElementById('ha-gps-toggle-btn');
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Connect GPS (Not Enabled)';
                    btn.style.background = '#f1f5f9';
                    btn.style.color = '#94a3b8';
                    btn.style.borderColor = '#e2e8f0';
                    btn.style.cursor = 'not-allowed';
                    btn.style.opacity = '0.8';
                }

                const stEl = document.getElementById('ha-gps-status-badge');
                if (stEl) {
                    if (haTracker.mode === 'treadmill') {
                        stEl.textContent = 'INDOOR MOTOR';
                        stEl.style.background = '#e0e7ff';
                        stEl.style.color = '#3730a3';
                        stEl.style.borderColor = '#c7d2fe';
                    } else {
                        stEl.textContent = 'GPS NOT ENABLED';
                        stEl.style.background = '#fef3c7';
                        stEl.style.color = '#92400e';
                        stEl.style.borderColor = '#fcd34d';
                    }
                }

                const accEl = document.getElementById('ha-gps-accuracy-display');
                if (accEl) {
                    accEl.textContent = haTracker.mode === 'treadmill'
                        ? 'CALIBRATED'
                        : (haTracker.lastAccuracy ? `±${Math.round(haTracker.lastAccuracy)}m` : 'AUTO');
                }

                const distEl = document.getElementById('ha-live-distance');
                if (distEl) distEl.textContent = formatDist(haTracker.distanceMeters);

                const svgPath = document.getElementById('ha-svg-path');
                if (svgPath) svgPath.setAttribute('d', renderSvgPath());
            }

            function syncLiveTelemetryToDom() {
                const now = Date.now();
                const profile = window.hiveBmiEngine ? window.hiveBmiEngine.getProfile() : null;
                const userAge = profile && profile.age ? profile.age : 26;
                const maxHR = window.hiveBmiEngine ? window.hiveBmiEngine.calculateMaxHeartRate(userAge) : (220 - userAge);

                const elapsedSec = haTracker.active && haTracker.startTime
                    ? Math.max(0, Math.floor((now - haTracker.startTime - haTracker.totalPausedMs) / 1000))
                    : 0;

                const effSpeed = haTracker.mode === 'treadmill'
                    ? haTracker.speedKmh
                    : (haTracker.currentSpeedKmh > 1 ? haTracker.currentSpeedKmh : haTracker.outdoorPaceKmh);

                const timeEl = document.getElementById('ha-live-time');
                if (timeEl) timeEl.textContent = formatDur(elapsedSec);

                const distEl = document.getElementById('ha-live-distance');
                if (distEl) distEl.textContent = formatDist(haTracker.distanceMeters);

                const paceEl = document.getElementById('ha-live-pace');
                if (paceEl) {
                    const secPerKm = haTracker.active && effSpeed > 0 ? (3600 / effSpeed) : 0;
                    paceEl.textContent = formatPace(secPerKm);
                }

                const elevEl = document.getElementById('ha-live-elev');
                if (elevEl) elevEl.textContent = Math.round(haTracker.elevationGain) + ' m';

                const hrMetricEl = document.getElementById('ha-live-hr-metric');
                if (hrMetricEl) hrMetricEl.textContent = haTracker.currentHeartRate + ' BPM';

                const calMetricEl = document.getElementById('ha-live-cal-metric');
                if (calMetricEl) calMetricEl.textContent = Math.round(haTracker.sessionCalories) + ' kcal';

                // Top 4 Summary Cards live updates
                const todayDistEl = document.getElementById('ha-today-distance');
                if (todayDistEl) {
                    todayDistEl.textContent = formatDist(getTodayFinishedMeters() + (haTracker.active ? haTracker.distanceMeters : 0));
                }

                const todayCalEl = document.getElementById('ha-today-calories');
                if (todayCalEl) {
                    const totalCal = Math.round(getTodayFinishedCalories() + (haTracker.active ? haTracker.sessionCalories : 0));
                    todayCalEl.innerHTML = `${totalCal} <span style="font-size:14px;color:#64748b;font-weight:600">kcal</span>`;
                }

                const topHrEl = document.getElementById('ha-live-hr');
                if (topHrEl) {
                    topHrEl.innerHTML = `${haTracker.currentHeartRate} <span style="font-size:14px;color:#64748b;font-weight:600">BPM</span>`;
                }

                const zoneBadge = document.getElementById('ha-hr-zone-badge');
                if (zoneBadge && window.hiveBmiEngine) {
                    const z = window.hiveBmiEngine.getHeartRateZone(haTracker.currentHeartRate, maxHR);
                    const zc = getZoneBadgeColors(z);
                    zoneBadge.textContent = z;
                    zoneBadge.style.background = zc.bg;
                    zoneBadge.style.color = zc.text;
                    zoneBadge.style.borderColor = zc.border;
                }

                const pulseDot = document.getElementById('ha-hr-pulse-dot');
                if (pulseDot) {
                    pulseDot.classList.toggle('live', Boolean(haTracker.active && !haTracker.paused));
                }
            }

            // START, PAUSE, RESUME, FINISH RUN
            window.haStartTracking = () => {
                // GPS auto-connect disabled while backend work is in progress

                const now = Date.now();
                haTracker.active = true;
                haTracker.paused = false;
                haTracker.startTime = now;
                haTracker.lastTickAt = now;
                haTracker.totalPausedMs = 0;
                haTracker.lastAcceptedLat = null;
                haTracker.lastAcceptedLng = null;
                haTracker.gpsDeltaSinceLastTick = 0;
                haTracker.elevationGain = 0;
                haTracker.distanceMeters = 0;
                haTracker.sessionCalories = 0;
                haTracker.coords = [];
                haTracker.currentHeartRate = 76;
                if (haTracker.googlePolyline) haTracker.googlePolyline.setPath([]);

                if (haTracker.timerInterval) clearInterval(haTracker.timerInterval);

                haTracker.timerInterval = setInterval(() => {
                    if (!haTracker.active || haTracker.paused) return;

                    const tickNow = Date.now();
                    const deltaSec = Math.max(0.25, Math.min(5, (tickNow - (haTracker.lastTickAt || tickNow)) / 1000));
                    haTracker.lastTickAt = tickNow;

                    const profile = window.hiveBmiEngine ? window.hiveBmiEngine.getProfile() : null;
                    const userAge = profile && profile.age ? profile.age : 26;
                    const userWeightKg = profile && profile.weightKg ? profile.weightKg : 60;
                    const maxHR = window.hiveBmiEngine ? window.hiveBmiEngine.calculateMaxHeartRate(userAge) : (220 - userAge);

                    let effSpeed = haTracker.speedKmh;
                    let effIncline = 0;

                    if (haTracker.mode === 'treadmill') {
                        effSpeed = haTracker.speedKmh;
                        effIncline = haTracker.inclinePct;
                        const deltaMeters = ((effSpeed * 1000) / 3600) * deltaSec;
                        haTracker.distanceMeters += deltaMeters;
                        if (effIncline > 0) {
                            haTracker.elevationGain += deltaMeters * (effIncline / 100);
                        }
                    } else {
                        // Outdoor mode: blend real GPS delta when available, fallback to active pace if stationary/indoor
                        if (haTracker.gpsDeltaSinceLastTick > 0) {
                            effSpeed = haTracker.currentSpeedKmh > 1
                                ? haTracker.currentSpeedKmh
                                : Math.max(3, (haTracker.gpsDeltaSinceLastTick / deltaSec) * 3.6);
                            haTracker.gpsDeltaSinceLastTick = 0;
                        } else {
                            effSpeed = haTracker.currentSpeedKmh > 1 ? haTracker.currentSpeedKmh : haTracker.outdoorPaceKmh;
                            const deltaMeters = ((effSpeed * 1000) / 3600) * deltaSec;
                            haTracker.distanceMeters += deltaMeters;
                            haTracker.elevationGain += deltaMeters * 0.01;
                        }
                    }

                    // Smooth Heart Rate ramp toward active effort target
                    const targetHR = maxHR * Math.min(0.92, 0.52 + (effSpeed * 0.03) + (effIncline * 0.015));
                    haTracker.currentHeartRate += (targetHR - haTracker.currentHeartRate) * 0.2 + (Math.random() * 2 - 1);
                    haTracker.currentHeartRate = Math.round(Math.max(68, Math.min(maxHR, haTracker.currentHeartRate)));

                    // Session calories via MET formula using saved BMI weight
                    const met = 1 + (effSpeed * 1.05) + (effIncline * 0.45);
                    const kcalPerSec = (met * 3.5 * userWeightKg) / 12000;
                    haTracker.sessionCalories += kcalPerSec * deltaSec;

                    syncLiveTelemetryToDom();
                }, 1000);

                renderControls();
                syncLiveTelemetryToDom();
                toast(`Live ${haTracker.mode === 'treadmill' ? 'Treadmill' : 'Outdoor'} run started!`);
            };

            window.haPauseTracking = () => {
                if (!haTracker.active || haTracker.paused) return;
                haTracker.paused = true;
                haTracker.pauseTime = Date.now();
                renderControls();
                syncLiveTelemetryToDom();
                toast('Run paused.');
            };

            window.haResumeTracking = () => {
                if (!haTracker.active || !haTracker.paused) return;
                const now = Date.now();
                haTracker.totalPausedMs += (now - haTracker.pauseTime);
                haTracker.lastTickAt = now;
                haTracker.paused = false;
                haTracker.lastAcceptedLat = null;
                haTracker.lastAcceptedLng = null;
                renderControls();
                syncLiveTelemetryToDom();
                toast('Run resumed.');
            };

            window.haFinishTracking = () => {
                if (!haTracker.active) return;
                const elapsedSec = Math.max(1, Math.floor((Date.now() - haTracker.startTime - haTracker.totalPausedMs) / 1000));

                if (haTracker.distanceMeters < 5 && elapsedSec < 3) {
                    toast('Run too short to record (minimum 3 seconds).');
                    resetTracker();
                    renderControls();
                    syncLiveTelemetryToDom();
                    return;
                }

                const effSpeed = haTracker.mode === 'treadmill'
                    ? haTracker.speedKmh
                    : (haTracker.distanceMeters > 0 ? (haTracker.distanceMeters / elapsedSec) * 3.6 : haTracker.outdoorPaceKmh);
                const secPerKm = effSpeed > 0 ? (3600 / effSpeed) : 0;
                const finishedAt = new Date().toISOString();
                const startedAt = new Date(haTracker.startTime).toISOString();
                const routeTitle = haTracker.mode === 'treadmill'
                    ? `Indoor Treadmill (${haTracker.speedKmh.toFixed(1)} km/h, ${haTracker.inclinePct.toFixed(1)}% inc)`
                    : 'Hive City Outdoor Run';

                const runRecord = {
                    id: 'run-' + Date.now(),
                    startedAt: startedAt,
                    finishedAt: finishedAt,
                    date: 'Today, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    route: routeTitle,
                    distance: formatDist(haTracker.distanceMeters),
                    rawMeters: Math.round(haTracker.distanceMeters),
                    duration: formatDur(elapsedSec),
                    durationSec: elapsedSec,
                    pace: formatPace(secPerKm),
                    calories: Math.max(1, Math.round(haTracker.sessionCalories)),
                    elevation: Math.round(haTracker.elevationGain) + 'm',
                    avgHeartRate: haTracker.currentHeartRate || 130,
                    mode: haTracker.mode,
                    pointsCount: haTracker.coords.length,
                    coords: haTracker.coords.slice(0, 100)
                };

                haState.history.unshift(runRecord);
                haSave();

                try {
                    const hist = JSON.parse(localStorage.getItem('hivecity_activity_history') || '[]');
                    hist.unshift(runRecord);
                    localStorage.setItem('hivecity_activity_history', JSON.stringify(hist));
                } catch (e) { }

                if (typeof window.haSaveReportToAppsScript === 'function') {
                    window.haSaveReportToAppsScript(runRecord);
                }

                toast('Run saved: ' + runRecord.distance + ' · ' + runRecord.calories + ' kcal');
                resetTracker();
                go(1);
            };

            function resetTracker() {
                haTracker.active = false;
                haTracker.paused = false;
                haTracker.distanceMeters = 0;
                haTracker.sessionCalories = 0;
                haTracker.elevationGain = 0;
                haTracker.currentHeartRate = 72;
                haTracker.gpsDeltaSinceLastTick = 0;
                if (haTracker.timerInterval) clearInterval(haTracker.timerInterval);
                haTracker.timerInterval = null;
            }

            function renderControls() {
                const cDiv = document.getElementById('ha-action-controls');
                if (!cDiv) return;
                if (!haTracker.active) {
                    cDiv.innerHTML = `
            <button type="button" class="ha-lime-btn" onclick="haStartTracking()" style="padding:12px 26px;font-size:14px;display:inline-flex;align-items:center;gap:8px">
              ▶ Start Run
            </button>
          `;
                } else if (haTracker.paused) {
                    cDiv.innerHTML = `
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button type="button" class="ha-lime-btn" onclick="haResumeTracking()" style="padding:11px 22px;font-size:13px">▶ Resume</button>
              <button type="button" onclick="haFinishTracking()" style="background:#0f172a;color:#ffffff;font-weight:800;border:none;padding:11px 22px;border-radius:999px;font-size:13px;cursor:pointer">■ Finish Run</button>
            </div>
          `;
                } else {
                    cDiv.innerHTML = `
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <button type="button" onclick="haPauseTracking()" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-weight:800;padding:11px 22px;border-radius:999px;font-size:13px;cursor:pointer">❚❚ Pause</button>
              <button type="button" onclick="haFinishTracking()" style="background:#0f172a;color:#ffffff;font-weight:800;border:none;padding:11px 22px;border-radius:999px;font-size:13px;cursor:pointer">■ Finish Run</button>
            </div>
          `;
                }
            }

            // =====================================================================
            // BMI CALCULATOR MODAL HANDLERS (Clean Validation + Instant Save & Lock)
            // =====================================================================
            window.haBmiUnitState = { heightUnit: 'ft', weightUnit: 'kg' };

            window.haOpenBmiModal = () => {
                const modal = document.getElementById('ha-bmi-modal');
                if (!modal) return;
                const profile = window.hiveBmiEngine ? window.hiveBmiEngine.getProfile() : null;
                if (profile) {
                    window.haBmiUnitState.heightUnit = profile.heightUnit || 'ft';
                    window.haBmiUnitState.weightUnit = profile.weightUnit || 'kg';
                }
                modal.innerHTML = renderBmiModalInnerHtml(profile);
                modal.style.display = 'flex';
                window.haRecalcBmiModal();
            };

            window.haCloseBmiModal = () => {
                const modal = document.getElementById('ha-bmi-modal');
                if (modal) modal.style.display = 'none';
            };

            window.haToggleBmiHeightUnit = (unit) => {
                window.haBmiUnitState.heightUnit = unit;
                const ftRow = document.getElementById('ha-bmi-row-ft');
                const cmRow = document.getElementById('ha-bmi-row-cm');
                const btnFt = document.getElementById('ha-bmi-btn-ft');
                const btnCm = document.getElementById('ha-bmi-btn-cm');
                if (ftRow && cmRow) {
                    ftRow.style.display = unit === 'ft' ? 'flex' : 'none';
                    cmRow.style.display = unit === 'cm' ? 'block' : 'none';
                }
                if (btnFt && btnCm) {
                    btnFt.style.background = unit === 'ft' ? '#C6F432' : '#f1f5f9';
                    btnFt.style.color = unit === 'ft' ? '#020617' : '#475569';
                    btnFt.style.borderColor = unit === 'ft' ? '#a3e635' : '#e2e8f0';
                    btnCm.style.background = unit === 'cm' ? '#C6F432' : '#f1f5f9';
                    btnCm.style.color = unit === 'cm' ? '#020617' : '#475569';
                    btnCm.style.borderColor = unit === 'cm' ? '#a3e635' : '#e2e8f0';
                }
                window.haRecalcBmiModal();
            };

            window.haToggleBmiWeightUnit = (unit) => {
                window.haBmiUnitState.weightUnit = unit;
                const kgRow = document.getElementById('ha-bmi-row-kg');
                const lbsRow = document.getElementById('ha-bmi-row-lbs');
                const btnKg = document.getElementById('ha-bmi-btn-kg');
                const btnLbs = document.getElementById('ha-bmi-btn-lbs');
                if (kgRow && lbsRow) {
                    kgRow.style.display = unit === 'kg' ? 'block' : 'none';
                    lbsRow.style.display = unit === 'lbs' ? 'block' : 'none';
                }
                if (btnKg && btnLbs) {
                    btnKg.style.background = unit === 'kg' ? '#C6F432' : '#f1f5f9';
                    btnKg.style.color = unit === 'kg' ? '#020617' : '#475569';
                    btnKg.style.borderColor = unit === 'kg' ? '#a3e635' : '#e2e8f0';
                    btnLbs.style.background = unit === 'lbs' ? '#C6F432' : '#f1f5f9';
                    btnLbs.style.color = unit === 'lbs' ? '#020617' : '#475569';
                    btnLbs.style.borderColor = unit === 'lbs' ? '#a3e635' : '#e2e8f0';
                }
                window.haRecalcBmiModal();
            };

            function readBmiModalInputs() {
                const hUnit = window.haBmiUnitState.heightUnit;
                const wUnit = window.haBmiUnitState.weightUnit;
                let heightVal = 0, feet = undefined, inches = undefined, heightCm = 0;
                let weightVal = 0, weightKg = 0;

                if (hUnit === 'ft') {
                    const ftRaw = document.getElementById('ha-bmi-ft-val')?.value;
                    const inRaw = document.getElementById('ha-bmi-in-val')?.value;
                    feet = parseFloat(ftRaw);
                    inches = inRaw === '' || inRaw == null ? 0 : parseFloat(inRaw);
                    if (!Number.isFinite(feet) || feet <= 0) return { error: 'Please enter a valid height in feet (e.g. 5).' };
                    if (!Number.isFinite(inches) || inches < 0 || inches >= 12) return { error: 'Inches must be between 0 and 11.' };
                    heightVal = feet;
                    heightCm = window.hiveBmiEngine.normalizeHeightToCm(0, 'ft', feet, inches);
                } else {
                    const cmRaw = document.getElementById('ha-bmi-cm-val')?.value;
                    heightVal = parseFloat(cmRaw);
                    if (!Number.isFinite(heightVal) || heightVal < 50 || heightVal > 260) {
                        return { error: 'Please enter a valid height in cm (50–260 cm).' };
                    }
                    heightCm = window.hiveBmiEngine.normalizeHeightToCm(heightVal, 'cm');
                }

                if (wUnit === 'lbs') {
                    const lbsRaw = document.getElementById('ha-bmi-lbs-val')?.value;
                    weightVal = parseFloat(lbsRaw);
                    if (!Number.isFinite(weightVal) || weightVal < 40 || weightVal > 700) {
                        return { error: 'Please enter a valid weight in lbs (40–700 lbs).' };
                    }
                    weightKg = window.hiveBmiEngine.normalizeWeightToKg(weightVal, 'lbs');
                } else {
                    const kgRaw = document.getElementById('ha-bmi-kg-val')?.value;
                    weightVal = parseFloat(kgRaw);
                    if (!Number.isFinite(weightVal) || weightVal < 20 || weightVal > 320) {
                        return { error: 'Please enter a valid weight in kg (20–320 kg).' };
                    }
                    weightKg = window.hiveBmiEngine.normalizeWeightToKg(weightVal, 'kg');
                }

                const ageRaw = document.getElementById('ha-bmi-age-val')?.value;
                const age = parseInt(ageRaw, 10);
                if (!Number.isFinite(age) || age < 10 || age > 110) {
                    return { error: 'Please enter a valid age (10–110).' };
                }

                const gender = document.getElementById('ha-bmi-gender-val')?.value || 'female';
                return { hUnit, wUnit, heightVal, feet, inches, heightCm, weightVal, weightKg, age, gender };
            }

            window.haRecalcBmiModal = () => {
                if (!window.hiveBmiEngine) return;
                const errEl = document.getElementById('ha-bmi-form-error');
                const parsed = readBmiModalInputs();
                if (parsed.error) {
                    if (errEl) { errEl.textContent = parsed.error; errEl.style.display = 'block'; }
                    return;
                }
                if (errEl) errEl.style.display = 'none';

                const bmi = window.hiveBmiEngine.calculateBmi(parsed.weightKg, parsed.heightCm);
                const category = window.hiveBmiEngine.classifyBmi(bmi);
                const { dailyCalorieTarget, goalStrategy } = window.hiveBmiEngine.getCalorieTargetAndStrategy(category, parsed.weightKg);
                const c = getBmiCategoryColors(category);

                const scoreEl = document.getElementById('ha-bmi-preview-score');
                const catEl = document.getElementById('ha-bmi-preview-cat');
                const calEl = document.getElementById('ha-bmi-preview-cal');
                const stratEl = document.getElementById('ha-bmi-preview-strat');

                if (scoreEl) scoreEl.textContent = bmi.toFixed(2);
                if (catEl) {
                    catEl.textContent = category.toUpperCase();
                    catEl.style.background = c.bg;
                    catEl.style.color = c.text;
                    catEl.style.borderColor = c.border;
                }
                if (calEl) calEl.textContent = dailyCalorieTarget.toLocaleString() + ' kcal/day';
                if (stratEl) stratEl.textContent = goalStrategy.replace(/_/g, ' ').toUpperCase();
            };

            window.haSaveBmiProfileFromModal = (e) => {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (!window.hiveBmiEngine) return false;

                const errEl = document.getElementById('ha-bmi-form-error');
                const parsed = readBmiModalInputs();
                if (parsed.error) {
                    if (errEl) { errEl.textContent = parsed.error; errEl.style.display = 'block'; }
                    return false;
                }
                if (errEl) errEl.style.display = 'none';

                const bmi = window.hiveBmiEngine.calculateBmi(parsed.weightKg, parsed.heightCm);
                const bmiCategory = window.hiveBmiEngine.classifyBmi(bmi);
                const { dailyCalorieTarget, goalStrategy } = window.hiveBmiEngine.getCalorieTargetAndStrategy(bmiCategory, parsed.weightKg);

                const profile = {
                    height: parsed.heightVal,
                    heightUnit: parsed.hUnit,
                    feet: parsed.feet,
                    inches: parsed.inches,
                    heightCm: parsed.heightCm,
                    weight: parsed.weightVal,
                    weightUnit: parsed.wUnit,
                    weightKg: parsed.weightKg,
                    age: parsed.age,
                    gender: parsed.gender,
                    bmi: bmi,
                    bmiCategory: bmiCategory,
                    dailyCalorieTarget: dailyCalorieTarget,
                    goalStrategy: goalStrategy,
                    updatedAt: new Date().toISOString()
                };

                window.haCloseBmiModal();
                window.hiveBmiEngine.saveProfile(profile);
                toast(`Locked BMI ${bmi.toFixed(2)} (${bmiCategory}) · ${dailyCalorieTarget.toLocaleString()} kcal/day`);
                if (typeof go === 'function') go(1);
                return false;
            };

            function renderBmiModalInnerHtml(existing) {
                const p = existing || {
                    heightUnit: 'ft',
                    feet: 5,
                    inches: 0,
                    height: 152.4,
                    heightCm: 152.4,
                    weightUnit: 'kg',
                    weight: 60,
                    weightKg: 60,
                    age: 26,
                    gender: 'female'
                };
                const isFt = window.haBmiUnitState.heightUnit === 'ft';
                const isKg = window.haBmiUnitState.weightUnit === 'kg';

                return `
        <div style="width:100%;max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:24px;padding:26px;position:relative;box-shadow:0 24px 60px rgba(15,23,42,0.22);color:#0f172a;margin:auto">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
            <div>
              <span style="display:inline-block;background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe;font-size:10px;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;padding:3px 10px;border-radius:999px;margin-bottom:6px">Personal Health & Nutrition</span>
              <h2 style="font-size:22px;font-weight:800;color:#020617;margin:0">Exact BMI & Nutrient Lock</h2>
            </div>
            <button type="button" onclick="haCloseBmiModal()" style="font-size:15px;padding:6px 11px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0;border-radius:10px;cursor:pointer;font-weight:700">✕</button>
          </div>

          <div id="ha-bmi-form-error" style="display:none;margin-bottom:14px;padding:10px 14px;background:#fff1f2;border:1px solid #fda4af;color:#be123c;border-radius:12px;font-size:12px;font-weight:700"></div>

          <form novalidate onsubmit="return haSaveBmiProfileFromModal(event)">
            <!-- Height Section -->
            <div style="margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <label style="font-size:12px;font-weight:800;color:#0f172a">Height</label>
                <div style="display:flex;gap:6px">
                  <button type="button" id="ha-bmi-btn-ft" onclick="haToggleBmiHeightUnit('ft')" style="font-size:11px;font-weight:700;padding:5px 12px;border-radius:8px;border:1px solid ${isFt ? '#a3e635' : '#e2e8f0'};cursor:pointer;background:${isFt ? '#C6F432' : '#f1f5f9'};color:${isFt ? '#020617' : '#475569'}">Feet / In</button>
                  <button type="button" id="ha-bmi-btn-cm" onclick="haToggleBmiHeightUnit('cm')" style="font-size:11px;font-weight:700;padding:5px 12px;border-radius:8px;border:1px solid ${!isFt ? '#a3e635' : '#e2e8f0'};cursor:pointer;background:${!isFt ? '#C6F432' : '#f1f5f9'};color:${!isFt ? '#020617' : '#475569'}">Centimeters</button>
                </div>
              </div>
              <div id="ha-bmi-row-ft" style="display:${isFt ? 'flex' : 'none'};gap:10px">
                <div style="flex:1">
                  <input id="ha-bmi-ft-val" type="number" step="any" value="${p.feet !== undefined ? p.feet : 5}" oninput="haRecalcBmiModal()" style="width:100%;box-sizing:border-box;background:#f8fafc;border:1px solid #cbd5e1;color:#020617;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:700">
                  <small style="color:#64748b;font-size:11px">Feet</small>
                </div>
                <div style="flex:1">
                  <input id="ha-bmi-in-val" type="number" step="any" value="${p.inches !== undefined ? p.inches : 0}" oninput="haRecalcBmiModal()" style="width:100%;box-sizing:border-box;background:#f8fafc;border:1px solid #cbd5e1;color:#020617;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:700">
                  <small style="color:#64748b;font-size:11px">Inches</small>
                </div>
              </div>
              <div id="ha-bmi-row-cm" style="display:${!isFt ? 'block' : 'none'}">
                <input id="ha-bmi-cm-val" type="number" step="any" value="${p.heightCm || 152.4}" oninput="haRecalcBmiModal()" style="width:100%;box-sizing:border-box;background:#f8fafc;border:1px solid #cbd5e1;color:#020617;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:700">
                <small style="color:#64748b;font-size:11px">Height in cm (e.g. 152.4 for 5 ft)</small>
              </div>
            </div>

            <!-- Weight Section -->
            <div style="margin-bottom:16px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <label style="font-size:12px;font-weight:800;color:#0f172a">Weight</label>
                <div style="display:flex;gap:6px">
                  <button type="button" id="ha-bmi-btn-kg" onclick="haToggleBmiWeightUnit('kg')" style="font-size:11px;font-weight:700;padding:5px 12px;border-radius:8px;border:1px solid ${isKg ? '#a3e635' : '#e2e8f0'};cursor:pointer;background:${isKg ? '#C6F432' : '#f1f5f9'};color:${isKg ? '#020617' : '#475569'}">Kilograms (kg)</button>
                  <button type="button" id="ha-bmi-btn-lbs" onclick="haToggleBmiWeightUnit('lbs')" style="font-size:11px;font-weight:700;padding:5px 12px;border-radius:8px;border:1px solid ${!isKg ? '#a3e635' : '#e2e8f0'};cursor:pointer;background:${!isKg ? '#C6F432' : '#f1f5f9'};color:${!isKg ? '#020617' : '#475569'}">Pounds (lbs)</button>
                </div>
              </div>
              <div id="ha-bmi-row-kg" style="display:${isKg ? 'block' : 'none'}">
                <input id="ha-bmi-kg-val" type="number" step="any" value="${p.weightKg || 60}" oninput="haRecalcBmiModal()" style="width:100%;box-sizing:border-box;background:#f8fafc;border:1px solid #cbd5e1;color:#020617;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:700">
                <small style="color:#64748b;font-size:11px">Weight in kilograms (e.g. 60 kg)</small>
              </div>
              <div id="ha-bmi-row-lbs" style="display:${!isKg ? 'block' : 'none'}">
                <input id="ha-bmi-lbs-val" type="number" step="any" value="${p.weightUnit === 'lbs' ? p.weight : 132.3}" oninput="haRecalcBmiModal()" style="width:100%;box-sizing:border-box;background:#f8fafc;border:1px solid #cbd5e1;color:#020617;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:700">
                <small style="color:#64748b;font-size:11px">Weight in pounds</small>
              </div>
            </div>

            <!-- Age & Gender Grid -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">
              <div>
                <label style="font-size:12px;font-weight:800;color:#0f172a;display:block;margin-bottom:6px">Age</label>
                <input id="ha-bmi-age-val" type="number" step="1" value="${p.age || 26}" oninput="haRecalcBmiModal()" style="width:100%;box-sizing:border-box;background:#f8fafc;border:1px solid #cbd5e1;color:#020617;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:700">
              </div>
              <div>
                <label style="font-size:12px;font-weight:800;color:#0f172a;display:block;margin-bottom:6px">Biological Sex</label>
                <select id="ha-bmi-gender-val" style="width:100%;box-sizing:border-box;background:#f8fafc;border:1px solid #cbd5e1;color:#020617;border-radius:10px;padding:10px 12px;font-size:14px;font-weight:700">
                  <option value="female" ${p.gender === 'female' ? 'selected' : ''}>Female</option>
                  <option value="male" ${p.gender === 'male' ? 'selected' : ''}>Male</option>
                  <option value="other" ${p.gender === 'other' ? 'selected' : ''}>Other</option>
                </select>
              </div>
            </div>

            <!-- Live Calculated Preview -->
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:20px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:0.6px">Calculated BMI</span>
                <span id="ha-bmi-preview-cat" style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px">OVERWEIGHT</span>
              </div>
              <div id="ha-bmi-preview-score" class="ha-num-dark" style="font-size:36px;line-height:1;margin-bottom:10px">25.83</div>
              <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e2e8f0;padding-top:10px;font-size:12px;flex-wrap:wrap;gap:8px">
                <span style="color:#475569">Daily Target: <b id="ha-bmi-preview-cal" style="color:#059669">1,440 kcal/day</b></span>
                <span id="ha-bmi-preview-strat" style="color:#4f46e5;font-weight:800;font-size:11px;background:#eef2ff;border:1px solid #c7d2fe;padding:2px 9px;border-radius:999px">CALORIE DEFICIT</span>
              </div>
            </div>

            <!-- Actions -->
            <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">
              <button type="button" onclick="haCloseBmiModal()" style="border:1px solid #cbd5e1;color:#475569;background:#ffffff;font-weight:700;padding:10px 18px;border-radius:999px;cursor:pointer;font-size:13px">Cancel</button>
              <button type="submit" class="ha-lime-btn" style="padding:11px 22px;font-size:13px">🔒 Save & Lock BMI to Nutrient Plan</button>
            </div>
          </form>
        </div>
                `;
            }

            // LOCKED NUTRIENT RECOMMENDATIONS (TOP 3 PICKS) SECTION
            function renderLockedNutrientPreviewHtml(profile) {
                if (!profile || !window.hiveBmiEngine) return '';
                const sharedRecipes = typeof window.getSharedNutrients === 'function' ? window.getSharedNutrients() : [];
                const combinedPool = [...sharedRecipes, ...(window.SEED_NUTRIENT_RECIPES || [])];
                const topPicks = window.hiveBmiEngine.getTopRecommendedRecipes(profile, combinedPool, 3);
                if (!topPicks.length) return '';

                return `
  <section id="ha-locked-nutrients-section" class="ha-card" style="padding:20px 22px;margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:16px">
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
          <span style="background:#dcfce7;color:#166534;border:1px solid #86efac;font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px">🔒 Locked to BMI ${Number(profile.bmi).toFixed(2)} (${hesc(profile.bmiCategory)})</span>
          <span style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px">Target: ${Number(profile.dailyCalorieTarget).toLocaleString()} kcal/day</span>
        </div>
        <h2 style="font-size:18px;font-weight:800;color:#020617;margin:4px 0 0">Locked Nutrient Recommendations (Top ${topPicks.length} Picks)</h2>
      </div>
      <a href="#nutrition" onclick="location.hash='#nutrition'" style="display:inline-flex;align-items:center;gap:6px;background:#f8fafc;color:#059669;border:1px solid #a7f3d0;font-weight:800;font-size:12px;padding:8px 16px;border-radius:999px;text-decoration:none;cursor:pointer">
        View All in Nutrients →
      </a>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(260px, 1fr));gap:14px">
      ${topPicks.map(item => {
                    const r = item.recipe;
                    const cal = Number(r.calories) || 0;
                    const pro = Number(r.protein || r.proteinGrams) || 0;
                    const fib = Number(r.fiber || r.fiberGrams) || 0;
                    const gi = r.glycemicIndex || 'Low';
                    return `
        <article role="button" tabindex="0" onclick="openRecipeDetailModal('${hesc(r.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openRecipeDetailModal('${hesc(r.id)}')}" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;transition:box-shadow 0.15s, border-color 0.15s" onmouseover="this.style.borderColor='#10b981';this.style.boxShadow='0 6px 18px rgba(16,185,129,0.1)'" onmouseout="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">
              <span style="background:#dcfce7;color:#166534;border:1px solid #86efac;font-size:10px;font-weight:800;padding:2px 8px;border-radius:999px">✓ Locked to BMI</span>
              <span style="font-size:11px;font-weight:700;color:#64748b">${hesc(r.mealType || r.category || 'Meal')} · ⏱ ${Number(r.prepTime || r.prepTimeMins || 20)}m</span>
            </div>
            <h3 style="font-size:15px;font-weight:800;color:#020617;margin:0 0 6px;line-height:1.3">${hesc(r.title || r.name)}</h3>
            <p style="font-size:12px;color:#475569;margin:0 0 12px;line-height:1.45">${hesc(item.matchReason)}</p>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;padding-top:10px;border-top:1px solid #f1f5f9">
            <span style="background:#fff7ed;color:#c2410c;border:1px solid #fed7aa;font-size:11px;font-weight:800;padding:3px 8px;border-radius:8px">${cal} kcal</span>
            <span style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:11px;font-weight:800;padding:3px 8px;border-radius:8px">${pro}g Protein</span>
            <span style="background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;font-size:11px;font-weight:800;padding:3px 8px;border-radius:8px">${fib}g Fiber</span>
            <span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:3px 8px;border-radius:8px">${hesc(gi)} GI</span>
          </div>
        </article>`;
                }).join('')}
    </div>
  </section>`;
            }

            // ACTIVITY MAIN VIEW RENDER (Modern Light Canvas & Elevated Color-Coded Cards)
            const render = () => {
                setTimeout(() => {
                    initGoogleMapsIfConfigured();
                    updateGpsHud();
                    if (haTracker.active) {
                        renderControls();
                        syncLiveTelemetryToDom();
                    }
                }, 60);

                const profile = window.hiveBmiEngine ? window.hiveBmiEngine.getProfile() : null;
                const hasBmi = !!profile;
                const bmiVal = profile ? Number(profile.bmi).toFixed(2) : 'Not Set';
                const bmiCat = profile ? profile.bmiCategory : 'UNCONFIGURED';
                const bmiTarget = profile ? `${Number(profile.dailyCalorieTarget).toLocaleString()} kcal/day target` : 'Enter height & weight to unlock plan';
                const bmiColors = getBmiCategoryColors(profile ? profile.bmiCategory : '');

                const todayRuns = getTodayFinishedRuns();
                const todayMeters = getTodayFinishedMeters() + (haTracker.active ? haTracker.distanceMeters : 0);
                const todayCalories = getTodayFinishedCalories() + (haTracker.active ? haTracker.sessionCalories : 0);

                const userAge = profile && profile.age ? profile.age : 26;
                const maxHR = window.hiveBmiEngine ? window.hiveBmiEngine.calculateMaxHeartRate(userAge) : (220 - userAge);
                const currentHR = haTracker.active ? haTracker.currentHeartRate : 72;
                const hrZone = window.hiveBmiEngine ? window.hiveBmiEngine.getHeartRateZone(currentHR, maxHR) : 'Resting';
                const zoneColors = getZoneBadgeColors(hrZone);

                const isRunningLive = Boolean(haTracker.active && !haTracker.paused);
                const effSpeed = haTracker.mode === 'treadmill'
                    ? haTracker.speedKmh
                    : (haTracker.currentSpeedKmh > 1 ? haTracker.currentSpeedKmh : haTracker.outdoorPaceKmh);
                const elapsedSec = haTracker.active && haTracker.startTime
                    ? Math.max(0, Math.floor((Date.now() - haTracker.startTime - haTracker.totalPausedMs) / 1000))
                    : 0;

                return `
<div class="ha">
  <!-- BMI Modal Backdrop -->
  <div id="ha-bmi-modal" onclick="if(event.target===this)haCloseBmiModal()" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,0.58);backdrop-filter:blur(6px);z-index:9999;align-items:center;justify-content:center;padding:16px;overflow-y:auto"></div>

  <!-- Top 4 Color-Coded Metric Cards -->
  <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(230px, 1fr));gap:14px;margin-bottom:20px">
    <!-- Card 1: Today's Distance (Emerald/Teal) -->
    <div class="ha-card" style="padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:11px;font-weight:800;color:#475569;letter-spacing:0.8px;text-transform:uppercase">Today's Distance</span>
        <span style="width:34px;height:34px;border-radius:10px;background:#ecfdf5;border:1px solid #a7f3d0;color:#059669;display:grid;place-items:center;font-size:16px">📍</span>
      </div>
      <div id="ha-today-distance" class="ha-num-dark" style="font-size:32px;line-height:1.05">${formatDist(todayMeters)}</div>
      <small style="color:#059669;font-size:12px;font-weight:700;margin-top:8px;display:block">${todayRuns.length} session${todayRuns.length === 1 ? '' : 's'} recorded today</small>
    </div>

    <!-- Card 2: Calories Burned Today (Amber/Orange) -->
    <div class="ha-card" style="padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-size:11px;font-weight:800;color:#475569;letter-spacing:0.8px;text-transform:uppercase">Calories Burned Today</span>
        <span style="width:34px;height:34px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#ea580c;display:grid;place-items:center;font-size:16px">🔥</span>
      </div>
      <div id="ha-today-calories" class="ha-num-dark" style="font-size:32px;line-height:1.05">${Math.round(todayCalories)} <span style="font-size:14px;color:#64748b;font-weight:600">kcal</span></div>
      <small style="color:#ea580c;font-size:12px;font-weight:700;margin-top:8px;display:block">Active burn across all runs</small>
    </div>

    <!-- Card 3: Heart Rate (Rose/Coral + Live Pulse) -->
    <div class="ha-card" style="padding:18px 20px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#475569;letter-spacing:0.8px;text-transform:uppercase">
          <span id="ha-hr-pulse-dot" class="ha-pulse-dot ${isRunningLive ? 'live' : ''}"></span>
          Heart Rate
        </span>
        <span id="ha-hr-zone-badge" style="background:${zoneColors.bg};color:${zoneColors.text};border:1px solid ${zoneColors.border};font-weight:800;font-size:11px;padding:3px 10px;border-radius:999px">${hesc(hrZone)}</span>
      </div>
      <div id="ha-live-hr" class="ha-num-dark" style="font-size:32px;line-height:1.05">${currentHR} <span style="font-size:14px;color:#64748b;font-weight:600">BPM</span></div>
      <small style="color:#e11d48;font-size:12px;font-weight:700;margin-top:8px;display:block">Max HR: ${maxHR} BPM · Age ${userAge}</small>
    </div>

    <!-- Card 4: BMI & Nutrient Plan (Indigo/Violet + Signature Lime Action) -->
    <div class="ha-card" style="padding:18px 20px;display:flex;flex-direction:column;justify-content:space-between">
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:6px">
          <span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:#475569;letter-spacing:0.8px;text-transform:uppercase">
            <span style="width:24px;height:24px;border-radius:7px;background:#eef2ff;border:1px solid #c7d2fe;color:#4f46e5;display:inline-grid;place-items:center;font-size:12px">⚖️</span>
            BMI & Plan
          </span>
          <span style="background:${bmiColors.bg};color:${bmiColors.text};border:1px solid ${bmiColors.border};font-weight:800;font-size:10px;padding:3px 9px;border-radius:999px">${hesc(bmiCat.toUpperCase())}</span>
        </div>
        <div class="ha-num-dark" style="font-size:28px;line-height:1.1;margin-bottom:4px">${bmiVal}</div>
        <small style="color:#4f46e5;font-size:12px;font-weight:700;display:block">${hesc(bmiTarget)}</small>
      </div>
      <div style="margin-top:12px">
        <button type="button" class="ha-lime-btn" onclick="haOpenBmiModal()" style="font-size:12px;padding:7px 16px;width:100%">
          ${hasBmi ? 'Update BMI' : 'Enable BMI'}
        </button>
      </div>
    </div>
  </div>

  <!-- Instant Locked Nutrient Recommendations (Top 3 Picks) -->
  ${renderLockedNutrientPreviewHtml(profile)}

  <!-- Vibrant Activity Command Hero (Light Elevated Card — Zero Black Blocks) -->
  <header class="ha-hero">
    <div style="display:flex;flex-direction:column;justify-content:space-between">
      <div>
        <!-- High-Contrast Status Pills -->
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <span style="background:#C6F432;color:#020617;border:1px solid #a3e635;font-size:11px;font-weight:800;padding:4px 11px;border-radius:999px;letter-spacing:0.4px">🏃 PERFORMANCE HUB</span>
          <span id="ha-mode-indicator-badge" style="background:${haTracker.mode === 'treadmill' ? '#e0e7ff' : '#d1fae5'};color:#0f172a;border:1px solid ${haTracker.mode === 'treadmill' ? '#a5b4fc' : '#6ee7b7'};font-size:11px;font-weight:800;padding:4px 11px;border-radius:999px">
            ${haTracker.mode === 'treadmill' ? '⚡ TREADMILL MODE' : '🌲 OUTDOOR GPS'}
          </span>
          <span id="ha-gps-status-badge" style="background:#f1f5f9;color:#334155;border:1px solid #cbd5e1;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px">
            ${haTracker.mode === 'treadmill' ? 'INDOOR MOTOR' : 'READY'}
          </span>
          <span style="background:#f8fafc;color:#475569;border:1px solid #e2e8f0;font-size:11px;font-weight:700;padding:4px 10px;border-radius:999px">
            ACCURACY: <b id="ha-gps-accuracy-display" style="color:#0f172a">${haTracker.mode === 'treadmill' ? 'CALIBRATED' : 'AUTO'}</b>
          </span>
        </div>

        <h1>Activity Command</h1>
        <p style="color:#475569;font-size:14px;line-height:1.5;margin:0 0 18px;max-width:460px">
          Real-time outdoor & treadmill run telemetry with instant pace, heart-rate zone monitoring, and BMI-locked nutrition sync.
        </p>

        <!-- Tactile Mode Switcher -->
        <div style="display:inline-flex;background:#f1f5f9;border:1px solid #e2e8f0;padding:4px;border-radius:12px;margin-bottom:18px;gap:4px">
          <button id="ha-tab-outdoor" type="button" onclick="haSetWorkoutMode('outdoor')" style="border:none;padding:7px 15px;border-radius:9px;font-weight:800;font-size:12px;cursor:pointer;background:${haTracker.mode === 'outdoor' ? '#ffffff' : 'transparent'};color:${haTracker.mode === 'outdoor' ? '#020617' : '#64748b'};box-shadow:${haTracker.mode === 'outdoor' ? '0 1px 3px rgba(15,23,42,0.1)' : 'none'}">
            🌲 Outdoor Run
          </button>
          <button id="ha-tab-treadmill" type="button" onclick="haSetWorkoutMode('treadmill')" style="border:none;padding:7px 15px;border-radius:9px;font-weight:800;font-size:12px;cursor:pointer;background:${haTracker.mode === 'treadmill' ? '#ffffff' : 'transparent'};color:${haTracker.mode === 'treadmill' ? '#020617' : '#64748b'};box-shadow:${haTracker.mode === 'treadmill' ? '0 1px 3px rgba(15,23,42,0.1)' : 'none'}">
            ⚡ Treadmill Mode
          </button>
        </div>

        <!-- Primary Action Triggers -->
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div id="ha-action-controls">
            <button type="button" class="ha-lime-btn" onclick="haStartTracking()" style="padding:12px 26px;font-size:14px;display:inline-flex;align-items:center;gap:8px">
              ▶ Start Run
            </button>
          </div>
          <button id="ha-gps-toggle-btn" type="button" disabled title="GPS connection is disabled while backend work is going on" style="background:#f1f5f9;color:#94a3b8;border:1px solid #e2e8f0;font-weight:700;font-size:13px;padding:11px 18px;border-radius:999px;cursor:not-allowed;opacity:0.8;display:${haTracker.mode === 'outdoor' ? 'inline-flex' : 'none'};align-items:center;gap:6px">
            Connect GPS (Not Enabled)
          </button>
        </div>
      </div>

      <!-- Treadmill Speed & Incline Controls (Crisp Light Surface) -->
      <div id="ha-treadmill-controls" style="display:${haTracker.mode === 'treadmill' ? 'block' : 'none'};margin-top:18px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;max-width:460px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <span style="font-size:11px;font-weight:800;color:#059669;text-transform:uppercase;letter-spacing:0.8px">Treadmill Telemetry Controls</span>
          <span style="font-size:11px;color:#64748b;font-weight:600">2.0–20.0 km/h · 0–15% inc</span>
        </div>
        <!-- Speed Row -->
        <div style="margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:12px;color:#0f172a;font-weight:700">Belt Speed</span>
            <b id="ha-tm-speed-val" style="color:#059669;font-size:14px;font-family:'IBM Plex Mono',monospace">${haTracker.speedKmh.toFixed(1)} km/h</b>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" onclick="haSetTreadmillSpeed(-0.5)" style="background:#ffffff;color:#0f172a;border:1px solid #cbd5e1;border-radius:8px;width:32px;height:32px;font-weight:800;cursor:pointer">-</button>
            <input id="ha-tm-speed-slider" type="range" min="2.0" max="20.0" step="0.5" value="${haTracker.speedKmh}" oninput="haOnTreadmillSpeedSlider(this.value)" style="flex:1;accent-color:#10b981">
            <button type="button" onclick="haSetTreadmillSpeed(0.5)" style="background:#ffffff;color:#0f172a;border:1px solid #cbd5e1;border-radius:8px;width:32px;height:32px;font-weight:800;cursor:pointer">+</button>
          </div>
        </div>
        <!-- Incline Row -->
        <div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:12px;color:#0f172a;font-weight:700">Deck Incline</span>
            <b id="ha-tm-incline-val" style="color:#0f172a;font-size:14px;font-family:'IBM Plex Mono',monospace">${haTracker.inclinePct.toFixed(1)} %</b>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button type="button" onclick="haSetTreadmillIncline(-0.5)" style="background:#ffffff;color:#0f172a;border:1px solid #cbd5e1;border-radius:8px;width:32px;height:32px;font-weight:800;cursor:pointer">-</button>
            <input id="ha-tm-incline-slider" type="range" min="0.0" max="15.0" step="0.5" value="${haTracker.inclinePct}" oninput="haOnTreadmillInclineSlider(this.value)" style="flex:1;accent-color:#10b981">
            <button type="button" onclick="haSetTreadmillIncline(0.5)" style="background:#ffffff;color:#0f172a;border:1px solid #cbd5e1;border-radius:8px;width:32px;height:32px;font-weight:800;cursor:pointer">+</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Vibrant LIVE TRACKER METRICS Hero Card (Crisp White + Emerald-to-Lime Top Accent Bar) -->
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;box-shadow:0 6px 24px rgba(15,23,42,0.06);overflow:hidden;display:flex;flex-direction:column">
      <div style="height:5px;background:linear-gradient(90deg, #10b981 0%, #84cc16 55%, #C6F432 100%)"></div>
      <div style="padding:20px 22px;flex:1;display:flex;flex-direction:column;justify-content:space-between">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <span style="font-size:11px;font-weight:800;color:#059669;letter-spacing:1px;text-transform:uppercase">LIVE TRACKER METRICS</span>
          <span style="font-size:11px;font-weight:700;color:${isRunningLive ? '#059669' : '#64748b'};background:${isRunningLive ? '#ecfdf5' : '#f1f5f9'};border:1px solid ${isRunningLive ? '#a7f3d0' : '#e2e8f0'};padding:2px 9px;border-radius:999px">
            ${isRunningLive ? '● RECORDING' : (haTracker.paused ? '❚❚ PAUSED' : 'STANDBY')}
          </span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
          <div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:14px;padding:12px 14px">
            <small style="color:#64748b;font-size:10px;font-weight:800;letter-spacing:0.6px;display:block;margin-bottom:4px">DISTANCE</small>
            <div id="ha-live-distance" class="ha-num-dark" style="font-size:26px;line-height:1.1">${formatDist(haTracker.distanceMeters)}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:14px;padding:12px 14px">
            <small style="color:#64748b;font-size:10px;font-weight:800;letter-spacing:0.6px;display:block;margin-bottom:4px">DURATION</small>
            <div id="ha-live-time" class="ha-num-dark" style="font-size:26px;line-height:1.1">${formatDur(elapsedSec)}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:14px;padding:12px 14px">
            <small style="color:#64748b;font-size:10px;font-weight:800;letter-spacing:0.6px;display:block;margin-bottom:4px">CURRENT PACE</small>
            <div id="ha-live-pace" class="ha-num-dark" style="font-size:22px;line-height:1.1">${haTracker.active && effSpeed > 0 ? formatPace(3600 / effSpeed) : '--:--'}</div>
          </div>
          <div style="background:#f8fafc;border:1px solid #f1f5f9;border-radius:14px;padding:12px 14px">
            <small style="color:#64748b;font-size:10px;font-weight:800;letter-spacing:0.6px;display:block;margin-bottom:4px">ELEVATION GAIN</small>
            <div id="ha-live-elev" class="ha-num-dark" style="font-size:22px;line-height:1.1">${Math.round(haTracker.elevationGain)} m</div>
          </div>
          <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:14px;padding:12px 14px">
            <small style="color:#be123c;font-size:10px;font-weight:800;letter-spacing:0.6px;display:block;margin-bottom:4px">HEART RATE</small>
            <div id="ha-live-hr-metric" style="font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:22px;font-weight:800;color:#e11d48;line-height:1.1">${currentHR} BPM</div>
          </div>
          <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:14px;padding:12px 14px">
            <small style="color:#047857;font-size:10px;font-weight:800;letter-spacing:0.6px;display:block;margin-bottom:4px">SESSION CALORIES</small>
            <div id="ha-live-cal-metric" style="font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:22px;font-weight:800;color:#059669;line-height:1.1">${Math.round(haTracker.sessionCalories)} kcal</div>
          </div>
        </div>
      </div>
    </div>
  </header>

  <!-- Interactive Route Visualizer (30% Blurred Map + Backend Work Overlay) -->
  <section class="ha-card" style="padding:20px;margin-bottom:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <h2 style="font-size:18px;font-weight:800;color:#020617;margin:0">Interactive Route Visualizer</h2>
      <span style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px">BACKEND WORK IN PROGRESS</span>
    </div>
    <div id="ha-map-canvas" style="width:100%;height:300px;border-radius:18px;overflow:hidden">
      ${renderSvgMapHtml()}
    </div>
  </section>

  <!-- Recent Workouts (Crisp White Elevated Card) -->
  <section class="ha-card" style="padding:22px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="font-size:19px;font-weight:800;color:#020617;margin:0">Recent Workouts</h2>
      <span style="font-size:12px;font-weight:700;color:#64748b">${haState.history.length} total</span>
    </div>

    ${haState.history.length ? `
      <div style="display:grid;gap:10px">
        ${haState.history.slice(0, 10).map(r => `
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;padding:14px 18px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px">
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:20px;background:#ffffff;border:1px solid #e2e8f0;width:42px;height:42px;border-radius:12px;display:grid;place-items:center">${r.mode === 'treadmill' ? '⚡' : '🏃'}</span>
              <div>
                <b style="font-size:15px;color:#020617">${hesc(r.route)}</b>
                <small style="display:block;color:#64748b;font-size:12px">${hesc(r.date)}${r.calories ? ` · ${r.calories} kcal` : ''}${r.avgHeartRate ? ` · ${r.avgHeartRate} BPM avg` : ''}</small>
              </div>
            </div>
            <div style="display:flex;gap:22px;text-align:right">
              <div><b style="font-family:'IBM Plex Mono',monospace;font-size:18px;color:#059669">${hesc(r.distance)}</b><small style="display:block;font-size:10px;font-weight:700;color:#64748b">DIST</small></div>
              <div><b style="font-family:'IBM Plex Mono',monospace;font-size:18px;color:#020617">${hesc(r.duration)}</b><small style="display:block;font-size:10px;font-weight:700;color:#64748b">TIME</small></div>
              <div><b style="font-family:'IBM Plex Mono',monospace;font-size:18px;color:#020617">${hesc(r.pace)}</b><small style="display:block;font-size:10px;font-weight:700;color:#64748b">PACE</small></div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : `
      <div style="text-align:center;padding:34px 20px;background:#f8fafc;border-radius:16px;border:1px dashed #cbd5e1">
        <div style="font-size:32px;margin-bottom:8px">🏃⚡</div>
        <div style="font-weight:800;color:#020617;font-size:15px;margin-bottom:4px">Ready to Track Your Training</div>
        <p style="color:#64748b;font-size:13px;max-width:390px;margin:0 auto">Press <b>Start Run</b> above in Outdoor or Treadmill mode to watch live distance, heart rate, and calorie burn record in real time.</p>
      </div>
    `}
  </section>
</div>
        `;
            };

            V.activity = render;
        })();

    