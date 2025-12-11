using Google.Cloud.Firestore;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Employee_System.Services
{
    public class FirestoreService
    {
        public FirestoreDb Db { get; }

        // Accept FirestoreDb via DI so credentials are supplied by Program.cs
        public FirestoreService(FirestoreDb db)
        {
            Db = db ?? throw new ArgumentNullException(nameof(db));
            Console.WriteLine($"✅ FirestoreService initialized with project: {Db.ProjectId}");
        }

        // === Helper: Update any document in a collection ===
        public async Task UpdateDocumentAsync(string collectionName, string documentId, Dictionary<string, object> updates)
        {
            try
            {
                var docRef = Db.Collection(collectionName).Document(documentId);
                await docRef.UpdateAsync(updates);
                Console.WriteLine($"✅ Document '{documentId}' in '{collectionName}' updated successfully.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error updating document '{documentId}' in '{collectionName}': {ex.Message}");
                throw;
            }
        }

        // === Helper: Delete a document from a collection ===
        public async Task DeleteDocumentAsync(string collectionName, string documentId)
        {
            try
            {
                var docRef = Db.Collection(collectionName).Document(documentId);
                await docRef.DeleteAsync();
                Console.WriteLine($"🗑️ Document '{documentId}' deleted successfully from '{collectionName}'.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error deleting document '{documentId}' from '{collectionName}': {ex.Message}");
                throw;
            }
        }
    }
}
