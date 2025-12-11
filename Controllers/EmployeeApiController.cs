using Microsoft.AspNetCore.Mvc;
using FirebaseAdmin.Auth;
using Employee_System.Services;
using Microsoft.AspNetCore.Hosting;
using Google.Cloud.Firestore;
using System.IO;
using System.Linq;
using System;
using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;
using System.Collections.Generic;

namespace Employee_System.Controllers
{
    [ApiController]
    [Route("api/employee")]
    public class EmployeeApiController : ControllerBase
    {
        private readonly VerificationService _verificationService;
        private readonly IWebHostEnvironment _env;
        private readonly FirestoreService _firestoreService;

        public EmployeeApiController(VerificationService verificationService, IWebHostEnvironment env, FirestoreService firestoreService)
        {
            _verificationService = verificationService;
            _env = env;
            _firestoreService = firestoreService;
        }

        // POST /api/employee/verification/submit
        [HttpPost("verification/submit")]
        [RequestSizeLimit(200_000_000)] // allow up to 200MB — ensure IIS/Kestrel configured too
        public async Task<IActionResult> SubmitVerification()
        {
            try
            {
                // 1) Verify token in Authorization header
                var authHeader = Request.Headers["Authorization"].FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                    return Unauthorized(new { error = "Missing Authorization header" });

                var idToken = authHeader.Substring("Bearer ".Length).Trim();
                FirebaseToken decoded;
                try
                {
                    decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
                }
                catch (Exception ex)
                {
                    return Unauthorized(new { error = "Invalid token", details = ex.Message });
                }

                var uid = decoded.Uid;
                var email = decoded.Claims.TryGetValue("email", out var e) ? e?.ToString() : null;
                if (string.IsNullOrEmpty(email))
                    email = decoded.Claims.ContainsKey("email") ? decoded.Claims["email"]?.ToString() : null;

                // Check latest verification status and block if pending
                var db = _firestoreService.Db;
                var latestSnap = await db.Collection("verifications")
                                        .WhereEqualTo("uid", uid)
                                        .OrderByDescending("createdAt")
                                        .Limit(1)
                                        .GetSnapshotAsync();

                if (latestSnap.Count > 0)
                {
                    var doc = latestSnap.Documents.First();
                    var dict = doc.ToDictionary();
                    if (dict.TryGetValue("status", out var st) && (st?.ToString() ?? "pending").ToLowerInvariant() == "pending")
                    {
                        return BadRequest(new { error = "You already have a pending verification. Please wait for admin review." });
                    }
                }

                // 2) Read files
                var form = await Request.ReadFormAsync();
                var idFile = form.Files.FirstOrDefault(f => f.Name == "idFile" || f.Name == "idDocument");
                var proofFile = form.Files.FirstOrDefault(f => f.Name == "proofFile" || f.Name == "proofOfResidence");
                var selfieFile = form.Files.FirstOrDefault(f => f.Name == "selfieFile" || f.Name == "selfie");

                if (idFile == null || proofFile == null || selfieFile == null)
                    return BadRequest(new { error = "idFile, proofFile and selfieFile are all required." });

                // validate
                var allowedExt = new[] { ".jpg", ".jpeg", ".png", ".pdf" };
                bool Validate(IFormFile f)
                {
                    var ext = Path.GetExtension(f.FileName).ToLowerInvariant();
                    return allowedExt.Contains(ext) && f.Length > 0 && f.Length <= 50L * 1024 * 1024; // 50MB limit
                }
                if (!Validate(idFile) || !Validate(proofFile) || !Validate(selfieFile))
                    return BadRequest(new { error = "Invalid file types or size exceeds 50MB." });

                // 3) Save files to PrivateUploads (create if not exists)
                var privateRoot = Path.Combine(AppContext.BaseDirectory, "PrivateUploads", "verifications", uid);
                Directory.CreateDirectory(privateRoot);

                string Save(IFormFile f)
                {
                    var safe = $"{DateTime.UtcNow:yyyyMMddHHmmss}_{Guid.NewGuid().ToString("N").Substring(0, 8)}_{Path.GetFileName(f.FileName)}";
                    var path = Path.Combine(privateRoot, safe);
                    using var fs = System.IO.File.Create(path);
                    f.CopyTo(fs);
                    // return the private API-served URL (authenticated GET)
                    return $"{Request.Scheme}://{Request.Host}/api/employee/verification/file/{uid}/{Uri.EscapeDataString(safe)}";
                }

                var idUrl = Save(idFile);
                var proofUrl = Save(proofFile);
                var selfieUrl = Save(selfieFile);

                // 4) Build Firestore data (include employeeEmail to match rules)
                var docId = Guid.NewGuid().ToString("N");
                var data = new Dictionary<string, object>
                {
                    ["uid"] = uid,
                    ["employeeEmail"] = email ?? "",
                    ["idDocumentUrl"] = idUrl,
                    ["proofUrl"] = proofUrl,
                    ["selfieUrl"] = selfieUrl,
                    ["status"] = "pending",
                    ["createdAt"] = Timestamp.GetCurrentTimestamp()
                };

                // 5) Write to Firestore via service
                var ok = await _verificationService.AddVerificationAsync(data);
                if (!ok)
                    return StatusCode(500, new { error = "Failed to save verification to Firestore." });

                Console.WriteLine($"✅ [EmployeeApiController] Verification created for {email} (uid={uid})");

                return Ok(new { success = true, message = "Verification submitted.", docId, idUrl, proofUrl, selfieUrl });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ SubmitVerification error: {ex}");
                return StatusCode(500, new { error = "Server error while submitting verification.", details = ex.Message });
            }
        }

