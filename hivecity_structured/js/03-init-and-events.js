
        (() => {
            const SHARED_EVENTS_KEY = 'hivecity_shared_events';
            const SHARED_BOOKINGS_KEY = 'hivecity_event_bookings';
            const EVENTS_UPDATED_EVENT = 'hivecity:events-updated';
            const MONTH_NAME_MAP = {
                jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2,
                apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6,
                aug: 7, august: 7, sep: 8, sept: 8, september: 8,
                oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
            };

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

            const state = {
                month: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
                selected: null, // optional date filter YYYY-MM-DD
                activeTab: 'upcoming', // 'upcoming' | 'ongoing' | 'completed'
                events: [],
                remoteEvents: [],
                apiEvents: [],
                bookings: [],
                expandedTc: {},
                agreedTerms: {},
                sessionBooked: {},
                loaded: false,
                error: false,
                unsubscribe: null,
                unsubscribeBookings: null,
                lifecycleTimer: null,
                apiBaseUrl: null
            };

            const escHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

            const toLocalDayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

            // Parses ISO ("2026-11-26"), formatted ("26 Nov 2026", "Nov 26, 2026"), timestamps, and Date objects cleanly
            const dateValue = v => {
                if (!v) return null;
                if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
                if (v.toDate && typeof v.toDate === 'function') return v.toDate();
                if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
                if (typeof v === 'string') {
                    const trimmed = v.trim();
                    if (!trimmed) return null;
                    const isoOnly = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
                    if (isoOnly) {
                        return new Date(Number(isoOnly[1]), Number(isoOnly[2]) - 1, Number(isoOnly[3]), 0, 0, 0, 0);
                    }
                    const dmy = /^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/.exec(trimmed);
                    if (dmy && MONTH_NAME_MAP[dmy[2].toLowerCase()] !== undefined) {
                        return new Date(Number(dmy[3]), MONTH_NAME_MAP[dmy[2].toLowerCase()], Number(dmy[1]), 0, 0, 0, 0);
                    }
                    const mdy = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(trimmed);
                    if (mdy && MONTH_NAME_MAP[mdy[1].toLowerCase()] !== undefined) {
                        return new Date(Number(mdy[3]), MONTH_NAME_MAP[mdy[1].toLowerCase()], Number(mdy[2]), 0, 0, 0, 0);
                    }
                    const d = new Date(trimmed);
                    return isNaN(d.getTime()) ? null : d;
                }
                const secs = typeof v.seconds === 'number' ? v.seconds : v._seconds;
                if (typeof secs === 'number') return new Date(secs * 1000);
                return null;
            };

            const eventDate = e => dateValue(e.eventDate || e.date || e.schedule || e.startDate || e.startAt || e.event_date || e.datetime || e.when);

            // Deterministic lifecycle status resolver using timezone-safe YYYY-MM-DD comparison
            const resolveStatus = e => {
                const raw = String(e.status || e.eventStatus || '').trim().toLowerCase();
                if (e.completed === true || raw === 'completed' || raw === 'complete' || raw === 'done') {
                    return 'completed';
                }
                const start = eventDate(e);
                if (start) {
                    const todayKey = toLocalDayKey(new Date());
                    const evtKey = toLocalDayKey(start);
                    return todayKey >= evtKey ? 'ongoing' : 'upcoming';
                }
                if (raw === 'ongoing' || raw === 'live') {
                    return 'ongoing';
                }
                return 'upcoming';
            };

            const isDone = e => resolveStatus(e) === 'completed';
            const isLive = e => resolveStatus(e) === 'ongoing';
            const isUpcoming = e => resolveStatus(e) === 'upcoming';

            const formatFee = feeAmount => {
                if (feeAmount === undefined || feeAmount === null || feeAmount === '') return 'Free';
                if (typeof feeAmount === 'number') return feeAmount > 0 ? '₹' + feeAmount.toLocaleString('en-IN') : 'Free';
                const str = String(feeAmount).trim();
                if (!str || str.toLowerCase() === 'free') return 'Free';
                const num = Number(str.replace(/[₹,\s]/g, ''));
                if (Number.isFinite(num)) return num > 0 ? '₹' + num.toLocaleString('en-IN') : 'Free';
                return str;
            };

            const normalizeBookingUrl = rawUrl => {
                if (!rawUrl) return '';
                const trimmed = String(rawUrl).trim();
                if (!trimmed) return '';
                const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
                try {
                    const u = new URL(withScheme);
                    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : '';
                } catch {
                    return '';
                }
            };

            const formatEventDateDisplay = e => {
                const raw = e.eventDate || e.date || e.schedule;
                const d = eventDate(e);
                if (!d) return raw ? String(raw) : 'Date TBA';
                if (typeof raw === 'string' && (/^\d{4}-\d{1,2}-\d{1,2}$/.test(raw.trim()) || /^\d{1,2}\s+[A-Za-z]+,?\s+\d{4}$/.test(raw.trim()))) {
                    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                }
                return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            };

            const dayKey = toLocalDayKey;
            const dayEvents = key => state.events.filter(e => { const d = eventDate(e); return d && dayKey(d) === key; });

            const readLocalEvents = () => {
                try {
                    const raw = localStorage.getItem(SHARED_EVENTS_KEY);
                    const arr = raw ? JSON.parse(raw) : [];
                    return Array.isArray(arr) ? arr : [];
                } catch { return []; }
            };

            const readLocalBookings = () => {
                try {
                    const raw = localStorage.getItem(SHARED_BOOKINGS_KEY);
                    const arr = raw ? JSON.parse(raw) : [];
                    return Array.isArray(arr) ? arr : [];
                } catch { return []; }
            };

            const mergeAllEvents = () => {
                const map = {};
                if (state.apiBaseUrl === null) {
                    readLocalEvents().forEach((e, idx) => {
                        const id = String(e._docId || e.id || ('local-' + idx));
                        map[id] = { ...e, id, _docId: id };
                    });
                }
                state.apiEvents.forEach(e => {
                    const id = String(e._docId || e.id);
                    if (id) map[id] = { ...e, id, _docId: id };
                });
                state.remoteEvents.forEach(e => {
                    const id = String(e._docId || e.id);
                    if (id) {
                        const existing = map[id] || {};
                        map[id] = { ...existing, ...e, id, _docId: id };
                        if (typeof existing.bookingsCount === 'number' && state.apiBaseUrl !== null) {
                            map[id].bookingsCount = existing.bookingsCount;
                        }
                    }
                });
                state.events = Object.values(map);
            };

            async function fetchEventsFromApi() {
                const candidates = state.apiBaseUrl !== null ? [state.apiBaseUrl] : getApiCandidates();
                for (const base of candidates) {
                    try {
                        const res = await fetch(base + '/api/events', { cache: 'no-store' });
                        if (res.ok) {
                            const data = await res.json();
                            if (Array.isArray(data.events)) {
                                state.apiBaseUrl = base;
                                state.apiEvents = data.events;
                                state.loaded = true;
                                state.error = false;
                                try { localStorage.setItem(SHARED_EVENTS_KEY, JSON.stringify(data.events)); } catch { }
                                mergeAllEvents();
                                render();
                                // Also fetch authoritative bookings list for accurate counts & status
                                try {
                                    const bRes = await fetch(base + '/api/events/bookings', { cache: 'no-store' });
                                    if (bRes.ok) {
                                        const bData = await bRes.json();
                                        if (Array.isArray(bData.bookings)) {
                                            state.bookings = bData.bookings;
                                            try { localStorage.setItem(SHARED_BOOKINGS_KEY, JSON.stringify(bData.bookings)); } catch { }
                                            render();
                                        }
                                    }
                                } catch { }
                                return true;
                            }
                        }
                    } catch { }
                }
                return false;
            }

            const getCurrentUserInfo = () => {
                const cur = (typeof window.getAuthUser === 'function' ? window.getAuthUser() : window.hiveCurrentUser) || null;
                return {
                    userId: (cur && cur.uid) || 'guest-athlete',
                    userName: (cur && (cur.displayName || cur.name)) || 'Hive Athlete',
                    userEmail: (cur && cur.email) || ''
                };
            };

            const getBookingsForEvent = eventId => state.bookings.filter(b => String(b.eventId) === String(eventId));
            const getUserBookingForEvent = eventId => {
                if (state.sessionBooked[String(eventId)]) return state.sessionBooked[String(eventId)];
                const { userId } = getCurrentUserInfo();
                if (userId && userId !== 'guest-athlete') {
                    return state.bookings.find(b => String(b.eventId) === String(eventId) && String(b.userId) === String(userId)) || null;
                }
                return null;
            };

            const syncEventBookingsCountLocal = (eventId, nextCount) => {
                const safeCount = Math.max(0, Number(nextCount) || 0);
                state.apiEvents = state.apiEvents.map(item =>
                    String(item._docId || item.id) === eventId ? { ...item, bookingsCount: safeCount } : item
                );
                state.remoteEvents = state.remoteEvents.map(item =>
                    String(item._docId || item.id) === eventId ? { ...item, bookingsCount: safeCount } : item
                );
                const cached = readLocalEvents().map(item =>
                    String(item._docId || item.id) === eventId ? { ...item, bookingsCount: safeCount } : item
                );
                try { localStorage.setItem(SHARED_EVENTS_KEY, JSON.stringify(cached)); } catch { }
            };

            async function handleBookEvent(evt) {
                const eventId = String(evt._docId || evt.id || '');
                if (!eventId) return;
                if (!state.agreedTerms[eventId]) {
                    if (typeof toast === 'function') toast('Please agree to the Terms & Conditions before booking.');
                    return;
                }

                const user = getCurrentUserInfo();
                const isGuest = !user.userId || user.userId === 'guest-athlete';
                const feeRaw = evt.feeAmount ?? evt.fee ?? evt.price ?? 0;
                const bookingUrl = normalizeBookingUrl(evt.bookingUrl);
                const bookingId = isGuest
                    ? eventId + '_guest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
                    : eventId + '_' + user.userId.replace(/[^a-zA-Z0-9_-]/g, '');

                const ticketId = 'HC-' + String(bookingId).replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
                const bookingRecord = {
                    id: bookingId,
                    ticketId,
                    userId: user.userId,
                    userName: user.userName,
                    userEmail: user.userEmail,
                    eventId,
                    eventTitle: evt.title || evt.name || 'Hivecity Event',
                    eventImage: evt.imageUrl || evt.coverImage || evt.image || '',
                    eventDate: evt.eventDate || evt.date || '',
                    location: evt.location || '',
                    bookedAt: new Date().toISOString(),
                    feeAmount: feeRaw,
                    agreedToTerms: true,
                    bookingUrl
                };

                // 1. Optimistically increment booking count & hide Book Now button immediately
                const alreadyExists = state.bookings.some(b => b.id === bookingId);
                const prevBase = Number(evt.bookingsCount ?? evt.bookings ?? evt.participants ?? 0) || 0;
                const prevTotal = Math.max(prevBase, getBookingsForEvent(eventId).length);
                const optimisticCount = alreadyExists ? Math.max(1, prevTotal) : prevTotal + 1;

                state.sessionBooked[eventId] = bookingRecord;
                syncEventBookingsCountLocal(eventId, optimisticCount);

                const nextBookings = [bookingRecord, ...state.bookings.filter(b => b.id !== bookingId)];
                state.bookings = nextBookings;
                try { localStorage.setItem(SHARED_BOOKINGS_KEY, JSON.stringify(nextBookings)); } catch { }
                if (typeof window.saveHiveBookedTicket === 'function') {
                    window.saveHiveBookedTicket(bookingRecord);
                }

                // Render immediately so Book Now disappears & booked count increments without waiting for network
                render();

                // 2. Persist booking to shared backend /api/events/:id/book (increments count in Admin & Firestore!)
                const candidates = state.apiBaseUrl !== null ? [state.apiBaseUrl] : getApiCandidates();
                for (const base of candidates) {
                    try {
                        const res = await fetch(base + '/api/events/' + encodeURIComponent(eventId) + '/book', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(bookingRecord)
                        });
                        if (res.ok) {
                            const data = await res.json();
                            if (typeof data.bookingsCount === 'number') {
                                syncEventBookingsCountLocal(eventId, data.bookingsCount);
                            }
                            break;
                        }
                    } catch { }
                }

                // 3. Also write to client Firestore if available & authenticated
                if (window.hiveDb && !isGuest) {
                    try {
                        await window.hiveDb.collection('event_bookings').doc(bookingRecord.id).set(bookingRecord, { merge: true });
                    } catch (err) {
                        console.warn('Firestore event_bookings write note:', err);
                    }
                }

                // 4. Redirect to external booking URL if configured, otherwise confirm in-app
                if (bookingUrl) {
                    window.open(bookingUrl, '_blank', 'noopener,noreferrer');
                    if (typeof toast === 'function') toast('Booking recorded! Opening external booking site…');
                } else {
                    if (typeof toast === 'function') toast('Booking confirmed for "' + bookingRecord.eventTitle + '"!');
                }
                render();
            }

            async function handleCancelBooking(evt) {
                const eventId = String(evt._docId || evt.id || '');
                if (!eventId) return;
                const booking = getUserBookingForEvent(eventId);
                const user = getCurrentUserInfo();
                const isGuest = !user.userId || user.userId === 'guest-athlete';
                const bookingId = (booking && booking.id) || (!isGuest ? eventId + '_' + user.userId.replace(/[^a-zA-Z0-9_-]/g, '') : '');

                // 1. Optimistically remove booking & restore Book Now immediately
                delete state.sessionBooked[eventId];
                state.agreedTerms[eventId] = false;

                const nextBookings = state.bookings.filter(b => {
                    if (String(b.eventId) !== eventId) return true;
                    if (bookingId && String(b.id) === String(bookingId)) return false;
                    if (!isGuest && String(b.userId) === String(user.userId)) return false;
                    return true;
                });
                state.bookings = nextBookings;
                try { localStorage.setItem(SHARED_BOOKINGS_KEY, JSON.stringify(nextBookings)); } catch { }
                if (typeof window.removeHiveBookedTicket === 'function') {
                    window.removeHiveBookedTicket(bookingId, eventId);
                }

                const prevBase = Number(evt.bookingsCount ?? evt.bookings ?? evt.participants ?? 0) || 0;
                const optimisticCount = Math.max(0, Math.min(prevBase - 1, getBookingsForEvent(eventId).length));
                syncEventBookingsCountLocal(eventId, optimisticCount);
                render();

                // 2. Delete booking on shared backend /api/events/:id/book
                const candidates = state.apiBaseUrl !== null ? [state.apiBaseUrl] : getApiCandidates();
                for (const base of candidates) {
                    try {
                        const res = await fetch(base + '/api/events/' + encodeURIComponent(eventId) + '/book', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                bookingId,
                                userId: user.userId,
                                userName: user.userName,
                                userEmail: user.userEmail,
                                eventTitle: evt.title || evt.name || 'Hivecity Event',
                                feeAmount: evt.feeAmount ?? evt.fee ?? evt.price ?? 0
                            })
                        });
                        if (res.ok) {
                            const data = await res.json();
                            if (typeof data.bookingsCount === 'number') {
                                syncEventBookingsCountLocal(eventId, data.bookingsCount);
                            }
                            break;
                        }
                    } catch { }
                }

                // 3. Also delete from client Firestore if authenticated
                if (window.hiveDb && !isGuest && bookingId) {
                    try {
                        await window.hiveDb.collection('event_bookings').doc(bookingId).delete();
                    } catch { }
                }

                if (typeof toast === 'function') toast('Booking cancelled for "' + (evt.title || evt.name || 'Event') + '".');
                render();
            }

            function renderEventCard(e) {
                const eventId = String(e._docId || e.id || '');
                const status = resolveStatus(e);
                const title = e.title || e.name || 'Community Event';
                const desc = e.description || '';
                const loc = e.location || '';
                const dateLabel = formatEventDateDisplay(e);
                const feeLabel = formatFee(e.feeAmount ?? e.fee ?? e.price ?? 0);
                const termsText = (e.termsAndConditions || '').trim() || 'Standard Hivecity event participation guidelines apply. Participants must arrive 15 minutes before start time and follow safety marshal instructions.';
                const bookingUrl = normalizeBookingUrl(e.bookingUrl);
                const baseParticipants = Number(e.bookingsCount ?? e.bookings ?? e.participants ?? 0) || 0;
                const localBookedCount = getBookingsForEvent(eventId).length;
                const totalBooked = Math.max(baseParticipants, localBookedCount);
                const userBooking = getUserBookingForEvent(eventId);
                const isTcOpen = Boolean(state.expandedTc[eventId]);
                const isAgreed = Boolean(state.agreedTerms[eventId]);

                const statusClass = status === 'completed' ? 'done' : status === 'ongoing' ? 'live' : 'up';
                const statusLabel = status === 'completed' ? '🏆 Completed' : status === 'ongoing' ? '◉ Ongoing' : '● Upcoming';
                const coverImg = String(e.imageUrl || e.coverImage || e.image || '').trim();
                const fallbackCover = (typeof IM !== 'undefined' && IM[93]) ? IM[93] : '';
                const displayCover = coverImg || fallbackCover;

                return `
                <article class="hec-event-card" data-event-id="${escHtml(eventId)}">
                    ${displayCover ? `<div style="border-radius:12px;overflow:hidden;max-height:210px;background:#f3f6f4"><img src="${escHtml(displayCover)}" alt="${escHtml(title)}" style="width:100%;height:190px;object-fit:cover;display:block" loading="lazy" onerror="this.onerror=null;if(typeof IM!=='undefined'&&IM[93]&&this.src!==IM[93]){this.src=IM[93];}else{this.parentNode.style.display='none';}"></div>` : ''}
                    <div class="hec-event-head">
                        <div>
                            <h3 class="hec-event-title">${escHtml(title)}</h3>
                            <div class="hec-event-meta" style="margin-top:5px">
                                <span>📅 ${escHtml(dateLabel)}</span>
                                ${loc ? `<span>📍 ${escHtml(loc)}</span>` : ''}
                                ${e.type || e.category ? `<span>🏷️ ${escHtml(e.type || e.category)}</span>` : ''}
                                <span>👥 ${totalBooked} booked</span>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                            <span class="hec-fee-badge">Entry Fee: ${escHtml(feeLabel)}</span>
                            <span class="hec-status-pill ${statusClass}" style="padding:4px 11px;font-size:11px;cursor:default">${statusLabel}</span>
                        </div>
                    </div>
                    ${desc ? `<p style="margin:0;font-size:13px;color:#56645a;line-height:1.5">${escHtml(desc)}</p>` : ''}

                    ${status === 'upcoming' ? `
                        <div style="display:grid;gap:10px;padding-top:8px;border-top:1px solid #eef3ef">
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
                                <button type="button" class="hec-tc-toggle" data-hec-tc-toggle="${escHtml(eventId)}">
                                    ${isTcOpen ? '▾ Hide Terms & Conditions' : '▸ Read Terms & Conditions'}
                                </button>
                                <span style="font-size:12px;color:#56645a">Fee: <strong style="color:#17251c">${escHtml(feeLabel)}</strong></span>
                            </div>
                            ${isTcOpen ? `<div class="hec-tc-box"><strong style="display:block;margin-bottom:4px;color:#17251c">Terms &amp; Conditions</strong>${escHtml(termsText)}</div>` : ''}
                            ${userBooking ? `
                                <div class="hec-booked-banner">
                                    <span>✓ Booking Confirmed ${bookingUrl ? '· Redirect Ready' : '· Registration Recorded'} (${escHtml(feeLabel)})</span>
                                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                                        ${bookingUrl ? `<a href="${escHtml(bookingUrl)}" target="_blank" rel="noopener noreferrer" style="color:#159447;text-decoration:underline;font-weight:800">Open Booking Site ↗</a>` : ''}
                                        <button type="button" data-hec-cancel-book="${escHtml(eventId)}" style="border:1px solid #b7e4c7;background:#ffffff;color:#14532d;border-radius:999px;padding:4px 11px;font-size:11px;font-weight:700;cursor:pointer">Cancel Booking</button>
                                    </div>
                                </div>
                            ` : `
                                <label class="hec-tc-agree">
                                    <input type="checkbox" data-hec-tc-agree="${escHtml(eventId)}" ${isAgreed ? 'checked' : ''} />
                                    <span>I have read and agree to the Terms &amp; Conditions</span>
                                </label>
                                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
                                    <small style="color:#6a786e;font-size:11px">${bookingUrl ? 'Redirects securely to official booking partner.' : 'Instant in-app booking confirmation.'}</small>
                                    <button type="button" class="hec-book-btn" data-hec-book="${escHtml(eventId)}" ${isAgreed ? '' : 'disabled'}>
                                        ${bookingUrl ? 'Book Now ↗' : 'Book Now'}
                                    </button>
                                </div>
                            `}
                        </div>
                    ` : status === 'ongoing' ? `
                        <div style="padding-top:8px;border-top:1px solid #eef3ef;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:12px;color:#2672c9;font-weight:700">
                            <span>◉ Happening now · Entry Fee: ${escHtml(feeLabel)}</span>
                            ${userBooking ? '<span style="color:#159447">✓ You are booked</span>' : ''}
                        </div>
                    ` : `
                        <div style="padding-top:8px;border-top:1px solid #eef3ef;font-size:12px;color:#c28b0d;font-weight:700">
                            🏆 Event Completed · ${totalBooked} participant${totalBooked === 1 ? '' : 's'}
                        </div>
                    `}
                </article>`;
            }

            function render() {
                const root = document.querySelector('#app .ev-page'); if (!root) return;
                let area = document.getElementById('hive-event-calendar');
                if (!area) {
                    area = document.createElement('section');
                    area.id = 'hive-event-calendar';
                    area.className = 'hive-event-calendar';
                    (root.querySelector('.ev-wrap') || root).appendChild(area);
                }

                mergeAllEvents();
                const y = state.month.getFullYear(), m = state.month.getMonth(), offset = new Date(y, m, 1).getDay(), count = new Date(y, m + 1, 0).getDate(), cells = [];
                for (let i = 0; i < offset; i++) cells.push('<button class="hec-day" disabled aria-hidden="true"></button>');
                for (let n = 1; n <= count; n++) {
                    const d = new Date(y, m, n), key = dayKey(d), has = dayEvents(key).length > 0, today = new Date().toDateString() === d.toDateString();
                    cells.push(`<button type="button" class="hec-day${today ? ' today' : ''}${state.selected === key ? ' selected' : ''}" data-hec-date="${key}" aria-label="${key}${has ? ', events scheduled' : ''}"><span class="n">${n}</span>${has ? '<i class="dot"></i>' : ''}</button>`);
                }

                const upcomingList = state.events.filter(isUpcoming);
                const ongoingList = state.events.filter(isLive);
                const completedList = state.events.filter(isDone);
                const upcoming = upcomingList.length, ongoing = ongoingList.length, completed = completedList.length;

                const participants = state.events.reduce((sum, e) => {
                    const eventId = String(e._docId || e.id || '');
                    const v = e.bookingsCount ?? e.participants ?? e.participantCount ?? e.registeredCount ?? e.registrationCount ?? e.attendees ?? e.registrations ?? e.bookings;
                    const base = Array.isArray(v) ? v.length : (Number(v) || 0);
                    return sum + Math.max(base, getBookingsForEvent(eventId).length);
                }, 0);

                let visibleEvents = state.activeTab === 'ongoing' ? ongoingList : state.activeTab === 'completed' ? completedList : upcomingList;
                if (state.selected) {
                    visibleEvents = state.events.filter(e => { const d = eventDate(e); return d && dayKey(d) === state.selected; });
                }

                const mainContent = visibleEvents.length > 0
                    ? `<div class="hec-event-list">
                        ${state.selected ? `<div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#56645a;padding:0 2px"><span>Showing events scheduled on <strong>${escHtml(state.selected)}</strong></span><button type="button" class="hec-tc-toggle" data-hec-clear-date="1">Show all ${escHtml(state.activeTab)}</button></div>` : ''}
                        ${visibleEvents.map(renderEventCard).join('')}
                       </div>`
                    : `<div>
                        <div class="hec-empty-icon">▦</div>
                        <h2>${state.selected ? 'No events on ' + escHtml(state.selected) : 'No ' + escHtml(state.activeTab) + ' events available'}</h2>
                        <p>${state.selected ? 'Select another date or view all published events.' : 'Events published by the Hivecity admin will appear here automatically.'}</p>
                        ${state.selected ? '<button type="button" class="hec-tc-toggle" data-hec-clear-date="1" style="margin-top:10px">Show all events</button>' : ''}
                        ${state.error ? '<div class="hec-error">Could not connect to the events collection. Please check Firestore access.</div>' : !state.loaded ? '<div class="hec-loading">Checking for published events…</div>' : ''}
                       </div>`;

                area.innerHTML = `<section class="hec-center"><div class="hec-overview"><div class="hec-overview-card"><b>${state.events.length}</b><span><em>▦</em>Total Events</span></div><div class="hec-overview-card"><b>${participants.toLocaleString()}</b><span><em>♙</em>Participate</span></div><div class="hec-overview-card"><b>${completed}</b><span><em>🏆</em>Completed</span></div></div><div class="hec-status-row" aria-label="Event status"><button type="button" class="hec-status-pill up${!state.selected && state.activeTab === 'upcoming' ? ' active' : ''}" data-hec-tab="upcoming">● Upcoming <strong>${upcoming}</strong></button><button type="button" class="hec-status-pill live${!state.selected && state.activeTab === 'ongoing' ? ' active' : ''}" data-hec-tab="ongoing">◉ Ongoing <strong>${ongoing}</strong></button><button type="button" class="hec-status-pill done${!state.selected && state.activeTab === 'completed' ? ' active' : ''}" data-hec-tab="completed">🏆 Completed <strong>${completed}</strong></button></div><div class="hec-main" style="${visibleEvents.length > 0 ? 'align-items:stretch;justify-content:flex-start;text-align:left;padding:18px' : ''}">${mainContent}</div></section><aside class="hec-side"><section class="hec-panel"><div class="hec-head"><div class="hec-month">${state.month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div><div class="hec-nav"><button type="button" data-hec-move="-1" aria-label="Previous month">‹</button><button type="button" data-hec-move="1" aria-label="Next month">›</button></div></div><div class="hec-week">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(x => `<span>${x}</span>`).join('')}</div><div class="hec-days">${cells.join('')}</div><div class="hec-legend"><span><i></i> Event scheduled</span><span>Today outlined</span></div></section><section class="hec-panel"><h2 class="hec-stats-title"><span style="color:#159447">▥</span> Event Status</h2><div class="hec-stat-grid"><div class="hec-stat up" data-hec-tab="upcoming"><b>${upcoming}</b><span>Upcoming</span></div><div class="hec-stat live" data-hec-tab="ongoing"><b>${ongoing}</b><span>Ongoing</span></div><div class="hec-stat done" data-hec-tab="completed"><b>${completed}</b><span>Completed</span></div></div></section></aside>`;

                area.querySelectorAll('[data-hec-move]').forEach(b => b.addEventListener('click', () => { state.month = new Date(y, m + Number(b.dataset.hecMove), 1); render(); }));
                area.querySelectorAll('[data-hec-date]').forEach(b => b.addEventListener('click', () => { state.selected = state.selected === b.dataset.hecDate ? null : b.dataset.hecDate; render(); }));
                area.querySelectorAll('[data-hec-clear-date]').forEach(b => b.addEventListener('click', () => { state.selected = null; render(); }));
                area.querySelectorAll('[data-hec-tab]').forEach(b => b.addEventListener('click', () => { state.activeTab = b.dataset.hecTab; state.selected = null; render(); }));
                area.querySelectorAll('[data-hec-tc-toggle]').forEach(b => b.addEventListener('click', () => {
                    const id = b.dataset.hecTcToggle;
                    state.expandedTc[id] = !state.expandedTc[id];
                    render();
                }));
                area.querySelectorAll('[data-hec-tc-agree]').forEach(cb => cb.addEventListener('change', () => {
                    const id = cb.dataset.hecTcAgree;
                    state.agreedTerms[id] = cb.checked;
                    render();
                }));
                area.querySelectorAll('[data-hec-book]').forEach(btn => btn.addEventListener('click', () => {
                    const id = btn.dataset.hecBook;
                    const evt = state.events.find(x => String(x._docId || x.id) === String(id));
                    if (evt) void handleBookEvent(evt);
                }));
                area.querySelectorAll('[data-hec-cancel-book]').forEach(btn => btn.addEventListener('click', () => {
                    const id = btn.dataset.hecCancelBook;
                    const evt = state.events.find(x => String(x._docId || x.id) === String(id));
                    if (evt) void handleCancelBooking(evt);
                }));
            }

            function subscribe() {
                state.bookings = readLocalBookings();
                mergeAllEvents();
                void fetchEventsFromApi();
                if (!state.lifecycleTimer) {
                    state.lifecycleTimer = setInterval(() => {
                        if (location.hash.slice(1).split('?')[0].split('/')[0] === 'events') {
                            void fetchEventsFromApi();
                        }
                        render();
                    }, 10000);
                }
                if (!window._hiveEventsStorageSyncBound) {
                    window._hiveEventsStorageSyncBound = true;
                    const refreshNow = () => {
                        state.bookings = readLocalBookings();
                        mergeAllEvents();
                        void fetchEventsFromApi();
                        render();
                    };
                    window.addEventListener('storage', ev => {
                        if (ev && (ev.key === SHARED_EVENTS_KEY || ev.key === SHARED_BOOKINGS_KEY)) {
                            refreshNow();
                        }
                    });
                    window.addEventListener(EVENTS_UPDATED_EVENT, refreshNow);
                    window.addEventListener('focus', refreshNow);
                    document.addEventListener('visibilitychange', () => {
                        if (document.visibilityState === 'visible') refreshNow();
                    });
                }
                if (state.unsubscribe || !window.hiveDb) {
                    if (!window.hiveDb) state.loaded = true;
                    return;
                }
                try {
                    state.unsubscribe = window.hiveDb.collection('events').onSnapshot(s => {
                        state.remoteEvents = s.docs.map(d => ({ _docId: d.id, id: d.id, ...d.data() }));
                        mergeAllEvents();
                        state.loaded = true;
                        state.error = false;
                        render();
                    }, e => {
                        console.error('Hive events subscription failed:', e);
                        state.loaded = true;
                        state.error = true;
                        render();
                    });
                } catch (e) {
                    console.error(e);
                    state.loaded = true;
                    state.error = true;
                    render();
                }

                if (!state.unsubscribeBookings) {
                    try {
                        state.unsubscribeBookings = window.hiveDb.collection('event_bookings').onSnapshot(s => {
                            const remote = s.docs.map(d => ({ id: d.id, ...d.data() }));
                            state.bookings = remote;
                            try { localStorage.setItem(SHARED_BOOKINGS_KEY, JSON.stringify(remote)); } catch { }
                            render();
                        }, () => { });
                    } catch { }
                }
            }

            function syncMode() {
                const isEvents = location.hash.slice(1).split('?')[0].split('/')[0] === 'events';
                document.body.classList.toggle('hive-events-route', isEvents);
                if (isEvents) {
                    subscribe();
                    requestAnimationFrame(render);
                }
            }

            function install() {
                if (typeof V === 'undefined' || !V) return false;
                V.events = () => `<main class="ev-page" id="events"><div class="ev-wrap"><header class="ev-page-head"><div><h1>Events</h1><p>Discover, join and relive Hivecity events</p></div></header><div id="hive-event-calendar" class="hive-event-calendar"></div></div></main>`;
                if (!window.__hiveEventsGoWrapped) {
                    const oldGo = go;
                    go = function () { const r = oldGo.apply(this, arguments); syncMode(); return r; };
                    window.__hiveEventsGoWrapped = true;
                    window.addEventListener('hashchange', syncMode);
                }
                syncMode();
                return true;
            }
            if (!install()) { let n = 0; const t = setInterval(() => { if (install() || ++n > 100) clearInterval(t); }, 100); }
        })();
    