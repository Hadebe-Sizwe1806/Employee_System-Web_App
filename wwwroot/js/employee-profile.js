// wwwroot/js/employee-profile.js
document.addEventListener('DOMContentLoaded', () => {
    const auth = window.firebaseHelpers?.auth;
    const db = window.firebaseHelpers?.db;

    const pName = document.getElementById('pName');
    const pSurname = document.getElementById('pSurname');
    const pRole = document.getElementById('pRole');
    const pPhone = document.getElementById('pPhone');
    const pEmail = document.getElementById('pEmail');
    const pPhoto = document.getElementById('pPhoto');
    const submitBtn = document.getElementById('submitVerifBtn');
    const idFileEl = document.getElementById('idFile');
    const proofFileEl = document.getElementById('proofFile');
    const selfieFileEl = document.getElementById('selfieFile');
    const verifMsg = document.getElementById('verifMsg');

    const appealSection = document.getElementById('appealSection');
    const submitAppealBtn = document.getElementById('submitAppealBtn');
    const cancelAppealBtn = document.getElementById('cancelAppealBtn');
    const appealMessageEl = document.getElementById('appealMessage');
    const appealMsg = document.getElementById('appealMsg');

    const statusBadge = document.getElementById('verificationStatusBadge');
    const verificationDate = document.getElementById('verificationDate');
    const verificationComment = document.getElementById('verificationComment');

    // Helper: get id token for current user (returns null if not available)
    async function getIdToken() {
        try {
            if (!auth) return null;
            let user = auth.currentUser;
            if (!user) {
                user = await new Promise(resolve => {
                    const unsub = window.firebaseHelpers.onAuthStateChanged(auth, u => {
                        try { unsub(); } catch { }
                        resolve(u);
                    });
                    setTimeout(() => { try { unsub(); } catch { }; resolve(auth.currentUser || null); }, 1500);
                });
            }
            if (!user) return null;
            return await user.getIdToken();
        } catch (err) {
            console.warn('getIdToken error', err);
            return null;
        }
    }

    function renderStatus(status) {
        if (!statusBadge) return;
        const s = (status || 'pending').toLowerCase();
        statusBadge.className = 'badge ';
        switch (s) {
            case 'approved':
                statusBadge.classList.add('bg-success');
                statusBadge.textContent = 'Approved';
                break;
            case 'rejected':
                statusBadge.classList.add('bg-danger');
                statusBadge.textContent = 'Rejected';
                break;
            case 'pending':
            default:
                statusBadge.classList.add('bg-secondary');
                statusBadge.textContent = 'Pending';
                break;
        }
    }

    function updateVerificationUI(verification) {
        if (!verification) {
            renderStatus('none');
            verificationDate && (verificationDate.textContent = '');
            verificationComment && (verificationComment.style.display = 'none');
            appealSection && (appealSection.style.display = 'none');
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        const status = (verification.status || 'pending').toString().toLowerCase();
        renderStatus(status);

        if (verification.createdAt && verification.createdAt._seconds) {
            const d = new Date(verification.createdAt._seconds * 1000);
            verificationDate && (verificationDate.textContent = d.toLocaleString());
        } else if (verification.createdAt) {
            verificationDate && (verificationDate.textContent = verification.createdAt.toString());
        }

        if (verification.comment) {
            verificationComment.style.display = 'block';
            verificationComment.textContent = 'Admin note: ' + verification.comment;
        } else {
            verificationComment.style.display = 'none';
            verificationComment.textContent = '';
        }

        if (status === 'rejected') {
            appealSection && (appealSection.style.display = 'block');
            if (submitBtn) submitBtn.disabled = true;
        } else {
            appealSection && (appealSection.style.display = 'none');
        }

        if (status === 'pending') {
            if (submitBtn) submitBtn.disabled = true;
            if (verifMsg) verifMsg.textContent = 'You have a pending verification. Please wait for admin review.';
        } else {
            if (submitBtn) submitBtn.disabled = false;
            if (verifMsg) verifMsg.textContent = '';
        }
    }

    async function fetchAndRenderVerification() {
        try {
            const token = await getIdToken();
            if (!token) return;
            const res = await fetch('/api/employee/verification', {
                method: 'GET',
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) return;
            const payload = await res.json().catch(() => null);
            if (!payload) return;

            if (payload?.hasVerification && payload.verification) {
                const ver = payload.verification;

                if (ver.idDocumentUrl) {
                    const idPlaceholder = document.getElementById('idDocPlaceholder');
                    if (idPlaceholder) {
                        idPlaceholder.dataset.privateUrl = ver.idDocumentUrl;
                        idPlaceholder.innerHTML = '';
                    }
                }
                if (ver.proofUrl) {
                    const proofPlaceholder = document.getElementById('proofDocPlaceholder');
                    if (proofPlaceholder) {
                        proofPlaceholder.dataset.privateUrl = ver.proofUrl;
                        proofPlaceholder.innerHTML = '';
                    }
                }
                if (ver.selfieUrl) {
                    const selfiePlaceholder = document.getElementById('selfieDocPlaceholder');
                    if (selfiePlaceholder) {
                        selfiePlaceholder.dataset.privateUrl = ver.selfieUrl;
                        selfiePlaceholder.innerHTML = '';
                    }
                }

                updateVerificationUI(ver);
                if (window.loadPrivateMedia && typeof window.loadPrivateMedia === 'function') {
                    window.loadPrivateMedia();
                } else {
                    document.dispatchEvent(new CustomEvent('private-media-updated'));
                }
            } else {
                updateVerificationUI(null);
            }
        } catch (err) {
            console.warn('Could not load existing verification', err);
        }
    }

    (async () => {
        try {
            const mod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');
            var getDocs = mod.getDocs, query = mod.query, collection = mod.collection, where = mod.where;
        } catch (e) { }

        if (!auth) {
            console.warn('employee-profile: firebase auth not available');
            return;
        }

        window.firebaseHelpers.onAuthStateChanged(auth, async (user) => {
            if (!user) {
                pEmail && (pEmail.textContent = 'Not signed in');
                return;
            }

            pEmail && (pEmail.textContent = user.email);

            try {
                if (db && typeof getDocs !== 'undefined') {
                    const q = query(collection(db, 'employees'), where('email', '==', user.email));
                    const snap = await getDocs(q);
                    if (snap.empty) {
                        pName && (pName.textContent = '');
                        pSurname && (pSurname.textContent = '');
                        pRole && (pRole.textContent = '');
                        pPhone && (pPhone.textContent = '');
                        pPhoto && (pPhoto.src = '');
                    } else {
                        snap.forEach(docSnap => {
                            const d = docSnap.data();
                            pName && (pName.textContent = d.name || '');
                            pSurname && (pSurname.textContent = d.surname || '');
                            pRole && (pRole.textContent = d.role || '');
                            pPhone && (pPhone.textContent = d.phone || '');
                            pPhoto && (pPhoto.src = d.photoUrl || '');
                        });
                    }
                }
            } catch (err) {
                console.error('load profile error', err);
            }

            await fetchAndRenderVerification();
            setInterval(fetchAndRenderVerification, 15000);
        });
    })();

    // ===== Verification submission =====
    if (submitBtn) {
        submitBtn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            if (!idFileEl || !proofFileEl || !selfieFileEl || !verifMsg) {
                console.error('Required verif elements missing');
                return;
            }

            const idFile = idFileEl.files[0];
            const proofFile = proofFileEl.files[0];
            const selfieFile = selfieFileEl.files[0];
            if (!idFile || !proofFile || !selfieFile) {
                verifMsg.textContent = 'Please select ID, proof and selfie files.';
                return;
            }

            verifMsg.textContent = 'Uploading...';
            try {
                const token = await getIdToken();
                if (!token) {
                    verifMsg.textContent = 'Not signed in or token unavailable.';
                    return;
                }

                const form = new FormData();
                form.append('idFile', idFile);
                form.append('proofFile', proofFile);
                form.append('selfieFile', selfieFile);

                const res = await fetch('/api/employee/verification/submit', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: form
                });

                const text = await res.text().catch(() => '');
                let payload = null;
                try { payload = text ? JSON.parse(text) : null; } catch (e) { payload = null; }

                if (!res.ok) {
                    const serverMsg = payload?.error || text || `HTTP ${res.status}`;
                    verifMsg.textContent = `Upload failed: ${serverMsg}`;
                    await fetchAndRenderVerification();
                    return;
                }

                verifMsg.textContent = 'Verification submitted successfully.';

                if (payload?.idUrl) {
                    const idPlaceholder = document.getElementById('idDocPlaceholder');
                    if (idPlaceholder) {
                        idPlaceholder.dataset.privateUrl = payload.idUrl;
                        idPlaceholder.innerHTML = '';
                    }
                }
                if (payload?.proofUrl) {
                    const proofPlaceholder = document.getElementById('proofDocPlaceholder');
                    if (proofPlaceholder) {
                        proofPlaceholder.dataset.privateUrl = payload.proofUrl;
                        proofPlaceholder.innerHTML = '';
                    }
                }
                if (payload?.selfieUrl) {
                    const selfiePlaceholder = document.getElementById('selfieDocPlaceholder');
                    if (selfiePlaceholder) {
                        selfiePlaceholder.dataset.privateUrl = payload.selfieUrl;
                        selfiePlaceholder.innerHTML = '';
                    }
                }

                if (window.loadPrivateMedia && typeof window.loadPrivateMedia === 'function') {
                    window.loadPrivateMedia();
                } else {
                    document.dispatchEvent(new CustomEvent('private-media-updated'));
                }

                await fetchAndRenderVerification();
            } catch (err) {
                console.error('submit verification error', err);
                verifMsg.textContent = 'Error submitting verification.';
            }
        });
    }

    // ===== Appeal submission =====
    if (submitAppealBtn) {
        submitAppealBtn.addEventListener('click', async (ev) => {
            ev.preventDefault();
            if (!appealMessageEl || !appealMsg) return;

            const msg = (appealMessageEl.value || '').trim();
            if (!msg) {
                appealMsg.textContent = 'Please enter a message for your appeal.';
                return;
            }

            appealMsg.textContent = 'Submitting appeal...';
            submitAppealBtn.disabled = true;
            try {
                const token = await getIdToken();
                if (!token) {
                    appealMsg.textContent = 'Not authenticated.';
                    submitAppealBtn.disabled = false;
                    return;
                }

                const res = await fetch('/api/employee/verification/appeal', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ message: msg })
                });

                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    appealMsg.textContent = payload?.error || 'Appeal failed.';
                    submitAppealBtn.disabled = false;
                    return;
                }

                appealMsg.textContent = 'Appeal submitted. Verification is now pending again.';
                appealMessageEl.value = '';
                await fetchAndRenderVerification();
            } catch (err) {
                console.error('Error submitting appeal', err);
                appealMsg.textContent = 'Error submitting appeal.';
            } finally {
                submitAppealBtn.disabled = false;
            }
        });

        if (cancelAppealBtn) {
            cancelAppealBtn.addEventListener('click', (ev) => {
                ev.preventDefault();
                appealMessageEl.value = '';
                appealMsg.textContent = '';
                appealSection.style.display = 'none';
            });
        }
    }

    // ===== Edit profile modal =====
    const editBtn = document.getElementById('editProfileBtn');
    const editModalEl = document.getElementById('editProfileModal');
    const editNameEl = document.getElementById('editName');
    const editRoleEl = document.getElementById('editRole');
    const editPhoneEl = document.getElementById('editPhone');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const editProfileMsg = document.getElementById('editProfileMsg');

    if (editBtn && editModalEl && saveProfileBtn) {
        let bsModal = null;
        try {
            const ModalCtor = window.bootstrap?.Modal;
            if (ModalCtor) bsModal = new ModalCtor(editModalEl);
        } catch (e) { }

        editBtn.addEventListener('click', () => {
            editNameEl.value = pName?.textContent?.trim() || '';
            editRoleEl.value = pRole?.textContent?.trim() || '';
            editPhoneEl.value = pPhone?.textContent?.trim() || '';
            if (bsModal?.show) bsModal.show();
            else editModalEl.classList.add('show');
            editProfileMsg && (editProfileMsg.textContent = '');
        });

        saveProfileBtn.addEventListener('click', async () => {
            const name = editNameEl?.value?.trim();
            const role = editRoleEl?.value?.trim();
            const phone = editPhoneEl?.value?.trim();

            if (!name) {
                editProfileMsg.innerHTML = '<div class="text-danger small">Name is required.</div>';
                return;
            }

            saveProfileBtn.disabled = true;
            editProfileMsg.innerHTML = '<div class="text-muted small">Saving...</div>';

            try {
                const token = await getIdToken();
                if (!token) {
                    editProfileMsg.innerHTML = '<div class="text-danger small">Not authenticated.</div>';
                    saveProfileBtn.disabled = false;
                    return;
                }

                const res = await fetch('/api/employee/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ name, role, phone })
                });

                const payload = await res.json().catch(() => ({}));
                if (!res.ok) {
                    editProfileMsg.innerHTML = `<div class="text-danger small">${payload?.error || 'Save failed.'}</div>`;
                    saveProfileBtn.disabled = false;
                    return;
                }

                pName.textContent = name;
                pRole.textContent = role || '';
                pPhone.textContent = phone || '';
                editProfileMsg.innerHTML = '<div class="text-success small">Profile updated.</div>';

                setTimeout(() => {
                    if (bsModal?.hide) bsModal.hide();
                    else editModalEl.classList.remove('show');
                }, 700);
            } catch (err) {
                console.error('Error saving profile', err);
                editProfileMsg.innerHTML = '<div class="text-danger small">Error saving profile.</div>';
            } finally {
                saveProfileBtn.disabled = false;
            }
        });
    }
});
