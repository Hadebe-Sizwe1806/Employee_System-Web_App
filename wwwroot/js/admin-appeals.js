// wwwroot/js/admin-appeals.js
// Real-time listeners for appeals; server endpoints used for approve/reject actions.

document.addEventListener('DOMContentLoaded', () => {
    const pendingList = document.getElementById('pendingAppealList');
    const approvedList = document.getElementById('approvedAppealList');
    const rejectedList = document.getElementById('rejectedAppealList');
    const pendingCountEl = document.getElementById('pendingAppealCount');
    const approvedCountEl = document.getElementById('approvedAppealCount');
    const rejectedCountEl = document.getElementById('rejectedAppealCount');

    if (!pendingList && !approvedList && !rejectedList) {
        console.warn('admin-appeals: DOM elements not found');
        return;
    }

    const PAGE_SIZE = 100;

    async function getIdToken() {
        try {
            if (!window.firebaseHelpers || !window.firebaseHelpers.auth) return null;
            const auth = window.firebaseHelpers.auth;
            let user = auth.currentUser;
            if (!user) {
                user = await new Promise(resolve => {
                    const unsub = window.firebaseHelpers.onAuthStateChanged(auth, u => {
                        try { unsub(); } catch {}
                        resolve(u);
                    });
                    setTimeout(() => { try { unsub(); } catch {} resolve(auth.currentUser || null); }, 1500);
                });
            }
            return user ? await user.getIdToken() : null;
        } catch (err) {
            console.warn('getIdToken error', err);
            return null;
        }
    }

    async function callAdminEndpoint(path, method = 'POST', body = null) {
        const token = await getIdToken();
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(path, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: body ? JSON.stringify(body) : undefined
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Server responded ${res.status}: ${text}`);
        }
        return res.json().catch(() => ({}));
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderAppealCardFromData(ds) {
        const data = ds.data();
        const created = data.createdAt || '';
        const status = data.status || '';
        const id = ds.id;
        const el = document.createElement('div');
        el.className = 'card mb-2 p-2';
        el.innerHTML = `
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="fw-bold">${escapeHtml(data.employeeEmail || '')}</div>
                <div class="text-muted small">${escapeHtml(created)} • ${escapeHtml(status)}</div>
                ${data.comment ? `<div class="small text-muted mt-1">Note: ${escapeHtml(data.comment)}</div>` : ''}
                ${data.verificationId ? `<div class="small text-muted mt-1">Verification: ${escapeHtml(data.verificationId)}</div>` : ''}
              </div>
              <div class="text-end">
                ${data.idDocumentUrl ? `<button data-url="${escapeHtml(data.idDocumentUrl)}" class="btn btn-sm btn-outline-secondary me-1 btn-open">ID</button>` : ''}
                ${data.proofUrl ? `<button data-url="${escapeHtml(data.proofUrl)}" class="btn btn-sm btn-outline-secondary btn-open">Proof</button>` : ''}
              </div>
            </div>
            <div class="mt-2">${data.status === 'pending' ? `<button data-id="${id}" class="btn btn-sm btn-success btn-approve me-2">Approve</button> <button data-id="${id}" class="btn btn-sm btn-danger btn-reject">Reject</button>` : ''}</div>
        `;
        return el;
    }

    async function openSecureFile(url) {
        if (!url) return;
        try {
            const token = await getIdToken();
            if (!token) { alert('Not authenticated'); return; }
            const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const win = window.open();
            if (!win) { window.location.href = objectUrl; return; }
            if (blob.type === 'application/pdf' || url.toLowerCase().endsWith('.pdf')) { win.location.href = objectUrl; return; }
            if (blob.type.startsWith('image/')) { win.document.write(`<img src="${objectUrl}" style="max-width:100%">`); return; }
            win.document.write(`<a href="${objectUrl}" download>Download</a>`);
        } catch (err) {
            console.error('openSecureFile error', err);
            alert('Unable to open file: ' + (err && err.message ? err.message : err));
        }
    }

    async function approveAppeal(id) {
        try {
            await callAdminEndpoint(`/api/admin/appeal/approve/${encodeURIComponent(id)}`, 'POST');
        } catch (err) {
            console.error('approve appeal error', err);
            alert('Error approving appeal. See console.');
        }
    }

    async function rejectAppeal(id) {
        const reason = prompt('Reason for rejection (optional):');
        if (!confirm('Reject this appeal?')) return;
        try {
            await callAdminEndpoint(`/api/admin/appeal/reject/${encodeURIComponent(id)}`, 'POST', { reason: reason || '' });
        } catch (err) {
            console.error('reject appeal error', err);
            alert('Error rejecting appeal. See console.');
        }
    }

    // Setup real-time listeners
    (async () => {
        const start = Date.now();
        while (!window.firebaseHelpers && Date.now() - start < 3000) { await new Promise(r => setTimeout(r, 50)); }

        try {
            const mod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');
            const db = window.firebaseHelpers.db;
            const { collection, query, where, orderBy, limit, onSnapshot } = mod;

            const subscribe = (status, listEl, countEl) => {
                const q = query(collection(db, 'appeals'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
                onSnapshot(q, snap => {
                    listEl.innerHTML = '';
                    snap.forEach(ds => {
                        const card = renderAppealCardFromData(ds);
                        listEl.appendChild(card);
                    });
                    if (countEl) countEl.textContent = String(snap.size);

                    listEl.querySelectorAll('.btn-open').forEach(btn => {
                        btn.removeEventListener('click', onOpenClick);
                        btn.addEventListener('click', onOpenClick);
                    });
                    listEl.querySelectorAll('.btn-approve').forEach(btn => {
                        btn.removeEventListener('click', onApproveClick);
                        btn.addEventListener('click', onApproveClick);
                    });
                    listEl.querySelectorAll('.btn-reject').forEach(btn => {
                        btn.removeEventListener('click', onRejectClick);
                        btn.addEventListener('click', onRejectClick);
                    });
                }, err => { console.error('Realtime appeals error', err); });
            };

            const onOpenClick = (e) => openSecureFile(e.currentTarget.dataset.url);
            const onApproveClick = (e) => approveAppeal(e.currentTarget.dataset.id);
            const onRejectClick = (e) => rejectAppeal(e.currentTarget.dataset.id);

            subscribe('pending', pendingList, pendingCountEl);
            subscribe('approved', approvedList, approvedCountEl);
            subscribe('rejected', rejectedList, rejectedCountEl);
        } catch (err) {
            console.error('Failed to initialize realtime appeals', err);
        }
    })();
});// wwwroot/js/admin-appeals.js
// Mirror of admin-verifications.js but operates on appeals collection

document.addEventListener('DOMContentLoaded', () => {
    const pendingList = document.getElementById('pendingAppealList');
    const approvedList = document.getElementById('approvedAppealList');
    const rejectedList = document.getElementById('rejectedAppealList');
    const container = document.getElementById('appealsContainer') || document.body;
    const loader = document.getElementById('appealsLoader');
    const pendingCountEl = document.getElementById('pendingAppealCount');
    const approvedCountEl = document.getElementById('approvedAppealCount');
    const rejectedCountEl = document.getElementById('rejectedAppealCount');
    const refreshBtn = document.getElementById('refreshAppealsBtn');

    if (!pendingList && !approvedList && !rejectedList) {
        console.warn('admin-appeals: DOM elements not found');
        return;
    }

    const PAGE_SIZE = 8;
    const state = {
        lastId: { pending: null, approved: null, rejected: null },
        hasMore: { pending: true, approved: true, rejected: true },
        loading: { pending: false, approved: false, rejected: false },
        counts: { pending: 0, approved: 0, rejected: 0 }
    };

    function showLoader(show) { if (loader) loader.style.display = show ? '' : 'none'; }
    function setCounts() {
        if (pendingCountEl) pendingCountEl.textContent = state.counts.pending.toString();
        if (approvedCountEl) approvedCountEl.textContent = state.counts.approved.toString();
        if (rejectedCountEl) rejectedCountEl.textContent = state.counts.rejected.toString();
    }
    function clearList(listEl) { if (!listEl) return; listEl.innerHTML = ''; }
    function showEmpty(listEl, message) {
        if (!listEl) return;
        const placeholder = document.createElement('div');
        placeholder.className = 'no-items text-muted small p-2 text-center';
        placeholder.textContent = message;
        listEl.appendChild(placeholder);
    }

    async function getIdToken() {
        try {
            if (!window.firebaseHelpers || !window.firebaseHelpers.auth) return null;
            const auth = window.firebaseHelpers.auth;
            if (!auth.currentUser) {
                await new Promise(r => {
                    const unsub = window.firebaseHelpers.onAuthStateChanged(auth, (u) => {
                        if (u) { try { unsub(); } catch {} r(); }
                    });
                    setTimeout(() => { try { unsub(); } catch {} r(); }, 1200);
                });
            }
            return auth.currentUser ? await auth.currentUser.getIdToken() : null;
        } catch (e) { console.warn('getIdToken error', e); return null; }
    }

    async function callAdminEndpoint(path, method = 'GET', body = null) {
        const token = await getIdToken();
        if (!token) throw new Error('Not authenticated');
        const res = await fetch(path + (method === 'GET' && body ? '?' + new URLSearchParams(body).toString() : ''), {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: method === 'GET' ? undefined : (body ? JSON.stringify(body) : undefined)
        });
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`Server ${res.status}: ${txt}`);
        }
        return res.json().catch(() => ({}));
    }

    function escapeHtml(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    function renderCard(item) {
        const data = item.data || {};
        const el = document.createElement('div');
        el.className = 'card mb-2 p-2';
        const created = data.createdAt || '';
        const status = data.status || '';
        el.innerHTML = `
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <div class="fw-bold">${escapeHtml(data.employeeEmail || '')}</div>
                <div class="text-muted small">${escapeHtml(created)} • ${escapeHtml(status)}</div>
                ${data.comment ? `<div class="small text-muted mt-1">Note: ${escapeHtml(data.comment)}</div>` : ''}
                ${data.verificationId ? `<div class="small text-muted mt-1">Verification: ${escapeHtml(data.verificationId)}</div>` : ''}
              </div>
              <div class="text-end">
                ${data.idDocumentUrl ? `<button data-url="${escapeHtml(data.idDocumentUrl)}" class="btn btn-sm btn-outline-secondary me-1 btn-open">ID</button>` : ''}
                ${data.proofUrl ? `<button data-url="${escapeHtml(data.proofUrl)}" class="btn btn-sm btn-outline-secondary btn-open">Proof</button>` : ''}
              </div>
            </div>
            <div class="mt-2">${status === 'pending' ? `<button data-id="${item.id}" class="btn btn-sm btn-success btn-approve me-2">Approve</button> <button data-id="${item.id}" class="btn btn-sm btn-danger btn-reject">Reject</button>` : ''}</div>
        `;
        return el;
    }

    async function openSecureFile(url) {
        if (!url) return;
        try {
            const token = await getIdToken();
            if (!token) { alert('Not authenticated'); return; }
            const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const win = window.open();
            if (!win) { window.location.href = objectUrl; return; }
            if (blob.type === 'application/pdf' || url.toLowerCase().endsWith('.pdf')) { win.location.href = objectUrl; return; }
            if (blob.type.startsWith('image/')) { win.document.write(`<img src="${objectUrl}" style="max-width:100%">`); return; }
            win.document.write(`<a href="${objectUrl}" download>Download</a>`);
        } catch (err) {
            console.error('openSecureFile error', err);
            alert('Unable to open file: ' + (err && err.message ? err.message : err));
        }
    }

    async function fetchStatusFromServer(status, append = false) {
        if (state.loading[status]) return;
        if (!append) {
            clearList(statusToList(status));
            state.lastId[status] = null;
            state.hasMore[status] = true;
            state.counts[status] = 0;
        }
        if (!state.hasMore[status]) return;
        state.loading[status] = true;
        showLoader(true);

        try {
            const params = { status, pageSize: PAGE_SIZE };
            if (append && state.lastId[status]) params.startAfterId = state.lastId[status];
            const query = new URLSearchParams(params).toString();
            const res = await callAdminEndpoint(`/api/admin/appeal/list?${query}`, 'GET');
            const items = res.items || [];
            const lastId = res.lastId || null;
            const hasMore = !!res.hasMore;

            if (!append && items.length === 0) showEmpty(statusToList(status), `No ${status} appeals.`);
            else items.forEach(item => statusToList(status).appendChild(renderCard(item)));

            state.lastId[status] = lastId;
            state.hasMore[status] = hasMore;
            state.counts[status] = (state.counts[status] || 0) + items.length;
            setCounts();

            // attach handlers
            statusToList(status).querySelectorAll('.btn-approve').forEach(btn => {
                btn.removeEventListener('click', onApproveClick);
                btn.addEventListener('click', onApproveClick);
            });
            statusToList(status).querySelectorAll('.btn-reject').forEach(btn => {
                btn.removeEventListener('click', onRejectClick);
                btn.addEventListener('click', onRejectClick);
            });
            statusToList(status).querySelectorAll('.btn-open').forEach(btn => {
                btn.removeEventListener('click', onOpenClick);
                btn.addEventListener('click', onOpenClick);
            });
        } catch (err) {
            console.error('fetchStatusFromServer error', err);
            if (!append) showEmpty(statusToList(status), `Error loading ${status} items.`);
        } finally {
            state.loading[status] = false;
            showLoader(false);
        }
    }

    function onOpenClick(e) {
        openSecureFile(e.currentTarget.dataset.url);
    }

    function statusToList(status) {
        return status === 'pending' ? pendingList : status === 'approved' ? approvedList : rejectedList;
    }

    async function onApproveClick(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        if (!confirm('Approve this appeal?')) return;
        try {
            await callAdminEndpoint(`/api/admin/appeal/approve/${encodeURIComponent(id)}`, 'POST');
            await fetchStatusFromServer('pending', false);
            await fetchStatusFromServer('approved', false);
        } catch (err) {
            console.error('approve appeal error', err);
            alert('Error approving appeal. See console.');
        }
    }

    async function onRejectClick(e) {
        const id = e.currentTarget.dataset.id;
        if (!id) return;
        const reason = prompt('Reason for rejection (optional):');
        if (!confirm('Reject this appeal?')) return;
        try {
            await callAdminEndpoint(`/api/admin/appeal/reject/${encodeURIComponent(id)}`, 'POST', { reason: reason || '' });
            await fetchStatusFromServer('pending', false);
            await fetchStatusFromServer('rejected', false);
        } catch (err) {
            console.error('reject appeal error', err);
            alert('Error rejecting appeal. See console.');
        }
    }

    async function loadAppeals() {
        ['pending','approved','rejected'].forEach(s => { clearList(statusToList(s)); state.lastId[s]=null; state.hasMore[s]=true; state.counts[s]=0; });
        setCounts();
        showLoader(true);
        await Promise.all([fetchStatusFromServer('pending', false), fetchStatusFromServer('approved', false), fetchStatusFromServer('rejected', false)]).finally(()=>showLoader(false));
    }

    if (refreshBtn) refreshBtn.addEventListener('click', () => loadAppeals());

    document.addEventListener('shown.bs.tab', (e) => {
        try {
            const target = e.target.getAttribute('data-bs-target') || e.target.getAttribute('href');
            if (!target) return;
            if (document.querySelector(target).querySelector('#pendingAppealList')) {
                loadAppeals();
            }
        } catch {}
    });

    // initial load (defer until firebaseHelpers ready)
    (async () => {
        const start = Date.now();
        while (!window.firebaseHelpers && Date.now() - start < 3000) { await new Promise(r => setTimeout(r,50)); }
        setTimeout(() => {
            if (document.querySelector('#pendingAppealList')) loadAppeals();
        }, 200);
    })();
});