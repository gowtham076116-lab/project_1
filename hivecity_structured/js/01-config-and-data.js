
        // HIVECITY Firebase web configuration. Firebase web API keys identify the project;
        // authorization is enforced by Firebase Authentication and Firestore Security Rules.
        window.HIVE_FIREBASE_CONFIG = {
            apiKey: "AIzaSyDm1OW7KxPv_y9ZziQL-HK-_4YIJjxfqpY",
            authDomain: "hivecity-32eb6.firebaseapp.com",
            projectId: "hivecity-32eb6",
            storageBucket: "hivecity-32eb6.firebasestorage.app",
            messagingSenderId: "496535782790",
            appId: "1:496535782790:web:1d886dbecaa87f41cc9807",
            measurementId: "G-V4BN1N4XZJ"
        };
        if (!firebase.apps.length) firebase.initializeApp(window.HIVE_FIREBASE_CONFIG);
        window.hiveAuth = firebase.auth();
        window.hiveDb = firebase.firestore();
        window.hiveStorage = (typeof firebase.storage === "function") ? firebase.storage() : null;
        window.hiveCurrentUser = null;
        window.hiveAuthReady = false;
        window.hiveAuthInitialStateResolved = false;

        window.hiveGetUserApiBases = function () {
            const list = [];
            const configured = window.HIVECITY_CONFIG && window.HIVECITY_CONFIG.API_BASE_URL;
            if (configured) list.push(String(configured).replace(/\/$/, ''));
            if ((location.protocol === 'http:' || location.protocol === 'https:') && location.port === '3000') list.push('');
            if (!list.includes('http://localhost:3000')) list.push('http://localhost:3000');
            if (!list.includes('http://127.0.0.1:3000')) list.push('http://127.0.0.1:3000');
            if ((location.protocol === 'http:' || location.protocol === 'https:') && !list.includes('')) list.push('');
            return list;
        };

        window.hiveSyncToGoogleSheet = async function (userData, userAuth) {
            userData = userData || {};
            try {
                const authObj = userAuth || window.hiveCurrentUser || (window.hiveAuth && window.hiveAuth.currentUser);
                if (!authObj || typeof authObj.getIdToken !== 'function') return { success: false, skipped: true };
                const idToken = await authObj.getIdToken();
                const bmiProfile = (window.hiveBmiEngine && typeof window.hiveBmiEngine.getProfile === 'function') ? window.hiveBmiEngine.getProfile() : null;
                const payload = {
                    idToken: idToken,
                    displayName: userData.displayName || userData.name || authObj.displayName || '',
                    name: userData.name || userData.displayName || authObj.displayName || '',
                    username: userData.username || (window.getHiveUsername ? window.getHiveUsername(authObj.uid) : '') || '',
                    mobile: userData.mobile || userData.phone || '',
                    phone: userData.phone || userData.mobile || '',
                    city: userData.city || '',
                    bio: userData.bio || '',
                    bmi: userData.bmi !== undefined ? userData.bmi : (bmiProfile ? bmiProfile.bmi : undefined),
                    bmiCategory: userData.bmiCategory || (bmiProfile ? bmiProfile.bmiCategory : ''),
                    dailyCalorieTarget: userData.dailyCalorieTarget !== undefined ? userData.dailyCalorieTarget : (bmiProfile ? bmiProfile.dailyCalorieTarget : undefined),
                    status: userData.status || (authObj.emailVerified ? 'Verified' : 'Pending Verification'),
                    provider: userData.provider || (authObj.providerData && authObj.providerData[0] && authObj.providerData[0].providerId) || 'password',
                    registrationDate: userData.registrationDate || (authObj.metadata && authObj.metadata.creationTime) || new Date().toISOString(),
                    lastSignIn: new Date().toISOString()
                };
                for (const base of window.hiveGetUserApiBases()) {
                    try {
                        const res = await fetch(base + '/api/users/sync', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
                            body: JSON.stringify(payload)
                        });
                        if (res.ok) return await res.json().catch(() => ({ success: true }));
                    } catch (_) { }
                }
                return { success: false };
            } catch (err) {
                console.warn('[Hivecity Sync] Token acquisition failed:', err);
                return { success: false };
            }
        };

        window.hiveSaveProfile = async function (user, extra) {
            extra = extra || {};
            let old = {};
            let isNewUser = true;
            const providerId = (user.providerData && user.providerData[0] && user.providerData[0].providerId) || 'password';
            try {
                if (window.hiveDb) {
                    const snap = await window.hiveDb.collection('users').doc(user.uid).get();
                    isNewUser = !snap.exists;
                    old = snap.exists ? (snap.data() || {}) : {};
                }
            } catch (_) { }
            const profile = {
                uid: user.uid,
                name: user.displayName || extra.name || old.name || '',
                email: user.email || old.email || '',
                mobile: (extra.mobile !== undefined) ? extra.mobile : (old.mobile || null),
                city: (extra.city !== undefined) ? extra.city : (old.city || ''),
                photoURL: user.photoURL || old.photoURL || null,
                provider: old.provider || providerId,
                status: user.emailVerified ? 'Active' : 'Pending Verification',
                emailVerified: Boolean(user.emailVerified),
                lastLoginAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (isNewUser) profile.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            try {
                if (window.hiveDb) await window.hiveDb.collection('users').doc(user.uid).set(profile, { merge: true });
            } catch (_) { }
            try { await window.hiveSyncToGoogleSheet(profile, user); } catch (_) { }
            return {
                uid: profile.uid,
                name: profile.name,
                email: profile.email,
                mobile: profile.mobile || '',
                city: profile.city || '',
                photoURL: profile.photoURL || '',
                provider: profile.provider
            };
        };

        window.hiveSignOut = async function () {
            try {
                if (typeof sh0 === 'function') sh0();
                const sh = document.getElementById('sh');
                if (sh) sh.innerHTML = '';
                sessionStorage.removeItem('hivecityUser');
                window.hiveCurrentUser = null;
                location.hash = 'auth';
                if (typeof go === 'function') go();
                await window.hiveAuth.signOut();
            } catch (err) {
                console.error('HIVECITY sign-out failed:', err);
                if (typeof sh0 === 'function') sh0();
                const sh = document.getElementById('sh');
                if (sh) sh.innerHTML = '';
                sessionStorage.removeItem('hivecityUser');
                window.hiveCurrentUser = null;
                location.hash = 'auth';
                if (typeof go === 'function') go();
            }
        };
    


        const IM = { "3": "./assets/images/extracted-img-001.webp", "4": "./assets/images/extracted-img-002.webp", "5": "./assets/images/extracted-img-003.webp", "6": "./assets/images/extracted-img-004.webp", "7": "./assets/images/extracted-img-005.webp", "8": "./assets/images/extracted-img-006.webp", "9": "./assets/images/extracted-img-007.webp", "10": "./assets/images/extracted-img-008.webp", "11": "./assets/images/extracted-img-009.webp", "12": "./assets/images/extracted-img-010.webp", "13": "./assets/images/extracted-img-011.webp", "14": "./assets/images/extracted-img-012.webp", "15": "./assets/images/extracted-img-013.webp", "16": "./assets/images/extracted-img-014.webp", "17": "./assets/images/extracted-img-015.webp", "18": "./assets/images/extracted-img-016.webp", "19": "./assets/images/extracted-img-017.webp", "20": "./assets/images/extracted-img-018.webp", "21": "./assets/images/extracted-img-019.webp", "22": "./assets/images/extracted-img-020.webp", "23": "./assets/images/extracted-img-021.webp", "24": "./assets/images/extracted-img-022.webp", "25": "./assets/images/extracted-img-023.webp", "26": "./assets/images/extracted-img-024.webp", "27": "./assets/images/extracted-img-025.webp", "28": "./assets/images/extracted-img-026.webp", "29": "./assets/images/extracted-img-027.webp", "32": "./assets/images/extracted-img-028.webp", "33": "./assets/images/extracted-img-029.webp", "36": "./assets/images/extracted-img-030.webp", "37": "./assets/images/extracted-img-031.webp", "38": "./assets/images/extracted-img-032.webp", "39": "./assets/images/extracted-img-033.webp", "40": "./assets/images/extracted-img-034.webp", "41": "./assets/images/extracted-img-035.webp", "42": "./assets/images/extracted-img-036.webp", "43": "./assets/images/extracted-img-037.webp", "44": "./assets/images/extracted-img-038.webp", "45": "./assets/images/extracted-img-039.webp", "46": "./assets/images/extracted-img-040.webp", "47": "./assets/images/extracted-img-041.webp", "49": "./assets/images/extracted-img-042.webp", "51": "./assets/images/extracted-img-043.webp", "52": "./assets/images/extracted-img-044.webp", "53": "./assets/images/extracted-img-045.webp", "56": "./assets/images/extracted-img-046.webp", "57": "./assets/images/extracted-img-047.webp", "58": "./assets/images/extracted-img-048.webp", "61": "./assets/images/extracted-img-049.webp", "62": "./assets/images/extracted-img-050.webp", "63": "./assets/images/extracted-img-051.webp", "64": "./assets/images/extracted-img-052.webp", "65": "./assets/images/extracted-img-053.webp", "78": "./assets/images/extracted-img-054.webp", "81": "./assets/images/extracted-img-055.webp", "82": "./assets/images/extracted-img-056.webp", "83": "./assets/images/extracted-img-057.webp", "84": "./assets/images/extracted-img-058.webp", "85": "./assets/images/extracted-img-059.webp", "86": "./assets/images/extracted-img-060.webp", "87": "./assets/images/extracted-img-061.webp", "88": "./assets/images/extracted-img-062.webp", "89": "./assets/images/extracted-img-063.webp", "90": "./assets/images/extracted-img-064.webp", "91": "./assets/images/extracted-img-065.webp", "92": "./assets/images/extracted-img-066.webp", "93": "./assets/images/extracted-img-067.webp", "94": "./assets/images/extracted-img-068.webp", "95": "./assets/images/extracted-img-069.webp", "96": "./assets/images/extracted-img-070.webp", "97": "./assets/images/extracted-img-071.webp" }; const AV = { "4": "./assets/images/extracted-img-072.webp", "5": "./assets/images/extracted-img-073.webp", "25": "./assets/images/extracted-img-074.webp", "26": "./assets/images/extracted-img-075.webp", "27": "./assets/images/extracted-img-076.webp", "28": "./assets/images/extracted-img-077.webp", "29": "./assets/images/extracted-img-078.webp", "32": "./assets/images/extracted-img-079.webp", "33": "./assets/images/extracted-img-080.webp", "36": "./assets/images/extracted-img-081.webp", "40": "./assets/images/extracted-img-082.webp", "86": "./assets/images/extracted-img-083.webp", "90": "./assets/images/extracted-img-084.webp", "92": "./assets/images/extracted-img-085.webp", "93": "./assets/images/extracted-img-086.webp", "91": "./assets/images/extracted-img-087.webp", "95": "./assets/images/extracted-img-088.webp", "96": "./assets/images/extracted-img-089.webp", "97": "./assets/images/extracted-img-090.webp" }; const FI = { "1f34c": "./assets/images/extracted-img-091.svg", "1f34e": "./assets/images/extracted-img-092.svg", "1f353": "./assets/images/extracted-img-093.svg", "1f951": "./assets/images/extracted-img-094.svg", "1f966": "./assets/images/extracted-img-095.svg", "1f955": "./assets/images/extracted-img-096.svg", "1f345": "./assets/images/extracted-img-097.svg", "1f96c": "./assets/images/extracted-img-098.svg", "1f35e": "./assets/images/extracted-img-099.svg", "1f35a": "./assets/images/extracted-img-100.svg", "1f35d": "./assets/images/extracted-img-101.svg", "1f954": "./assets/images/extracted-img-102.svg", "1f33d": "./assets/images/extracted-img-103.svg", "1f95a": "./assets/images/extracted-img-104.svg", "1f357": "./assets/images/extracted-img-105.svg", "1f41f": "./assets/images/extracted-img-106.svg", "1f969": "./assets/images/extracted-img-107.svg", "1fad8": "./assets/images/extracted-img-108.svg", "1f95c": "./assets/images/extracted-img-109.svg", "1f95b": "./assets/images/extracted-img-110.svg", "1f9c0": "./assets/images/extracted-img-111.svg", "1f9c8": "./assets/images/extracted-img-112.svg", "1fad2": "./assets/images/extracted-img-113.svg", "1f36f": "./assets/images/extracted-img-114.svg", "1f36b": "./assets/images/extracted-img-115.svg" }; const I = n => IM[n];
        const R = [['discover', 'Home'], ['community', 'Social'], ['activity', 'Activity'], ['events', 'Events'], ['profile', 'Profile'], ['nutrition', 'Nutrition'], ['shop', 'Shop'], ['bookings', 'Overview'], ['notifications', 'Notifications'], ['help', 'Help']];
        const USD_TO_INR_SAMPLE_RATE = 93.41; const money = n => '₹' + Math.round(Number(n || 0) * USD_TO_INR_SAMPLE_RATE).toLocaleString('en-IN'); const rupees = n => '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN');
        const P = [];
        window.isVerifiedDirectProductUrl = function (rawUrl) {
            const s = String(rawUrl || '').trim();
            if (!s || s === '#' || !/^https?:\/\//i.test(s)) return false;
            try {
                const u = new URL(s);
                const host = u.hostname.toLowerCase();
                const full = (u.pathname + u.search).toLowerCase();
                if ((host.includes('amazon.') && (u.pathname === '/s' || u.pathname.startsWith('/s/') || u.searchParams.has('k'))) ||
                    (host.includes('flipkart.') && (u.pathname.startsWith('/search') || u.searchParams.has('q')))) {
                    return false;
                }
                return /\/dp\/[a-z0-9]{10}/i.test(full) ||
                    /\/gp\/product\/[a-z0-9]{10}/i.test(full) ||
                    host.includes('amzn.to') ||
                    host.includes('amzn.in') ||
                    host.includes('link.amazon') ||
                    /\/p\/itm/i.test(full);
            } catch (_) {
                return false;
            }
        };
        window.handleHiveShopImgError = function (imgEl, fallbackKey) {
            if (!imgEl) return;
            if (!imgEl.dataset.shopFb && fallbackKey && typeof I === 'function' && I(fallbackKey)) {
                imgEl.dataset.shopFb = '1';
                imgEl.src = I(fallbackKey);
                return;
            }
            imgEl.onerror = null;
            imgEl.src = './assets/images/recipe-placeholder.jpeg';
        };
        let EV = [];
        const F = [['Breakfast', 'Avocado toast & egg bowl', 12, 420], ['Lunch', 'Grain & chickpea bowl', 11, 560], ['Dinner', 'Veggie power bowl', 10, 480], ['Snack', 'Fruit & nut plate', 21, 200]];
        let S = { cart: {}, wish: {}, bk: {}, meals: {}, water: 0, q: '', cat: 'All', sort: 'rel', th: null, run: { t: 0, on: 0, d: 0, id: 0 } };
        try { Object.assign(S, JSON.parse(localStorage.getItem('hv') || '{}')); S.run = { t: 0, on: 0, d: 0, id: 0 } } catch (e) { }
        const sv = () => { try { localStorage.setItem('hv', JSON.stringify({ cart: S.cart, wish: S.wish, bk: S.bk, meals: S.meals, water: S.water, th: S.th })) } catch (e) { } };
        if (S.th) document.documentElement.dataset.theme = S.th;
        const $ = s => document.querySelector(s), app = $('#app');
        function toast(m) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.append(t); setTimeout(() => t.remove(), 2200) }
        function theme() { const d = matchMedia('(prefers-color-scheme:dark)').matches; const cur = document.documentElement.dataset.theme || (d ? 'dark' : 'light'); S.th = cur == 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = S.th; sv() }
        const cnt = () => {
            if (typeof window.getHiveWishlistItems === 'function') return window.getHiveWishlistItems().length;
            return Object.keys(S.wish || {}).filter(k => Boolean(S.wish[k])).length;
        };
        function chrome(h) {
            const sp = h == '' || h == 'auth'; $('#nav').innerHTML = sp ? '' : `<nav class="top"><button class="avb" onclick="location.hash='discover'" aria-label="HIVE CITY Home" style="background:#000;border-color:#000"><img src="./assets/images/hivecity-logo-round.png" alt="HIVE CITY" style="width:100%;height:100%;object-fit:contain;border-radius:9999px;background:#000;display:block"></button><b>HIVE CITY</b>${R.map(([r, l]) => `<a href="#${r}" class="${h == r ? 'on' : ''} ${['discover', 'shop', 'bookings', 'notifications', 'help', 'profile'].includes(r) ? 'keep' : ''}">${l}${r == 'bookings' && cnt() ? ' (' + cnt() + ')' : ''}</a>`).join('')}<button class="chip" onclick="theme()" aria-label="Toggle theme">◐</button></nav>`;
            $('#bn').innerHTML = sp ? '' : `<nav class="bot">${['discover', 'community', 'activity', 'events', 'profile'].map(r => `<a href="#${r}" class="${h == r ? 'on' : ''}">${R.find(x => x[0] == r)[1]}</a>`).join('')}<a href="#shop">Shop</a></nav>`
        }
        const V = {
            '': () => `<div class="splash"><div><svg width="120" height="120" viewBox="0 0 100 100"><path d="M50 6 90 28V72L50 94 10 72V28Z"/><path d="M30 62V38M70 62V38M30 50H70"/></svg><div class="big" style="font-size:72px;margin-top:10px">HIVE CITY</div><p class="it" style="color:#C7F36B">Move · Connect · Live</p><div class="bar" style="width:160px;margin:14px auto"><i style="width:0;animation:ld 2.2s forwards"></i></div></div></div><style>@keyframes ld{to{width:100%}}</style>`,
            auth: () => `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));min-height:80vh"><div class="hero" style="min-height:300px"><img src="${I(92)}" alt="Two runners smiling during a race"><div><h1 class="big">Find your pace</h1></div></div><form class="card" id="af" style="align-self:center" novalidate><h2>Welcome to the Hive</h2><p class="it">Sign in or join.</p><p><input type="text" id="em" placeholder="Email address" aria-label="Email address" autocomplete="username"></p><p><input type="password" id="pw" placeholder="Password (8+ chars)" aria-label="Password"></p><p id="er" style="color:#d33;min-height:20px;margin:0"></p><button class="btn" id="go">Sign in</button> <a class="btn g" href="#discover">Browse as guest</a></form></div>`,
            discover: () => `<div class="hero"><img src="${I(3)}" alt="Group of runners at a race"><div><p class="it" style="color:#C7F36B">More than a run. A community in motion.</p><h1 class="big">Find your pace</h1><p class="row"><a class="btn" href="#activity">JOIN THE HIVE</a><a class="btn g" style="color:#fff" href="#community">EXPLORE THE MOVEMENT</a></p></div></div>
<h2 style="margin-top:36px" class="big">Your only competition is who you were yesterday</h2><div class="grid">${[['Track', 'activity', 89, 'Live GPS, pace, goals'], ['Eat', 'nutrition', 15, 'Macros, meals, water'], ['Connect', 'community', 97, 'Stories & groups'], ['Gather', 'events', 93, 'Runs & experiences'], ['Gear up', 'shop', 61, 'Sports marketplace']].map(x => `<a class="card" href="#${x[1]}" style="text-decoration:none"><div class="clip"><img class="p" src="${I(x[2])}" alt="${x[0]}"></div><h3 style="margin-top:10px">${x[0]}</h3><span style="color:var(--mu)">${x[3]}</span></a>`).join('')}</div>
<div class="row" style="margin:40px 0;justify-content:center;text-align:center"><div><p class="big">THE CITY IS MOVING.</p><p class="big it">ARE YOU?</p><a class="btn" href="#events">JOIN HIVE CITY</a></div></div>`,
            community: () => `<h1 class="big">Community</h1><div class="row" style="margin:12px 0">${[90, 4, 5, 92, 96].map((n, i) => `<button class="chip" style="padding:3px;border:3px solid var(--hl);border-radius:50%;width:64px;height:64px" onclick="toast('Story viewer')"><img src="${I(n)}" alt="Story ${i + 1}" style="width:100%;height:100%;border-radius:50%;object-fit:cover"></button>`).join('')}</div>
<div class="grid">${[[3, 'Sunday long run crew'], [91, 'Early road session'], [97, 'Autumn trail group'], [5, 'Finish-line energy']].map(([n, t], i) => `<div class="card"><div class="clip" ondblclick="this.nextElementSibling.click()"><img class="p" src="${I(n)}" alt="${t}"></div><div class="row" style="margin-top:8px"><button class="chip" onclick="this.classList.toggle('on');this.textContent=this.classList.contains('on')?'♥ 1':'♡ Like'">♡ Like</button><button class="chip" onclick="toast('Saved')">Save</button></div><p>${t}</p></div>`).join('')}</div>`,
            activity: () => {
                const g = [['Distance (km)', .6], ['Active min', .4], ['Steps', .7]]; return `<h1 class="big">Activity</h1><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="map"><svg viewBox="0 0 400 300" width="100%" height="100%" role="img" aria-label="Route map"><rect width="400" height="300" fill="var(--bd)" opacity=".35"/><path d="M20 250C90 200 120 260 190 180S300 120 380 40" stroke="var(--ac)" stroke-width="5" fill="none" stroke-dasharray="600" style="animation:dr 3s forwards"/><circle class="pulse" cx="190" cy="180" r="9" fill="var(--ac)"/></svg><p style="position:absolute;left:12px;bottom:4px" class="tag">Google Maps needs your API key — see notes</p></div>
<div class="card"><div class="num" style="font-size:44px" id="tm">00:00:00</div><div class="row num"><span>DIST <b id="ds">0.00</b> km</span><span>PACE <b id="pc">--:--</b> /km</span></div><p class="row"><button class="btn" id="st">Start</button><button class="btn g" id="fn">Finish</button></p><span class="tag">Distance uses your device GPS; heart rate needs a paired wearable.</span></div></div>
<h2 style="margin-top:24px">Today's workout</h2><div class="grid">${['Warm-up 10 min', 'Intervals 5×3 min', 'Cool-down & stretch'].map((t, i) => `<label class="card row" style="cursor:pointer"><input class="ck wk" type="checkbox"><span>${t}</span></label>`).join('')}<div class="card row"><div class="ring" id="wr"><i class="num" id="wp">0%</i></div></div></div>`
            },
            nutrition: () => '<h1 class="big">Nutrition</h1>',
            shop: () => {
                S.cat = 'All';
                const allShopProducts = typeof window.getAllShopProducts === 'function' ? window.getAllShopProducts() : [];
                const escShop = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
                const priceInr = p => (p.prInr !== undefined && p.prInr !== null && Number(p.prInr) > 0) ? Number(p.prInr) : Math.round(Number(p.pr || 0) * USD_TO_INR_SAMPLE_RATE);
                const selectedProductId = typeof window.getSelectedShopProductId === 'function' ? window.getSelectedShopProductId() : '';
                let L = [];
                if (selectedProductId) {
                    const directMatch = allShopProducts.find(p => String(p.id) === String(selectedProductId));
                    const fallbackWish = !directMatch && typeof window.getHiveWishlistItems === 'function'
                        ? window.getHiveWishlistItems().find(p => String(p.id) === String(selectedProductId))
                        : null;
                    if (directMatch || fallbackWish) {
                        L = [directMatch || fallbackWish];
                    } else {
                        L = allShopProducts;
                    }
                } else {
                    L = allShopProducts.filter(p => (p.n + ' ' + (p.b || '') + ' ' + (p.description || '') + ' ' + p.c).toLowerCase().includes((S.q || '').toLowerCase()));
                    if (S.sort == 'lo') L = [...L].sort((a, b) => priceInr(a) - priceInr(b));
                    if (S.sort == 'hi') L = [...L].sort((a, b) => priceInr(b) - priceInr(a));
                }
                const filterBanner = selectedProductId ? `<div class="row" style="margin:0 0 12px;align-items:center"><button type="button" class="chip on" onclick="window.clearShopProductFilter()">← Show All Products</button></div>` : '';
                return `<h1 class="big">Hive Market</h1><div class="row" style="margin:0 0 14px;gap:10px;align-items:center"><input type="search" id="q" style="flex:1;min-width:200px" placeholder="Search shoes, headbands, gym shorts…" value="${escShop(S.q)}" aria-label="Search"><select id="so" style="width:auto" aria-label="Sort"><option value="rel">Relevance</option><option value="lo" ${S.sort == 'lo' ? 'selected' : ''}>Price: low to high</option><option value="hi" ${S.sort == 'hi' ? 'selected' : ''}>Price: high to low</option></select></div>${filterBanner}<div class="grid">${L.map(p => {
                    const imgSrc = p.imageUrl ? escShop(p.imageUrl) : (p.im ? I(p.im) : '');
                    const outOfStock = p.isLiveProduct && Number(p.stock || 0) <= 0;
                    const stockBadgeHtml = p.isLiveProduct ? `<span class="tag">${outOfStock ? 'OUT OF STOCK' : `IN STOCK · ${Number(p.stock)}`}</span>` : '';
                    const displayPrice = rupees(priceInr(p));
                    const isSaved = typeof window.isProductWishlisted === 'function' ? window.isProductWishlisted(p.id) : Boolean(S.wish[p.id]);
                    const buyBtn = `<button type="button" class="btn" data-buy="${escShop(p.id)}" ${outOfStock ? 'disabled' : ''} style="background:#1B4D3E;color:#fff;font-weight:700;border-radius:999px;padding:9px 18px">${outOfStock ? 'Out of stock' : 'Buy Now'}</button>`;
                    return `<div class="card" data-shop-product-id="${escShop(p.id)}"><div class="clip">${imgSrc ? `<img class="p" loading="lazy" src="${imgSrc}" alt="${escShop(p.n)}" onerror="window.handleHiveShopImgError(this,${Number(p.im) || 0})">` : `<div class="p" style="display:grid;place-items:center;background:var(--bd);font-size:44px">🛍️</div>`}</div>${stockBadgeHtml}<h3 style="margin:8px 0 2px;font-size:16px">${escShop(p.n)}</h3><span style="color:var(--mu)">${escShop(p.b)} · ${escShop(p.c)}</span>${p.description ? `<p style="margin:6px 0 0;font-size:12px;color:var(--mu);line-height:1.4">${escShop(p.description)}</p>` : ''}<p class="num"><b>${displayPrice}</b></p><div class="row" style="align-items:center;gap:10px">${buyBtn}<button class="chip ${isSaved ? 'on' : ''}" data-w="${escShop(p.id)}" aria-label="Wishlist">${isSaved ? '♥' : '♡'}</button></div></div>`;
                }).join('') || '<p>No products match.</p>'}</div>`;
            },
            events: () => `<h1 class="big">Events</h1><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"><div class="map"><svg viewBox="0 0 400 300" width="100%" height="100%" role="img" aria-label="Event map"><rect width="400" height="300" fill="var(--bd)" opacity=".35"/>${[[90, 80], [220, 150], [300, 220]].map(p => `<circle class="pulse" cx="${p[0]}" cy="${p[1]}" r="8" fill="var(--ac)"/>`).join('')}</svg></div><div style="display:grid;gap:12px">${EV.map(e => `<div class="card row"><img class="p" style="width:120px;aspect-ratio:1" src="${I(e.im)}" alt="${e.n}"><div style="flex:1"><span class="tag">${e.c}</span><h3>${e.n}</h3>${e.d} · ${e.v}<br><span class="num">${e.pr ? '$' + e.pr : 'Free'} · ${e.sl} slots</span><p><button class="btn" data-e="${e.id}">Get ticket</button></p></div></div>`).join('')}</div></div>`,
            bookings: () => '<h1 class="big">Overview</h1>',
            profile: () => `<div class="row" style="gap:18px"><img src="${I(90)}" alt="Profile" style="width:110px;height:110px;border-radius:50%;object-fit:cover"><div><h1 class="big">Your profile</h1><span class="tag">Member</span></div></div><div class="grid" style="margin-top:18px">${[['Runs', '0'], ['Distance', '0 km'], ['Badges', '0']].map(s => `<div class="card"><div class="num" style="font-size:34px">${s[1]}</div>${s[0]}</div>`).join('')}</div><p style="color:var(--mu)">Stats fill from real tracked activity once you sign in.</p><button class="btn g" onclick="hiveSignOut()">Log out</button>`,
            admin: () => `<h1 class="big">Admin</h1><p class="tag">Needs role-based login in production.</p><div class="grid">${[['Products', P.length], ['Events', EV.length], ['Members', 0], ['Open orders', cnt()]].map(s => `<div class="card"><div class="num" style="font-size:32px">${s[1]}</div>${s[0]}</div>`).join('')}</div><div class="card" style="margin-top:14px;overflow-x:auto"><table><tr><th>Event</th><th>Date</th><th>Slots</th></tr>${EV.map(e => `<tr><td>${e.n}</td><td>${e.d}</td><td class="num">${e.sl}</td></tr>`).join('')}</table></div>`
        };
        function wire(h) {
            if (h == '') { setTimeout(() => { if (location.hash == '' || location.hash == '#') location.hash = 'auth' }, 2600) }

            if (h == 'auth') {
                const form = $('#af');
                const error = $('#er');
                const submit = $('#go');
                const googleButton = $('#googleSignIn');
                let registerMode = false;

                function showError(message, success) {
                    error.style.color = success ? 'green' : '#d33';
                    error.textContent = message;
                }

                function friendlyAuthError(err) {
                    const code = err && err.code;
                    const messages = {
                        'auth/email-already-in-use': 'An account with this email already exists. Please sign in.',
                        'auth/invalid-email': 'Enter a valid email address.',
                        'auth/weak-password': 'Choose a stronger password with at least 8 characters.',
                        'auth/user-not-found': 'No account was found for this email.',
                        'auth/wrong-password': 'The email or password is incorrect.',
                        'auth/invalid-credential': 'The email or password is incorrect.',
                        'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
                        'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
                        'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups and try again.',
                        'auth/unauthorized-domain': 'This domain is not authorized in Firebase Authentication. Add localhost under Authorized domains.',
                        'auth/network-request-failed': 'Network error. Check your internet connection and try again.'
                    };
                    return messages[code] || (err && err.message) || 'Authentication failed. Please try again.';
                }

                function setAuthMode(register) {
                    registerMode = register;
                    $('#registerFields').style.display = register ? 'block' : 'none';
                    $('#loginFields').style.display = register ? 'none' : 'block';
                    form.querySelector('#pw').parentElement.style.display = '';
                    submit.style.display = '';
                    googleButton.style.display = '';
                    const forgotWrap = $('#forgotPwWrap');
                    if (forgotWrap) forgotWrap.style.display = register ? 'none' : '';
                    const verifyHint = $('#regVerifyHint');
                    if (verifyHint) verifyHint.style.display = register && $('#regEmail') && $('#regEmail').value.trim() ? '' : 'none';
                    $('#authTitle').textContent = register ? 'Create your Hive Account' : 'Welcome to the Hive';
                    $('#authSubtitle').textContent = register ? 'Verify your email to join.' : 'Sign in to continue your journey.';
                    submit.textContent = register ? 'Create Account' : 'Sign in';
                    $('#authMode').textContent = register ? 'Already have an account? Sign in' : 'Create an account';
                    $('#pw').autocomplete = register ? 'new-password' : 'current-password';
                    $('#pw').value = '';
                    showError('');
                }

                const regEmailInput = $('#regEmail');
                if (regEmailInput) {
                    regEmailInput.addEventListener('input', () => {
                        const hint = $('#regVerifyHint');
                        if (hint) hint.style.display = registerMode && regEmailInput.value.trim() ? '' : 'none';
                    });
                }

                const forgotBtn = $('#forgotPwBtn');
                if (forgotBtn) {
                    forgotBtn.onclick = async (e) => {
                        if (e) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                        const email = ($('#em')?.value || '').trim().toLowerCase();
                        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                            showError('Please enter your registered email address first, then click Forgot Password.');
                            return;
                        }
                        forgotBtn.disabled = true;
                        window._hivePasswordResetPending = true;
                        try { sessionStorage.setItem('hivePasswordResetPending', email); } catch (_) { }
                        try {
                            window.hiveCurrentUser = null;
                            sessionStorage.removeItem('hivecityUser');
                            if (window.hiveAuth && window.hiveAuth.currentUser) {
                                try { await window.hiveAuth.signOut(); } catch (_) { }
                            }
                            await window.hiveAuth.sendPasswordResetEmail(email);
                            if ($('#pw')) $('#pw').value = '';
                            if (location.hash !== '#auth') location.hash = 'auth';
                            showError('Password reset link sent to ' + email + '. Please check your inbox, reset your password, and then sign in with your new password.', true);
                        } catch (err) {
                            window._hivePasswordResetPending = false;
                            try { sessionStorage.removeItem('hivePasswordResetPending'); } catch (_) { }
                            showError(friendlyAuthError(err));
                        } finally {
                            forgotBtn.disabled = false;
                        }
                    };
                }

                async function checkUserBlockedStatus(uid, timeoutMs) {
                    if (!uid) return false;
                    const maxWait = Number(timeoutMs) > 0 ? Number(timeoutMs) : 700;
                    const fsCheck = (async () => {
                        try {
                            if (window.hiveDb) {
                                const snap = await window.hiveDb.collection('users').doc(uid).get();
                                if (snap.exists) {
                                    const d = snap.data() || {};
                                    if (d.blocked === true || String(d.status || '').toLowerCase() === 'blocked') return true;
                                }
                            }
                        } catch (_) { }
                        return false;
                    })();
                    const apiCheck = (async () => {
                        try {
                            const bases = typeof window.hiveGetUserApiBases === 'function' ? window.hiveGetUserApiBases() : ['http://localhost:3000'];
                            const primaryBase = bases[0];
                            if (primaryBase !== undefined) {
                                const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
                                const timer = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch (_) { } }, maxWait) : null;
                                try {
                                    const res = await fetch(primaryBase + '/api/users/' + encodeURIComponent(uid) + '/access-status', {
                                        cache: 'no-store',
                                        signal: ctrl ? ctrl.signal : undefined
                                    });
                                    if (res.ok) {
                                        const data = await res.json();
                                        if (data && data.blocked) return true;
                                    }
                                } catch (_) { }
                                finally { if (timer) clearTimeout(timer); }
                            }
                        } catch (_) { }
                        return false;
                    })();
                    const raceChecks = Promise.all([fsCheck, apiCheck]).then(([a, b]) => Boolean(a || b));
                    const timerFallback = new Promise(resolve => setTimeout(() => resolve(false), maxWait));
                    return Promise.race([raceChecks, timerFallback]);
                }

                async function finishSignIn(user) {
                    if (!user.emailVerified) {
                        try { await user.reload(); } catch (_) { }
                    }
                    if (!user.emailVerified) {
                        try { await user.sendEmailVerification(); } catch (e) { console.warn('Verification email resend failed:', e); }
                        window.hiveCurrentUser = null;
                        sessionStorage.removeItem('hivecityUser');
                        await window.hiveAuth.signOut();
                        showError('Please verify your email before logging in');
                        return;
                    }
                    const isBlocked = await checkUserBlockedStatus(user.uid, 650);
                    if (isBlocked) {
                        window.hiveCurrentUser = null;
                        sessionStorage.removeItem('hivecityUser');
                        await window.hiveAuth.signOut();
                        showError('Your account has been blocked by the administrator');
                        return;
                    }
                    window._hivePasswordResetPending = false;
                    try { sessionStorage.removeItem('hivePasswordResetPending'); } catch (_) { }
                    window.hiveCurrentUser = user;
                    // Attach live Firestore watcher to immediately sign out if Admin blocks active session
                    if (window.hiveDb && user.uid) {
                        try {
                            if (typeof window._hiveBlockUnsub === 'function') window._hiveBlockUnsub();
                            window._hiveBlockUnsub = window.hiveDb.collection('users').doc(user.uid).onSnapshot(snap => {
                                const d = snap && snap.exists ? (snap.data() || {}) : {};
                                if (d.blocked === true || String(d.status || '').toLowerCase() === 'blocked') {
                                    window.hiveCurrentUser = null;
                                    window.hiveAuth.signOut().catch(() => { });
                                    sessionStorage.removeItem('hivecityUser');
                                    toast('Your account has been blocked by the administrator');
                                    location.hash = 'auth';
                                }
                            }, () => { });
                        } catch (_) { }
                    }
                    const pendingMobile = sessionStorage.getItem('hivePendingMobile');
                    const extra = pendingMobile ? { mobile: '+91' + pendingMobile } : {};
                    const quickProfile = {
                        uid: user.uid,
                        name: user.displayName || '',
                        email: user.email || '',
                        mobile: pendingMobile ? ('+91' + pendingMobile) : null,
                        photoURL: user.photoURL || null,
                        emailVerified: true,
                        status: 'Active'
                    };
                    sessionStorage.setItem('hivecityUser', JSON.stringify(quickProfile));
                    sessionStorage.removeItem('hivePendingMobile');
                    // Navigate immediately (~1s total login) and sync Firestore + Google Sheets in background
                    location.hash = 'community';
                    Promise.resolve()
                        .then(() => window.hiveSaveProfile(user, extra))
                        .then(profile => {
                            if (profile) {
                                try { sessionStorage.setItem('hivecityUser', JSON.stringify(profile)); } catch (_) { }
                            }
                            if (typeof window.hiveSyncToGoogleSheet === 'function') {
                                return window.hiveSyncToGoogleSheet(Object.assign({}, profile || quickProfile, { status: 'Verified' }), user);
                            }
                        })
                        .catch(() => { });
                }

                $('#authMode').onclick = () => setAuthMode(!registerMode);

                googleButton.onclick = async () => {
                    googleButton.disabled = true;
                    showError('');
                    window._hivePasswordResetPending = false;
                    try { sessionStorage.removeItem('hivePasswordResetPending'); } catch (_) { }
                    try {
                        const provider = new firebase.auth.GoogleAuthProvider();
                        provider.setCustomParameters({ prompt: 'select_account' });
                        const credential = await window.hiveAuth.signInWithPopup(provider);
                        await finishSignIn(credential.user);
                    } catch (err) { showError(friendlyAuthError(err)); }
                    finally { googleButton.disabled = false; }
                };

                form.onsubmit = async e => {
                    e.preventDefault();
                    showError('');
                    const password = $('#pw').value;
                    if (password.length < 8 || password.length > 128) {
                        showError('Password must contain 8 to 128 characters.');
                        return;
                    }
                    submit.disabled = true;
                    submit.textContent = registerMode ? 'Creating account…' : 'Signing in…';
                    try {
                        if (registerMode) {
                            const name = $('#fullName').value.trim();
                            const email = $('#regEmail').value.trim().toLowerCase();
                            const mobileInput = $('#regMobile').value.replace(/\D/g, '');
                            const mobile = mobileInput.length === 12 && mobileInput.startsWith('91') ? mobileInput.slice(2) : mobileInput;
                            if (!name || !email || !mobile) throw new Error('Please fill in all registration fields.');
                            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
                            if (!/^[6-9]\d{9}$/.test(mobile)) throw new Error('Enter a valid 10-digit Indian mobile number.');
                            const credential = await window.hiveAuth.createUserWithEmailAndPassword(email, password);
                            await credential.user.updateProfile({ displayName: name });
                            await window.hiveSaveProfile(credential.user, { name, mobile: '+91' + mobile });
                            await credential.user.sendEmailVerification();
                            try { await window.hiveSyncToGoogleSheet({ displayName: name, mobile: '+91' + mobile, status: 'Pending Verification', provider: 'password' }, credential.user); } catch (_) { }
                            sessionStorage.setItem('hivePendingMobile', mobile);
                            window.hiveCurrentUser = null;
                            sessionStorage.removeItem('hivecityUser');
                            await window.hiveAuth.signOut();
                            $('#em').value = email;
                            setAuthMode(false);
                            showError('Account created! Please check your email inbox and click the verification link before signing in.', true);
                        } else {
                            const email = $('#em').value.trim().toLowerCase();
                            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter the email address you registered with.');
                            window._hivePasswordResetPending = false;
                            try { sessionStorage.removeItem('hivePasswordResetPending'); } catch (_) { }
                            const credential = await window.hiveAuth.signInWithEmailAndPassword(email, password);
                            await finishSignIn(credential.user);
                        }
                    } catch (err) { showError(friendlyAuthError(err)); }
                    finally {
                        submit.disabled = false;
                        if (submit.style.display !== 'none') submit.textContent = registerMode ? 'Create Account' : 'Sign in';
                    }
                };

                const pendingResetEmail = sessionStorage.getItem('hivePasswordResetPending');
                if (pendingResetEmail) {
                    if ($('#em') && !$('#em').value) $('#em').value = pendingResetEmail;
                    showError('Password reset link sent to ' + pendingResetEmail + '. Please check your inbox, reset your password, and then sign in with your new password.', true);
                } else if (window.hiveCurrentUser && window.hiveCurrentUser.emailVerified && !window._hivePasswordResetPending) {
                    finishSignIn(window.hiveCurrentUser).catch(err => showError(friendlyAuthError(err)));
                }
            }

            if (h == 'activity') {
                const w = [...document.querySelectorAll('.wk')]; w.forEach(c => c.onchange = () => { const v = Math.round(w.filter(x => x.checked).length / w.length * 100); $('#wr').style.setProperty('--v', v); $('#wp').textContent = v + '%' });
                const f = n => String(n).padStart(2, '0'), u = () => { const t = S.run.t; $('#tm').textContent = f(t / 3600 | 0) + ':' + f(t / 60 % 60 | 0) + ':' + f(t % 60); $('#ds').textContent = S.run.d.toFixed(2); if (S.run.d > .05) $('#pc').textContent = f(t / S.run.d / 60 | 0) + ':' + f(t / S.run.d % 60 | 0) };
                $('#st').onclick = () => { if (S.run.on) { S.run.on = 0; clearInterval(S.run.id); navigator.geolocation && S.run.w != null && navigator.geolocation.clearWatch(S.run.w); $('#st').textContent = 'Resume' } else { S.run.on = 1; $('#st').textContent = 'Pause'; S.run.id = setInterval(() => { S.run.t++; u() }, 1000); try { let l; S.run.w = navigator.geolocation.watchPosition(p => { const c = p.coords; if (l) { const a = Math.PI / 180, x = (c.longitude - l.longitude) * a * Math.cos(c.latitude * a), y = (c.latitude - l.latitude) * a; S.run.d += Math.hypot(x, y) * 6371 } l = c }, () => toast('Location blocked — time only')) } catch (e) { } } };
                $('#fn').onclick = () => { clearInterval(S.run.id); S.run = { t: 0, on: 0, d: 0, id: 0 }; $('#st').textContent = 'Start'; u(); toast('Workout finished') }
            }
            document.querySelectorAll('.mc').forEach(c => c.onchange = () => { S.meals[c.dataset.i] = c.checked; sv(); go() });
            if (h == 'shop') {
                const clearSelectedFilterSilent = () => {
                    window._selectedWishlistProductId = '';
                    try { sessionStorage.removeItem('selectedWishlistProductId'); } catch (_) { }
                    if (location.hash.includes('productId=')) {
                        try { history.replaceState(null, '', '#shop'); } catch (_) { }
                    }
                };
                $('#q').oninput = e => { clearSelectedFilterSilent(); S.q = e.target.value; go(1) };
                $('#so').onchange = e => { S.sort = e.target.value; go() };
                document.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { clearSelectedFilterSilent(); S.cat = b.dataset.c; go() });
                document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
                    if (b.disabled) return;
                    const productId = String(b.dataset.buy || '');
                    const catalogItem = (Array.isArray(window.HIVECITY_SHOP_CATALOG) ? window.HIVECITY_SHOP_CATALOG : [])
                        .find(x => String(x.id) === productId);
                    const allShop = typeof window.getAllShopProducts === 'function' ? window.getAllShopProducts() : P;
                    const prod = allShop.find(x => String(x.id) === productId);
                    const targetUrl = String(
                        (catalogItem && (catalogItem.affiliateUrl || catalogItem.buyUrl || catalogItem.url || catalogItem.link)) ||
                        (prod && (prod.affiliateUrl || prod.buyUrl || prod.url || prod.link || prod.checkoutUrl)) ||
                        ''
                    ).trim();
                    if (!/^https?:\/\//i.test(targetUrl)) {
                        toast('Paste this product link in shop-links.js to enable Buy Now');
                        return;
                    }
                    window.open(targetUrl, '_blank', 'noopener,noreferrer');
                    toast('Opening partner product page…');
                });
                document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
                    const isSaved = typeof window.toggleHiveWishlistProduct === 'function'
                        ? window.toggleHiveWishlistProduct(b.dataset.w)
                        : (S.wish[b.dataset.w] = !S.wish[b.dataset.w], sv(), Boolean(S.wish[b.dataset.w]));
                    b.textContent = isSaved ? '♥' : '♡';
                    b.classList.toggle('on', Boolean(isSaved));
                });
            }
            if (h == 'events') document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { S.bk[b.dataset.e] = (S.bk[b.dataset.e] || 0) + 1; sv(); toast('Added to bookings'); b.textContent = 'Added ✓' });
            if (h == 'bookings') { /* Wishlist showcase events are wired inline */ }
        }
        function go(keep) {
            const rawH = location.hash.slice(1);
            const h = rawH.split("?")[0].split("/")[0];
            if (h === 'admin') { location.hash = 'discover'; return; }
            const isResetPending = Boolean(window._hivePasswordResetPending || sessionStorage.getItem('hivePasswordResetPending'));
            const isVerifiedUser = Boolean(window.hiveCurrentUser && window.hiveCurrentUser.emailVerified && !isResetPending);
            if (!isVerifiedUser && h && h !== 'auth') {
                if (location.hash !== '#auth') location.hash = 'auth';
                return;
            }
            if (window.hiveAuthReady && isVerifiedUser && (h === '' || h === 'auth')) {
                if (location.hash !== '#community') location.hash = 'community';
                return;
            }
            const v = V[h] || V.discover, q = keep && document.activeElement.id;
            app.innerHTML = v(); chrome(h); wire(h); fx(h);
            if (q) { const e = $('#' + q); if (e) { e.focus(); e.setSelectionRange(99, 99) } }
            if (!keep) scrollTo(0, 0);
        }
        window.addEventListener('hashchange', () => go());
        window.hiveAuth.onAuthStateChanged(user => {
            const isInitialAuthCheck = !window.hiveAuthInitialStateResolved;
            window.hiveAuthInitialStateResolved = true;
            const isResetPending = Boolean(window._hivePasswordResetPending || sessionStorage.getItem('hivePasswordResetPending'));
            if (isResetPending) {
                window.hiveCurrentUser = null;
                window.hiveAuthReady = true;
                sessionStorage.removeItem('hivecityUser');
                if (location.hash !== '#auth') {
                    location.hash = 'auth';
                } else if (isInitialAuthCheck) {
                    go();
                }
                return;
            }
            if (user && !user.emailVerified) {
                window.hiveCurrentUser = null;
                window.hiveAuthReady = true;
                sessionStorage.removeItem('hivecityUser');
                if (location.hash !== '#auth') {
                    location.hash = 'auth';
                } else if (isInitialAuthCheck) {
                    go();
                }
                return;
            }
            window.hiveCurrentUser = user;
            window.hiveAuthReady = true;
            if (!user) {
                sessionStorage.removeItem('hivecityUser');
                // Always render an initial route on a fresh visit; otherwise #app can remain blank.
                if (!location.hash || location.hash === '#') {
                    location.hash = 'auth';
                } else if (location.hash !== '#auth') {
                    location.hash = 'auth';
                } else if (isInitialAuthCheck) {
                    go();
                }
            } else if (isInitialAuthCheck) {
                if (user.emailVerified) {
                    try {
                        if (typeof window.hiveSyncToGoogleSheet === 'function') {
                            void window.hiveSyncToGoogleSheet({ status: 'Verified' }, user);
                        }
                    } catch (_) { }
                    if (location.hash === '#auth' || location.hash === '' || location.hash === '#') location.hash = 'community';
                    else go();
                } else {
                    if (location.hash !== '#auth') location.hash = 'auth';
                    else go();
                }
            }
            // Subsequent sign-in events are routed by the successful login/register handler.
        });
        document.body.insertAdjacentHTML('beforeend', '<div id="sb"></div><div id="cg"></div><div id="lb"></div>');
        const split = t => [...t].map((c, i) => c == ' ' ? ' ' : `<span class="ch" style="--i:${i}">${c}</span>`).join('');
        V[''] = () => `<div class="splash"><div class="grain"></div><div style="position:relative"><div class="orb"><svg viewBox="0 0 200 200" class="o1"><circle cx="100" cy="100" r="95" fill="none" stroke="#C7F36B" stroke-width="2" stroke-dasharray="40 20"/></svg><svg viewBox="0 0 200 200" class="o2"><circle cx="100" cy="100" r="80" fill="none" stroke="#C7F36B" stroke-width="3" stroke-dasharray="90 30" opacity=".7"/></svg><svg viewBox="0 0 200 200" class="o3"><circle cx="100" cy="100" r="65" fill="none" stroke="#F2F0E9" stroke-width="1.5" stroke-dasharray="10 12"/></svg><svg viewBox="0 0 100 100" class="lg"><path d="M50 6 90 28V72L50 94 10 72V28Z"/><path d="M30 62V38M70 62V38M30 50H70"/></svg></div><div class="big" style="font-size:76px">${split('HIVE CITY')}</div><p class="it" style="color:#C7F36B;animation:in 1s 1.5s both">Move · Connect · Live</p><div class="bar" style="width:160px;margin:14px auto"><i style="width:0;animation:ld 2.4s forwards"></i></div></div></div>`;

        /* ==========================================================================
           HIVECITY MASTER CONFIGURATION & EXTENSIONS
           ========================================================================== */

        /* --- INSTAGRAM-STYLE USERNAME REGISTRY SYSTEM --- */
        window.isUsernameAvailable = function (username, currentUid) {
            if (!username) return false;
            const clean = username.trim().toLowerCase().replace(/^@/, '');
            if (!/^[a-z0-9_]{3,30}$/.test(clean)) return false;

            let registry = {};
            try {
                registry = JSON.parse(localStorage.getItem('hivecity_usernames_registry') || '{}');
            } catch (e) { }

            // Seed with initial known profiles if empty
            if (!Object.keys(registry).length) {
                registry['gowtham_fitness'] = 'user_gowtham_fit';
                registry['apex_runner'] = 'athlete_usr_77';
                registry['elena_marathon'] = 'u_elena_m';
                registry['marcus_runs'] = 'u_marcus_r';
                registry['priya_fit'] = 'u_priya_f';
                registry['admin'] = 'admin_usr_01';
                try { localStorage.setItem('hivecity_usernames_registry', JSON.stringify(registry)); } catch (e) { }
            }

            const reserved = ['admin', 'hivecity', 'official', 'support', 'help', 'system'];
            if (reserved.includes(clean) && (!currentUid || !String(currentUid).includes('admin'))) {
                return false;
            }

            const owner = registry[clean];
            if (owner && owner !== currentUid) {
                return false; // Taken by someone else
            }

            if (window.hs && window.hs.users) {
                for (const u of Object.values(window.hs.users)) {
                    if (u && u.username && u.username.toLowerCase() === clean && u.uid !== currentUid) {
                        return false;
                    }
                }
            }
            return true;
        };

        window.saveHiveUsername = function (uid, username) {
            if (!uid) return username;
            const clean = username.trim().toLowerCase().replace(/^@/, '');
            let registry = {};
            try {
                registry = JSON.parse(localStorage.getItem('hivecity_usernames_registry') || '{}');
            } catch (e) { }

            // Remove any previous username for this uid
            for (const k of Object.keys(registry)) {
                if (registry[k] === uid) delete registry[k];
            }
            registry[clean] = uid;
            try { localStorage.setItem('hivecity_usernames_registry', JSON.stringify(registry)); } catch (e) { }

            let byUid = {};
            try {
                byUid = JSON.parse(localStorage.getItem('hivecity_usernames_by_uid') || '{}');
            } catch (e) { }
            byUid[uid] = clean;
            try { localStorage.setItem('hivecity_usernames_by_uid', JSON.stringify(byUid)); } catch (e) { }

            if (window.hs && window.hs.users) {
                if (!window.hs.users[uid]) window.hs.users[uid] = { uid };
                window.hs.users[uid].username = clean;
                if (typeof hsSave === 'function') hsSave();
            }
            return clean;
        };

        window.getHiveUsername = function (uid) {
            if (!uid) return 'athlete';
            try {
                const byUid = JSON.parse(localStorage.getItem('hivecity_usernames_by_uid') || '{}');
                if (byUid[uid]) return byUid[uid];
            } catch (e) { }
            if (typeof getUserProfile === 'function') {
                const p = getUserProfile(uid);
                if (p && p.username) return p.username;
            }
            return 'athlete_' + String(uid).slice(0, 6);
        };

        window.liveCheckUsername = function (val) {
            const st = document.getElementById('hs-edit-username-status');
            if (!st) return;
            const clean = (val || '').trim().toLowerCase().replace(/^@/, '');
            const cur = (window.getAuthUser ? window.getAuthUser() : window.hiveCurrentUser);
            if (!clean) {
                st.textContent = '';
                return;
            }
            if (!/^[a-z0-9_]{3,30}$/.test(clean)) {
                st.textContent = '⚠️ 3-30 chars, lowercase letters, numbers & underscores only';
                st.style.color = 'var(--mu)';
                return;
            }
            const avail = window.isUsernameAvailable(clean, cur ? cur.uid : null);
            if (avail) {
                st.textContent = '✓ @' + clean + ' is available';
                st.style.color = '#1f8a4c';
            } else {
                st.textContent = '✕ @' + clean + ' is already taken';
                st.style.color = '#d33';
            }
        };

        window.HIVECITY_CONFIG = {
            GOOGLE_MAPS_API_KEY: "",     // Add the restricted Maps JavaScript API key after enabling billing/API
            GOOGLE_APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwgPpu-p1VPfq9_0764qUipHjEbTfDEtW3Ih9u_k5cC6ZlrU3OOVwbOge4v1qAQzFFr/exec",
            SOCIAL_MAINTENANCE: true     // Keep Social maintenance enabled
        };

        window.getAuthUser = function () {
            return window.hiveCurrentUser || null;
        };

        /* --- PROFILE HANDLE: use the member-created @username, not an HC-XXXXXX ID --- */
        window.getOrCreateProfileId = function (uid) {
            try {
                const handle = window.getHiveUsername ? window.getHiveUsername(uid) : '';
                return handle ? '@' + String(handle).replace(/^@/, '') : 'username-not-set';
            } catch (e) {
                return 'username-not-set';
            }
        };

        /* --- HOME PAGE DAILY DISTANCE CALCULATION --- */
        window.getHomeDailyKmNumber = function () {
            let totalMeters = 0;
            const seenIds = new Set();
            const today = new Date();
            const sameLocalDay = value => {
                if (!value) return false;
                const d = new Date(value);
                return !isNaN(d.getTime()) &&
                    d.getFullYear() === today.getFullYear() &&
                    d.getMonth() === today.getMonth() &&
                    d.getDate() === today.getDate();
            };
            const includeRun = r => {
                const id = r.id || r.runId || (r.date + '_' + r.distance);
                if (seenIds.has(id)) return;
                seenIds.add(id);
                const isToday = sameLocalDay(r.startedAt || r.finishedAt || r.createdAt || r.timestamp) ||
                    (typeof r.date === 'string' && /^Today\b/i.test(r.date));
                if (!isToday) return;
                let meters = Number(r.rawMeters || r.distMeters || 0);
                if (!(meters > 0) && typeof r.distance === 'string' && /km/i.test(r.distance)) {
                    meters = parseFloat(r.distance) * 1000;
                } else if (!(meters > 0) && typeof r.distance === 'number') {
                    meters = r.distance * 1000;
                }
                if (Number.isFinite(meters) && meters > 0) totalMeters += meters;
            };
            try {
                const ha = JSON.parse(localStorage.getItem('hive-city-activity-v1') || '{}');
                if (Array.isArray(ha.history)) ha.history.forEach(includeRun);
            } catch (e) { }
            try {
                const ah = JSON.parse(localStorage.getItem('hivecity_activity_history') || '[]');
                if (Array.isArray(ah)) ah.forEach(includeRun);
            } catch (e) { }
            return totalMeters / 1000;
        };
        window.getHomeDailyDistance = function () {
            const km = window.getHomeDailyKmNumber();
            return km > 0 ? km.toFixed(2) + ' KM' : 'NIL';
        };
        // Backward-compatible alias for any older widget still calling this helper.
        window.getHomeTotalKm = window.getHomeDailyDistance;


        /* --- HIVECITY STANDARD SEED NUTRIENT RECIPES & BMI ENGINE --- */
        window.SEED_NUTRIENT_RECIPES = [
            {
                id: 'seed-nut-01',
                name: 'Grilled Paneer & Quinoa Bowl',
                title: 'Grilled Paneer & Quinoa Bowl',
                goal: 'Muscle Building',
                category: 'High Protein Meals',
                mealType: 'Lunch',
                prepTime: 25,
                calories: 420,
                protein: 28,
                carbs: 34,
                fat: 16,
                fiber: 7,
                glycemicIndex: 'Low',
                tags: ['high-protein', 'calorie-deficit', 'high-fiber', 'vegetarian'],
                suitableCategories: ['Overweight', 'Normal', 'Obese'],
                description: 'High-protein seasoned cottage cheese tossed with warm tri-color quinoa, spinach, and roasted peppers.',
                ingredients: ['200g low-fat paneer cubes', '1 cup cooked quinoa', '1 cup baby spinach', '1/2 bell pepper diced', '1 tbsp extra virgin olive oil', 'lemon herb seasoning'],
                steps: ['Cook quinoa in vegetable broth until fluffy.', 'Lightly sear seasoned paneer cubes on non-stick grill pan for 4-5 mins.', 'Toss warm quinoa with baby spinach until gently wilted.', 'Assemble bowl with grilled paneer, roasted peppers, and drizzle with olive oil and lemon.'],
                imageUrls: ['assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_01.jpeg', 'assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_02.jpeg', 'assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_03.jpeg'],
                images: { slot1: { url: 'assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_01.jpeg', label: 'Finished bowl' }, slot2: { url: 'assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_02.jpeg', label: 'Preparation' }, slot3: { url: 'assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_03.jpeg', label: 'Macro plate' } }
            },
            {
                id: 'seed-nut-02',
                name: 'Moong Dal Chilla with Mint Chutney',
                title: 'Moong Dal Chilla with Mint Chutney',
                goal: 'Weight Loss',
                category: 'Quick Breakfast',
                mealType: 'Breakfast',
                prepTime: 20,
                calories: 320,
                protein: 22,
                carbs: 36,
                fat: 8,
                fiber: 8,
                glycemicIndex: 'Low',
                tags: ['low-glycemic', 'high-fiber', 'calorie-deficit', 'vegan'],
                suitableCategories: ['Overweight', 'Obese', 'Normal'],
                description: 'Crispy savory yellow lentil pancakes stuffed with grated vegetables and accompanied by zesty mint chutney.',
                ingredients: ['1 cup soaked yellow moong dal', '1/4 cup grated carrots & zucchini', '1 green chili', '1/2 tsp cumin seeds', 'fresh coriander', '1 tsp cold-pressed oil'],
                steps: ['Blend soaked moong dal with green chili and ginger into a smooth pourable batter.', 'Fold in grated carrots, zucchini, cumin and chopped coriander.', 'Spread ladleful thinly on a hot seasoned griddle and cook with minimal oil until crisp on both sides.', 'Serve hot with freshly ground mint coriander chutney.'],
                imageUrls: ['assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_01.jpeg', 'assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_02.jpeg', 'assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_03.jpeg'],
                images: { slot1: { url: 'assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_01.jpeg', label: 'Crispy Chilla' }, slot2: { url: 'assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_02.jpeg', label: 'Mint chutney dip' }, slot3: { url: 'assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_03.jpeg', label: 'Serving' } }
            },
            {
                id: 'seed-nut-03',
                name: 'Peanut Butter Banana Oats Smoothie',
                title: 'Peanut Butter Banana Oats Smoothie',
                goal: 'Weight Gain',
                category: 'Recovery Smoothies',
                mealType: 'Breakfast',
                prepTime: 10,
                calories: 640,
                protein: 30,
                carbs: 76,
                fat: 24,
                fiber: 9,
                glycemicIndex: 'Medium',
                tags: ['calorie-dense', 'high-protein', 'weight-gain', 'mass-builder'],
                suitableCategories: ['Underweight', 'Normal'],
                description: 'Dense, nutrient-packed energy smoothie with rolled oats, organic peanut butter, banana, whole milk, and chia.',
                ingredients: ['1.5 ripe bananas', '50g rolled oats', '2 tbsp organic peanut butter', '300ml whole milk', '1 tbsp chia seeds', '1 scoop whey protein (optional)'],
                steps: ['Soak rolled oats in 100ml warm milk for 5 minutes.', 'Combine soaked oats, bananas, peanut butter, chia seeds and remaining milk in blender.', 'Blend on high for 60 seconds until rich and completely creamy.', 'Pour into tall glass and enjoy immediately post-workout.'],
                imageUrls: ['assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_01.jpeg', 'assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_02.jpeg', 'assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_03.jpeg'],
                images: { slot1: { url: 'assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_01.jpeg', label: 'Nutrient shake' }, slot2: { url: 'assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_02.jpeg', label: 'Smoothie pour' }, slot3: { url: 'assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_03.jpeg', label: 'Ingredients' } }
            },
            {
                id: 'seed-nut-04',
                name: 'Steamed Idli with Sambar & Egg Whites',
                title: 'Steamed Idli with Sambar & Egg Whites',
                goal: 'Maintenance',
                category: 'Quick Breakfast',
                mealType: 'Breakfast',
                prepTime: 20,
                calories: 380,
                protein: 24,
                carbs: 52,
                fat: 6,
                fiber: 6,
                glycemicIndex: 'Medium',
                tags: ['lean-protein', 'digestive-health', 'balanced-maintenance'],
                suitableCategories: ['Normal', 'Overweight'],
                description: 'Fermented soft rice-lentil idlis served with vegetable-packed pigeon pea sambar and spiced boiled egg whites.',
                ingredients: ['3 steamed idlis', '1 bowl vegetable sambar (drumstick, tomato, shallots)', '3 boiled egg whites seasoned with black pepper & pinch of rock salt'],
                steps: ['Steam fresh fermented idli batter for 10-12 mins until pillowy.', 'Warm hearty vegetable sambar infused with mustard seeds and curry leaves.', 'Boil and shell eggs, discarding yolks for lean protein recovery.', 'Serve warm with fresh sambar.'],
                imageUrls: ['assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_01.jpeg', 'assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_02.jpeg', 'assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_03.jpeg'],
                images: { slot1: { url: 'assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_01.jpeg', label: 'Steamed plate' }, slot2: { url: 'assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_02.jpeg', label: 'Sambar bowl' }, slot3: { url: 'assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_03.jpeg', label: 'Egg whites' } }
            },
            {
                id: 'seed-nut-05',
                name: 'Grilled Chicken & Roasted Veggie Salad',
                title: 'Grilled Chicken & Roasted Veggie Salad',
                goal: 'Weight Loss',
                category: 'High Protein Meals',
                mealType: 'Dinner',
                prepTime: 30,
                calories: 390,
                protein: 42,
                carbs: 18,
                fat: 14,
                fiber: 7,
                glycemicIndex: 'Low',
                tags: ['high-protein', 'low-carb', 'calorie-deficit', 'keto-friendly'],
                suitableCategories: ['Overweight', 'Obese', 'Normal'],
                description: 'Herb-marinated grilled chicken breast served over warm roasted zucchini, broccoli, cucumbers, and olive oil dressing.',
                ingredients: ['220g skinless chicken breast', '1 cup broccoli florets', '1 zucchini sliced', '1/2 cucumber diced', '1 tbsp extra virgin olive oil', 'lemon oregano vinaigrette'],
                steps: ['Marinate chicken in lemon juice, garlic, cracked pepper and dried oregano for 15 mins.', 'Toss broccoli and zucchini with half oil and roast at 200°C for 18 mins.', 'Grill chicken breast 6-7 mins per side until internal temperature reaches 74°C.', 'Slice chicken across grain and arrange over roasted vegetables and cucumber with remaining dressing.'],
                imageUrls: ['assets/recipes/Weight_Loss/Tuna White Bean Salad/image_01.jpeg', 'assets/recipes/Weight_Loss/Tuna White Bean Salad/image_02.jpeg', 'assets/recipes/Weight_Loss/Tuna White Bean Salad/image_03.jpeg'],
                images: { slot1: { url: 'assets/recipes/Weight_Loss/Tuna White Bean Salad/image_01.jpeg', label: 'Chicken Salad' }, slot2: { url: 'assets/recipes/Weight_Loss/Tuna White Bean Salad/image_02.jpeg', label: 'Grilled slice' }, slot3: { url: 'assets/recipes/Weight_Loss/Tuna White Bean Salad/image_03.jpeg', label: 'Fresh greens' } }
            },
            {
                id: 'seed-nut-06',
                name: 'Sprouted Kala Chana Chaat',
                title: 'Sprouted Kala Chana Chaat',
                goal: 'Weight Loss',
                category: 'Plant Based',
                mealType: 'Snack',
                prepTime: 15,
                calories: 290,
                protein: 19,
                carbs: 44,
                fat: 5,
                fiber: 11,
                glycemicIndex: 'Low',
                tags: ['low-glycemic', 'high-fiber', 'weight-loss', 'vegan'],
                suitableCategories: ['Overweight', 'Obese', 'Normal'],
                description: 'Steamed sprouted brown chickpeas tossed with red onion, tomato, lemon juice, chaat masala, and fresh coriander.',
                ingredients: ['1.5 cups sprouted kala chana', '1 medium red onion finely diced', '1 ripe tomato diced', '1 green chili minced', 'fresh lime juice', '1 tsp chaat masala', 'fresh mint & coriander'],
                steps: ['Steam sprouted kala chana for 6-8 mins until tender yet firm to bite.', 'In large mixing bowl, combine warm chana with onion, tomato, green chili and mint.', 'Toss with lime juice, chaat masala and black rock salt.', 'Serve immediately as a slow-digesting, high-satiety recovery bowl.'],
                imageUrls: ['assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_01.jpeg', 'assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_02.jpeg', 'assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_03.jpeg'],
                images: { slot1: { url: 'assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_01.jpeg', label: 'Kala Chana Chaat' }, slot2: { url: 'assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_02.jpeg', label: 'Sprouts mix' }, slot3: { url: 'assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_03.jpeg', label: 'Lime garnish' } }
            },
            {
                id: 'seed-nut-07',
                name: 'Sattu High-Calorie Power Shake',
                title: 'Sattu High-Calorie Power Shake',
                goal: 'Weight Gain',
                category: 'Recovery Smoothies',
                mealType: 'Post-Workout',
                prepTime: 10,
                calories: 580,
                protein: 32,
                carbs: 70,
                fat: 18,
                fiber: 8,
                glycemicIndex: 'Medium',
                tags: ['calorie-surplus', 'high-protein', 'plant-protein', 'weight-gain'],
                suitableCategories: ['Underweight', 'Normal'],
                description: 'Traditional roasted gram flour blended with full cream milk, crushed jaggery, crushed almonds, and cardamom.',
                ingredients: ['60g roasted chana sattu flour', '350ml whole milk', '2 tbsp organic jaggery powder', '10 crushed almonds', '1/4 tsp green cardamom powder'],
                steps: ['Add sattu flour and jaggery powder to blender with 100ml milk to form a lump-free paste.', 'Add remaining milk and cardamom powder, then blend for 30 seconds.', 'Top with crushed almonds and serve chilled for sustained calorie surplus.'],
                imageUrls: ['assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_01.jpeg', 'assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_02.jpeg', 'assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_03.jpeg'],
                images: { slot1: { url: 'assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_01.jpeg', label: 'Sattu Power Shake' }, slot2: { url: 'assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_02.jpeg', label: 'Blend consistency' }, slot3: { url: 'assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_03.jpeg', label: 'Almond topping' } }
            },
            {
                id: 'seed-nut-08',
                name: 'Methi Dal with Foxtail Millet Khichdi',
                title: 'Methi Dal with Foxtail Millet Khichdi',
                goal: 'Maintenance',
                category: 'Plant Based',
                mealType: 'Dinner',
                prepTime: 35,
                calories: 410,
                protein: 21,
                carbs: 58,
                fat: 10,
                fiber: 9,
                glycemicIndex: 'Low',
                tags: ['low-glycemic', 'high-fiber', 'gut-health', 'balanced-maintenance'],
                suitableCategories: ['Normal', 'Overweight', 'Obese'],
                description: 'Slow-simmered yellow moong dal with fresh fenugreek leaves and foxtail millet, tempered with cumin and ghee.',
                ingredients: ['1/2 cup foxtail millet', '1/2 cup split yellow moong dal', '1 packed cup fresh methi (fenugreek) leaves', '1 tsp cumin seeds', '1 tbsp pure A2 ghee', 'turmeric & ginger'],
                steps: ['Rinse foxtail millet and moong dal together; soak for 15 minutes.', 'Pressure cook millet and dal with 3.5 cups water, turmeric and grated ginger for 3 whistles.', 'In a small pan, warm ghee and crackle cumin seeds, green chili and washed methi leaves until fragrant.', 'Stir methi tempering into the hot khichdi and simmer for 2 mins. Serve warm.'],
                imageUrls: ['assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_01.jpeg', 'assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_02.jpeg', 'assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_03.jpeg'],
                images: { slot1: { url: 'assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_01.jpeg', label: 'Millet Khichdi' }, slot2: { url: 'assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_02.jpeg', label: 'Methi tempering' }, slot3: { url: 'assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_03.jpeg', label: 'Serving bowl' } }
            }
        ];

        /* --- HIVECITY EXACT BMI & CALORIE ENGINE UTILITIES --- */
        window.hiveBmiEngine = {
            STORAGE_KEY: 'hivecity_user_bmi_profile',

            normalizeHeightToCm: function (height, unit, feet, inches) {
                if (unit === 'ft') {
                    var totalInches = (feet !== undefined && feet !== null ? Number(feet) : Number(height)) * 12 + (Number(inches) || 0);
                    return Number((totalInches * 2.54).toFixed(2));
                }
                return Number(Number(height).toFixed(2));
            },

            normalizeWeightToKg: function (weight, unit) {
                if (unit === 'lbs') {
                    return Number((Number(weight) * 0.45359237).toFixed(2));
                }
                return Number(Number(weight).toFixed(2));
            },

            calculateBmi: function (weightKg, heightCm) {
                if (!heightCm || !weightKg || heightCm <= 0 || weightKg <= 0) return 0;
                var heightM = heightCm / 100;
                var val = weightKg / (heightM * heightM);
                return Number(val.toFixed(2));
            },

            classifyBmi: function (bmi) {
                if (bmi < 18.5) return 'Underweight';
                if (bmi < 25.0) return 'Normal';
                if (bmi < 30.0) return 'Overweight';
                return 'Obese';
            },

            getCalorieTargetAndStrategy: function (category, weightKg) {
                switch (category) {
                    case 'Underweight':
                        return { dailyCalorieTarget: Math.round(weightKg * 36), goalStrategy: 'calorie_surplus' };
                    case 'Normal':
                        return { dailyCalorieTarget: Math.round(weightKg * 30), goalStrategy: 'balanced_maintenance' };
                    case 'Overweight':
                        return { dailyCalorieTarget: Math.max(1400, Math.round(weightKg * 24)), goalStrategy: 'calorie_deficit' };
                    case 'Obese':
                        return { dailyCalorieTarget: Math.max(1300, Math.round(weightKg * 21)), goalStrategy: 'low_glycemic_high_fiber' };
                    default:
                        return { dailyCalorieTarget: 2000, goalStrategy: 'balanced_maintenance' };
                }
            },

            calculateMaxHeartRate: function (age) {
                var cleanAge = Number(age) > 0 ? Number(age) : 25;
                return 220 - cleanAge;
            },

            getHeartRateZone: function (bpm, maxHR) {
                if (!maxHR || maxHR <= 0) return 'Resting';
                var ratio = bpm / maxHR;
                if (ratio < 0.50) return 'Resting';
                if (ratio < 0.60) return 'Warm-Up';
                if (ratio < 0.70) return 'Fat Burn';
                if (ratio < 0.85) return 'Cardio';
                return 'Peak';
            },

            getProfile: function () {
                try {
                    var raw = localStorage.getItem('hivecity_user_bmi_profile');
                    return raw ? JSON.parse(raw) : null;
                } catch (e) {
                    return null;
                }
            },

            saveProfile: function (profile) {
                try {
                    localStorage.setItem('hivecity_user_bmi_profile', JSON.stringify(profile));
                    window.dispatchEvent(new CustomEvent('hivecity:bmi-updated', { detail: profile }));
                } catch (e) {
                    console.error('Failed to save BMI profile', e);
                }
            },

            getRecommendedRecipes: function (recipes, profile) {
                var list = Array.isArray(recipes) && recipes.length ? recipes : (window.SEED_NUTRIENT_RECIPES || []);
                if (!profile) {
                    return list.map(function (r) {
                        return { recipe: r, matchReason: 'General Healthy Plate', isPrimaryFit: false };
                    });
                }
                var cat = profile.bmiCategory;
                var target = Number(profile.dailyCalorieTarget) || 1800;
                var maxMealCal = Math.round(target * 0.4);

                return list.map(function (r) {
                    var cal = Number(r.calories) || 0;
                    var pro = Number(r.protein || r.proteinGrams) || 0;
                    var carb = Number(r.carbs || r.carbsGrams) || 0;
                    var fib = Number(r.fiber || r.fiberGrams) || 0;
                    var gi = r.glycemicIndex || 'Medium';
                    var suitable = Array.isArray(r.suitableCategories) && r.suitableCategories.indexOf(cat) !== -1;
                    var isPrimaryFit = false;
                    var matchReason = '';

                    if (cat === 'Underweight') {
                        if ((cal >= 500 && pro >= 25) || suitable) {
                            isPrimaryFit = true;
                            matchReason = 'Calorie Surplus (' + cal + ' kcal · ' + pro + 'g Protein)';
                        } else {
                            matchReason = 'Nutrient Addition (' + cal + ' kcal)';
                        }
                    } else if (cat === 'Normal') {
                        if ((cal >= 350 && cal <= 650 && pro >= 20 && fib >= 5) || suitable) {
                            isPrimaryFit = true;
                            matchReason = 'Balanced Maintenance (' + pro + 'g Protein · ' + fib + 'g Fiber)';
                        } else {
                            matchReason = 'Balanced Variety';
                        }
                    } else if (cat === 'Overweight') {
                        if ((cal <= maxMealCal && pro >= 22 && fib >= 6) || suitable) {
                            isPrimaryFit = true;
                            matchReason = 'Calorie Deficit Fit (≤' + maxMealCal + ' kcal · ' + pro + 'g Protein)';
                        } else {
                            matchReason = 'Moderate Fit (' + cal + ' kcal)';
                        }
                    } else {
                        if ((cal <= 450 && carb <= 38 && pro >= 25 && fib >= 7 && gi === 'Low') || suitable) {
                            isPrimaryFit = true;
                            matchReason = 'Low GI · ' + fib + 'g Fiber · ' + pro + 'g Protein';
                        } else {
                            matchReason = 'Calorie Controlled (' + cal + ' kcal)';
                        }
                    }
                    return { recipe: r, matchReason: matchReason, isPrimaryFit: isPrimaryFit };
                }).sort(function (a, b) {
                    if (a.isPrimaryFit && !b.isPrimaryFit) return -1;
                    if (!a.isPrimaryFit && b.isPrimaryFit) return 1;
                    return 0;
                });
            },

            getTopRecommendedRecipes: function (profile, recipes, limit) {
                var n = limit || 3;
                if (!profile) return [];
                var all = this.getRecommendedRecipes(recipes || window.SEED_NUTRIENT_RECIPES || [], profile);
                var primary = all.filter(function (x) { return x.isPrimaryFit; });
                return (primary.length >= n ? primary : all).slice(0, n);
            }
        };

        // Sync BMI updates across Activity & Nutrients views and across browser tabs
        if (!window._hiveBmiSyncListenersBound) {
            window._hiveBmiSyncListenersBound = true;
            var refreshBmiAwareView = function () {
                var h = (location.hash || '').toLowerCase();
                if ((h.indexOf('nutrition') !== -1 || h.indexOf('activity') !== -1) && typeof window.go === 'function') {
                    window.go(1);
                }
            };
            window.addEventListener('hivecity:bmi-updated', refreshBmiAwareView);
            window.addEventListener('storage', function (ev) {
                if (ev && ev.key === 'hivecity_user_bmi_profile') {
                    refreshBmiAwareView();
                }
            });
        }

        /* --- CURATED ATHLETE NUTRITION LIBRARY: 50 RECIPES --- */
        window.getHive1000Recipes = (function () {
            const curated = [{"id":"hive-curated-01","name":"Banana Peanut Butter Oat Bowl","goal":"Weight Gain","category":"High Protein Breakfast","calories":620,"protein":25,"carbs":78,"fat":24,"prepTime":25,"description":"Creamy oats topped with banana and peanut butter for energy-dense training fuel.","ingredients":["Rolled oats","banana","peanut butter","milk","chia seeds"],"steps":["Simmer rolled oats in milk for 5–7 minutes, stirring until creamy.","Slice the banana and stir half into the oats; spoon into a bowl.","Top with peanut butter and chia seeds. Add a splash of milk to loosen if needed."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_01.jpeg","./assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_02.jpeg","./assets/recipes/Weight_Gain/Banana Peanut Butter Oat Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-02","name":"Greek Yogurt Berry Crunch","goal":"Weight Loss","category":"High Protein Breakfast","calories":310,"protein":24,"carbs":35,"fat":8,"prepTime":30,"description":"A protein-rich bowl with berries and a crisp seed topping.","ingredients":["Greek yogurt","blueberries","strawberries","oats","pumpkin seeds"],"steps":["Spoon thick Greek yogurt into a serving bowl and smooth the top.","Rinse and dry the berries; halve larger strawberries.","Add berries and toasted oats, then finish with a small drizzle of honey if desired."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Greek Yogurt Berry Crunch/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Greek Yogurt Berry Crunch/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Greek Yogurt Berry Crunch/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Greek Yogurt Berry Crunch/image_01.jpeg","./assets/recipes/Weight_Loss/Greek Yogurt Berry Crunch/image_02.jpeg","./assets/recipes/Weight_Loss/Greek Yogurt Berry Crunch/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-03","name":"Grilled Chicken Quinoa Bowl","goal":"Muscle Building","category":"High Protein Meals","calories":540,"protein":46,"carbs":52,"fat":16,"prepTime":35,"description":"Lean chicken and quinoa provide protein and carbohydrates for recovery.","ingredients":["Chicken breast","quinoa","spinach","cucumber","olive oil","lemon"],"steps":["Rinse quinoa and simmer in water or stock until the grains are tender and the liquid is absorbed.","Season chicken with pepper, paprika, lemon and a little oil; grill until the centre reaches 74°C/165°F.","Rest and slice the chicken. Serve over quinoa with vegetables and a lemon-yogurt dressing."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_01.jpeg","./assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_02.jpeg","./assets/recipes/Muscle_Building/Grilled Chicken Quinoa Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-04","name":"Paneer Tikka Rice Bowl","goal":"Weight Gain","category":"Vegetarian Protein","calories":590,"protein":29,"carbs":70,"fat":21,"prepTime":40,"description":"Spiced paneer with rice and vegetables for a satisfying vegetarian meal.","ingredients":["Paneer","brown rice","bell pepper","yogurt","tikka spices"],"steps":["Marinate paneer cubes in yogurt, tikka spices, lemon and salt for 15 minutes.","Grill or pan-sear the paneer and peppers until lightly charred.","Serve with cooked rice, cucumber and mint yogurt; garnish with coriander."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Paneer Tikka Rice Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Paneer Tikka Rice Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Paneer Tikka Rice Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Paneer Tikka Rice Bowl/image_01.jpeg","./assets/recipes/Weight_Gain/Paneer Tikka Rice Bowl/image_02.jpeg","./assets/recipes/Weight_Gain/Paneer Tikka Rice Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-05","name":"Salmon Sweet Potato Plate","goal":"Endurance","category":"Omega-3 Rich Meals","calories":560,"protein":38,"carbs":54,"fat":20,"prepTime":45,"description":"Salmon and sweet potato combine protein, healthy fats and training fuel.","ingredients":["Salmon","sweet potato","broccoli","lemon","olive oil"],"steps":["Roast cubed sweet potato at 200°C/400°F until tender and browned, about 25 minutes.","Season salmon with lemon, pepper and herbs; bake until opaque and flaky (about 10–14 minutes depending on thickness).","Serve with greens and the roasted sweet potato; add lemon just before eating."],"images":{"slot1":{"url":"./assets/recipes/Endurance/Salmon Sweet Potato Plate/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Endurance/Salmon Sweet Potato Plate/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Endurance/Salmon Sweet Potato Plate/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Endurance/Salmon Sweet Potato Plate/image_01.jpeg","./assets/recipes/Endurance/Salmon Sweet Potato Plate/image_02.jpeg","./assets/recipes/Endurance/Salmon Sweet Potato Plate/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-06","name":"Chickpea Avocado Salad","goal":"Weight Loss","category":"Plant Based","calories":390,"protein":15,"carbs":42,"fat":18,"prepTime":20,"description":"A fibre-rich salad with chickpeas and creamy avocado.","ingredients":["Chickpeas","avocado","cucumber","tomato","parsley","lemon"],"steps":["Rinse and drain chickpeas; halve the tomatoes and dice cucumber and avocado.","Whisk lemon juice, olive oil, salt and pepper for the dressing.","Toss gently with herbs and serve immediately so the avocado stays fresh."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_01.jpeg","./assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_02.jpeg","./assets/recipes/Weight_Loss/Chickpea Avocado Salad/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-07","name":"Egg White Spinach Wrap","goal":"Weight Loss","category":"Quick Breakfast","calories":330,"protein":28,"carbs":34,"fat":9,"prepTime":25,"description":"A quick savoury wrap with lean protein and greens.","ingredients":["Egg whites","whole wheat wrap","spinach","tomato","cottage cheese"],"steps":["Wilt spinach in a non-stick pan with a little oil or water.","Add whisked egg whites and cook gently, stirring until just set.","Spoon into a warm whole-wheat wrap, add salsa and roll tightly."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_01.jpeg","./assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_02.jpeg","./assets/recipes/Weight_Loss/Egg White Spinach Wrap/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-08","name":"Tofu Edamame Power Bowl","goal":"Muscle Building","category":"Plant Based","calories":480,"protein":31,"carbs":49,"fat":17,"prepTime":30,"description":"Plant protein from tofu and edamame in a balanced bowl.","ingredients":["Firm tofu","edamame","brown rice","carrot","sesame","soy sauce"],"steps":["Press tofu dry, cube it and sear in a hot pan until golden on several sides.","Steam edamame and vegetables until tender-crisp; cook rice or grains separately.","Build the bowl and finish with soy, ginger, lime and sesame dressing."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Tofu Edamame Power Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Tofu Edamame Power Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Tofu Edamame Power Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Tofu Edamame Power Bowl/image_01.jpeg","./assets/recipes/Muscle_Building/Tofu Edamame Power Bowl/image_02.jpeg","./assets/recipes/Muscle_Building/Tofu Edamame Power Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-09","name":"Mango Lassi Recovery Smoothie","goal":"Weight Gain","category":"Recovery Smoothies","calories":430,"protein":22,"carbs":64,"fat":10,"prepTime":35,"description":"A refreshing smoothie with carbohydrate and protein after training.","ingredients":["Mango","Greek yogurt","milk","oats","cardamom"],"steps":["Chill ripe mango and plain yogurt before blending.","Blend mango, yogurt, milk and cardamom until smooth.","Taste and adjust thickness with milk; serve cold after training."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Mango Lassi Recovery Smoothie/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Mango Lassi Recovery Smoothie/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Mango Lassi Recovery Smoothie/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Mango Lassi Recovery Smoothie/image_01.jpeg","./assets/recipes/Weight_Gain/Mango Lassi Recovery Smoothie/image_02.jpeg","./assets/recipes/Weight_Gain/Mango Lassi Recovery Smoothie/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-10","name":"Tuna White Bean Salad","goal":"Weight Loss","category":"High Protein Meals","calories":365,"protein":34,"carbs":32,"fat":11,"prepTime":40,"description":"A quick protein-forward salad with beans for fibre.","ingredients":["Tuna","white beans","cherry tomatoes","rocket","lemon","olive oil"],"steps":["Drain tuna and rinse white beans; flake the tuna with a fork.","Combine with chopped tomato, red onion, parsley and lemon.","Dress with olive oil, pepper and lemon zest; fold gently and serve."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Tuna White Bean Salad/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Tuna White Bean Salad/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Tuna White Bean Salad/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Tuna White Bean Salad/image_01.jpeg","./assets/recipes/Weight_Loss/Tuna White Bean Salad/image_02.jpeg","./assets/recipes/Weight_Loss/Tuna White Bean Salad/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-11","name":"Overnight Cocoa Protein Oats","goal":"Weight Gain","category":"High Protein Breakfast","calories":510,"protein":32,"carbs":62,"fat":15,"prepTime":45,"description":"Make-ahead oats with cocoa and protein for busy mornings.","ingredients":["Oats","milk","cocoa","whey protein","banana","almond butter"],"steps":["Mix oats, cocoa, milk and protein powder until no dry pockets remain.","Cover and refrigerate for at least 6 hours or overnight.","Stir before serving; add banana or yogurt and a little milk to adjust consistency."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Overnight Cocoa Protein Oats/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Overnight Cocoa Protein Oats/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Overnight Cocoa Protein Oats/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Overnight Cocoa Protein Oats/image_01.jpeg","./assets/recipes/Weight_Gain/Overnight Cocoa Protein Oats/image_02.jpeg","./assets/recipes/Weight_Gain/Overnight Cocoa Protein Oats/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-12","name":"Turkey Hummus Pita","goal":"Muscle Building","category":"High Protein Meals","calories":470,"protein":38,"carbs":48,"fat":13,"prepTime":20,"description":"A portable pita with lean turkey and hummus.","ingredients":["Turkey breast","whole wheat pita","hummus","lettuce","cucumber"],"steps":["Season turkey strips with cumin, paprika, garlic and pepper; cook in a skillet until fully cooked.","Warm the pita and spread the inside with hummus.","Fill with turkey, lettuce, tomato and cucumber; finish with lemon."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Turkey Hummus Pita/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Turkey Hummus Pita/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Turkey Hummus Pita/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Turkey Hummus Pita/image_01.jpeg","./assets/recipes/Muscle_Building/Turkey Hummus Pita/image_02.jpeg","./assets/recipes/Muscle_Building/Turkey Hummus Pita/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-13","name":"Lentil Spinach Dal with Rice","goal":"Endurance","category":"Plant Based","calories":520,"protein":23,"carbs":82,"fat":9,"prepTime":25,"description":"A comforting lentil and rice meal rich in carbohydrates and plant protein.","ingredients":["Red lentils","spinach","rice","tomato","cumin","turmeric"],"steps":["Rinse lentils and simmer with turmeric until soft, adding water as needed.","In a separate pan, sauté cumin, garlic, onion and tomato; stir this tempering into the lentils.","Fold in spinach until wilted. Serve with freshly cooked rice."],"images":{"slot1":{"url":"./assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_01.jpeg","./assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_02.jpeg","./assets/recipes/Endurance/Lentil Spinach Dal with Rice/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-14","name":"Cottage Cheese Pineapple Bowl","goal":"Weight Loss","category":"High Protein Snacks","calories":280,"protein":25,"carbs":30,"fat":6,"prepTime":30,"description":"A simple high-protein snack with bright pineapple.","ingredients":["Cottage cheese","pineapple","chia seeds","mint"],"steps":["Drain cottage cheese if watery and spoon into a bowl.","Cut pineapple into bite-sized pieces and pat dry.","Top with pineapple, pumpkin seeds and cinnamon; chill briefly if preferred."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Cottage Cheese Pineapple Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Cottage Cheese Pineapple Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Cottage Cheese Pineapple Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Cottage Cheese Pineapple Bowl/image_01.jpeg","./assets/recipes/Weight_Loss/Cottage Cheese Pineapple Bowl/image_02.jpeg","./assets/recipes/Weight_Loss/Cottage Cheese Pineapple Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-15","name":"Beef and Broccoli Brown Rice","goal":"Muscle Building","category":"High Protein Meals","calories":570,"protein":42,"carbs":58,"fat":18,"prepTime":35,"description":"A balanced stir-fry with iron-rich beef and whole grains.","ingredients":["Lean beef","broccoli","brown rice","garlic","ginger","sesame"],"steps":["Cook brown rice according to the packet instructions.","Stir-fry thinly sliced lean beef in a hot pan until browned; remove briefly.","Cook broccoli until crisp-tender, return beef to the pan and add garlic-soy sauce. Serve over rice."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Beef and Broccoli Brown Rice/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Beef and Broccoli Brown Rice/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Beef and Broccoli Brown Rice/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Beef and Broccoli Brown Rice/image_01.jpeg","./assets/recipes/Muscle_Building/Beef and Broccoli Brown Rice/image_02.jpeg","./assets/recipes/Muscle_Building/Beef and Broccoli Brown Rice/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-16","name":"Almond Date Energy Bites","goal":"Weight Gain","category":"Training Snacks","calories":210,"protein":7,"carbs":25,"fat":10,"prepTime":40,"description":"Small energy bites for a convenient pre-training snack.","ingredients":["Dates","almonds","oats","cocoa","chia seeds"],"steps":["Soak dates in warm water for 5 minutes if they are firm, then drain well.","Pulse dates, almonds, oats and cocoa in a food processor until the mixture clumps.","Roll into small balls and chill for 20–30 minutes before serving."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Almond Date Energy Bites/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Almond Date Energy Bites/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Almond Date Energy Bites/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Almond Date Energy Bites/image_01.jpeg","./assets/recipes/Weight_Gain/Almond Date Energy Bites/image_02.jpeg","./assets/recipes/Weight_Gain/Almond Date Energy Bites/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-17","name":"Mediterranean Chickpea Couscous","goal":"Maintenance","category":"Plant Based","calories":455,"protein":18,"carbs":68,"fat":13,"prepTime":45,"description":"A colourful Mediterranean bowl with plant protein and whole grains.","ingredients":["Chickpeas","whole wheat couscous","cucumber","tomato","feta","lemon"],"steps":["Prepare couscous with hot stock according to the packet; fluff with a fork.","Rinse chickpeas and chop cucumber, tomato, parsley and olives.","Toss with couscous, lemon juice and olive oil; crumble feta over the top."],"images":{"slot1":{"url":"./assets/recipes/Maintenance/Mediterranean Chickpea Couscous/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Maintenance/Mediterranean Chickpea Couscous/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Maintenance/Mediterranean Chickpea Couscous/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Maintenance/Mediterranean Chickpea Couscous/image_01.jpeg","./assets/recipes/Maintenance/Mediterranean Chickpea Couscous/image_02.jpeg","./assets/recipes/Maintenance/Mediterranean Chickpea Couscous/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-18","name":"Prawn Garlic Millet Bowl","goal":"Endurance","category":"High Protein Meals","calories":490,"protein":36,"carbs":59,"fat":12,"prepTime":20,"description":"A light seafood bowl with millet for sustained energy.","ingredients":["Prawns","millet","green beans","garlic","lemon","olive oil"],"steps":["Rinse millet and simmer until fluffy; rest covered for 5 minutes.","Sauté garlic in a little oil, add prawns and cook until opaque and just curled.","Serve prawns over millet with greens, lemon and chopped herbs."],"images":{"slot1":{"url":"./assets/recipes/Endurance/Prawn Garlic Millet Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Endurance/Prawn Garlic Millet Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Endurance/Prawn Garlic Millet Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Endurance/Prawn Garlic Millet Bowl/image_01.jpeg","./assets/recipes/Endurance/Prawn Garlic Millet Bowl/image_02.jpeg","./assets/recipes/Endurance/Prawn Garlic Millet Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-19","name":"Sweet Potato Black Bean Tacos","goal":"Weight Loss","category":"Plant Based","calories":410,"protein":17,"carbs":62,"fat":11,"prepTime":25,"description":"Fibre-rich tacos with roasted sweet potato and black beans.","ingredients":["Sweet potato","black beans","corn tortillas","cabbage","salsa"],"steps":["Roast diced sweet potato with cumin and paprika at 200°C/400°F until tender.","Warm and drain black beans; season with lime and a pinch of salt.","Fill warm tortillas with beans, sweet potato, cabbage and salsa; top with avocado."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Sweet Potato Black Bean Tacos/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Sweet Potato Black Bean Tacos/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Sweet Potato Black Bean Tacos/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Sweet Potato Black Bean Tacos/image_01.jpeg","./assets/recipes/Weight_Loss/Sweet Potato Black Bean Tacos/image_02.jpeg","./assets/recipes/Weight_Loss/Sweet Potato Black Bean Tacos/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-20","name":"Chocolate Banana Recovery Shake","goal":"Weight Gain","category":"Recovery Smoothies","calories":460,"protein":27,"carbs":66,"fat":11,"prepTime":30,"description":"A creamy recovery shake with carbohydrates and protein.","ingredients":["Banana","milk","cocoa","Greek yogurt","oats"],"steps":["Add milk, banana, cocoa and yogurt to a blender.","Blend until smooth, adding ice for a colder texture.","Taste and adjust thickness with milk; serve soon after blending."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_01.jpeg","./assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_02.jpeg","./assets/recipes/Weight_Gain/Chocolate Banana Recovery Shake/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-21","name":"Herbed Egg and Avocado Toast","goal":"Maintenance","category":"Quick Breakfast","calories":390,"protein":20,"carbs":34,"fat":19,"prepTime":35,"description":"A balanced breakfast with eggs and unsaturated fats.","ingredients":["Eggs","wholegrain toast","avocado","chives","pepper"],"steps":["Toast whole-grain bread until crisp.","Cook eggs to preference in a non-stick pan; season with pepper and herbs.","Mash avocado with lemon, spread on toast and top with eggs."],"images":{"slot1":{"url":"./assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_01.jpeg","./assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_02.jpeg","./assets/recipes/Maintenance/Herbed Egg and Avocado Toast/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-22","name":"Lemon Herb Baked Cod","goal":"Weight Loss","category":"Lean Protein Meals","calories":340,"protein":38,"carbs":28,"fat":8,"prepTime":40,"description":"A light fish plate with potatoes and crisp vegetables.","ingredients":["Cod","baby potatoes","asparagus","lemon","dill"],"steps":["Place cod in a lined baking dish and season with lemon zest, herbs, pepper and a little olive oil.","Bake at 200°C/400°F for approximately 10–12 minutes, until opaque and flaky.","Serve with steamed vegetables and a whole grain; squeeze fresh lemon over the fish."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Lemon Herb Baked Cod/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Lemon Herb Baked Cod/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Lemon Herb Baked Cod/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Lemon Herb Baked Cod/image_01.jpeg","./assets/recipes/Weight_Loss/Lemon Herb Baked Cod/image_02.jpeg","./assets/recipes/Weight_Loss/Lemon Herb Baked Cod/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-23","name":"Peanut Tofu Soba Noodles","goal":"Muscle Building","category":"Plant Based","calories":530,"protein":27,"carbs":66,"fat":17,"prepTime":45,"description":"Soba noodles and tofu tossed in a peanut-lime dressing.","ingredients":["Tofu","soba noodles","peanut butter","cabbage","carrot","lime"],"steps":["Cook soba noodles according to the packet, rinse briefly and drain.","Sear cubed tofu until golden; whisk peanut butter, soy, lime and warm water into a sauce.","Toss noodles with tofu, shredded vegetables and sauce; finish with sesame."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Peanut Tofu Soba Noodles/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Peanut Tofu Soba Noodles/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Peanut Tofu Soba Noodles/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Peanut Tofu Soba Noodles/image_01.jpeg","./assets/recipes/Muscle_Building/Peanut Tofu Soba Noodles/image_02.jpeg","./assets/recipes/Muscle_Building/Peanut Tofu Soba Noodles/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-24","name":"Quinoa Berry Breakfast Porridge","goal":"Endurance","category":"Quick Breakfast","calories":420,"protein":16,"carbs":70,"fat":10,"prepTime":20,"description":"A warm grain breakfast with fruit and slow-release energy.","ingredients":["Quinoa","milk","raspberries","banana","walnuts","cinnamon"],"steps":["Simmer rinsed quinoa in milk or water until tender, about 15 minutes.","Stir in cinnamon and a little yogurt for creaminess.","Top with fresh berries and chopped nuts; serve warm."],"images":{"slot1":{"url":"./assets/recipes/Endurance/Quinoa Berry Breakfast Porridge/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Endurance/Quinoa Berry Breakfast Porridge/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Endurance/Quinoa Berry Breakfast Porridge/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Endurance/Quinoa Berry Breakfast Porridge/image_01.jpeg","./assets/recipes/Endurance/Quinoa Berry Breakfast Porridge/image_02.jpeg","./assets/recipes/Endurance/Quinoa Berry Breakfast Porridge/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-25","name":"Chicken Lentil Soup","goal":"Weight Loss","category":"Lean Protein Meals","calories":380,"protein":39,"carbs":35,"fat":9,"prepTime":25,"description":"A hearty soup with lean chicken and fibre-rich lentils.","ingredients":["Chicken breast","lentils","carrot","celery","tomato","herbs"],"steps":["Sauté onion, carrot and garlic in a pot until softened.","Add diced chicken, rinsed lentils, stock and herbs; simmer until lentils are tender and chicken is fully cooked.","Shred or dice the chicken, adjust seasoning and finish with lemon and parsley."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Chicken Lentil Soup/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Chicken Lentil Soup/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Chicken Lentil Soup/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Chicken Lentil Soup/image_01.jpeg","./assets/recipes/Weight_Loss/Chicken Lentil Soup/image_02.jpeg","./assets/recipes/Weight_Loss/Chicken Lentil Soup/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-26","name":"Paneer Stuffed Bell Peppers","goal":"Weight Gain","category":"Vegetarian Protein","calories":500,"protein":27,"carbs":45,"fat":23,"prepTime":30,"description":"Baked peppers filled with spiced paneer and rice.","ingredients":["Paneer","bell peppers","rice","peas","tomato","cumin"],"steps":["Halve and deseed bell peppers; bake cut-side up for 10 minutes at 190°C/375°F.","Mix crumbled paneer with cooked rice, peas, tomato, cumin and coriander.","Fill peppers and bake another 15–20 minutes until tender; garnish with herbs."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Paneer Stuffed Bell Peppers/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Paneer Stuffed Bell Peppers/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Paneer Stuffed Bell Peppers/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Paneer Stuffed Bell Peppers/image_01.jpeg","./assets/recipes/Weight_Gain/Paneer Stuffed Bell Peppers/image_02.jpeg","./assets/recipes/Weight_Gain/Paneer Stuffed Bell Peppers/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-27","name":"Blueberry Kefir Smoothie","goal":"Maintenance","category":"Recovery Smoothies","calories":300,"protein":17,"carbs":43,"fat":7,"prepTime":35,"description":"A tangy smoothie with cultured dairy and berries.","ingredients":["Kefir","blueberries","banana","flaxseed","oats"],"steps":["Add kefir, blueberries, banana and oats to a blender.","Blend until smooth, adding water or milk to reach the preferred consistency.","Serve chilled; add ice if desired."],"images":{"slot1":{"url":"./assets/recipes/Maintenance/Blueberry Kefir Smoothie/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Maintenance/Blueberry Kefir Smoothie/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Maintenance/Blueberry Kefir Smoothie/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Maintenance/Blueberry Kefir Smoothie/image_01.jpeg","./assets/recipes/Maintenance/Blueberry Kefir Smoothie/image_02.jpeg","./assets/recipes/Maintenance/Blueberry Kefir Smoothie/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-28","name":"Salmon Avocado Grain Toast","goal":"Muscle Building","category":"Omega-3 Rich Meals","calories":495,"protein":31,"carbs":39,"fat":22,"prepTime":40,"description":"A satisfying toast combining salmon protein and avocado.","ingredients":["Salmon","rye bread","avocado","lemon","dill"],"steps":["Toast whole-grain bread until firm and crisp.","Cook salmon until opaque and flaky, then break into large flakes; use fully cooked leftover salmon if available.","Top toast with mashed avocado, salmon, lemon and dill."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Salmon Avocado Grain Toast/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Salmon Avocado Grain Toast/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Salmon Avocado Grain Toast/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Salmon Avocado Grain Toast/image_01.jpeg","./assets/recipes/Muscle_Building/Salmon Avocado Grain Toast/image_02.jpeg","./assets/recipes/Muscle_Building/Salmon Avocado Grain Toast/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-29","name":"Roasted Vegetable Hummus Bowl","goal":"Weight Loss","category":"Plant Based","calories":365,"protein":13,"carbs":49,"fat":13,"prepTime":45,"description":"Roasted vegetables and hummus in a fibre-rich bowl.","ingredients":["Hummus","zucchini","carrot","cauliflower","quinoa","parsley"],"steps":["Cut vegetables into even pieces; toss with olive oil, pepper and paprika.","Roast at 200°C/400°F until browned and tender, turning once.","Serve over grains with hummus, lemon and fresh herbs."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Roasted Vegetable Hummus Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Roasted Vegetable Hummus Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Roasted Vegetable Hummus Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Roasted Vegetable Hummus Bowl/image_01.jpeg","./assets/recipes/Weight_Loss/Roasted Vegetable Hummus Bowl/image_02.jpeg","./assets/recipes/Weight_Loss/Roasted Vegetable Hummus Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-30","name":"Turkey Egg Breakfast Muffins","goal":"Weight Gain","category":"High Protein Breakfast","calories":360,"protein":32,"carbs":18,"fat":17,"prepTime":20,"description":"Portable baked egg muffins with turkey and vegetables.","ingredients":["Turkey mince","eggs","spinach","bell pepper","cheddar"],"steps":["Heat oven to 180°C/350°F and lightly oil a muffin tin.","Mix cooked lean turkey with whisked eggs, spinach and diced pepper; divide into muffin cups.","Bake 15–20 minutes until the centres are set; cool slightly before removing."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Turkey Egg Breakfast Muffins/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Turkey Egg Breakfast Muffins/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Turkey Egg Breakfast Muffins/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Turkey Egg Breakfast Muffins/image_01.jpeg","./assets/recipes/Weight_Gain/Turkey Egg Breakfast Muffins/image_02.jpeg","./assets/recipes/Weight_Gain/Turkey Egg Breakfast Muffins/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-31","name":"Chia Pudding with Kiwi","goal":"Weight Loss","category":"High Protein Snacks","calories":275,"protein":14,"carbs":31,"fat":10,"prepTime":25,"description":"A make-ahead pudding with fibre and creamy yogurt.","ingredients":["Chia seeds","Greek yogurt","milk","kiwi","vanilla"],"steps":["Whisk chia seeds into milk with vanilla and a little sweetener if desired.","Refrigerate for at least 3 hours, stirring once after 10 minutes to prevent clumps.","Top with peeled kiwi and nuts just before serving."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Chia Pudding with Kiwi/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Chia Pudding with Kiwi/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Chia Pudding with Kiwi/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Chia Pudding with Kiwi/image_01.jpeg","./assets/recipes/Weight_Loss/Chia Pudding with Kiwi/image_02.jpeg","./assets/recipes/Weight_Loss/Chia Pudding with Kiwi/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-32","name":"Chicken Pesto Pasta","goal":"Muscle Building","category":"High Protein Meals","calories":610,"protein":43,"carbs":72,"fat":17,"prepTime":30,"description":"Whole wheat pasta with chicken and basil pesto.","ingredients":["Chicken breast","whole wheat pasta","basil pesto","tomatoes"],"steps":["Cook whole-wheat pasta in salted water until al dente; reserve a little pasta water.","Season and pan-cook chicken until the centre reaches 74°C/165°F; rest and slice.","Toss pasta with pesto, a splash of pasta water, chicken and spinach."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Chicken Pesto Pasta/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Chicken Pesto Pasta/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Chicken Pesto Pasta/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Chicken Pesto Pasta/image_01.jpeg","./assets/recipes/Muscle_Building/Chicken Pesto Pasta/image_02.jpeg","./assets/recipes/Muscle_Building/Chicken Pesto Pasta/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-33","name":"Black Bean Corn Quinoa Salad","goal":"Endurance","category":"Plant Based","calories":445,"protein":19,"carbs":70,"fat":11,"prepTime":35,"description":"A colourful plant-based bowl for carbohydrate replenishment.","ingredients":["Black beans","quinoa","corn","red pepper","lime","coriander"],"steps":["Cook quinoa and allow it to cool slightly.","Rinse black beans; combine with corn, diced pepper, tomato and coriander.","Dress with lime, olive oil and cumin; fold through quinoa and chill briefly."],"images":{"slot1":{"url":"./assets/recipes/Endurance/Black Bean Corn Quinoa Salad/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Endurance/Black Bean Corn Quinoa Salad/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Endurance/Black Bean Corn Quinoa Salad/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Endurance/Black Bean Corn Quinoa Salad/image_01.jpeg","./assets/recipes/Endurance/Black Bean Corn Quinoa Salad/image_02.jpeg","./assets/recipes/Endurance/Black Bean Corn Quinoa Salad/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-34","name":"Cottage Cheese Banana Pancakes","goal":"Weight Gain","category":"High Protein Breakfast","calories":480,"protein":31,"carbs":55,"fat":14,"prepTime":40,"description":"Soft pancakes with cottage cheese for extra protein.","ingredients":["Cottage cheese","banana","eggs","oats","cinnamon"],"steps":["Mash banana and whisk with cottage cheese and eggs; fold in oats or flour to make a thick batter.","Cook small pancakes on a lightly oiled non-stick pan over medium-low heat until bubbles form.","Flip and cook through; serve with berries or yogurt."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Cottage Cheese Banana Pancakes/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Cottage Cheese Banana Pancakes/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Cottage Cheese Banana Pancakes/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Cottage Cheese Banana Pancakes/image_01.jpeg","./assets/recipes/Weight_Gain/Cottage Cheese Banana Pancakes/image_02.jpeg","./assets/recipes/Weight_Gain/Cottage Cheese Banana Pancakes/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-35","name":"Sesame Ginger Tempeh Bowl","goal":"Muscle Building","category":"Plant Based","calories":520,"protein":29,"carbs":58,"fat":18,"prepTime":45,"description":"A satisfying plant-protein bowl with a ginger sesame glaze.","ingredients":["Tempeh","brown rice","broccoli","sesame","ginger","tamari"],"steps":["Slice tempeh and steam for 5 minutes to soften its flavour, then pat dry.","Pan-sear until golden; add ginger, soy, sesame and a little water to glaze.","Serve with rice and steamed vegetables; finish with sesame seeds."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Sesame Ginger Tempeh Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Sesame Ginger Tempeh Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Sesame Ginger Tempeh Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Sesame Ginger Tempeh Bowl/image_01.jpeg","./assets/recipes/Muscle_Building/Sesame Ginger Tempeh Bowl/image_02.jpeg","./assets/recipes/Muscle_Building/Sesame Ginger Tempeh Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-36","name":"Watermelon Feta Mint Salad","goal":"Maintenance","category":"Hydrating Meals","calories":260,"protein":9,"carbs":32,"fat":11,"prepTime":20,"description":"A refreshing hydrating salad with a savoury feta finish.","ingredients":["Watermelon","feta","cucumber","mint","lime"],"steps":["Chill watermelon, then cut into bite-sized cubes.","Crumble feta and tear mint leaves.","Combine gently with lime juice and black pepper; serve cold."],"images":{"slot1":{"url":"./assets/recipes/Maintenance/Watermelon Feta Mint Salad/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Maintenance/Watermelon Feta Mint Salad/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Maintenance/Watermelon Feta Mint Salad/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Maintenance/Watermelon Feta Mint Salad/image_01.jpeg","./assets/recipes/Maintenance/Watermelon Feta Mint Salad/image_02.jpeg","./assets/recipes/Maintenance/Watermelon Feta Mint Salad/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-37","name":"Spiced Chickpea Sweet Potato Tray","goal":"Weight Gain","category":"Plant Based","calories":535,"protein":19,"carbs":77,"fat":17,"prepTime":25,"description":"A hearty plant-based tray meal with tahini dressing.","ingredients":["Chickpeas","sweet potato","tahini","spinach","paprika"],"steps":["Cut sweet potato into cubes and toss with oil, cumin, smoked paprika and pepper.","Roast at 200°C/400°F for 15 minutes, add drained chickpeas and roast until crisp-edged.","Finish with lemon and parsley; serve with yogurt or tahini."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Spiced Chickpea Sweet Potato Tray/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Spiced Chickpea Sweet Potato Tray/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Spiced Chickpea Sweet Potato Tray/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Spiced Chickpea Sweet Potato Tray/image_01.jpeg","./assets/recipes/Weight_Gain/Spiced Chickpea Sweet Potato Tray/image_02.jpeg","./assets/recipes/Weight_Gain/Spiced Chickpea Sweet Potato Tray/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-38","name":"Garlic Chicken Soba Soup","goal":"Weight Loss","category":"Lean Protein Meals","calories":395,"protein":37,"carbs":44,"fat":8,"prepTime":30,"description":"A warming broth with lean chicken and noodles.","ingredients":["Chicken breast","soba noodles","mushrooms","bok choy","ginger"],"steps":["Simmer stock with garlic, ginger and sliced mushrooms for 5 minutes.","Add thin chicken strips and simmer until fully cooked; remove any foam.","Add cooked soba and greens, heat through and finish with spring onion."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Garlic Chicken Soba Soup/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Garlic Chicken Soba Soup/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Garlic Chicken Soba Soup/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Garlic Chicken Soba Soup/image_01.jpeg","./assets/recipes/Weight_Loss/Garlic Chicken Soba Soup/image_02.jpeg","./assets/recipes/Weight_Loss/Garlic Chicken Soba Soup/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-39","name":"Oat Apple Walnut Crumble Bowl","goal":"Endurance","category":"Quick Breakfast","calories":440,"protein":14,"carbs":66,"fat":15,"prepTime":35,"description":"Warm apple oats with walnuts and a spoon of yogurt.","ingredients":["Oats","apple","walnuts","yogurt","cinnamon"],"steps":["Dice apple and cook with cinnamon and a splash of water until just softened.","Toast oats and chopped walnuts in a dry pan until fragrant.","Spoon warm apple into a bowl and top with oat-walnut crumble and yogurt."],"images":{"slot1":{"url":"./assets/recipes/Endurance/Oat Apple Walnut Crumble Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Endurance/Oat Apple Walnut Crumble Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Endurance/Oat Apple Walnut Crumble Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Endurance/Oat Apple Walnut Crumble Bowl/image_01.jpeg","./assets/recipes/Endurance/Oat Apple Walnut Crumble Bowl/image_02.jpeg","./assets/recipes/Endurance/Oat Apple Walnut Crumble Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-40","name":"Smoked Tofu Rainbow Wrap","goal":"Maintenance","category":"Plant Based","calories":420,"protein":24,"carbs":48,"fat":14,"prepTime":40,"description":"A colourful wrap with smoky tofu and crunchy vegetables.","ingredients":["Smoked tofu","whole wheat wrap","red cabbage","carrot","yogurt sauce"],"steps":["Slice smoked tofu and briefly sear if you prefer a warm filling.","Shred carrot, cabbage and pepper; mix yogurt with lemon for a quick dressing.","Layer vegetables and tofu in a whole-wheat wrap, add dressing and roll firmly."],"images":{"slot1":{"url":"./assets/recipes/Maintenance/Smoked Tofu Rainbow Wrap/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Maintenance/Smoked Tofu Rainbow Wrap/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Maintenance/Smoked Tofu Rainbow Wrap/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Maintenance/Smoked Tofu Rainbow Wrap/image_01.jpeg","./assets/recipes/Maintenance/Smoked Tofu Rainbow Wrap/image_02.jpeg","./assets/recipes/Maintenance/Smoked Tofu Rainbow Wrap/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-41","name":"Sardine Tomato Rye Toast","goal":"Endurance","category":"Omega-3 Rich Meals","calories":385,"protein":27,"carbs":38,"fat":13,"prepTime":45,"description":"Omega-3-rich sardines served on wholegrain rye.","ingredients":["Sardines","rye bread","tomato","rocket","lemon"],"steps":["Toast rye bread until crisp.","Drain sardines and gently break into pieces; mix with lemon and black pepper.","Top toast with sliced tomato, sardines and parsley."],"images":{"slot1":{"url":"./assets/recipes/Endurance/Sardine Tomato Rye Toast/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Endurance/Sardine Tomato Rye Toast/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Endurance/Sardine Tomato Rye Toast/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Endurance/Sardine Tomato Rye Toast/image_01.jpeg","./assets/recipes/Endurance/Sardine Tomato Rye Toast/image_02.jpeg","./assets/recipes/Endurance/Sardine Tomato Rye Toast/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-42","name":"Pumpkin Seed Date Smoothie","goal":"Weight Gain","category":"Recovery Smoothies","calories":470,"protein":20,"carbs":61,"fat":17,"prepTime":20,"description":"A naturally sweet smoothie with seeds and oats.","ingredients":["Milk","dates","pumpkin seeds","banana","oats"],"steps":["Soak dates in warm water briefly if firm; drain.","Blend dates, milk, pumpkin seeds, banana and yogurt until smooth.","Add ice or extra milk to adjust thickness; serve chilled."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Pumpkin Seed Date Smoothie/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Pumpkin Seed Date Smoothie/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Pumpkin Seed Date Smoothie/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Pumpkin Seed Date Smoothie/image_01.jpeg","./assets/recipes/Weight_Gain/Pumpkin Seed Date Smoothie/image_02.jpeg","./assets/recipes/Weight_Gain/Pumpkin Seed Date Smoothie/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-43","name":"Crispy Air-Fryer Chickpeas","goal":"Weight Loss","category":"Training Snacks","calories":190,"protein":9,"carbs":27,"fat":5,"prepTime":25,"description":"Crunchy roasted chickpeas for a fibre-rich snack.","ingredients":["Chickpeas","paprika","garlic powder","olive oil"],"steps":["Rinse chickpeas and dry very thoroughly with a clean towel.","Toss with a little oil, paprika, cumin and pepper; air-fry at 190°C/375°F for 12–18 minutes, shaking halfway.","Cool for 5 minutes to crisp further; season lightly and store airtight once completely cool."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Crispy Air-Fryer Chickpeas/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Crispy Air-Fryer Chickpeas/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Crispy Air-Fryer Chickpeas/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Crispy Air-Fryer Chickpeas/image_01.jpeg","./assets/recipes/Weight_Loss/Crispy Air-Fryer Chickpeas/image_02.jpeg","./assets/recipes/Weight_Loss/Crispy Air-Fryer Chickpeas/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-44","name":"Greek Chicken Orzo Salad","goal":"Muscle Building","category":"High Protein Meals","calories":545,"protein":41,"carbs":59,"fat":15,"prepTime":30,"description":"A fresh Greek-inspired pasta salad with grilled chicken.","ingredients":["Chicken","whole wheat orzo","cucumber","olives","tomato","feta"],"steps":["Cook orzo until al dente, drain and cool slightly.","Season chicken with oregano, lemon and pepper; grill until the centre reaches 74°C/165°F, then rest and slice.","Toss orzo with cucumber, tomato, olives and feta; top with chicken and lemon dressing."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Greek Chicken Orzo Salad/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Greek Chicken Orzo Salad/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Greek Chicken Orzo Salad/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Greek Chicken Orzo Salad/image_01.jpeg","./assets/recipes/Muscle_Building/Greek Chicken Orzo Salad/image_02.jpeg","./assets/recipes/Muscle_Building/Greek Chicken Orzo Salad/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-45","name":"Mushroom Spinach Egg Skillet","goal":"Weight Loss","category":"Quick Breakfast","calories":295,"protein":23,"carbs":14,"fat":16,"prepTime":35,"description":"A simple skillet breakfast with vegetables and protein.","ingredients":["Eggs","mushrooms","spinach","onion","olive oil"],"steps":["Sauté sliced mushrooms until their moisture evaporates and edges brown.","Add spinach and cook until wilted; spread vegetables evenly in the pan.","Pour in beaten eggs and cook gently until set, folding once if desired."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Mushroom Spinach Egg Skillet/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Mushroom Spinach Egg Skillet/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Mushroom Spinach Egg Skillet/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Mushroom Spinach Egg Skillet/image_01.jpeg","./assets/recipes/Weight_Loss/Mushroom Spinach Egg Skillet/image_02.jpeg","./assets/recipes/Weight_Loss/Mushroom Spinach Egg Skillet/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-46","name":"Ragi Banana Protein Dosa","goal":"Weight Gain","category":"Vegetarian Protein","calories":450,"protein":21,"carbs":67,"fat":11,"prepTime":40,"description":"A nutritious ragi-based breakfast with banana and protein.","ingredients":["Ragi flour","banana","yogurt","whey or soy protein","cardamom"],"steps":["Whisk ragi flour with mashed banana, yogurt or milk and water into a pourable batter; rest 10 minutes.","Pour a thin layer onto a lightly oiled hot tawa and cook until the edges lift.","Flip briefly to cook the other side; serve with plain yogurt or nut butter."],"images":{"slot1":{"url":"./assets/recipes/Weight_Gain/Ragi Banana Protein Dosa/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Gain/Ragi Banana Protein Dosa/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Gain/Ragi Banana Protein Dosa/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Gain/Ragi Banana Protein Dosa/image_01.jpeg","./assets/recipes/Weight_Gain/Ragi Banana Protein Dosa/image_02.jpeg","./assets/recipes/Weight_Gain/Ragi Banana Protein Dosa/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-47","name":"Citrus Beetroot Lentil Salad","goal":"Endurance","category":"Plant Based","calories":405,"protein":20,"carbs":57,"fat":10,"prepTime":45,"description":"A vibrant lentil salad with citrus and earthy beetroot.","ingredients":["Beetroot","green lentils","orange","rocket","walnuts"],"steps":["Cook lentils until tender but holding their shape; drain and cool.","Roast or boil beetroot until tender, cool, peel and dice.","Toss lentils and beetroot with orange segments, greens and a citrus-olive oil dressing."],"images":{"slot1":{"url":"./assets/recipes/Endurance/Citrus Beetroot Lentil Salad/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Endurance/Citrus Beetroot Lentil Salad/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Endurance/Citrus Beetroot Lentil Salad/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Endurance/Citrus Beetroot Lentil Salad/image_01.jpeg","./assets/recipes/Endurance/Citrus Beetroot Lentil Salad/image_02.jpeg","./assets/recipes/Endurance/Citrus Beetroot Lentil Salad/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-48","name":"Grilled Halloumi Grain Bowl","goal":"Maintenance","category":"Vegetarian Protein","calories":510,"protein":24,"carbs":55,"fat":21,"prepTime":20,"description":"Grilled halloumi with grains and seasonal vegetables.","ingredients":["Halloumi","farro","zucchini","cherry tomatoes","mint"],"steps":["Cook the chosen whole grain and prepare cucumber, tomato and greens.","Slice halloumi and grill in a hot dry pan for 1–2 minutes per side until golden.","Build the bowl with grains and vegetables; top with halloumi and lemon-herb dressing."],"images":{"slot1":{"url":"./assets/recipes/Maintenance/Grilled Halloumi Grain Bowl/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Maintenance/Grilled Halloumi Grain Bowl/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Maintenance/Grilled Halloumi Grain Bowl/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Maintenance/Grilled Halloumi Grain Bowl/image_01.jpeg","./assets/recipes/Maintenance/Grilled Halloumi Grain Bowl/image_02.jpeg","./assets/recipes/Maintenance/Grilled Halloumi Grain Bowl/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-49","name":"Cocoa Almond Yogurt Bark","goal":"Weight Loss","category":"High Protein Snacks","calories":230,"protein":18,"carbs":21,"fat":9,"prepTime":25,"description":"A chilled high-protein snack with cocoa and almonds.","ingredients":["Greek yogurt","cocoa","almonds","raspberries"],"steps":["Line a tray with baking paper and spread thick Greek yogurt into an even layer.","Scatter chopped almonds, cocoa nibs and berries over the surface.","Freeze for 3–4 hours until firm, then break into pieces and keep frozen."],"images":{"slot1":{"url":"./assets/recipes/Weight_Loss/Cocoa Almond Yogurt Bark/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Weight_Loss/Cocoa Almond Yogurt Bark/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Weight_Loss/Cocoa Almond Yogurt Bark/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Weight_Loss/Cocoa Almond Yogurt Bark/image_01.jpeg","./assets/recipes/Weight_Loss/Cocoa Almond Yogurt Bark/image_02.jpeg","./assets/recipes/Weight_Loss/Cocoa Almond Yogurt Bark/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."},{"id":"hive-curated-50","name":"Lemon Dill Chicken Potato Salad","goal":"Muscle Building","category":"High Protein Meals","calories":520,"protein":42,"carbs":48,"fat":17,"prepTime":30,"description":"A creamy lighter potato salad with lean chicken.","ingredients":["Chicken breast","baby potatoes","Greek yogurt","dill","celery"],"steps":["Boil baby potatoes until just tender; drain and cool slightly.","Season chicken with lemon, dill, pepper and a little oil; grill until the centre reaches 74°C/165°F, then rest and slice.","Toss potatoes with Greek yogurt, mustard, lemon and dill; fold in chicken and greens."],"images":{"slot1":{"url":"./assets/recipes/Muscle_Building/Lemon Dill Chicken Potato Salad/image_01.jpeg","label":"Finished dish"},"slot2":{"url":"./assets/recipes/Muscle_Building/Lemon Dill Chicken Potato Salad/image_02.jpeg","label":"Close-up"},"slot3":{"url":"./assets/recipes/Muscle_Building/Lemon Dill Chicken Potato Salad/image_03.jpeg","label":"Serving view"}},"imageUrls":["./assets/recipes/Muscle_Building/Lemon Dill Chicken Potato Salad/image_01.jpeg","./assets/recipes/Muscle_Building/Lemon Dill Chicken Potato Salad/image_02.jpeg","./assets/recipes/Muscle_Building/Lemon Dill Chicken Potato Salad/image_03.jpeg"],"sourceName":"Hivecity AI-generated food photography","sourceUrl":"","imageNote":"AI-generated illustrative food photography, locally bundled with Hivecity."}];
            return function () { return curated; };
        })();

        /* --- RANDOMIZED DISCOVERY ORDER: stable per browser session/user --- */
        window.getUserRecipeOrder = function (uid, recipes) {
            const key = 'hivecity_nutrition_order_v2_' + String(uid || 'guest');
            let ids = [];
            try { ids = JSON.parse(sessionStorage.getItem(key) || '[]'); } catch (e) { ids = []; }
            const byId = new Map(recipes.map(r => [String(r.id), r]));
            if (ids.length !== recipes.length || ids.some(id => !byId.has(String(id)))) {
                const arr = recipes.slice();
                for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; }
                ids = arr.map(r => String(r.id));
                try { sessionStorage.setItem(key, JSON.stringify(ids)); } catch (e) { }
            }
            return ids.map(id => byId.get(String(id))).filter(Boolean);
        };

        /* --- FIREBASE-AUTHENTICATED GOOGLE APPS SCRIPT SYNC --- */
        window.haSaveReportToAppsScript = async function (runData) {
            const url = (window.HIVECITY_CONFIG && window.HIVECITY_CONFIG.GOOGLE_APPS_SCRIPT_URL || '').trim();
            const user = window.hiveAuth && window.hiveAuth.currentUser;
            if (!url || !user) {
                try {
                    const queue = JSON.parse(localStorage.getItem('hivecity_pending_cloud_sync') || '[]');
                    queue.push({ timestamp: Date.now(), data: runData });
                    localStorage.setItem('hivecity_pending_cloud_sync', JSON.stringify(queue));
                } catch (e) { }
                return { status: 'local_saved', message: 'Cloud URL or signed-in user unavailable.' };
            }

            try {
                const idToken = await user.getIdToken();
                const payload = {
                    action: 'save',
                    idToken: idToken,
                    activity: {
                        runId: String(runData.id || ('run-' + Date.now())),
                        startedAt: runData.startedAt || new Date().toISOString(),
                        finishedAt: runData.finishedAt || new Date().toISOString(),
                        distanceMeters: Number(runData.rawMeters || 0),
                        durationSeconds: Number(runData.durationSec || 0),
                        points: (runData.coords || []).slice(0, 100).map(p => ({
                            lat: Number(p.lat),
                            lng: Number(p.lng),
                            accuracy: Number(p.accuracy || 0),
                            timestamp: Number(p.time || p.timestamp || Date.now())
                        }))
                    }
                };
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.error || 'Cloud save was rejected.');
                toast('Activity saved to your Hivecity cloud records.');
                return result;
            } catch (err) {
                console.warn('[HIVECITY Sync] Remote save failed:', err);
                try {
                    const queue = JSON.parse(localStorage.getItem('hivecity_pending_cloud_sync') || '[]');
                    queue.push({ timestamp: Date.now(), data: runData });
                    localStorage.setItem('hivecity_pending_cloud_sync', JSON.stringify(queue));
                } catch (e) { }
                toast('Cloud sync failed; activity remains saved on this device.');
                return { status: 'sync_error', error: err.message };
            }
        };

        window.haFetchReportsFromAppsScript = async function () {
            const url = (window.HIVECITY_CONFIG && window.HIVECITY_CONFIG.GOOGLE_APPS_SCRIPT_URL || '').trim();
            const user = window.hiveAuth && window.hiveAuth.currentUser;
            if (!url || !user) {
                toast('Sign in to load your cloud activities.');
                return { status: 'not_ready', activities: [] };
            }
            try {
                const idToken = await user.getIdToken();
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({ action: 'list', idToken: idToken })
                });
                const result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.error || 'Cloud history request failed.');
                const local = JSON.parse(localStorage.getItem('hive-city-activity-v1') || '{"history":[]}');
                local.history = Array.isArray(local.history) ? local.history : [];
                const seen = new Set(local.history.map(r => r.id));
                (result.activities || []).forEach(a => {
                    if (seen.has(a.runId)) return;
                    local.history.unshift({
                        id: a.runId,
                        date: new Date(a.finishedAt).toLocaleString(),
                        startedAt: a.startedAt,
                        finishedAt: a.finishedAt,
                        route: 'Hive City GPS Track',
                        distance: (Number(a.distanceMeters) / 1000).toFixed(2) + ' km',
                        rawMeters: Number(a.distanceMeters),
                        durationSec: Number(a.durationSeconds),
                        duration: formatDur(Number(a.durationSeconds)),
                        coords: (a.points || []).map(p => ({ lat: p.lat, lng: p.lng, accuracy: p.accuracy, time: p.timestamp }))
                    });
                });
                localStorage.setItem('hive-city-activity-v1', JSON.stringify(local));
                haState = Object.assign(haState, local);
                toast('Your cloud activity history has been loaded.');
                if (location.hash === '#activity') go(1);
                return result;
            } catch (err) {
                console.warn('[HIVECITY Sync] Remote history failed:', err);
                toast('Could not load cloud history. Check the Apps Script deployment and browser connection.');
                return { status: 'fetch_error', error: err.message, activities: [] };
            }
        };

        V.discover = () => `<div class="hero hz"><img data-par=".2" src="${IM[92]}" alt="Two runners smiling during a race"><div class="grain" style="position:absolute"></div><div style="width:100%"><p class="it rv in" style="color:#C7F36B;font-size:20px">More than a run. A community in motion.</p><h1 class="big" style="font-size:clamp(64px,16vw,220px)">${split('FIND YOUR ')}<span class="lm">${split('PACE')}</span></h1><p class="row"><a class="btn" style="background:#C7F36B;color:#10110F" href="#activity">JOIN THE HIVE</a><a class="btn g" style="color:#fff;border-color:#fff8" href="#community">EXPLORE THE MOVEMENT</a></p><div class="cue"></div></div></div>
<div class="mq"><div>${'<span>ONE MORE STEP</span><span>SHOW UP. MOVE FORWARD.</span><span>STRONGER WITH EVERY STRIDE</span>'.repeat(2)}</div></div>
<h2 class="big" data-sc style="text-align:center">YOUR ONLY COMPETITION IS WHO YOU WERE <span class="lm">YESTERDAY</span></h2>
<div class="grid" style="margin:30px 0">${[90, 89, 96].map(n => `<div class="cl"><img src="${IM[n]}" alt="Athlete running"></div>`).join('')}</div>
<h2 class="big rv" style="margin-top:60px">FIND YOUR <span class="lm">PEOPLE</span></h2><div style="overflow:hidden;margin:20px 0"><div class="hx" data-hx=".5">${[3, 4, 5, 91, 97, 92].map(n => `<img src="${IM[n]}" alt="Runners together">`).join('')}</div></div><div style="overflow:hidden;margin:20px 0"><div class="hx" data-hx="-.5" style="margin-left:-70vw">${[97, 91, 92, 5, 4, 3].map(n => `<img src="${IM[n]}" alt="Runners together">`).join('')}</div></div>
<div class="grid" style="text-align:center;margin:50px 0">${[[P.length, 'products in the shop'], [EV.length, 'upcoming events'], [5, 'shop categories'], [12, 'app pages']].map(s => `<div><div class="num big rv" data-to="${s[0]}" style="color:var(--ac)">0</div>${s[1]}</div>`).join('')}</div>
<h2 class="big rv">RUN <span class="lm">YOUR WAY</span></h2><div class="sp2"><div tabindex="0"><img src="${IM[57]}" alt="Indoor training weights"><h3>INDOOR</h3></div><div tabindex="0"><img src="${IM[97]}" alt="Outdoor group run"><h3>OUTDOOR</h3></div></div>
<h2 class="big rv" style="margin-top:60px">UPCOMING <span class="lm">EXPERIENCES</span></h2><div class="sc">${EV.map(e => `<a href="#events"><img src="${typeof e.im === "string" && e.im.startsWith("http") ? e.im : (IM[e.im] || IM[90])}" alt="${e.n}"><div class="in2"><span class="tag" style="color:#fff">${e.c}</span><h3>${e.n}</h3>${e.d} · ${e.v}<br><b>Get tickets</b></div></a>`).join('')}</div>
<div class="hero" style="min-height:90vh;margin-top:60px;text-align:center;justify-content:center;align-items:center"><img data-par=".08" src="${IM[91]}" alt="Group running down a tree-lined road"><div><p class="big">THE CITY IS MOVING.</p><p class="big lm">ARE YOU?</p><a class="btn" style="background:#C7F36B;color:#10110F" href="#events">JOIN HIVE CITY</a></div></div>`;
        const oc = V.community; V.community = () => oc() + `<h2 class="big" style="margin-top:30px">Community <span class="lm">highlights</span></h2><p class="tag">Drag to spin · hover to enlarge · tap to open</p><div class="orbit" id="orbit"><img class="oc" src="${IM[3]}" alt="Featured group run">${[4, 5, 92, 97, 91, 96].map(n => `<img class="ob" src="${IM[n]}" alt="Community photo" onclick="lb(${n})">`).join('')}</div>`;
        function lb(n) { $('#lb').innerHTML = `<div class="lbx" onclick="this.parentNode.innerHTML=''"><img src="${IM[n]}" alt="Community photo"></div>` }
        let st; function story(i) { const L = [90, 4, 5, 92, 96]; clearTimeout(st); const o = $('#lb'); if (i < 0 || i >= L.length) { o.innerHTML = ''; return } o.innerHTML = `<div class="lbx stv"><div class="pb">${L.map((_, k) => `<i class="${k < i ? 'f' : ''}"><b style="${k == i ? 'animation:fill 4s linear forwards' : ''}"></b></i>`).join('')}</div><img src="${IM[L[i]]}" alt="Story ${i + 1}"><u style="left:0" onclick="story(${i - 1})"></u><u style="right:0" onclick="story(${i + 1})"></u><button class="chip x" onclick="story(-1)" aria-label="Close">✕</button></div>`; st = setTimeout(() => story(i + 1), 4000) }
        function orbit() { const w = $('#orbit'); if (!w) return; const els = [...w.querySelectorAll('.ob')], red = matchMedia('(prefers-reduced-motion:reduce)').matches; let a = 0, v = 0, dr = 0, lx = 0; w.onpointerdown = e => { dr = 1; lx = e.clientX }; addEventListener('pointerup', () => dr = 0); w.onpointermove = e => { if (dr) { v = (e.clientX - lx) * .3; a += v; lx = e.clientX } }; (function t() { if (!document.body.contains(w)) return; if (!dr) { a += v; v *= .95; if (!red && Math.abs(v) < .05) v = .12 } const R = w.clientWidth / 2.6; els.forEach((el, i) => { const r = (a + i * 360 / els.length) * Math.PI / 180, s = Math.sin(r); el.style.transform = `translate(${Math.cos(r) * R}px,${s * R * .28}px) scale(${.7 + .3 * (s + 1) / 2})`; el.style.zIndex = Math.round(s * 10) + 10 }); requestAnimationFrame(t) })() }
        const io = new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; const t = e.target; t.classList.add('in'); if (t.dataset.to) { const to = +t.dataset.to, s = performance.now(); (function c(n) { const p = Math.min(1, (n - s) / 1200); t.textContent = Math.round(to * p); if (p < 1) requestAnimationFrame(c) })(s) } io.unobserve(t) }), { threshold: .15 });
        function fx(h) { const B = { shop: [61, 'GEAR UP. GET OUT.'], activity: [89, 'EVERY KILOMETRE COUNTS'], nutrition: [15, 'FUEL THE MOVEMENT'], profile: [90, 'YOUR PACE. YOUR STORY.'], community: [97, 'FIND YOUR PEOPLE'] }; if (B[h]) app.insertAdjacentHTML('afterbegin', `<div class="hero bn"><img src="${IM[B[h][0]]}" alt=""><div><h2 class="big" style="margin:0">${B[h][1]}</h2></div></div>`); app.querySelectorAll('.rv,.cl,[data-to]').forEach(e => io.observe(e)); if (h == 'community') { orbit();[...app.querySelectorAll('button.chip')].filter(b => b.querySelector('img')).forEach((b, i) => b.onclick = () => story(i)); app.querySelectorAll('.clip').forEach(c => c.addEventListener('dblclick', e => { const s = document.createElement('span'); s.className = 'hv'; s.textContent = '♥'; s.style.left = e.clientX - 20 + 'px'; s.style.top = e.clientY - 20 + 'px'; document.body.append(s); setTimeout(() => s.remove(), 1000) })) } dispatchEvent(new Event('scroll')) }
        let _pl = null; const _q = () => _pl || (_pl = ['[data-par]', '[data-hx]', '[data-sc]'].map(s => [...document.querySelectorAll(s)]));
        let tk; addEventListener('scroll', () => {
            if (tk) return; tk = requestAnimationFrame(() => {
                tk = 0; const hh = innerHeight, [pa, hx, sc] = _q(), sb = $('#sb');
                const rp = pa.map(e => e.parentNode.getBoundingClientRect().top), rh = hx.map(e => e.parentNode.getBoundingClientRect().top), rs = sc.map(e => e.getBoundingClientRect().top);
                if (sb) sb.style.transform = 'scaleX(' + Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight - hh)) + ')';
                pa.forEach((e, i) => e.style.translate = '0 ' + (-rp[i] * e.dataset.par) + 'px'); hx.forEach((e, i) => e.style.transform = 'translateX(' + ((rh[i] - hh) * e.dataset.hx) + 'px)'); sc.forEach((e, i) => { const p = Math.max(0, Math.min(1, 1 - rs[i] / hh)); e.style.transform = 'scale(' + (.75 + p * .3) + ')' })
            })
        }, { passive: true });
        addEventListener('pointermove', e => { const g = $('#cg'); g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px'; if (e.pointerType != 'mouse') return; const c = e.target.closest && e.target.closest('.card'); if (c) { const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; c.style.transform = `perspective(700px) rotateX(${-y * 6}deg) rotateY(${x * 8}deg) translateY(-3px)` } const b = e.target.closest && e.target.closest('.btn'); if (b) { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .2}px,${(e.clientY - r.top - r.height / 2) * .3}px)` } });
        addEventListener('pointerout', e => { const t = e.target.closest && e.target.closest('.card,.btn'); if (t) t.style.transform = '' });
        document.body.insertAdjacentHTML('beforeend', '<div id="sh"></div>');
        Object.assign(S, { pg: 2, pl: [], gl: 'day', rf: 'All', rc: -1, sa: {}, lkd: {} });
        const esc = s => s.replace(/</g, '&lt;');
        V.discover = () => `<div class='gh'><div><span class='pill rv in'> </span><h1>Find your pace, <span class='it' style='font-size:inherit'>one quest</span> at a time.</h1><p style='font-size:18px;color:var(--mu);max-width:480px'>HIVE CITY turns running, eating well and showing up into small daily quests, with a crew that moves with you.</p><p class='row'><a class='btn' href='#activity'>Join the Hive</a><a class='btn g' href='#nutrition'></a></p></div><div class='col'><img class='fl f1' src='${IM[92]}' alt='Two runners smiling'><img class='fl f2' src='${IM[90]}' alt='Runner in morning light'><div class='ph'><img src='${IM[4]}' alt='Runner in pink'><div><span class='tag'>TODAY'S QUEST</span><h3 style='margin:6px 0'>Run 3 km, easy</h3><div class='bar'><i style='width:62%'></i></div><p class='num' style='font-size:13px'>1.9 / 3.0 km · example</p><button class='btn' style='width:100%'>Start quest</button></div></div></div></div>
<h2 class='stp rv'>Grow four stats.</h2><div class='grid' style='grid-template-columns:repeat(auto-fit,minmax(230px,1fr))'>${[['Pace', 89, 'Run, track, improve', 70], ['Fuel', 15, 'Eat with intention', 55], ['Crew', 97, 'Move with people', 80], ['Rhythm', 93, 'Show up to events', 40]].map(s => `<div class='st rv'><img src='${IM[s[1]]}' alt='${s[0]}'><div><h3 style='margin:0'>${s[0]}</h3>${s[2]}<div class='bar' style='margin-top:8px;background:#fff4'><i style='width:${s[3]}%;background:#C7F36B'></i></div></div></div>`).join('')}</div>
<div class='grid' style='grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin:70px 0;align-items:center'><div><h2 class='stp'>Today's quests</h2><p style='color:var(--mu)'>Tick them off and watch your XP fill.</p><div class='bar' style='height:12px'><i id='xp' style='width:0'></i></div><p class='num' id='xt'>0 / 4 done</p></div><div id='qs'>${['Run or walk 3 km', 'Log a protein-rich meal', 'Drink 8 glasses of water', 'Cheer on a crewmate'].map(q => `<label class='qx'><input class='ck' type='checkbox' onchange='qx()'><span>${q}</span></label>`).join('')}</div></div>
<h2 class='stp rv'>Move together.</h2><div style='overflow:hidden;margin:20px 0'><div class='hx' data-hx='.5'>${[3, 4, 5, 91, 97, 92].map(n => `<img src='${IM[n]}' alt='Runners together'>`).join('')}</div></div>
<h2 class='stp rv' style='margin-top:60px'>Upcoming experiences</h2><div class='sc'>${EV.map(e => `<a href='#events'><img src='${IM[e.im]}' alt='${e.n}'><div class='in2'><span class='tag' style='color:#fff'>${e.c}</span><h3>${e.n}</h3>${e.d} · ${e.v}<br><b>Get tickets</b></div></a>`).join('')}</div>
<div class='hero' style='min-height:70vh;margin-top:70px;text-align:center;justify-content:center;align-items:center;border-radius:32px'><img data-par='.06' src='${IM[91]}' alt='Group running down a tree-lined road'><div><h2 class='big'>THE CITY IS MOVING.<br><span class='lm'>ARE YOU?</span></h2><a class='btn' style='background:#C7F36B;color:#10110F' href='#activity'>Join HIVE CITY</a></div></div>`;
        function qx() { const c = [...document.querySelectorAll('#qs input')], n = c.filter(x => x.checked).length; $('#xp').style.width = n / c.length * 100 + '%'; $('#xt').textContent = n + ' / ' + c.length + ' done' + (n == c.length ? ' ' : '') }
        const PS = [{ u: 'Maya', im: 3, cap: 'Sunday long run crew', lk: 24, c: [['Jon', 'Pace was perfect!'], ['Ana', 'See you next week']] }, { u: 'Kai', im: 91, cap: 'Early road session', lk: 18, c: [['Maya', 'Love this route']] }, { u: 'Ren', im: 97, cap: 'Autumn trail group', lk: 31, c: [] }, { u: 'Sol', im: 5, cap: 'Finish-line energy', lk: 42, c: [['Kai', 'Legends!']] }];
        const CH = [['Maya', 'Anyone up for a 5K tomorrow?'], ['Kai', 'I am in. 6:30 at the park?']];
        const mh = m => `<div class='msg ${m[0] == 'You' ? 'me' : 'ai'}'><b>${m[0] == 'You' ? '' : m[0] + ' '}</b>${esc(m[1])}</div>`;
        V.community = () => `<h1 class='big'>Community</h1><div class='row' style='margin:12px 0'>${[90, 4, 5, 92, 96].map((n, i) => `<button class='chip' style='padding:3px;border:3px solid var(--hl);border-radius:50%;width:64px;height:64px'><img src='${IM[n]}' alt='Story ${i + 1}' style='width:100%;height:100%;border-radius:50%;object-fit:cover'></button>`).join('')}</div><div class='grid' style='grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start'><div>${PS.map((p, i) => `<div class='card' style='margin-bottom:14px'><div class='row'><span class='av'>${p.u[0]}</span><b>${p.u}</b></div><div class='clip' style='margin-top:8px' ondblclick='lk(${i},1)'><img class='p' src='${IM[p.im]}' alt='${p.cap}'></div><div class='row' style='margin-top:8px'><button class='chip ${S.lkd[i] ? 'on' : ''}' id='lk${i}' onclick='lk(${i})'>${S.lkd[i] ? '♥' : '♡'} ${p.lk + (S.lkd[i] ? 1 : 0)}</button><button class='chip' id='cc${i}' onclick='cm(${i})'> ${p.c.length}</button><button class='chip' onclick='shr(${i})'>Share</button><button class='chip' onclick='bk2(this)'>Save</button></div><p><b>${p.u}</b> ${p.cap}</p></div>`).join('')}</div><div class='card' style='position:sticky;top:70px'><h2>Crew chat</h2><div id='cht' style='max-height:320px;overflow:auto'>${CH.map(mh).join('')}</div><div class='row' style='margin-top:8px'><input type='text' id='cin' placeholder='Message the crew…' style='flex:1;width:auto' aria-label='Message' onkeydown='event.keyCode==13&&cs()'><button class='btn' onclick='cs()'>Send</button></div></div></div><h2 class='big' style='margin-top:30px'>Community <span class='lm'>highlights</span></h2><p class='tag'>Drag to spin · hover to enlarge · tap to open</p><div class='orbit' id='orbit'><img class='oc' src='${IM[3]}' alt='Featured group run'>${[4, 5, 92, 97, 91, 96].map(n => `<img class='ob' src='${IM[n]}' alt='Community photo' onclick='lb(${n})'>`).join('')}</div>`;
        function lk(i, d) { const on = d ? true : !S.lkd[i]; S.lkd[i] = on; const b = $('#lk' + i); b.className = 'chip' + (on ? ' on' : ''); b.textContent = (on ? '♥ ' : '♡ ') + (PS[i].lk + (on ? 1 : 0)) }
        function bk2(b) { b.classList.toggle('on'); b.textContent = b.classList.contains('on') ? 'Saved ✓' : 'Save' }
        function sh0() { $('#sh').innerHTML = '' }
        function cm(i) { const p = PS[i]; $('#sh').innerHTML = `<div class='sheet'><div class='row'><h3 style='flex:1;margin:0'>Comments</h3><button class='chip' onclick='sh0()'>✕</button></div><div>${p.c.map(c => `<p><b>${c[0]}</b> ${esc(c[1])}</p>`).join('') || '<p class=tag>No comments yet. Be first.</p>'}</div><div class='row'><input type='text' id='ci2' placeholder='Add a comment…' style='flex:1;width:auto' aria-label='Comment'><button class='btn' onclick='ac(${i})'>Post</button></div></div>` }
        function ac(i) { const v = $('#ci2').value.trim(); if (!v) return; PS[i].c.push(['You', v]); cm(i); $('#cc' + i).textContent = ' ' + PS[i].c.length }
        function shr(i) { $('#sh').innerHTML = `<div class='sheet'><div class='row'><h3 style='flex:1;margin:0'>Share</h3><button class='chip' onclick='sh0()'>✕</button></div><p class='row'><button class='btn g' onclick='try{navigator.clipboard.writeText(location.href)}catch(e){};toast("Link copied");sh0()'>Copy link</button><button class='btn g' onclick='cs2(${i})'>Send to crew chat</button></p></div>` }
        function cs2(i) { CH.push(['You', 'Check this out: ' + PS[i].cap]); sh0(); toast('Sent to crew chat'); if ($('#cht')) $('#cht').insertAdjacentHTML('beforeend', mh(CH[CH.length - 1])) }
        function cs() { const v = $('#cin').value.trim(); if (!v) return; $('#cin').value = ''; const c = $('#cht'); CH.push(['You', v]); c.insertAdjacentHTML('beforeend', mh(['You', v]) + `<div class='msg ai' id='ty'>…</div>`); c.scrollTop = 1e5; setTimeout(() => { const r = [['Maya', 'Nice, count me in!'], ['Kai', 'Love it. See you there.'], ['Ren', 'Let us go!']][Math.random() * 3 | 0]; CH.push(r); const t = $('#ty'); if (t) t.outerHTML = mh(r); c.scrollTop = 1e5 }, 1000) }
        R.length = 0; R.push(['discover', 'Home'], ['community', 'Social'], ['activity', 'Activity'], ['events', 'Events'], ['nutrition', 'Nutrition'], ['shop', 'Shop'], ['bookings', 'Overview'], ['notifications', 'Notifications'], ['help', 'Help'], ['profile', 'Profile']);

        /* Admin management is handled by the separate Hivecity Admin application. */

        /* 80 real-photo catalog products loaded directly in P */
        Object.assign(S, { fo: {}, seen: {}, py: [], at: 'w', bt: 't', last: -1, nt: 0 });
        const bc = () => (typeof window.getHiveBookedTickets === 'function' ? window.getHiveBookedTickets().length : 0);
        function hiveEscape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
        chrome = function (h) {
            const sp = h == '' || h == 'auth', n = cnt() + bc();
            const navLogo = `<img src='./assets/images/hivecity-logo-round.png' alt='HIVE CITY' style='width:100%;height:100%;object-fit:contain;border-radius:9999px;background:#000;display:block'>`;

            const unreadCampaigns = typeof window.getHiveUnreadCampaignsCount === 'function' ? window.getHiveUnreadCampaignsCount() : 0;
            $('#nav').innerHTML = sp ? '' : `<nav class='top'><button class='avb' onclick="location.hash='discover'" aria-label='HIVE CITY Home' style='background:#000;border-color:#000'>${navLogo}</button><b>HIVE CITY</b>${R.map(([r, l]) => `<a href='#${r}' class='${h == r ? 'on' : ''} ${['discover', 'shop', 'bookings', 'notifications', 'help', 'profile'].includes(r) ? 'keep' : ''}'>${l}${r == 'bookings' && n ? ' (' + n + ')' : ''}${r == 'notifications' && unreadCampaigns ? ' (' + unreadCampaigns + ')' : ''}</a>`).join('')}<button class='chip' onclick='theme()' aria-label='Toggle theme'>◐</button></nav>`;
            $('#bn').innerHTML = sp ? '' : `<nav class='bot'>${[['discover', 'Home'], ['community', 'Social'], ['activity', 'Activity'], ['nutrition', 'Food'], ['events', 'Events'], ['profile', 'Profile']].map(([r, l]) => `<a href='#${r}' class='${h == r ? 'on' : ''}'>${l}</a>`).join('')}</nav>`;
        };
        function sh0() { $('#sh').innerHTML = '' }

        window.hiveHandlePhotoUpload = function (input) {
            const file = input && input.files && input.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) { toast('Please select an image file'); return; }
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = async function () {
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

                    const user = window.hiveCurrentUser;
                    if (user) {
                        try { if (user.updateProfile) await user.updateProfile({ photoURL: resizedDataUrl }); } catch (_) { }
                        try {
                            await window.hiveDb.collection('users').doc(user.uid).set({
                                photoURL: resizedDataUrl,
                                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                            }, { merge: true });
                        } catch (err) { console.warn('Could not save photo to Firestore:', err); }
                    }
                    try {
                        let sess = JSON.parse(sessionStorage.getItem('hivecityUser') || '{}');
                        sess.photoURL = resizedDataUrl;
                        sessionStorage.setItem('hivecityUser', JSON.stringify(sess));
                    } catch (_) { }

                    const avEl = document.getElementById('profAvatar');
                    if (avEl) {
                        avEl.style.filter = 'none';
                        avEl.style.opacity = '1';
                        avEl.innerHTML = `<img src='${resizedDataUrl}' alt='Profile photo' style='width:100%;height:100%;object-fit:cover'>`;
                    }
                    if (typeof chrome === 'function') {
                        chrome(location.hash.slice(1));
                    }
                    const hsProfEl = document.getElementById('hsProfPhoto');
                    if (hsProfEl) {
                        hsProfEl.innerHTML = `<img src='${resizedDataUrl}' alt='Profile photo' style='width:100%;height:100%;object-fit:cover'>`;
                    }
                    toast('Profile photo updated!');
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        };

        function prof() {
            const user = window.hiveCurrentUser;
            if (!user) { toast('Please sign in to view your profile'); location.hash = 'auth'; return; }
            let sessData = {};
            try { sessData = JSON.parse(sessionStorage.getItem('hivecityUser') || '{}'); } catch (_) { }
            let data = {
                name: user.displayName || sessData.name || '',
                email: user.email || sessData.email || '',
                mobile: sessData.mobile || '',
                photoURL: user.photoURL || window.hiveCustomPhoto || sessData.photoURL || ''
            };

            const renderDrawer = (d) => {
                const name = String(d.name || user.displayName || 'Hive member');
                const email = String(d.email || user.email || '');
                const mobile = String(d.mobile || '');
                const photo = String(d.photoURL || user.photoURL || '');
                const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || 'A';
                $('#sh').innerHTML = `<div class='lbx' style='place-items:stretch end;z-index:84' onclick='if(event.target==this)sh0()'><div class='drawer'><img class='cv' src='${IM[89]}' alt='Hive City cover' loading='lazy' decoding='async'><button class='chip' style='position:absolute;top:10px;right:10px' onclick='sh0()' aria-label='Close'>✕</button><div style='padding:24px 18px 18px'><div class='row' style='align-items:center'><div class='prof-avatar-wrap' onclick="document.getElementById('hivePhotoInput').click()" style="position:relative;width:84px;height:84px;border-radius:50%;cursor:pointer;flex:none;margin-right:16px" title="Add or change photo"><input type="file" id="hivePhotoInput" accept="image/*" style="display:none" onchange="hiveHandlePhotoUpload(this)"><div class='av' id='profAvatar' style='width:84px;height:84px;font-size:32px;overflow:hidden;border-radius:50%;border:2px solid var(--hl);${photo ? '' : 'filter:blur(1.2px);opacity:0.85;'}'>${photo ? `<img src='${hiveEscape(photo)}' alt='Profile photo' style='width:100%;height:100%;object-fit:cover'>` : initials}</div><div style='position:absolute;inset:0;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.22);pointer-events:none'><span style='display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#10110F;color:#FFFFFF;font-size:22px;font-weight:700;line-height:1;box-shadow:0 2px 5px rgba(0,0,0,0.4)'>+</span></div></div><div><h2 style='margin:0'>${hiveEscape(name)}</h2><span class='tag'>Hive member</span></div></div><p style='margin-top:16px'>${email ? `<b>Email</b><br>${hiveEscape(email)}` : ''}${mobile ? `<br><br><b>Mobile</b><br>${hiveEscape(mobile)}` : ''}</p><div class='card' style='margin:14px 18px'><b>Activity summary</b><p style='margin:6px 0 0;color:var(--mu)'>Your run statistics will appear here after real activity is recorded. No sample statistics are shown.</p></div><h3>Tickets & orders</h3><a class='btn g' href='#bookings' onclick='sh0()'>Open Overview & tickets</a><h3 style='margin-top:20px'>Settings</h3><p><button class='chip' onclick='theme()'>◐ Light / dark</button></p><button class='btn' onclick='hiveSignOut()'>Log out</button></div></div></div>`;
            };

            // 1. Render immediately with available synchronous / cached state (< 5ms)
            renderDrawer(data);

            // 2. Fetch fresh Firestore data in background without blocking drawer visibility
            if (window.hiveDb && user.uid) {
                window.hiveDb.collection('users').doc(user.uid).get().then(snap => {
                    if (snap.exists) {
                        data = { ...data, ...snap.data() };
                        renderDrawer(data);
                    }
                }).catch(err => console.warn('Could not load Hive profile in background:', err));
            }
        }

        V.auth = () => `
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));min-height:88vh;gap:0;border-radius:28px;overflow:hidden;border:1px solid var(--bd)">
  <div class="hero" style="border-radius:0;min-height:360px">
    <img src="${IM[90]}" alt="Runner in golden light">
    <div>
      <p class="it" style="color:#C7F36B">Your next quest starts here.</p>
      <h1 class="big">FIND YOUR PACE</h1>
      <div class="row">
        ${[92, 5, 93, 91].map(n => `<img src="${AV[n]}" alt="" style="position:static;width:40px;height:40px;border-radius:50%;animation:none">`).join('')}
        <span style="font-size:13px">Join the crew</span>
      </div>
    </div>
  </div>

  <form class="card" id="af" style="align-self:center;border:0;border-radius:0;padding:36px" novalidate>
    <h2 id="authTitle">Welcome to the Hive</h2>
    <p class="it" id="authSubtitle">Sign in to continue your journey.</p>

    <div id="registerFields" style="display:none">
      <p><input type="text" id="fullName" placeholder="Full name" autocomplete="name"></p>
      <p><input type="email" id="regEmail" placeholder="Email address" autocomplete="email"></p>
      <p id="regVerifyHint" style="display:none;margin:-6px 0 10px;font-size:12px;color:#1B4D3E;font-weight:600">Verify your email address first — after signing up, click the verification link in your inbox before logging in.</p>
      <p><input type="tel" id="regMobile" placeholder="10-digit mobile number" autocomplete="tel"></p>
    </div>

    <div id="loginFields">
      <p><input type="text" id="em" placeholder="Email address" aria-label="Email address" autocomplete="username"></p>
    </div>

    <p><input type="password" id="pw" placeholder="Password (8+ chars)" aria-label="Password" autocomplete="current-password"></p>
    <p id="forgotPwWrap" style="margin:-6px 0 10px;text-align:right">
      <button type="button" id="forgotPwBtn" style="background:none;border:0;padding:0;color:#1B4D3E;font-size:13px;font-weight:600;cursor:pointer;text-decoration:underline">Forgot Password?</button>
    </p>

    <p id="er" style="color:#d33;min-height:20px;margin:0"></p>

    <button class="btn" id="go" type="submit">Sign in</button>

    <p style="text-align:center;margin-top:18px">
      <button type="button" id="authMode" class="btn" style="background:transparent;color:inherit;border:1px solid var(--bd)">
        Create an account
      </button>
    </p>

    <div style="text-align:center;margin:15px 0">OR</div>

    <button type="button" id="googleSignIn" class="btn" style="background:transparent;color:inherit;border:1px solid var(--bd);width:100%">
      <strong style="color:#4285F4;font-size:18px">G</strong>
      &nbsp; Continue with Google
    </button>
  </form>
</div>`;

        const d0 = V.discover; V.discover = () => d0().replace("<div class='hero' style='min-height:70vh", `<h2 class='stp rv' style='margin-top:60px'>Fuel the miles.</h2><div class='bento'><a class='b1 rv' href='#nutrition'><img src='${IM[15]}' alt='Colourful plate of healthy food'></a>${[10, 12, 21].map(n => `<a class='rv' href='#nutrition'><img src='${IM[n]}' alt='Healthy meal'></a>`).join('')}<div class='card' style='display:grid;place-items:center;text-align:center'><div><h3>Find the recipe</h3><a class='btn' href='#nutrition?create=1'>Build your plate</a></div></div></div>
<h2 class='stp rv' style='margin-top:60px'>Gear up.</h2><div class='bento'>${[[61, 'b1'], [62, ''], [64, ''], [57, ''], [58, '']].map(x => `<a class='${x[1]} rv' href='#shop'><img src='${IM[x[0]]}' alt='Sports gear'></a>`).join('')}</div>
<h2 class='stp rv' style='margin-top:60px'>Moments from the crew.</h2><div class='wall'>${[3, 89, 15, 91, 96, 5, 87, 93, 86].map(n => `<img class='rv' loading='lazy' src='${IM[n]}' alt='Community moment'>`).join('')}</div>
<h2 class='stp rv' style='margin-top:60px'>Community highlights.</h2><div class='orbit' id='orbit'><img class='oc' src='${IM[3]}' alt='Featured group run'>${[4, 5, 92, 97, 91, 96].map(n => `<img class='ob' src='${IM[n]}' alt='Community photo' onclick='lb(${n})'>`).join('')}</div><div class='mq'><div>${'<span>ONE MORE STEP</span><span>SHOW UP. MOVE FORWARD.</span><span>STRONGER WITH EVERY STRIDE</span>'.repeat(2)}</div></div><div class='hero' style='min-height:70vh`);
        /* SOCIAL */
        const U = [['maya.runs', 4], ['kai_trails', 90], ['ren.lifts', 25], ['sol.fuel', 33], ['jo_miles', 92], ['ana.moves', 26], ['theo.pace', 95], ['lia.yoga', 28]];
        const SF = [[[4, '5K done before sunrise ✅', '2h'], [3, 'Crew brunch ', '1h']], [[90, 'Golden hour on the trail', '3h'], [91, 'Sunday group run', '2h']], [[85, 'Core circuit ', '4h'], [57, 'New dumbbells', '4h']], [[15, 'Post-run fuel bowl', '5h'], [10, 'Meal prep Sunday', '5h']], [[92, 'Race day with my partner!', '6h'], [5, 'Finish line energy', '6h']], [[26, 'Wind shell weather', '7h'], [25, 'Stretch session', '7h']], [[95, 'Hurdle drills', '8h'], [89, 'Track Tuesday', '8h']], [[28, 'Studio vibes', '9h'], [87, 'Mum and me workout', '9h']]];
        const PO = [[0, [3, 97], 'Sunday long run with the crew. 18 km, zero regrets.', '#longrun #hivecity', 248, '2h'], [1, [90], 'Chasing the light. Golden hour on the trail hits different.', '#trailrunning', 412, '3h'], [3, [15, 10], 'Post-run fuel: grains, greens, egg. Protein sorted.', '#fuel #mealprep', 136, '5h'], [4, [92], 'Race day with my favourite running partner! 10K done.', '#raceday', 523, '6h'], [2, [85, 57], 'Core and dumbbells before work. Small wins.', '#strength', 97, '7h'], [6, [95, 89], 'Hurdle drills then track intervals. Legs are cooked.', '#trackday', 181, '8h'], [5, [26], 'Wind shell season is here.', '#gear', 76, '9h'], [7, [28, 87], 'Studio session with my little one. Best workout partner.', '#family', 305, '11h'], [0, [4, 91], 'Pink shoes, pink skies, 5K PB.', '#pb', 611, '1d'], [1, [93, 5], 'City 10K was electric. See you at the next one!', '#city10k', 389, '1d']];
        const CC = [['kai_trails', 'Absolute legend '], ['sol.fuel', 'That pace though!'], ['jo_miles', 'Count me in next time'], ['ana.moves', 'Goals!']];
        PS.length = 0; PS.push(...PO.map((p, i) => ({ uu: p[0], u: U[p[0]][0], im: p[1], cap: p[2], tg: p[3], lk: p[4], t: p[5], c: CC.slice(0, i % 3 + 1).map(x => [...x]) })));
        const ph = i => { const p = PS[i], u = U[p.uu]; return `<article class='card' style='padding:0;margin-bottom:16px;overflow:hidden'><div class='row' style='padding:12px'><img class='av2' src='${AV[u[1]]}' alt=''><div style='flex:1;line-height:1.2'><b>${u[0]}</b><br><small style='color:var(--mu)'>${p.t} ago</small></div><button class='chip' onclick='fol(${p.uu},this)'>${S.fo[p.uu] ? 'Following' : 'Follow'}</button></div><div style='position:relative'><div class='car' ondblclick='lk(${i},1,event)' onscroll='cdot(this)'>${p.im.map(n => `<img src='${IM[n]}' alt='${esc(p.cap)}' loading='lazy'>`).join('')}</div>${p.im.length > 1 ? `<span class='cnt'>1/${p.im.length}</span>` : ''}</div><div class='row' style='padding:10px 12px 0'><button class='chip ${S.lkd[i] ? 'on' : ''}' id='lk${i}' onclick='lk(${i})'>${S.lkd[i] ? '♥' : '♡'} ${p.lk + (S.lkd[i] ? 1 : 0)}</button><button class='chip' id='cc${i}' onclick='cm(${i})'> ${p.c.length}</button><button class='chip' onclick='shr(${i})'>Share</button><button class='chip' style='margin-left:auto' onclick='bk2(this)'>Save</button></div><p style='padding:0 12px 12px'><b>${u[0]}</b> ${esc(p.cap)} <span class='ht'>${p.tg}</span></p></article>` };
        V.community = () => `<h1 class='big'>Community</h1><div class='row' style='flex-wrap:nowrap;overflow-x:auto;gap:12px;padding:6px 2px'>${U.map((u, i) => `<button class='sr ${S.seen[i] ? 'seen' : ''}' onclick='story(${i},0)'><img src='${AV[u[1]]}' alt='${u[0]} story'><span>${u[0]}</span></button>`).join('')}</div><div class='grid' style='grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start;margin-top:10px'><div id='feed' style='max-width:560px;width:100%;margin:0 auto'>${PS.map((_, i) => ph(i)).join('')}<p id='mr' class='tag' style='text-align:center'>Loading more posts…</p></div><div style='position:sticky;top:70px;display:grid;gap:14px'><div class='card'><h3>Suggested for you</h3>${[5, 6, 7].map(i => `<div class='row' style='margin:8px 0'><img class='av2' src='${AV[U[i][1]]}' alt=''><b style='flex:1'>${U[i][0]}</b><button class='chip' onclick='fol(${i},this)'>${S.fo[i] ? 'Following' : 'Follow'}</button></div>`).join('')}</div><div class='card'><h3>Trending</h3><p class='ht'>#hivecity #longrun #fuel #city10k #pb</p></div><div class='card'><h3>Crew chat</h3><div id='cht' style='max-height:240px;overflow:auto'>${CH.map(mh).join('')}</div><div class='row' style='margin-top:8px'><input type='text' id='cin' placeholder='Message the crew…' style='flex:1;width:auto' aria-label='Message' onkeydown='event.keyCode==13&&cs()'><button class='btn' onclick='cs()'>Send</button></div></div></div></div>`;
        function more() { const n = PS.length; for (let k = 0; k < 3; k++) { const b = PS[(n + k) % 10]; PS.push({ ...b, lk: b.lk + ((n + k) * 37 % 90), t: (Math.floor(n / 10) + 2) + 'd', c: b.c.slice(0, 1) }); $('#mr').insertAdjacentHTML('beforebegin', ph(PS.length - 1)) } }
        function cdot(el) { const n = Math.round(el.scrollLeft / el.clientWidth), c = el.parentNode.querySelector('.cnt'); if (c) c.textContent = (n + 1) + '/' + el.children.length }
        function fol(i, b) { S.fo[i] = !S.fo[i]; b.textContent = S.fo[i] ? 'Following' : 'Follow' }
        function lk(i, d, e) { const on = d ? true : !S.lkd[i]; S.lkd[i] = on; const b = $('#lk' + i); b.className = 'chip' + (on ? ' on' : ''); b.textContent = (on ? '♥ ' : '♡ ') + (PS[i].lk + (on ? 1 : 0)); if (d && e) { const s = document.createElement('span'); s.className = 'hv'; s.textContent = '♥'; s.style.left = e.clientX - 20 + 'px'; s.style.top = e.clientY - 20 + 'px'; document.body.append(s); setTimeout(() => s.remove(), 1000) } }
        let sst; function story(u, f) { clearTimeout(sst); const o = $('#lb'); if (u < 0 || u >= U.length) { o.innerHTML = ''; return } const fr = SF[u]; if (f >= fr.length) return story(u + 1, 0); if (f < 0) return story(u - 1, 0); S.seen[u] = 1; o.innerHTML = `<div class='lbx stv'><div class='pb'>${fr.map((_, k) => `<i class='${k < f ? 'f' : ''}'><b style='${k == f ? 'animation:fill 4s linear forwards' : ''}'></b></i>`).join('')}</div><img src='${IM[fr[f][0]]}' alt=''><div class='sh'><img class='av2' src='${AV[U[u][1]]}' alt=''><b>${U[u][0]}</b><small>${fr[f][2]}</small></div><p class='scap'>${fr[f][1]}</p><u style='left:0' onclick='story(${u},${f - 1})'></u><u style='right:0' onclick='story(${u},${f + 1})'></u><button class='chip x' onclick='story(-1,0)' aria-label='Close'>✕</button></div>`; sst = setTimeout(() => story(u, f + 1), 4000) }
        /* ACTIVITY */
        const WK = { w: [[3.2, 5, 0, 6.4, 4.2, 8.1, 0], ['M', 'T', 'W', 'T', 'F', 'S', 'S']], m: [[22, 31, 28, 35], ['W1', 'W2', 'W3', 'W4']], d: [[0.8, 1.4, 0.6, 2.1, 1.2], ['6a', '9a', '12p', '3p', '6p']] };
        const bars = k => { const [a, l] = WK[k], mx = Math.max(...a), w = 280 / a.length; return `<svg viewBox='0 0 300 150' width='100%' role='img' aria-label='Distance in km'>${a.map((v, i) => { const h = v / mx * 95, x = 12 + i * w; return `<rect class='bar2' style='--i:${i}' x='${x + w * .15}' y='${120 - h}' width='${w * .7}' height='${h}' rx='6' fill='${v == mx ? '#C7F36B' : 'var(--ac)'}' opacity='${v == mx ? 1 : .55}'/><text x='${x + w / 2}' y='${114 - h}' font-size='10' text-anchor='middle' fill='currentColor'>${v}${v == mx ? ' ' : ''}</text><text x='${x + w / 2}' y='138' font-size='10' text-anchor='middle' fill='var(--mu)'>${l[i]}</text>` }).join('')}</svg>` };
        function ct(k) { S.at = k; $('#chart').innerHTML = bars(k); document.querySelectorAll('.ctb').forEach(b => b.classList.toggle('on', b.dataset.k == k)) }
        const blocks = (() => { let r = ''; for (let i = 0; i < 6; i++)for (let j = 0; j < 4; j++)r += `<rect x='${12 + i * 98}' y='${14 + j * 84}' width='84' height='70' rx='8' fill='color-mix(in srgb,var(--tx) 6%,transparent)'/>`; return r })();
        const ring = (v, t, s) => `<div style='text-align:center'><div class='ring' style='--v:${v};width:96px;height:96px'><i class='num' style='width:74px;height:74px;font-size:15px'>${t}</i></div><small>${s}</small></div>`;
        V.activity = () => `<h1 class='big'>Activity</h1><div class='grid' style='grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin:12px 0'><div class='card'><div class='row'><span class='fl2'></span><div><div class='num' style='font-size:44px;line-height:1'>12</div>day streak</div><div style='margin-left:auto;text-align:right'><b>Best 21</b></div></div><div class='row' style='justify-content:space-between;margin-top:10px'>${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => `<div style='text-align:center'><div class='dy ${i < 5 ? 'hit' : ''} ${i == 5 ? 'today' : ''}'>${i < 5 ? '' : ''}</div><small>${d}</small></div>`).join('')}</div></div><div class='card row' style='justify-content:space-around'>${ring(84, '4.2km', 'Move')}${ring(62, '37m', 'Active')}${ring(71, '412', 'kcal')}</div></div>
<div class='grid' style='grid-template-columns:repeat(auto-fit,minmax(320px,1fr))'><div class='card' style='padding:0;overflow:hidden'><svg viewBox='0 0 600 340' width='100%' role='img' aria-label='City route map'><rect width='600' height='340' fill='color-mix(in srgb,var(--tx) 3%,var(--card))'/>${blocks}<ellipse cx='470' cy='290' rx='90' ry='36' fill='#7bc96f55'/><path d='M0 90C150 60 250 150 600 118' stroke='#4aa8ff55' stroke-width='24' fill='none'/><path id='rt' d='M50 290C110 230 150 290 220 220S330 110 400 170S520 250 560 70' fill='none' stroke='var(--bd)' stroke-width='8' stroke-linecap='round'/><path id='rd' d='M50 290C110 230 150 290 220 220S330 110 400 170S520 250 560 70' fill='none' stroke='#C7F36B' stroke-width='8' stroke-linecap='round' style='stroke-dasharray:0 9999;filter:drop-shadow(0 0 6px #C7F36B)'/><text x='38' y='318' font-size='18'></text><text x='552' y='62' font-size='18'></text><g id='rn' transform='translate(50,290)'><circle class='pulse' r='12' fill='#C7F36B' opacity='.35'/><circle r='7' fill='#C7F36B' stroke='#10110F' stroke-width='3'/></g></svg><div class='row num' style='justify-content:space-around;padding:12px'><div>TIME<br><b id='tm' style='font-size:22px'>00:00:00</b></div><div>KM<br><b id='ds' style='font-size:22px'>0.00</b></div><div>PACE<br><b id='pc' style='font-size:22px'>--:--</b></div><div>STEPS<br><b id='stp' style='font-size:22px'>0</b></div><div>KCAL<br><b id='kc' style='font-size:22px'>0</b></div></div><p class='row' style='padding:0 12px 12px'><button class='btn' id='rb' onclick='runT()'>Start</button><button class='btn g' onclick='runF()'>Finish</button><button class='chip on'>Outdoor</button><button class='chip'>Indoor</button></p></div>
<div class='card'><span class='tag'>HEART RATE</span><div class='row'><span class='hh' id='hh'>❤</span><div><span class='num' id='hr' style='font-size:64px'>72</span> bpm<br><b id='zn'>Rest zone</b></div></div><svg viewBox='0 0 300 80' width='100%' aria-label='Heart rate chart'><polyline id='pl' fill='none' stroke='#ff5d6c' stroke-width='3' stroke-linecap='round' points=''/></svg><h3>Distance</h3><div class='row' style='margin-bottom:6px'>${[['w', 'Week'], ['m', 'Month'], ['d', 'Today']].map(([k, l]) => `<button class='chip ctb ${S.at == k ? 'on' : ''}' data-k='${k}' onclick='ct("${k}")'>${l}</button>`).join('')}</div><div id='chart'>${bars(S.at)}</div></div></div>
<h2 style='margin-top:26px'>Recommended workouts</h2><div class='grid'>${[[89, 'Track intervals', '6 × 400 m · 35 min'], [96, 'Easy trail loop', '5 km · 30 min'], [86, 'Recovery stretch', '15 min']].map(x => `<div class='card'><div class='clip'><img class='p' src='${IM[x[0]]}' alt='${x[1]}'></div><h3 style='margin:8px 0 2px'>${x[1]}</h3>${x[2]}</div>`).join('')}</div>
<div class='grid' style='grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:14px'><div class='card'><h3>Today's checklist</h3>${['Warm-up 10 min', 'Intervals 5 × 3 min', 'Cool-down & stretch'].map(t => `<label class='row' style='margin:8px 0;cursor:pointer'><input class='ck wk' type='checkbox' onchange='wk()'><span>${t}</span></label>`).join('')}<div class='ring' id='wr' style='--v:0'><i class='num' id='wp'>0%</i></div></div><div class='card'><h3>Achievements</h3><div class='row'>${[['', 'First 5K', 1], ['', '7-day streak', 1], ['⛰', '10K club', 1], ['', 'Early bird', 1], ['', 'Half marathon', 0], ['⚡', 'Sub-25 5K', 0]].map(a => `<span class='pill' style='${a[2] ? '' : 'opacity:.4'}'>${a[0]} ${a[1]}</span>`).join('')}</div><h3>Personal records</h3><p class='num'>5K 24:31 · 10K 52:08 · Longest 18 km </p></div></div>`;
        function wk() { const c = [...document.querySelectorAll('.wk')], v = Math.round(c.filter(x => x.checked).length / c.length * 100); $('#wr').style.setProperty('--v', v); $('#wp').textContent = v + '%'; if (v == 100) burst() }
        const RS = { t: 0, d: 0, on: 0, id: 0, h: [], st: 0, k: 0, hr: 72 };
        function runT() { if (RS.on) { RS.on = 0; clearInterval(RS.id); $('#rb').textContent = 'Resume' } else { RS.on = 1; $('#rb').textContent = 'Pause'; RS.id = setInterval(rtick, 1000) } }
        function runF() { clearInterval(RS.id); const d = RS.d.toFixed(2); Object.assign(RS, { t: 0, d: 0, on: 0, h: [], st: 0, k: 0, hr: 72 }); rdraw(); toast('Run saved: ' + d + ' km'); burst() }
        function rtick() { if (!$('#tm')) { clearInterval(RS.id); RS.on = 0; return } RS.t += 15; RS.d = Math.min(5, RS.d + .0455 + Math.random() * .004); RS.st += 42; RS.k += 2.9; RS.hr = Math.round(Math.min(184, 118 + RS.d * 10 + Math.sin(RS.t / 50) * 4 + Math.random() * 3)); RS.h.push(RS.hr); if (RS.h.length > 40) RS.h.shift(); rdraw(); if (RS.d >= 5) runF() }
        function rdraw() { if (!$('#tm') || !$('#ds') || !$('#rt')) return; const f = n => String(n).padStart(2, '0'), t = RS.t, pc = RS.d > .05 ? t / RS.d : 0; $('#tm').textContent = f(t / 3600 | 0) + ':' + f(t / 60 % 60 | 0) + ':' + f(t % 60); $('#ds').textContent = RS.d.toFixed(2); $('#pc').textContent = pc ? (pc / 60 | 0) + ':' + f(pc % 60 | 0) : '--:--'; $('#hr').textContent = RS.hr; $('#kc').textContent = Math.round(RS.k); $('#stp').textContent = RS.st; $('#zn').textContent = (RS.t ? (RS.hr < 130 ? 'Easy' : RS.hr < 150 ? 'Aerobic' : RS.hr < 168 ? 'Tempo' : 'Max') : 'Rest') + ' zone'; $('#hh').style.setProperty('--b', RS.hr); $('#rb').textContent = RS.on ? 'Pause' : RS.t ? 'Resume' : 'Start'; const r = $('#rt'), L = r.getTotalLength(), p = RS.d / 5, pt = r.getPointAtLength(p * L); $('#rn').setAttribute('transform', `translate(${pt.x},${pt.y})`); $('#rd').style.strokeDasharray = `${p * L} ${L}`; $('#pl').setAttribute('points', RS.h.map((v, i) => `${i * (300 / 39)},${80 - (v - 100) * .9}`).join(' ')) }
        function burst() { for (let i = 0; i < 30; i++) { const d = document.createElement('i'); d.style.cssText = `position:fixed;left:50%;top:60%;width:8px;height:12px;background:${['#C7F36B', '#fff', '#2fbf71'][i % 3]};z-index:95;pointer-events:none`; document.body.append(d); d.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${(Math.random() - .5) * 500}px,${-200 - Math.random() * 250}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: 1200, easing: 'ease-out' }).onfinish = () => d.remove() } }
        /* NUTRITION — recipes published by the admin */
        let hiveRecipes = [];
        let hiveRecipesUnsub = null;
        const recipeEscape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        function renderHiveRecipes() {
            const cards = hiveRecipes.map(recipe => {
                const name = recipeEscape(recipe.name);
                const category = recipeEscape(recipe.category || 'Recipe');
                const description = recipeEscape(recipe.description || '');
                const image = recipeEscape(recipe.imageUrl || recipe.image || '');
                const prep = recipe.prepTime ? `<span class="tag">${recipeEscape(recipe.prepTime)} min</span>` : '';
                const protein = recipe.protein ? `<span class="tag">${recipeEscape(recipe.protein)} g protein</span>` : '';
                const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
                const steps = Array.isArray(recipe.steps) ? recipe.steps : (Array.isArray(recipe.instructions) ? recipe.instructions : []);
                return `<article class="card" id="recipe-card-${recipe.id}"><div class="clip">${image ? `<img class="p" loading="lazy" src="${image}" alt="${name}">` : `<div class="p" style="display:grid;place-items:center;background:var(--bd);font-size:48px">🥗</div>`}</div><span class="tag">${category}</span><h2 style="margin:8px 0 4px;font-size:21px">${name}</h2>${description ? `<p>${description}</p>` : ''}<div class="row" style="margin-bottom:12px">${prep}${protein}</div><div class="row" style="margin-bottom:14px"><button type="button" class="btn g hs-share-nutrition-btn" onclick="hsShareNutritionToProfile('${recipe.id}')" style="font-size:12px;padding:6px 14px">📤 Share to Profile</button></div>${ingredients.length ? `<h3 style="margin-top:14px">Ingredients</h3><ul>${ingredients.map(x => `<li>${recipeEscape(x)}</li>`).join('')}</ul>` : ''}${steps.length ? `<h3>Preparation</h3><ol>${steps.map(x => `<li>${recipeEscape(x)}</li>`).join('')}</ol>` : ''}</article>`;
            }).join('');
            return `<h1 class="big">Nutrition</h1><p class="it" style="font-size:18px">Recipes for your everyday movement.</p><div class="grid" style="margin-top:18px">${cards || `<div class="card" style="grid-column:1/-1;text-align:center;padding:34px"><h2>No recipes published yet</h2><p style="color:var(--mu)">Recipes added and published by the admin will appear here.</p></div>`}</div>`;
        }

        /* --- RECIPE IMAGE SOURCES / ATTRIBUTION --- */
        // Add sourced photos here by recipe ID. Each entry can contain finished, cooking,
        // detail, sourceName, sourceUrl, and optional per-image source metadata.
        window.HIVE_RECIPE_IMAGE_MAP = window.HIVE_RECIPE_IMAGE_MAP || {};
        window.getHiveRecipeImageData = function (recipe) {
            recipe = recipe || {};
            const mapped = window.HIVE_RECIPE_IMAGE_MAP[recipe.id] || {};
            const uploaded = Array.isArray(recipe.imageUrls) ? recipe.imageUrls : (Array.isArray(recipe.images) ? recipe.images.map(x => typeof x === 'string' ? x : x.url).filter(Boolean) : []);
            const legacy = recipe.imageUrl || recipe.image || uploaded[0] || '';
            const sourceName = mapped.sourceName || recipe.imageSource || '';
            const sourceUrl = mapped.sourceUrl || recipe.imageSourceUrl || '';
            const uploadedSources = Array.isArray(recipe.imageSources) ? recipe.imageSources : [];
            return {
                finished: mapped.finished || uploaded[0] || legacy || '',
                cooking: mapped.cooking || uploaded[1] || '',
                detail: mapped.detail || uploaded[2] || '',
                sourceName,
                sourceUrl,
                sources: mapped.sources || {
                    finished: uploadedSources[0] || (sourceName ? { name: sourceName, url: sourceUrl } : null),
                    cooking: uploadedSources[1] || (sourceName ? { name: sourceName, url: sourceUrl } : null),
                    detail: uploadedSources[2] || (sourceName ? { name: sourceName, url: sourceUrl } : null)
                }
            };
        };
        window.renderHiveRecipeSourceBadge = function (sourceName, sourceUrl) {
            if (!sourceName) return '';
            const label = recipeEscape(sourceName);
            const href = String(sourceUrl || '').trim();
            return href
                ? `<a class="hive-recipe-source" href="${recipeEscape(href)}" target="_blank" rel="noopener noreferrer">Source: ${label}</a>`
                : `<span class="hive-recipe-source">Source: ${label}</span>`;
        };

        /* --- ENHANCED NUTRITION VIEW (50 curated recipes, filters, details, user creation) --- */
        window.hiveNutritionState = {
            goal: 'All',
            category: 'All',
            search: '',
            page: 1,
            pageSize: 50,
            randomRecipeId: ''
        };

        window.isHiveTestArtifact = window.isHiveTestArtifact || function (item) {
            if (!item || typeof item !== 'object') return false;
            const t = [item.title, item.name, item.recipeName, item.item, item.id].filter(Boolean).join(' ').toLowerCase();
            return t.includes('__verify_e2e') || t.includes('__smoke_');
        };

        window.handleHiveRecipeImgError = function (imgEl) {
            if (!imgEl) return;
            if (!imgEl.dataset.hiveFallbackTried) {
                imgEl.dataset.hiveFallbackTried = '1';
                imgEl.src = './assets/images/recipe-placeholder.jpeg';
                return;
            }
            imgEl.onerror = null;
            const parent = imgEl.parentNode;
            if (!parent) return;
            if (parent.classList && parent.classList.contains('hc-card-photo')) {
                parent.innerHTML = '<div class="hc-photo-fallback" aria-label="Food photo unavailable">🍽️</div>';
                return;
            }
            const fb = document.createElement('div');
            fb.className = 'hc-photo-fallback';
            fb.setAttribute('aria-label', 'Food photo unavailable');
            fb.textContent = '🍽️';
            if (parent.classList && parent.classList.contains('hc-random-item')) {
                fb.style.cssText = 'width:74px;height:66px;border-radius:12px;flex-shrink:0;display:grid;place-items:center;background:#edf2e9;font-size:24px';
            } else {
                fb.style.cssText = 'width:100%;height:100%;min-height:140px;display:grid;place-items:center;background:#edf2e9;font-size:28px';
            }
            parent.replaceChild(fb, imgEl);
        };

        window.renderEnhancedNutrition = function () {
            const cur = (window.getAuthUser ? window.getAuthUser() : window.hiveCurrentUser);
            const isTestItem = window.isHiveTestArtifact;
            const library = window.getHive1000Recipes();
            const viewerUid = cur && cur.uid ? cur.uid : '';
            const isHiddenForOwner = r => typeof window.isRecipeDeletedByOwner === 'function' && window.isRecipeDeletedByOwner(r, viewerUid);
            const sharedNutrients = (typeof window.getSharedNutrients === 'function' ? window.getSharedNutrients() : []).filter(r => r && !isTestItem(r) && !isHiddenForOwner(r));
            const customRecipes = JSON.parse(localStorage.getItem('hivecity_custom_recipes') || '[]').filter(r => r && !isTestItem(r) && !isHiddenForOwner(r) && (!r.ownerUid || (cur && r.ownerUid === cur.uid)));
            const seedRecipes = (window.SEED_NUTRIENT_RECIPES || []).filter(r => r && !isTestItem(r));
            const seenRecipeIds = new Set();
            const livePinned = [...sharedNutrients, ...customRecipes].filter(r => {
                if (!r || !r.id) return false;
                const k = String(r.id);
                if (seenRecipeIds.has(k)) return false;
                seenRecipeIds.add(k);
                return true;
            });
            const staticPool = [...seedRecipes, ...library].filter(r => {
                if (!r || !r.id) return false;
                const k = String(r.id);
                if (seenRecipeIds.has(k)) return false;
                seenRecipeIds.add(k);
                return true;
            });
            const orderedStaticRaw = window.getUserRecipeOrder(cur ? cur.uid : 'guest', staticPool);
            const activeBmiForSort = window.hiveBmiEngine ? window.hiveBmiEngine.getProfile() : null;
            const orderedLive = activeBmiForSort && window.hiveBmiEngine
                ? window.hiveBmiEngine.getRecommendedRecipes(livePinned, activeBmiForSort).map(x => x.recipe)
                : livePinned;
            const orderedStatic = activeBmiForSort && window.hiveBmiEngine
                ? window.hiveBmiEngine.getRecommendedRecipes(orderedStaticRaw, activeBmiForSort).map(x => x.recipe)
                : orderedStaticRaw;
            const ordered = [...orderedLive, ...orderedStatic];
            let filtered = ordered;
            if (window.hiveNutritionState.goal !== 'All') filtered = filtered.filter(r => r.goal === window.hiveNutritionState.goal);
            if (window.hiveNutritionState.category !== 'All') filtered = filtered.filter(r => r.category === window.hiveNutritionState.category || r.mealType === window.hiveNutritionState.category);
            if (window.hiveNutritionState.search) {
                const q = window.hiveNutritionState.search.toLowerCase();
                filtered = filtered.filter(r => [r.name, r.title, r.description, r.goal, r.category, r.mealType, ...(r.ingredients || [])].join(' ').toLowerCase().includes(q));
            }
            const pageSize = 50;
            const paginated = filtered.slice(0, pageSize);
            const isSpecialRecipe = r => Boolean(r && !isTestItem(r) && (r.creatorRole === 'Admin' || r.createdBy === 'admin' || r.isFeatured === true || r.isAdminSpecial === true));
            const specialMap = new Map();
            sharedNutrients.filter(isSpecialRecipe).forEach(r => specialMap.set(String(r.id), r));
            hiveRecipes.filter(r => isSpecialRecipe(r) && (r.published === true || String(r.status || '').toLowerCase() === 'published')).forEach(r => { if (!specialMap.has(String(r.id))) specialMap.set(String(r.id), r); });
            const specials = Array.from(specialMap.values()).sort((a, b) => {
                const ao = Number.isFinite(Number(a.specialOrder)) ? Number(a.specialOrder) : 999;
                const bo = Number.isFinite(Number(b.specialOrder)) ? Number(b.specialOrder) : 999;
                if (ao !== bo) return ao - bo;
                return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
            });
            const randomPool = filtered.length ? filtered : ordered;
            let randomRecipe = randomPool.find(r => r.id === window.hiveNutritionState.randomRecipeId);
            if (!randomRecipe || !randomPool.some(r => r.id === randomRecipe.id)) {
                randomRecipe = randomPool.length ? randomPool[Math.floor(Math.random() * randomPool.length)] : null;
                window.hiveNutritionState.randomRecipeId = randomRecipe ? randomRecipe.id : '';
            }
            const imageFor = (r, slot = 0) => (Array.isArray(r.images) && r.images[slot]) || (r.imageUrls && r.imageUrls[slot]) || (r.images && !Array.isArray(r.images) && r.images['slot' + (slot + 1)] && (r.images['slot' + (slot + 1)].url || r.images['slot' + (slot + 1)].src)) || (slot === 0 ? (r.coverImage || r.imageUrl || r.image || '') : '');
            const sourceBadge = r => `<small class="hc-img-source">Illustrative food photography · Source: ${recipeEscape(r.sourceName || 'User supplied image')}</small>`;
            const activeBmiProfile = window.hiveBmiEngine ? window.hiveBmiEngine.getProfile() : null;
            const foodCard = r => {
                const validImages = [0, 1, 2].map(i => imageFor(r, i)).filter(u => typeof u === 'string' && u.trim().length > 0);
                const photos = validImages.length ? validImages : ['./assets/images/recipe-placeholder.jpeg'];
                const singleCoverPhoto = photos.length === 1;
                let bmiMatchPill = '';
                if (activeBmiProfile) {
                    const cat = activeBmiProfile.bmiCategory;
                    const maxMealCal = Math.round(activeBmiProfile.dailyCalorieTarget * 0.4);
                    const isCatMatch = (r.suitableCategories && r.suitableCategories.includes(cat));
                    let ruleMatch = false;
                    const cal = Number(r.calories) || 0;
                    const pro = Number(r.protein || r.proteinGrams) || 0;
                    const carb = Number(r.carbs || r.carbsGrams) || 0;
                    if (cat === 'Underweight' && (cal >= 500 && pro >= 25)) ruleMatch = true;
                    if (cat === 'Normal' && (cal >= 350 && cal <= 650 && pro >= 20)) ruleMatch = true;
                    if (cat === 'Overweight' && (cal <= maxMealCal && pro >= 22)) ruleMatch = true;
                    if (cat === 'Obese' && (cal <= 450 && carb <= 38 && pro >= 25)) ruleMatch = true;

                    if (isCatMatch || ruleMatch) {
                        bmiMatchPill = `<span style="background:#C7F36B;color:#10110F;font-weight:800;font-size:10px;padding:3px 8px;border-radius:6px">★ ${recipeEscape(cat)} Fit</span>`;
                    }
                }
                const fiberVal = Number(r.fiber || r.fiberGrams || 0);
                const fiberDisplay = fiberVal > 0 ? `<span><b>${fiberVal}g</b><small>fiber</small></span>` : '';
                const galleryHtml = singleCoverPhoto
                    ? `<div class="hc-card-gallery" style="grid-template-columns:1fr"><div class="hc-card-photo"><img src="${recipeEscape(photos[0])}" alt="${recipeEscape(r.name || r.title || 'Recipe')}" loading="lazy" onerror="window.handleHiveRecipeImgError(this)"></div></div>`
                    : `<div class="hc-card-gallery" style="${photos.length === 2 ? 'grid-template-columns:repeat(2,1fr)' : ''}">${photos.map((src, i) => `<div class="hc-card-photo"><img src="${recipeEscape(src)}" alt="${recipeEscape(r.name || r.title || 'Recipe')} — ${['finished dish', 'preparation', 'close-up'][i] || 'photo'}" loading="lazy" onerror="window.handleHiveRecipeImgError(this)"></div>`).join('')}</div>`;
                const isOwnedByMe = Boolean(cur && cur.uid && (r.ownerUid === cur.uid || r.userId === cur.uid || r.createdBy === cur.uid));
                const ownerMenuHtml = isOwnedByMe ? `<div class="hc-recipe-menu-wrap" style="position:absolute;top:8px;right:8px;z-index:6" onclick="event.stopPropagation()"><button type="button" class="hc-recipe-menu-btn" aria-label="Recipe options" title="Recipe options" onclick="event.stopPropagation();window.toggleHiveRecipeMenu('${recipeEscape(r.id)}',event)" style="width:30px;height:30px;border-radius:999px;border:1px solid rgba(255,255,255,0.4);background:rgba(16,17,15,0.72);color:#fff;font-size:16px;font-weight:800;line-height:1;cursor:pointer;display:grid;place-items:center;padding:0">⋮</button><div class="hc-recipe-menu-dd" data-recipe-menu="${recipeEscape(r.id)}" style="display:none;position:absolute;top:34px;right:0;min-width:124px;background:#fff;border:1px solid #dce5db;border-radius:12px;box-shadow:0 12px 28px rgba(16,24,18,0.18);padding:4px;z-index:20"><button type="button" onclick="event.stopPropagation();window.startEditHiveUserRecipe('${recipeEscape(r.id)}')" style="width:100%;text-align:left;border:0;background:transparent;color:#18372d;padding:8px 10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">✏️ Edit</button><button type="button" onclick="event.stopPropagation();window.deleteHiveUserRecipe('${recipeEscape(r.id)}')" style="width:100%;text-align:left;border:0;background:transparent;color:#dc2626;padding:8px 10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px">🗑️ Delete</button></div></div>` : '';
                return `<article class="hc-food-card" style="position:relative" role="button" tabindex="0" onclick="openRecipeDetailModal('${recipeEscape(r.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openRecipeDetailModal('${recipeEscape(r.id)}')}">
          ${ownerMenuHtml}
          ${galleryHtml}
          <div class="hc-card-body"><div class="hc-card-tags"><span>${recipeEscape(r.goal || 'Nutrition')}</span><span>${recipeEscape(r.mealType || r.category || 'Recipe')}</span>${bmiMatchPill}</div>
          <h3>${recipeEscape(r.name || r.title || 'Recipe')}</h3><p>${recipeEscape(r.description || '')}</p>
          <div class="hc-macros" style="${fiberVal > 0 ? 'grid-template-columns:repeat(5,1fr)' : ''}"><span><b>${Number(r.calories) || '—'}</b><small>kcal</small></span><span><b>${Number(r.protein || r.proteinGrams) || '—'}g</b><small>protein</small></span><span><b>${Number(r.carbs || r.carbsGrams) || '—'}g</b><small>carbs</small></span><span><b>${Number(r.fat || r.fatsGrams) || '—'}g</b><small>fat</small></span>${fiberDisplay}</div>
          <div class="hc-card-foot"><span>⏱ ${Number(r.prepTime || r.prepTimeMins) || 25} min</span><span>View recipe <b>↗</b></span></div></div></article>`;
            };
            return `<style>
      .hive-nutrition-page{--hc-ink:#18372d;--hc-green:#176346;--hc-lime:#d9f2a0;--hc-paper:#f7f7f1;--hc-muted:#718078;color:var(--hc-ink);font-family:Inter,system-ui,sans-serif}
      .hc-nutrition-head{display:flex;justify-content:space-between;align-items:end;gap:18px;flex-wrap:wrap;padding:22px 2px 18px}
      .hc-eyebrow{font-size:11px;font-weight:800;letter-spacing:.14em;color:#53836b;text-transform:uppercase}
      .hc-nutrition-head h1{font-size:clamp(27px,4vw,40px);letter-spacing:-.04em;margin:7px 0;color:#17382d;font-weight:850}
      .hc-nutrition-head p{margin:0;color:#718078;font-size:14px}
      .hc-create-btn{border:0;border-radius:13px;background:#176346;color:white;font-weight:750;padding:13px 19px;cursor:pointer;box-shadow:0 7px 18px #17634622}
      .hc-special-strip{margin:10px 0 24px;padding:16px;border-radius:20px;background:#edf3e8;border:1px solid #dce8d7}
      .hc-section-title{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:0 0 13px}.hc-section-title h2{font-size:19px;margin:0;letter-spacing:-.02em}.hc-section-title small{color:#718078}
      .hc-special-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.hc-special-grid .hc-food-card{background:#fff}
      .hc-discover{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px;border:1px solid #e1e7df;border-radius:18px;background:#fff;margin-bottom:22px;flex-wrap:wrap}
      .hc-discover h2{font-size:17px;margin:0 0 4px}.hc-discover p{font-size:12px;color:#718078;margin:0}.hc-surprise{border:1px solid #cdddcf;background:#f4f8f1;color:#245d43;padding:9px 13px;border-radius:10px;font-weight:700;cursor:pointer}
      .hc-random-item{display:flex;align-items:center;gap:12px;min-width:240px;flex:1}.hc-random-item img{width:74px;height:66px;object-fit:cover;border-radius:12px}.hc-random-item strong{display:block;font-size:13px}.hc-random-item small{color:#718078}
      .hc-filter-panel{padding:16px;border:1px solid #e3e8e0;background:#fff;border-radius:18px;margin-bottom:16px}.hc-filter-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.hc-filter-row+.hc-filter-row{margin-top:12px}
      .hc-filter-label{font-size:11px;font-weight:800;color:#718078;min-width:48px;text-transform:uppercase;letter-spacing:.06em}.hc-filter-chip{border:1px solid #dce4db;background:#fff;color:#486257;padding:8px 12px;border-radius:999px;font-size:12px;font-weight:650;cursor:pointer}.hc-filter-chip.active{background:#176346;border-color:#176346;color:white}
      .hc-search{flex:1;min-width:220px;border:1px solid #dce4db;border-radius:11px;padding:11px 13px;font:inherit;font-size:13px;outline:none}.hc-search:focus{border-color:#4e8d69;box-shadow:0 0 0 3px #4e8d6918}
      .hc-results-meta{display:flex;justify-content:space-between;align-items:center;margin:18px 2px 12px;color:#718078;font-size:12px}.hc-food-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
      .hc-food-card{background:#fff;border:1px solid #e4e8df;border-radius:17px;overflow:hidden;cursor:pointer;transition:transform .18s,box-shadow .18s}.hc-food-card:hover{transform:translateY(-3px);box-shadow:0 12px 28px #1b3d2b12}.hc-card-gallery{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:3px;height:148px;background:#edf0e9}.hc-card-photo{min-width:0;overflow:hidden;position:relative}.hc-card-photo img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .3s}.hc-food-card:hover .hc-card-photo img{transform:scale(1.035)}.hc-photo-fallback{height:100%;display:grid;place-items:center;font-size:24px;background:#edf2e9}.hc-img-fallback{background:#edf2e9;display:grid;place-items:center}.hc-card-photo.hc-img-fallback::after{content:'🥗';font-size:30px;opacity:.8}
      .hc-card-body{padding:13px 14px 12px}.hc-card-tags{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}.hc-card-tags span{font-size:10px;font-weight:700;color:#4d725e;background:#eff5eb;border-radius:6px;padding:4px 7px}.hc-card-body h3{font-size:15px;line-height:1.25;margin:0 0 5px;color:#18372d}.hc-card-body p{font-size:11px;line-height:1.45;color:#718078;margin:0 0 11px;min-height:31px}.hc-macros{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;padding:9px 8px;background:#f4f6f0;border-radius:10px;text-align:center}.hc-macros b{font-size:13px;display:block;color:#244b39}.hc-macros small{font-size:9px;color:#829087;text-transform:uppercase}.hc-card-foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:10px;color:#748178}.hc-card-foot span:last-child{color:#176346;font-weight:800}
      .hc-empty{padding:40px 18px;text-align:center;border:1px dashed #cbd8ca;border-radius:16px;color:#718078;background:#fff}
      .hc-create-panel{display:none;margin:28px 0 45px;background:#fff;border:1px solid #dfe7dc;border-radius:20px;padding:22px;box-shadow:0 12px 30px #17382d0a}.hc-create-panel.open{display:block}.hc-create-panel h2{margin:0 0 5px;font-size:21px}.hc-create-panel>p{margin:0 0 18px;color:#718078;font-size:13px}.hc-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.hc-form-field{display:grid;gap:6px}.hc-form-field label{font-size:12px;font-weight:750;color:#365b48}.hc-form-field input,.hc-form-field select,.hc-form-field textarea{width:100%;box-sizing:border-box;border:1px solid #dce5db;border-radius:10px;padding:11px 12px;background:#fbfcf9;color:#18372d;font:inherit;font-size:13px}.hc-form-field textarea{resize:vertical}.hc-form-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:16px}.hc-secondary{border:1px solid #dce5db;background:white;color:#476353;border-radius:10px;padding:11px 15px;cursor:pointer;font-weight:700}
      @media(max-width:800px){.hc-food-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hc-special-grid{grid-template-columns:1fr}.hc-card-gallery{height:132px}}
      @media(max-width:520px){.hc-food-grid{grid-template-columns:1fr 1fr;gap:9px}.hc-card-gallery{height:104px}.hc-card-body{padding:10px}.hc-card-body h3{font-size:13px}.hc-card-body p{font-size:10px;min-height:40px}.hc-macros{padding:7px 4px}.hc-macros b{font-size:11px}.hc-nutrition-head{padding-top:12px}.hc-form-grid{grid-template-columns:1fr}}
      </style>
      <main class="hive-nutrition-page" style="max-width:1160px;margin:12px auto 50px;padding:0 18px">
        <header class="hc-nutrition-head"><div><div class="hc-eyebrow">HIVECITY · ATHLETE NUTRITION</div><h1>Discover food that fuels you.</h1><p>Explore balanced recipes, training fuel and everyday nutrition ideas.</p></div><button class="hc-create-btn" type="button" onclick="toggleHiveCreateRecipe(true)">＋ Create your own recipe</button></header>
        ${activeBmiProfile ? `
        <section style="margin:12px 0 22px;padding:18px 22px;background:linear-gradient(135deg,#ffffff 0%,#f0fdf4 100%);border:1px solid #86efac;border-radius:20px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap;box-shadow:0 4px 16px rgba(16,185,129,0.08)">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="font-size:28px;background:#dcfce7;border:1px solid #86efac;width:52px;height:52px;border-radius:14px;display:grid;place-items:center">🥗</div>
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
                <span style="background:#dcfce7;color:#166534;border:1px solid #86efac;font-size:11px;font-weight:800;padding:3px 10px;border-radius:999px;text-transform:uppercase">🔒 Locked to BMI ${Number(activeBmiProfile.bmi).toFixed(2)} (${recipeEscape(activeBmiProfile.bmiCategory)})</span>
                <span style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px">Target: ${Number(activeBmiProfile.dailyCalorieTarget).toLocaleString()} kcal/day</span>
              </div>
              <p style="margin:0;color:#334155;font-size:13px;line-height:1.45">
                Personalized recipe engine active: <b style="color:#020617;text-transform:capitalize">${recipeEscape(String(activeBmiProfile.goalStrategy || '').replace(/_/g, ' '))}</b> picks are prioritized at the top.
              </p>
            </div>
          </div>
          <div style="display:flex;gap:10px;align-items:center">
            <button type="button" onclick="location.hash='#activity';setTimeout(function(){ if(typeof window.haOpenBmiModal==='function') window.haOpenBmiModal(); }, 180);" style="background:#C6F432;color:#020617;border:1px solid #a3e635;font-weight:800;padding:10px 18px;border-radius:999px;font-size:12px;cursor:pointer">Update BMI</button>
          </div>
        </section>
        ` : `
        <section style="margin:12px 0 22px;padding:16px 20px;background:#edf3e8;border:1px solid #dce8d7;border-radius:18px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
          <div>
            <div style="font-weight:800;font-size:14px;color:#17382d;margin-bottom:3px">Want personalized calorie and macro recommendations?</div>
            <p style="margin:0;color:#718078;font-size:13px">Enable the exact BMI Calculator in Activity to receive daily calorie targets and tailored recipe matches.</p>
          </div>
          <button type="button" class="hc-create-btn" onclick="location.hash='#activity';setTimeout(function(){ if(typeof window.haOpenBmiModal==='function') window.haOpenBmiModal(); }, 180);" style="padding:10px 18px;border-radius:11px;font-size:12px">Enable BMI Profile</button>
        </section>
        `}
        <section class="hc-special-strip"><div class="hc-section-title"><h2>✦ Special nutrition</h2><small>Featured picks</small></div><div class="hc-special-grid">${specials.length ? specials.map(foodCard).join('') : `<div class="hc-empty" style="grid-column:1/-1;padding:18px">Featured nutrition will appear here when added in the Admin panel.</div>`}</div></section>
        <section class="hc-discover"><div><h2>Find your next favourite</h2><p>One idea picked from your current nutrition filters.</p></div><div class="hc-random-item">${randomRecipe ? `${imageFor(randomRecipe, 0) ? `<img src="${recipeEscape(imageFor(randomRecipe, 0))}" alt="" loading="lazy" onerror="window.handleHiveRecipeImgError(this)">` : ''}<div><strong>${recipeEscape(randomRecipe.name || randomRecipe.title || 'Discover a recipe')}</strong><small>${recipeEscape(randomRecipe.goal || 'Nutrition')} · ${Number(randomRecipe.calories) || '—'} kcal</small></div>` : ''}</div><button class="hc-surprise" type="button" onclick="pickRandomNutritionRecipe()">Surprise me ↻</button></section>
        <section class="hc-filter-panel"><div class="hc-filter-row"><span class="hc-filter-label">Goal</span>${['All', 'Weight Gain', 'Weight Loss', 'Muscle Building', 'Endurance', 'Maintenance'].map(g => `<button type="button" class="hc-filter-chip ${window.hiveNutritionState.goal === g ? 'active' : ''}" onclick="setNutritionGoal('${g}')">${g}</button>`).join('')}</div><div class="hc-filter-row"><span class="hc-filter-label">Search</span><input class="hc-search" type="search" placeholder="Search recipes, ingredients or nutrients…" value="${recipeEscape(window.hiveNutritionState.search || '')}" oninput="setNutritionSearch(this.value)"><span class="hc-filter-label">Type</span><select class="hc-filter-chip" onchange="setNutritionCategory(this.value)"><option value="All">All recipe types</option>${Array.from(new Set([...library.map(r => r.category), ...sharedNutrients.map(r => r.mealType || r.category)].filter(Boolean))).sort().map(c => `<option value="${recipeEscape(c)}" ${window.hiveNutritionState.category === c ? 'selected' : ''}>${recipeEscape(c)}</option>`).join('')}</select></div></section>
        <div class="hc-results-meta"><span><b>${filtered.length}</b> curated recipes</span><span>Random order · refreshed each session</span></div>
        <section class="hc-food-grid">${paginated.length ? paginated.map(foodCard).join('') : `<div class="hc-empty" style="grid-column:1/-1">No recipes match those filters. Try another goal or search term.</div>`}</section>
        <section id="hive-create-recipe-panel" class="hc-create-panel"><h2>Share your recipe with the Hivecity community</h2><p>Add the recipe details and 1 to 3 photos. Your submission will be linked to your profile.</p><form onsubmit="handleSaveCustomRecipe(event)">
          <div class="hc-form-grid"><div class="hc-form-field"><label for="cr_title">Recipe name</label><input id="cr_title" required maxlength="100" placeholder="e.g. Peanut butter banana oats"></div><div class="hc-form-field"><label for="cr_category">Recipe type</label><select id="cr_category"><option>High Protein Meals</option><option>Quick Breakfast</option><option>Plant Based</option><option>Recovery Smoothies</option><option>Training Snacks</option><option>Vegetarian Protein</option></select></div><div class="hc-form-field"><label for="cr_goal">Nutrition goal</label><select id="cr_goal"><option>Weight Gain</option><option>Weight Loss</option><option>Muscle Building</option><option>Endurance</option><option>Maintenance</option></select></div><div class="hc-form-field"><label for="cr_prep">Preparation time (minutes)</label><input id="cr_prep" type="number" min="1" max="600" placeholder="25"></div><div class="hc-form-field" style="grid-column:1/-1"><label for="cr_description">Recipe description</label><textarea id="cr_description" rows="3" required maxlength="600" placeholder="Describe the dish, flavour, and when it works well in a training day…"></textarea></div><div class="hc-form-field" style="grid-column:1/-1"><label for="cr_images">Food photos (1 to 3)</label><input type="file" id="cr_images" accept="image/*" multiple onchange="previewHiveRecipeImages(this)"><div id="cr_images_preview" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"></div><small style="color:#718078">Upload 1 to 3 photos (Finished dish · Preparation · Close-up). Maximum 8 MB per image.</small></div><div class="hc-form-field"><label for="cr_cal">Energy (kcal)</label><input id="cr_cal" type="number" min="0" required placeholder="450"></div><div class="hc-form-field"><label for="cr_pro">Protein (g)</label><input id="cr_pro" type="number" min="0" required placeholder="28"></div><div class="hc-form-field"><label for="cr_carb">Carbohydrates (g)</label><input id="cr_carb" type="number" min="0" required placeholder="52"></div><div class="hc-form-field"><label for="cr_fat">Fat (g)</label><input id="cr_fat" type="number" min="0" required placeholder="14"></div><div class="hc-form-field" style="grid-column:1/-1"><label for="cr_ingredients">Ingredients and quantities (one per line)</label><textarea id="cr_ingredients" rows="4" required placeholder="50 g rolled oats&#10;1 banana&#10;200 ml milk"></textarea></div><div class="hc-form-field" style="grid-column:1/-1"><label for="cr_steps">Preparation steps (one per line)</label><textarea id="cr_steps" rows="4" required placeholder="Prepare the ingredients…&#10;Cook or combine…&#10;Serve and enjoy…"></textarea></div></div>
          <div class="hc-form-actions"><button class="hc-secondary" type="button" onclick="toggleHiveCreateRecipe(false)">Cancel</button><button class="hc-create-btn" type="submit">Publish to my profile</button></div></form></section>
      </main><div id="hive-recipe-detail-modal" style="position:fixed;inset:0;background:rgba(13,28,20,.62);backdrop-filter:blur(7px);z-index:9999;display:none;place-items:center;padding:16px"></div><div id="hive-create-recipe-modal" style="display:none"></div>`;
        };

        window.checkPendingHiveRecipeEdit = function () {
            const hash = location.hash || '';
            const qStr = hash.split('?')[1] || '';
            const params = new URLSearchParams(qStr);
            const editIdFromHash = params.get('edit') || '';
            let editPayload = null;
            try {
                const raw = sessionStorage.getItem('hivecity_editing_recipe');
                if (raw) editPayload = JSON.parse(raw);
            } catch (_) { }
            const targetId = editIdFromHash || (editPayload && editPayload.recipeId) || window._hiveEditingRecipeId || '';
            if (targetId && hash.startsWith('#nutrition')) {
                const recipe = window.findHiveRecipeById(targetId) || (editPayload && editPayload.recipe) || null;
                if (recipe) {
                    window.prefillHiveRecipeFormForEdit(recipe);
                    return true;
                }
            }
            if (hash.includes('create') && typeof window.toggleHiveCreateRecipe === 'function') {
                window.toggleHiveCreateRecipe(true);
            }
            return false;
        };

        setTimeout(() => { window.checkPendingHiveRecipeEdit(); }, 180);

        window.toggleHiveCreateRecipe = function (show) {
            const panel = document.getElementById('hive-create-recipe-panel');
            if (!panel) return;
            panel.classList.toggle('open', !!show);
            if (!show) {
                window._hiveEditingRecipeId = '';
                window._hiveEditingRecipeOriginal = null;
                window._hiveEditingReturnHash = '';
                try { sessionStorage.removeItem('hivecity_editing_recipe'); } catch (_) { }
                const submitBtn = panel.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'Publish to my profile';
                const formEl = panel.querySelector('form');
                if (formEl && typeof formEl.reset === 'function') formEl.reset();
                window.hiveCustomRecipeImages = [];
                if (typeof window.renderHiveRecipeImagePreviews === 'function') window.renderHiveRecipeImagePreviews();
                if (location.hash.includes('create')) {
                    try { history.replaceState(null, '', '#nutrition'); } catch (_) { }
                }
            } else {
                panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };

        /* --- NUTRITION INTERACTION HANDLERS --- */
        window.setNutritionCategory = function (c) { window.hiveNutritionState.category = c; window.hiveNutritionState.page = 1; go(1); };
        window.setNutritionGoal = function (g) {
            window.hiveNutritionState.goal = g;
            window.hiveNutritionState.page = 1;
            window.hiveNutritionState.randomRecipeId = '';
            go(1);
        };
        window.pickRandomNutritionRecipe = function () {
            window.hiveNutritionState.randomRecipeId = '';
            go(1);
        };

        window.setNutritionSearch = function (q) {
            window.hiveNutritionState.search = q;
            window.hiveNutritionState.page = 1;
            const deb = window._nutDebounce;
            if (deb) clearTimeout(deb);
            window._nutDebounce = setTimeout(() => go(1), 250);
        };

        window.loadMoreRecipes = function () {
            window.hiveNutritionState.page++;
            go(1);
        };

        window.openRecipeDetailModal = function (id) {
            const curatedLibrary = window.getHive1000Recipes();
            const sharedNutrients = typeof window.getSharedNutrients === 'function' ? window.getSharedNutrients() : [];
            const custom = JSON.parse(localStorage.getItem('hivecity_custom_recipes') || '[]');
            const currentUid = window.hiveCurrentUser && window.hiveCurrentUser.uid;
            const visibleCustom = custom.filter(x => !x.ownerUid || (currentUid && x.ownerUid === currentUid));
            const seedList = window.SEED_NUTRIENT_RECIPES || [];
            const r = [...sharedNutrients, ...seedList, ...visibleCustom, ...curatedLibrary, ...hiveRecipes].find(x => String(x.id) === String(id));
            if (!r) return;
            const rIngredients = Array.isArray(r.ingredients) ? r.ingredients : [];
            const rSteps = Array.isArray(r.steps) ? r.steps : [];
            const rName = r.name || r.title || 'Recipe';
            const rProtein = r.protein ?? r.proteinGrams ?? 0;
            const rCarbs = r.carbs ?? r.carbsGrams ?? 0;
            const rFat = r.fat ?? r.fatsGrams ?? 0;
            const rFiber = r.fiber ?? r.fiberGrams ?? 0;

            let modal = document.getElementById('hive-recipe-detail-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'hive-recipe-detail-modal';
                modal.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);backdrop-filter:blur(7px);z-index:9999;display:none;place-items:center;padding:16px';
                document.body.appendChild(modal);
            }
            const imageData = window.getHiveRecipeImageData(r);
            const resolvedDetailImgs = (Array.isArray(r.images) && r.images.length)
                ? r.images.filter(Boolean)
                : (Array.isArray(r.imageUrls) && r.imageUrls.length)
                    ? r.imageUrls.filter(Boolean)
                    : ((r.coverImage || r.imageUrl || r.image) ? [r.coverImage || r.imageUrl || r.image] : []);
            if (resolvedDetailImgs.length) {
                imageData.finished = resolvedDetailImgs[0] || '';
                imageData.cooking = resolvedDetailImgs[1] || '';
                imageData.detail = resolvedDetailImgs[2] || '';
                imageData.sourceName = r.sourceName || 'Uploaded recipe photo';
                imageData.sourceUrl = r.sourceUrl || '';
                imageData.sources = {
                    finished: { name: imageData.sourceName, url: imageData.sourceUrl },
                    cooking: { name: imageData.sourceName, url: imageData.sourceUrl },
                    detail: { name: imageData.sourceName, url: imageData.sourceUrl }
                };
            }
            const recipeImageSlots = [
                { key: 'finished', label: 'Finished Dish' },
                { key: 'cooking', label: 'Cooking & Prep' },
                { key: 'detail', label: 'Close-up Detail' }
            ].map(slot => {
                const source = imageData.sources && imageData.sources[slot.key]
                    ? imageData.sources[slot.key]
                    : { name: imageData.sourceName, url: imageData.sourceUrl };
                return `<div class="hive-recipe-gallery-slide"><div class="hive-recipe-photo hive-recipe-photo-detail">${imageData[slot.key] ? `<img src="${recipeEscape(imageData[slot.key])}" alt="${recipeEscape(rName + ' — ' + slot.label)}" loading="lazy" onerror="window.handleHiveRecipeImgError(this)">${window.renderHiveRecipeSourceBadge(source && source.name, source && source.url)}` : `<div style="height:100%;min-height:190px;display:grid;place-items:center;background:var(--bg);color:var(--mu);font-size:14px">${slot.label} image not added yet</div>`}</div><span class="hive-recipe-gallery-label">${slot.label}</span></div>`;
            }).join('');

            modal.innerHTML = `
        <div class="card" style="width:100%;max-width:760px;max-height:92vh;overflow-y:auto;border-radius:24px;padding:24px;background:#fbfcf8;color:#18372d;border:1px solid #dce6da">
          <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:16px">
            <div>
              <span class="tag" style="background:rgba(199,243,107,0.15);color:#C7F36B;font-weight:700">${r.goal}</span>
              <span class="tag" style="margin-left:6px">${r.category}</span>
            </div>
            <button class="chip" onclick="document.getElementById('hive-recipe-detail-modal').style.display='none'" style="font-size:16px;padding:6px 12px">✕</button>
          </div>

          <h2 style="font-size:25px;font-weight:900;color:#18372d;margin:0 0 8px">${recipeEscape(rName)}</h2>
          <p style="color:var(--mu);margin:0 0 20px;line-height:1.5">${recipeEscape(r.description || '')}</p>

          <!-- Sourced recipe image gallery; unused slots remain available for future images. -->
          ${recipeImageSlots ? `
          <div style="margin-bottom:24px">
            <div style="font-size:12px;font-weight:700;color:var(--mu);margin-bottom:8px;text-transform:uppercase">Recipe Photos</div>
            <div class="hive-recipe-gallery" id="hive-recipe-gallery-track">${recipeImageSlots}</div><div class="hive-recipe-gallery-controls"><button type="button" onclick="hiveRecipeGalleryMove(-1)">← Previous</button><span style="font-size:11px;color:var(--mu)">1 / 3 · Swipe to slide</span><button type="button" onclick="hiveRecipeGalleryMove(1)">Next →</button></div>
          </div>` : `
          <div style="margin-bottom:24px">
            <div style="font-size:12px;font-weight:700;color:var(--mu);margin-bottom:8px;text-transform:uppercase">Recipe Photos</div>
            <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px">
              <div class="card" style="text-align:center;padding:16px 8px;border-radius:16px;background:var(--bg)"><div style="font-size:32px;margin-bottom:6px">${r.images ? r.images.slot1.icon : '🍽️'}</div><b style="font-size:12px;display:block">${r.images ? r.images.slot1.label : 'Plated Dish'}</b><small style="font-size:10px;color:var(--mu)">Photo not added yet</small></div>
              <div class="card" style="text-align:center;padding:16px 8px;border-radius:16px;background:var(--bg)"><div style="font-size:32px;margin-bottom:6px">${r.images ? r.images.slot2.icon : '🍳'}</div><b style="font-size:12px;display:block">${r.images ? r.images.slot2.label : 'Cooking & Prep'}</b><small style="font-size:10px;color:var(--mu)">Photo not added yet</small></div>
              <div class="card" style="text-align:center;padding:16px 8px;border-radius:16px;background:var(--bg)"><div style="font-size:32px;margin-bottom:6px">${r.images ? r.images.slot3.icon : '🥗'}</div><b style="font-size:12px;display:block">${r.images ? r.images.slot3.label : 'Macro & Angles'}</b><small style="font-size:10px;color:var(--mu)">Photo not added yet</small></div>
            </div>
          </div>`}

          <!-- Macros Row -->
          <div class="row" style="justify-content:space-around;background:var(--bg);padding:14px;border-radius:16px;margin-bottom:24px;text-align:center">
            <div><b class="num" style="font-size:24px;color:#C7F36B">${r.calories || 0}</b><small style="display:block;color:var(--mu);font-size:11px">CALORIES</small></div>
            <div><b class="num" style="font-size:24px">${rProtein}g</b><small style="display:block;color:var(--mu);font-size:11px">PROTEIN</small></div>
            <div><b class="num" style="font-size:24px">${rCarbs}g</b><small style="display:block;color:var(--mu);font-size:11px">CARBS</small></div>
            <div><b class="num" style="font-size:24px">${rFat}g</b><small style="display:block;color:var(--mu);font-size:11px">FAT</small></div>
            ${rFiber > 0 ? `<div><b class="num" style="font-size:24px">${rFiber}g</b><small style="display:block;color:var(--mu);font-size:11px">FIBER</small></div>` : ''}
          </div>

          <!-- Ingredients -->
          ${rIngredients.length ? `
          <div style="margin-bottom:20px">
            <h4 style="font-size:16px;margin:0 0 10px;color:#18372d">Ingredients (${rIngredients.length})</h4>
            <div style="display:grid;gap:6px">
              ${rIngredients.map(ing => `
                <div class="row" style="align-items:center;gap:10px;font-size:13px;padding:6px 12px;background:var(--bg);border-radius:8px">
                  <span style="color:#C7F36B">✓</span> ${recipeEscape(ing)}
                </div>
              `).join('')}
            </div>
          </div>` : ''}

          <!-- Steps -->
          ${rSteps.length ? `
          <div style="margin-bottom:24px">
            <h4 style="font-size:16px;margin:0 0 10px;color:#18372d">Preparation & Cooking Steps</h4>
            <div style="display:grid;gap:8px">
              ${rSteps.map((st, i) => `
                <div style="font-size:13px;line-height:1.5;padding:10px 14px;background:var(--bg);border-radius:10px">
                  <b style="color:#C7F36B">Step ${i + 1}:</b> ${recipeEscape(st)}
                </div>
              `).join('')}
            </div>
          </div>` : ''}

          <div class="row" style="gap:12px">
            <button type="button" class="btn" data-repost-btn="${recipeEscape(r.id)}" onclick="toggleRecipeRepost('${recipeEscape(r.id)}', this)" style="flex:1;background:${window.isRecipeRepostedByMe && window.isRecipeRepostedByMe(r.id) ? '#176346' : '#C7F36B'};color:${window.isRecipeRepostedByMe && window.isRecipeRepostedByMe(r.id) ? '#ffffff' : '#10110F'};font-weight:800">
              ${window.isRecipeRepostedByMe && window.isRecipeRepostedByMe(r.id) ? '✓ Reposted' : '🔁 Repost to Profile'}
            </button>
            <button type="button" class="btn g" onclick="toggleRecipeShare('${recipeEscape(r.id)}')" style="flex:1">
              💬 Share with Hive
            </button>
          </div>
        </div>
      `;
            modal.style.display = 'grid';
        };

        window.hiveRecipeGalleryMove = function (direction) {
            const track = document.getElementById('hive-recipe-gallery-track');
            if (!track) return;
            const slide = track.querySelector('.hive-recipe-gallery-slide');
            track.scrollBy({ left: (slide ? slide.getBoundingClientRect().width : track.clientWidth) * direction, behavior: 'smooth' });
        };

        window.closeAllHiveRecipeMenus = function () {
            document.querySelectorAll('.hc-recipe-menu-dd').forEach(el => { el.style.display = 'none'; });
        };

        document.addEventListener('click', () => {
            if (typeof window.closeAllHiveRecipeMenus === 'function') window.closeAllHiveRecipeMenus();
        });

        window.toggleHiveRecipeMenu = function (recipeId, ev) {
            if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
            const menus = document.querySelectorAll('.hc-recipe-menu-dd');
            let target = null;
            menus.forEach(el => {
                if (el.getAttribute('data-recipe-menu') === String(recipeId)) {
                    target = el;
                } else {
                    el.style.display = 'none';
                }
            });
            if (target) {
                target.style.display = target.style.display === 'block' ? 'none' : 'block';
            }
        };

        window.findHiveRecipeById = function (recipeId) {
            const idStr = String(recipeId || '');
            if (!idStr) return null;
            let localCustom = [];
            try { localCustom = JSON.parse(localStorage.getItem('hivecity_custom_recipes') || '[]'); } catch (_) { }
            const shared = typeof window.getSharedNutrients === 'function' ? window.getSharedNutrients() : [];
            const seeds = window.SEED_NUTRIENT_RECIPES || [];
            const curated = typeof window.getHive1000Recipes === 'function' ? window.getHive1000Recipes() : [];
            const fromHive = Array.isArray(hiveRecipes) ? hiveRecipes : [];
            const found =
                localCustom.find(r => r && String(r.id) === idStr) ||
                shared.find(r => r && String(r.id) === idStr) ||
                fromHive.find(r => r && String(r.id) === idStr) ||
                seeds.find(r => r && String(r.id) === idStr) ||
                curated.find(r => r && String(r.id) === idStr) ||
                null;
            if (found) return found;
            try {
                const reposts = JSON.parse(localStorage.getItem('hivecity_user_reposts') || '[]');
                const hit = reposts.find(x => x && String(x.originalItemId) === idStr && x.snapshot);
                if (hit && hit.snapshot) return hit.snapshot;
            } catch (_) { }
            return null;
        };

        window.prefillHiveRecipeFormForEdit = function (recipe) {
            if (!recipe || !recipe.id) return;
            window._hiveEditingRecipeId = String(recipe.id);
            window._hiveEditingRecipeOriginal = recipe;
            const panel = document.getElementById('hive-create-recipe-panel');
            if (!panel) return;
            panel.classList.add('open');

            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (!el) return;
                if (el.tagName === 'SELECT' && val) {
                    const hasOpt = Array.from(el.options).some(o => o.value === val || o.text === val);
                    if (!hasOpt) {
                        const opt = document.createElement('option');
                        opt.value = val;
                        opt.textContent = val;
                        el.appendChild(opt);
                    }
                }
                el.value = val !== undefined && val !== null ? String(val) : '';
            };

            setVal('cr_title', recipe.name || recipe.title || '');
            setVal('cr_category', recipe.category || recipe.mealType || 'High Protein Meals');
            setVal('cr_goal', recipe.goal || 'Maintenance');
            setVal('cr_prep', recipe.prepTime ?? recipe.prepTimeMins ?? 20);
            setVal('cr_description', recipe.description || '');
            setVal('cr_cal', recipe.calories ?? 0);
            setVal('cr_pro', recipe.protein ?? recipe.proteinGrams ?? 0);
            setVal('cr_carb', recipe.carbs ?? recipe.carbsGrams ?? 0);
            setVal('cr_fat', recipe.fat ?? recipe.fatsGrams ?? 0);
            setVal('cr_ingredients', Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : (recipe.ingredients || ''));
            setVal('cr_steps', Array.isArray(recipe.steps) ? recipe.steps.join('\n') : (Array.isArray(recipe.instructions) ? recipe.instructions.join('\n') : (recipe.steps || '')));

            const existingImgs = (Array.isArray(recipe.images) && recipe.images.length)
                ? recipe.images.filter(Boolean)
                : (Array.isArray(recipe.imageUrls) && recipe.imageUrls.length)
                    ? recipe.imageUrls.filter(Boolean)
                    : ((recipe.coverImage || recipe.imageUrl || recipe.image) ? [recipe.coverImage || recipe.imageUrl || recipe.image] : []);

            window.hiveCustomRecipeImages = existingImgs.slice(0, 3).map((url, idx) => ({
                file: null,
                dataUrl: url,
                existingUrl: url,
                name: 'existing-photo-' + (idx + 1) + '.jpg'
            }));
            if (typeof window.renderHiveRecipeImagePreviews === 'function') {
                window.renderHiveRecipeImagePreviews();
            }

            const submitBtn = panel.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.textContent = 'Save recipe changes';
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };

        window.startEditHiveUserRecipe = function (recipeId) {
            window.closeAllHiveRecipeMenus();
            const recipe = window.findHiveRecipeById(recipeId);
            if (!recipe) {
                toast('Could not find this recipe to edit.');
                return;
            }
            const returnHash = location.hash && location.hash.startsWith('#profile') ? location.hash : '#nutrition';
            window._hiveEditingRecipeId = String(recipe.id);
            window._hiveEditingRecipeOriginal = recipe;
            window._hiveEditingReturnHash = returnHash;
            try {
                sessionStorage.setItem('hivecity_editing_recipe', JSON.stringify({
                    recipeId: String(recipe.id),
                    returnHash: returnHash,
                    recipe: recipe
                }));
            } catch (_) { }

            const targetHash = '#nutrition?edit=' + encodeURIComponent(String(recipe.id));
            if (location.hash.startsWith('#nutrition')) {
                location.hash = targetHash;
                setTimeout(() => window.prefillHiveRecipeFormForEdit(recipe), 60);
            } else {
                location.hash = targetHash;
                setTimeout(() => window.prefillHiveRecipeFormForEdit(recipe), 160);
            }
        };

        window.getHiveOwnerDeletedRecipeIds = function (uid) {
            const cleanUid = String(uid || '');
            if (!cleanUid) return [];
            try {
                const map = JSON.parse(localStorage.getItem('hivecity_user_deleted_recipes') || '{}');
                return Array.isArray(map[cleanUid]) ? map[cleanUid].map(String) : [];
            } catch (_) { return []; }
        };

        window.isRecipeDeletedByOwner = function (recipe, viewerUid) {
            if (!recipe || !recipe.id) return false;
            const uid = String(viewerUid || '');
            if (!uid) return false;
            const idStr = String(recipe.id);
            const ownerDeletedList = window.getHiveOwnerDeletedRecipeIds(uid);
            if (ownerDeletedList.includes(idStr)) return true;
            const isOwner = String(recipe.ownerUid || '') === uid || String(recipe.userId || '') === uid || String(recipe.createdBy || '') === uid;
            return Boolean(isOwner && recipe.deletedByOwner === true);
        };

        window.deleteHiveUserRecipe = async function (recipeId) {
            window.closeAllHiveRecipeMenus();
            const cur = (window.hiveAuth && window.hiveAuth.currentUser) || (typeof window.getAuthUser === 'function' ? window.getAuthUser() : window.hiveCurrentUser);
            if (!cur) { toast('Please sign in first.'); return; }
            if (typeof window.confirm === 'function' && !window.confirm('Delete this recipe from your profile?')) {
                return;
            }
            const idStr = String(recipeId);
            // 1. Mark deleted ONLY for this user's own personal view
            try {
                const delMap = JSON.parse(localStorage.getItem('hivecity_user_deleted_recipes') || '{}');
                const arr = Array.isArray(delMap[cur.uid]) ? delMap[cur.uid].map(String) : [];
                if (!arr.includes(idStr)) arr.unshift(idStr);
                delMap[cur.uid] = arr;
                localStorage.setItem('hivecity_user_deleted_recipes', JSON.stringify(delMap));
            } catch (_) { }
            try {
                const custom = JSON.parse(localStorage.getItem('hivecity_custom_recipes') || '[]').filter(r => r && String(r.id) !== idStr);
                localStorage.setItem('hivecity_custom_recipes', JSON.stringify(custom));
            } catch (_) { }
            try {
                if (window.hs && window.hs.nutritionShares && Array.isArray(window.hs.nutritionShares[cur.uid])) {
                    window.hs.nutritionShares[cur.uid] = window.hs.nutritionShares[cur.uid].filter(id => String(id) !== idStr);
                    if (typeof window.hsSave === 'function') window.hsSave();
                }
            } catch (_) { }
            // 2. Soft-mark deletedByOwner on backend (never breaks Admin views or other users' references)
            try {
                if (typeof window.deleteUserRecipeOnAdminApi === 'function') {
                    await window.deleteUserRecipeOnAdminApi(idStr, cur);
                }
            } catch (_) { }

            window.dispatchEvent(new Event('hivecity:nutrients-updated'));
            toast('Recipe removed from your profile.');
            if (typeof go === 'function') go(1);
        };

        // --- UNIFIED REPOSTS STORE (hivecity_user_reposts + hs.repostsByUser + Firestore + Backend) ---
        window.readHiveUserRepostsAll = function () {
            try {
                const raw = localStorage.getItem('hivecity_user_reposts');
                const parsed = raw ? JSON.parse(raw) : [];
                return Array.isArray(parsed) ? parsed.filter(r => r && r.originalItemId && r.repostedBy) : [];
            } catch (_) { return []; }
        };

        window.getHiveUserReposts = function (uid) {
            const targetUid = String(uid || '');
            if (!targetUid) return [];
            const byItemId = new Map();
            const addRecord = rec => {
                if (!rec || !rec.originalItemId) return;
                const key = String(rec.originalItemId);
                if (!byItemId.has(key)) {
                    byItemId.set(key, rec);
                } else if (!byItemId.get(key).snapshot && rec.snapshot) {
                    byItemId.set(key, Object.assign({}, byItemId.get(key), { snapshot: rec.snapshot }));
                }
            };
            window.readHiveUserRepostsAll().filter(r => String(r.repostedBy) === targetUid).forEach(addRecord);
            if (window.hs && window.hs.repostsByUser && Array.isArray(window.hs.repostsByUser[targetUid])) {
                window.hs.repostsByUser[targetUid].forEach(addRecord);
            }
            // Migrate any legacy hivecity_recipe_reposts IDs for current logged-in user
            const cur = (window.hiveAuth && window.hiveAuth.currentUser) || (typeof window.getAuthUser === 'function' ? window.getAuthUser() : window.hiveCurrentUser);
            if (cur && String(cur.uid) === targetUid) {
                try {
                    const legacyIds = JSON.parse(localStorage.getItem('hivecity_recipe_reposts') || '[]');
                    if (Array.isArray(legacyIds)) {
                        legacyIds.forEach(rid => {
                            if (rid) addRecord({
                                id: targetUid + '_' + rid,
                                originalItemId: String(rid),
                                itemType: 'recipe',
                                repostedBy: targetUid,
                                repostedByEmail: cur.email || '',
                                repostedAt: new Date().toISOString()
                            });
                        });
                    }
                } catch (_) { }
            }
            return Array.from(byItemId.values()).sort((a, b) => String(b.repostedAt || '').localeCompare(String(a.repostedAt || '')));
        };

        window.isRecipeRepostedByMe = function (recipeId) {
            const cur = (window.hiveAuth && window.hiveAuth.currentUser) || (typeof window.getAuthUser === 'function' ? window.getAuthUser() : window.hiveCurrentUser);
            if (!cur || !cur.uid) return false;
            const idStr = String(recipeId || '');
            return window.getHiveUserReposts(cur.uid).some(r => String(r.originalItemId) === idStr);
        };

        window.toggleRecipeRepost = async function (recipeId, btnEl) {
            const cur = (window.hiveAuth && window.hiveAuth.currentUser) || (typeof window.getAuthUser === 'function' ? window.getAuthUser() : window.hiveCurrentUser);
            if (!cur || !cur.uid) {
                toast('Please sign in to repost recipes.');
                location.hash = 'auth';
                return false;
            }
            const idStr = String(recipeId || '');
            if (!idStr) return false;

            const allReposts = window.readHiveUserRepostsAll();
            const existingIdx = allReposts.findIndex(r => String(r.repostedBy) === String(cur.uid) && String(r.originalItemId) === idStr);
            const alreadyInHs = Boolean(window.hs && window.hs.reposts && window.hs.reposts[idStr]);
            const isRemoving = existingIdx >= 0 || alreadyInHs;

            let isNowReposted = false;
            let snapshotPayload = null;

            if (isRemoving) {
                const nextAll = allReposts.filter(r => !(String(r.repostedBy) === String(cur.uid) && String(r.originalItemId) === idStr));
                try { localStorage.setItem('hivecity_user_reposts', JSON.stringify(nextAll)); } catch (_) { }
                try {
                    const legacy = JSON.parse(localStorage.getItem('hivecity_recipe_reposts') || '[]').filter(x => String(x) !== idStr);
                    localStorage.setItem('hivecity_recipe_reposts', JSON.stringify(legacy));
                } catch (_) { }
                if (window.hs) {
                    window.hs.reposts = window.hs.reposts || {};
                    delete window.hs.reposts[idStr];
                    window.hs.repostsByUser = window.hs.repostsByUser || {};
                    window.hs.repostsByUser[cur.uid] = (window.hs.repostsByUser[cur.uid] || []).filter(r => String(r.originalItemId) !== idStr);
                    if (typeof window.hsSave === 'function') window.hsSave();
                }
                isNowReposted = false;
                toast('Removed from Profile Reposts');
            } else {
                const recipe = window.findHiveRecipeById(idStr) || { id: idStr, name: 'Hivecity Recipe', category: 'Nutrition' };
                const imgs = (Array.isArray(recipe.images) && recipe.images.length)
                    ? recipe.images.filter(Boolean)
                    : (Array.isArray(recipe.imageUrls) && recipe.imageUrls.length)
                        ? recipe.imageUrls.filter(Boolean)
                        : ((recipe.coverImage || recipe.imageUrl || recipe.image) ? [recipe.coverImage || recipe.imageUrl || recipe.image] : []);
                const coverImg = recipe.coverImage || recipe.imageUrl || recipe.image || imgs[0] || '';
                snapshotPayload = {
                    id: idStr,
                    name: recipe.name || recipe.title || 'Recipe',
                    title: recipe.title || recipe.name || 'Recipe',
                    category: recipe.category || recipe.mealType || 'Nutrition',
                    mealType: recipe.mealType || recipe.category || 'Nutrition',
                    goal: recipe.goal || 'Nutrition',
                    calories: Number(recipe.calories || 0),
                    prepTime: Number(recipe.prepTime || recipe.prepTimeMins || 20),
                    prepTimeMins: Number(recipe.prepTimeMins || recipe.prepTime || 20),
                    protein: Number(recipe.protein || recipe.proteinGrams || 0),
                    proteinGrams: Number(recipe.proteinGrams || recipe.protein || 0),
                    carbs: Number(recipe.carbs || recipe.carbsGrams || 0),
                    fat: Number(recipe.fat || recipe.fatsGrams || 0),
                    description: recipe.description || '',
                    image: coverImg,
                    coverImage: coverImg,
                    imageUrl: coverImg,
                    images: imgs.slice(0, 3),
                    imageUrls: imgs.slice(0, 3),
                    ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
                    steps: Array.isArray(recipe.steps) ? recipe.steps : [],
                    creatorName: recipe.creatorName || recipe.authorName || 'Hivecity',
                    authorName: recipe.authorName || recipe.creatorName || 'Hivecity',
                    authorEmail: recipe.authorEmail || ''
                };
                const repostRecord = {
                    id: cur.uid + '_' + idStr,
                    originalItemId: idStr,
                    itemType: 'recipe',
                    repostedBy: cur.uid,
                    repostedByEmail: cur.email || '',
                    repostedAt: new Date().toISOString(),
                    snapshot: snapshotPayload
                };
                const deduped = allReposts.filter(r => !(String(r.repostedBy) === String(cur.uid) && String(r.originalItemId) === idStr));
                deduped.unshift(repostRecord);
                try { localStorage.setItem('hivecity_user_reposts', JSON.stringify(deduped)); } catch (_) { }
                try {
                    const legacy = JSON.parse(localStorage.getItem('hivecity_recipe_reposts') || '[]').filter(x => String(x) !== idStr);
                    legacy.unshift(idStr);
                    localStorage.setItem('hivecity_recipe_reposts', JSON.stringify(legacy));
                } catch (_) { }
                if (window.hs) {
                    window.hs.reposts = window.hs.reposts || {};
                    window.hs.reposts[idStr] = true;
                    window.hs.repostsByUser = window.hs.repostsByUser || {};
                    window.hs.repostsByUser[cur.uid] = (window.hs.repostsByUser[cur.uid] || []).filter(r => String(r.originalItemId) !== idStr);
                    window.hs.repostsByUser[cur.uid].unshift(repostRecord);
                    if (typeof window.hsSave === 'function') window.hsSave();
                }
                isNowReposted = true;
                toast('Reposted to your Profile!');
            }

            // Update all matching Repost buttons immediately (both modal buttons and Profile REPOSTS icon buttons)
            const matchedButtons = Array.from(document.querySelectorAll('[data-repost-btn="' + idStr + '"]'));
            if (btnEl && !matchedButtons.includes(btnEl)) matchedButtons.push(btnEl);
            matchedButtons.forEach(b => {
                if (!b) return;
                if (b.classList && b.classList.contains('chip')) {
                    b.classList.toggle('on', isNowReposted);
                    b.textContent = '🔁';
                } else {
                    b.textContent = isNowReposted ? '🔁 Reposted' : '🔁 Repost to Profile';
                    b.style.background = isNowReposted ? '#176346' : '#C7F36B';
                    b.style.color = isNowReposted ? '#ffffff' : '#10110F';
                }
            });

            // Sync to Firestore & Backend reposts API cleanly (non-blocking)
            try {
                if (window.hiveDb) {
                    const repDoc = window.hiveDb.collection('reposts').doc(cur.uid + '_' + idStr);
                    if (isNowReposted) {
                        void repDoc.set({
                            id: cur.uid + '_' + idStr,
                            originalItemId: idStr,
                            itemType: 'recipe',
                            repostedBy: cur.uid,
                            repostedByEmail: cur.email || '',
                            repostedAt: new Date().toISOString(),
                            snapshot: snapshotPayload,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true }).catch(() => { });
                    } else {
                        void repDoc.delete().catch(() => { });
                    }
                }
            } catch (_) { }
            try {
                if (typeof window.syncUserRepostToggleToApi === 'function') {
                    void window.syncUserRepostToggleToApi({
                        originalItemId: idStr,
                        itemType: 'recipe',
                        repostedBy: cur.uid,
                        repostedByEmail: cur.email || '',
                        action: isNowReposted ? 'add' : 'remove',
                        snapshot: snapshotPayload
                    }, cur);
                }
            } catch (_) { }

            window.dispatchEvent(new Event('hivecity:reposts-updated'));
            return isNowReposted;
        };