        // GET latest verification for current user
        [HttpGet("verification")]
        public async Task<IActionResult> GetMyVerification()
        {
            try
            {
                var authHeader = Request.Headers["Authorization"].FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                    return Unauthorized(new { error = "Missing Authorization header" });

                var idToken = authHeader.Substring("Bearer ".Length).Trim();
                var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
                var uid = decoded.Uid;

                var db = _firestoreService.Db;
                var snapshots = await db.Collection("verifications")
                                        .WhereEqualTo("uid", uid)
                                        .OrderByDescending("createdAt")
                                        .Limit(1)
                                        .GetSnapshotAsync();

                if (snapshots.Count == 0)
                    return Ok(new { hasVerification = false });

                var doc = snapshots.Documents.First();
                var d = doc.ToDictionary();
                d["id"] = doc.Id;
                return Ok(new { hasVerification = true, verification = d });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ GetMyVerification error: {ex}");
                return StatusCode(500, new { error = "Server error while fetching verification.", details = ex.Message });
            }
        }

        // POST /api/employee/verification/appeal
        public class AppealDto { public string? message { get; set; } }

        [HttpPost("verification/appeal")]
        public async Task<IActionResult> AppealVerification([FromBody] AppealDto dto)
        {
            try
            {
                var authHeader = Request.Headers["Authorization"].FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                    return Unauthorized(new { error = "Missing Authorization header" });

                var idToken = authHeader.Substring("Bearer ".Length).Trim();
                var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
                var uid = decoded.Uid;

                var db = _firestoreService.Db;
                var snapshots = await db.Collection("verifications")
                                        .WhereEqualTo("uid", uid)
                                        .OrderByDescending("createdAt")
                                        .Limit(1)
                                        .GetSnapshotAsync();

                if (snapshots.Count == 0)
                    return BadRequest(new { error = "No verification found to appeal." });

                var doc = snapshots.Documents.First();
                var dict = doc.ToDictionary();
                var status = dict.ContainsKey("status") ? (dict["status"]?.ToString() ?? "pending") : "pending";
                if (!string.Equals(status, "rejected", StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { error = "Only rejected verifications can be appealed." });

                var updates = new Dictionary<string, object>
                {
                    ["status"] = "pending",
                    ["appealMessage"] = dto?.message ?? "",
                    ["appealedAt"] = Timestamp.GetCurrentTimestamp(),
                    ["reviewedAt"] = FieldValue.Delete // remove previous review time so admin can see new review cycle (optional)
                };

                // Use helper to update
                await _firestoreService.UpdateDocumentAsync("verifications", doc.Id, updates);

                return Ok(new { success = true, message = "Appeal submitted, verification is now pending." });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ AppealVerification error: {ex}");
                return StatusCode(500, new { error = "Server error while submitting appeal.", details = ex.Message });
            }
        }

        // Authenticated download of stored file
        [HttpGet("verification/file/{uid}/{*filename}")]
        public async Task<IActionResult> GetVerificationFile(string uid, string filename)
        {
            try
            {
                var authHeader = Request.Headers["Authorization"].FirstOrDefault();
                if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer "))
                    return Unauthorized(new { error = "Missing Authorization header" });

                var idToken = authHeader.Substring("Bearer ".Length).Trim();
                var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
                var requesterUid = decoded.Uid;
                var isAdmin = decoded.Claims.TryGetValue("role", out var role) && role?.ToString() == "admin";

                if (!isAdmin && requesterUid != uid)
                    return Forbid();

                var filePath = Path.Combine(AppContext.BaseDirectory, "PrivateUploads", "verifications", uid, filename);
                if (!System.IO.File.Exists(filePath))
                    return NotFound();

                var contentType = GetContentType(filePath) ?? "application/octet-stream";
                var fs = System.IO.File.OpenRead(filePath);
                return File(fs, contentType, Path.GetFileName(filePath));
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ GetVerificationFile error: {ex}");
                return StatusCode(500, new { error = "Server error.", details = ex.Message });
            }
        }

        private static string? GetContentType(string path)
        {
            var ext = Path.GetExtension(path).ToLowerInvariant();
            return ext switch
            {
                ".pdf" => "application/pdf",
                ".jpg" => "image/jpeg",
                ".jpeg" => "image/jpeg",
                ".png" => "image/png",
                _ => "application/octet-stream"
            };
        }
    }
}
