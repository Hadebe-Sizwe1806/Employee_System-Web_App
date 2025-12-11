using Google.Cloud.Firestore;
using System.Threading.Tasks;

namespace Employee_System.Services
{
    public class AdminService
    {
        private readonly FirestoreDb _db;
        public AdminService(FirestoreService fs)
        {
            _db = fs.Db;
        }

        public async Task AddEmployeeAsync(string docId, IDictionary<string, object> data)
        {
            var doc = _db.Collection("employees").Document(docId);
            await doc.SetAsync(data);
        }

        public async Task DeleteEmployeeAsync(string docId)
        {
            var doc = _db.Collection("employees").Document(docId);
            await doc.DeleteAsync();
        }
    }
}
