// wwwroot/js/admin-employees.js
// Simplified version: photo saved as Base64 in Firestore (no Firebase Storage required)
document.addEventListener('DOMContentLoaded', () => {
    const addBtn = document.getElementById('addEmpBtn');
    const tableBody = document.querySelector('#employeesTable tbody');

    if (!addBtn || !tableBody) {
        console.warn('admin-employees: required DOM elements not found');
        return;
    }

    // modular Firestore imports helper
    const fns = {
        getDocs: null, collection: null, addDoc: null,
        doc: null, updateDoc: null, serverTimestamp: null
    };

    async function loadModuleFns() {
        const mod = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js');
        fns.getDocs = mod.getDocs;
        fns.collection = mod.collection;
        fns.addDoc = mod.addDoc;
        fns.doc = mod.doc;
        fns.updateDoc = mod.updateDoc;
        fns.serverTimestamp = mod.serverTimestamp;
    }

    // secure delete uses Firebase Auth + ASP.NET Core endpoint
    async function deleteEmployeeSecure(docId) {
        try {
            const { getAuth } = await import('https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js');
            const auth = getAuth();
            const user = auth.currentUser;
            if (!user) {
                alert("Not signed in as admin");
                return;
            }
            const token = await user.getIdToken();

            const res = await fetch(`/api/admin/employee/${docId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const resText = await res.text();
            let data;
            try {
                data = JSON.parse(resText);
            } catch {
                data = { error: resText };
            }

            if (res.ok) {
                alert(data.message || "Employee deleted successfully.");
                await loadEmployees();
            } else {
                console.error("Server error:", data);
                alert("Error: " + (data.error || "Unknown server error"));
            }


        } catch (err) {
            console.error('Secure delete error:', err);
            alert('Failed to delete employee securely: ' + (err.message || err));
        }
    }

    async function addEmployee() {
        const name = document.getElementById('empName').value.trim();
        const surname = document.getElementById('empSurname').value.trim();
        const role = document.getElementById('empRole').value.trim();
        const phone = document.getElementById('empPhone').value.trim();
        const email = document.getElementById('empEmail').value.trim().toLowerCase();

        if (!email) { alert('Email is required'); return; }

        const db = window.firebaseHelpers.db;
        const data = {
            name, surname, role, phone, email,
            photoUrl: '',
            createdAt: window.firebaseHelpers.serverTimestamp()
        };

        try {
            await fns.addDoc(fns.collection(db, 'employees'), data);
            document.getElementById('addEmployeeForm').reset();
            await loadEmployees();
            alert('Employee added successfully.');
        } catch (err) {
            console.error('Add employee error', err);
            alert('Error adding employee. See console.');
        }
    }

    async function loadEmployees() {
        tableBody.innerHTML = '';
        const db = window.firebaseHelpers.db;
        try {
            const col = fns.collection(db, 'employees');
            const snap = await fns.getDocs(col);
            snap.forEach(docSnap => {
                const d = docSnap.data();
                const tr = document.createElement('tr');

                const nameTd = document.createElement('td');
                nameTd.textContent = (d.name || '') + ' ' + (d.surname || '');
                const roleTd = document.createElement('td'); roleTd.textContent = d.role || '';
                const emailTd = document.createElement('td'); emailTd.textContent = d.email || '';
                const phoneTd = document.createElement('td'); phoneTd.textContent = d.phone || '';
                const photoTd = document.createElement('td');
                if (d.photoUrl) {
                    const img = document.createElement('img');
                    img.src = d.photoUrl; // works for Base64 or URL
                    img.style.maxWidth = '80px';
                    img.classList.add('rounded');
                    img.style.cursor = 'pointer';
                    img.title = 'Click to view full photo';
                    img.addEventListener('click', () => {
                        const win = window.open();
                        win.document.write(`<img src="${d.photoUrl}" style="max-width:100%">`);
                    });
                    photoTd.appendChild(img);
                }

                const actionsTd = document.createElement('td');
                const delBtn = document.createElement('button');
                delBtn.className = 'btn btn-sm btn-danger me-1';
                delBtn.textContent = 'Delete';
                delBtn.addEventListener('click', async () => {
                    if (confirm('Delete this employee record?')) {
                        await deleteEmployeeSecure(docSnap.id);
                    }
                });

                const photoBtn = document.createElement('button');
                photoBtn.className = 'btn btn-sm btn-secondary';
                photoBtn.textContent = 'Take Photo';
                photoBtn.addEventListener('click', () => takeAndUploadPhoto(d.email, docSnap.id));

                actionsTd.appendChild(delBtn);
                actionsTd.appendChild(photoBtn);

                tr.appendChild(nameTd);
                tr.appendChild(roleTd);
                tr.appendChild(emailTd);
                tr.appendChild(phoneTd);
                tr.appendChild(photoTd);
                tr.appendChild(actionsTd);

                tableBody.appendChild(tr);
            });
        } catch (err) {
            console.error('loadEmployees error', err);
        }
    }

    // Webcam capture & save directly to Firestore as Base64 (improved: wait for metadata, handle errors)
    async function takeAndUploadPhoto(email, docId) {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert('Camera API not supported by this browser.');
                return;
            }

            if (!window.isSecureContext) {
                // getUserMedia only works on https or localhost
                if (!confirm('Camera access requires HTTPS or localhost. Continue anyway?')) return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            const video = document.createElement('video');
            video.autoplay = true;
            video.playsInline = true;
            video.srcObject = stream;
            video.style.position = 'fixed';
            video.style.right = '10px';
            video.style.bottom = '10px';
            video.style.maxWidth = '320px';
            video.style.zIndex = '9999';
            document.body.appendChild(video);

            // Wait for video to be ready
            await video.play().catch((e) => {
                // Some browsers require user gesture; still continue and wait for metadata
                console.warn('video.play() failed', e);
            });

            await new Promise((resolve) => {
                if (video.readyState >= 2) return resolve();
                const onMeta = () => { video.removeEventListener('loadedmetadata', onMeta); resolve(); };
                video.addEventListener('loadedmetadata', onMeta);
                // fallback timeout
                setTimeout(resolve, 2000);
            });

            if (!confirm('Camera is on. Click OK to capture a single photo.')) {
                stream.getTracks().forEach(t => t.stop());
                video.remove();
                return;
            }

            const canvas = document.createElement('canvas');
            const w = video.videoWidth || 640;
            const h = video.videoHeight || 480;
            canvas.width = 320; // smaller version
            canvas.height = Math.round((h / w) * 320);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            stream.getTracks().forEach(t => t.stop());
            video.remove();

            // Convert to Base64 string
            const base64Data = canvas.toDataURL('image/jpeg', 0.7);

            // Save directly to Firestore
            const db = window.firebaseHelpers.db;
            const dref = fns.doc(db, 'employees', docId);
            await fns.updateDoc(dref, { photoUrl: base64Data });

            alert('Photo captured and saved to Firestore.');
            await loadEmployees();
        } catch (err) {
            console.error('photo capture/save error', err);
            // Provide clearer messages for common errors
            if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
                alert('Camera access was denied. Check browser permissions and use HTTPS or localhost.');
            } else if (err.name === 'NotFoundError') {
                alert('No camera found.');
            } else {
                alert('Photo capture error: ' + (err.message || err));
            }
        }
    }

    (async () => {
        await loadModuleFns();
        addBtn.addEventListener('click', addEmployee);
        await loadEmployees();
    })();
});