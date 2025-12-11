using Google.Cloud.Firestore;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Employee_System.Services
{
    public class VerificationService
    {
        private readonly FirestoreDb _db;

        public VerificationService(FirestoreService firestoreService)
        {
            if (firestoreService == null || firestoreService.Db == null)
                throw new ArgumentNullException(nameof(firestoreService), "FirestoreService not initialized.");
            _db = firestoreService.Db;
        }

        // Adds a new verification (auto document id)
        public async Task<bool> AddVerificationAsync(Dictionary<string, object> data)
        {
            try
            {
                var col = _db.Collection("verifications");
                await col.AddAsync(data);
                Console.WriteLine("✅ [VerificationService] Verification document created.");
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ [VerificationService] AddVerificationAsync failed: {ex}");
                return false;
            }
        }

        // Create or update by explicit id
        public async Task CreateRequestAsync(string docId, Dictionary<string, object> data)
        {
            try
            {
                await _db.Collection("verifications").Document(docId).SetAsync(data);
                Console.WriteLine($"✅ [VerificationService] Verification '{docId}' written.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ [VerificationService] CreateRequestAsync failed: {ex}");
                throw;
            }
        }

        public async Task<List<Dictionary<string, object>>> GetAllVerificationsAsync()
        {
            var snapshot = await _db.Collection("verifications").OrderByDescending("createdAt").GetSnapshotAsync();
            var results = new List<Dictionary<string, object>>();
            foreach (var doc in snapshot.Documents)
            {
                var d = doc.ToDictionary();
                d["id"] = doc.Id;
                results.Add(d);
            }
            return results;
        }

        public async Task UpdateVerificationStatusAsync(string id, string status, string comment = "")
        {
            var updates = new Dictionary<string, object>
            {
                ["status"] = status,
                ["reviewedAt"] = Timestamp.GetCurrentTimestamp(),
                ["comment"] = comment
            };
            await _db.Collection("verifications").Document(id).UpdateAsync(updates);
            Console.WriteLine($"✅ [VerificationService] Updated {id} => {status}");
        }
    }
}
