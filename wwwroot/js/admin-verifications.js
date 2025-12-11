// wwwroot/js/admin-verifications.js
// Real-time listeners for verifications; server endpoints used for approve/reject actions.

document.addEventListener('DOMContentLoaded', () => {
    const pendingList = document.getElementById('pendingList');
    const approvedList = document.getElementById('approvedList');
    const rejectedList = document.getElementById('rejectedList');
    const pendingCountEl = document.getElementById('pendingCount');
    const approvedCountEl = document.getElementById('approvedCount');
    const rejectedCountEl = document.getElementById('rejectedCount');

    if (!pendingList && !approvedList && !rejectedList) {
        console.warn('admin-verifications: DOM elements not found');
        return;
    }

    const PAGE_SIZE = 100;

    // helper: get id token from firebase auth
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

    function renderCardFromData(ds) {
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
              </div>
              <div class="text-end">
                ${data.idDocumentUrl ? `<button data-url="${escapeHtml(data.idDocumentUrl)}" class="btn btn-sm btn-outline-secondary me-1 btn-open">ID</button>` : ''}
                ${data.proofUrl ? `<button data-url="${escapeHtml(data.proofUrl)}" class="btn btn-sm btn-outline-secondary btn-open">Proof</button>` : ''}
              </div>
            </div>
            <div class="mt-2">${data.status === 'pending' ? `<button data-id="${id}" class="btn btn-sm btn-success btn-approve me-2">Approve</button> <button data-id="${id}" class="btn btn-sm btn-danger btn-reject">Reject</button>` : ''}</div>
        `;
        // Attach handlers for open/approve/reject after insertion
        return el;
    }

    async function openSecureFile(url) {
        if (!url) return;
        try {
            const token = await getIdToken();
            if (!token) { alert('Not authenticated'); return; }
            const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
            if (!res.ok) {
                const t = await res.text().catch(() => res.statusText);
                throw new Error(t || `Status ${res.status}`);
            }
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

    // Approve/reject via server endpoints (keeps actions secure)
    async function approveVerification(id) {
        try {
            await callAdminEndpoint(`/api/admin/verification/approve/${encodeURIComponent(id)}`, 'POST');
        } catch (err) {
            console.error('approve error', err);
            alert('Error approving verification. See console.');
        }
    }

    async function rejectVerification(id) {
        const reason = prompt('Rejection reason (optional):');
        if (!confirm('Reject this verification?')) return;
        try {
            await callAdminEndpoint(`/api/admin/verification/reject/${encodeURIComponent(id)}`, 'POST', { reason: reason || '' });
        } catch (err) {
            console.error('reject error', err);
            alert('Error rejecting verification. See console.');
        }
    }

    // Setup real-time listeners
    (async () => {
        // Wait for firebaseHelpers
        const start = Date.now();
        while (!window.firebaseHelpers && Date.now() - start < 3000) { await new Promise(r => setTimeout(r, 50)); }

        try {
            const mod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');
            const db = window.firebaseHelpers.db;
            const { collection, query, where, orderBy, limit, onSnapshot } = mod;

            // For each status subscribe to real-time updates
            const subscribe = (status, listEl, countEl) => {
                const q = query(collection(db, 'verifications'), where('status', '==', status), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
                onSnapshot(q, snap => {
                    // clear and render full list
                    listEl.innerHTML = '';
                    snap.forEach(ds => {
                        const card = renderCardFromData(ds);
                        listEl.appendChild(card);
                    });
                    // update counts
                    if (countEl) countEl.textContent = String(snap.size);

                    // attach handlers for buttons inside list
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
                }, err => {
                    console.error('Realtime subscription error for', status, err);
                });
            };

            const onOpenClick = (e) => openSecureFile(e.currentTarget.dataset.url);
            const onApproveClick = (e) => approveVerification(e.currentTarget.dataset.id);
            const onRejectClick = (e) => rejectVerification(e.currentTarget.dataset.id);

            subscribe('pending', pendingList, pendingCountEl);
            subscribe('approved', approvedList, approvedCountEl);
            subscribe('rejected', rejectedList, rejectedCountEl);
        } catch (err) {
            console.error('Failed to initialize realtime verifications', err);
        }
    })();
});
