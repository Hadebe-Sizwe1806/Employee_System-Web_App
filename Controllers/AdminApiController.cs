using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using FirebaseAdmin.Auth;
using Employee_System.Services;
using Google.Cloud.Firestore;
using Microsoft.AspNetCore.Hosting;

namespace Employee_System.Controllers
{
    [ApiController]
    [Route("api/admin")]
    public class AdminApiController : ControllerBase
    {
        private readonly FirestoreService _firestoreService;
        private readonly IWebHostEnvironment _env;
        private readonly ILogger<AdminApiController> _logger;

        public AdminApiController(FirestoreService firestoreService, IWebHostEnvironment env, ILogger<AdminApiController> logger)
        {
            _firestoreService = firestoreService;
            _env = env;
            _logger = logger;
        }

        // Verify Admin Role via Firebase Custom Claim
        private async Task<bool> IsAdminAsync()
        {
            try
            {
                var header = Request.Headers["Authorization"].FirstOrDefault();
                if (string.IsNullOrEmpty(header))
                {
                    _logger.LogWarning("IsAdminAsync: Authorization header missing.");
                    return false;
                }

                // Accept "Bearer <token>"
                var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                    ? header.Substring("Bearer ".Length).Trim()
                    : header.Trim();

                if (string.IsNullOrEmpty(token))
                {
                    _logger.LogWarning("IsAdminAsync: Bearer token missing.");
                    return false;
                }

                var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(token);
                if (decoded.Claims.TryGetValue("role", out var role))
                {
                    var isAdmin = string.Equals(role?.ToString(), "admin", StringComparison.OrdinalIgnoreCase);
                    if (!isAdmin)
                        _logger.LogInformation("User {uid} is not admin. Role: {role}", decoded.Uid, role);
                    return isAdmin;
                }

                _logger.LogInformation("User {uid} has no 'role' claim.", decoded.Uid);
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Admin check failed during IsAdminAsync.");
                return false;
            }
        }

        // Debug endpoint: verifies token and returns claims (use only in local dev)
        [HttpGet("debug/token")]
        public async Task<IActionResult> DebugToken()
        {
            try
            {
                var header = Request.Headers["Authorization"].FirstOrDefault();
                if (string.IsNullOrEmpty(header)) return BadRequest(new { error = "Authorization header missing" });
                var token = header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase) ? header.Substring("Bearer ".Length).Trim() : header.Trim();

                var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(token);
                return Ok(new
                {
                    uid = decoded.Uid,
                    claims = decoded.Claims
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DebugToken error");
                return StatusCode(500, new { error = _env.IsDevelopment() ? ex.ToString() : "Token verification failed" });
            }
        }

        // DELETE: api/admin/employee/{id}
        [HttpDelete("employee/{id}")]
        public async Task<IActionResult> DeleteEmployee(string id)
        {
            if (!await IsAdminAsync())
                return Forbid("Admin privileges required.");

            try
            {
                await _firestoreService.DeleteDocumentAsync("employees", id);
                return Ok(new { message = "Employee deleted." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "DeleteEmployee error for id {id}", id);
                if (_env.IsDevelopment())
                    return StatusCode(500, new { error = ex.ToString() });
                return StatusCode(500, new { error = "Server error while deleting employee. Check server logs for details." });
            }
        }

        // Approve verification request
        [HttpPost("verification/approve/{id}")]
        public async Task<IActionResult> ApproveVerification(string id)
        {
            if (!await IsAdminAsync())
                return Forbid("Admin privileges required.");

            try
            {
                var updates = new Dictionary<string, object>
                {
                    { "status", "approved" },
                    { "reviewedAt", Timestamp.FromDateTime(DateTime.UtcNow) }
                };

                await _firestoreService.UpdateDocumentAsync("verifications", id, updates);
                return Ok(new { message = "Verification approved." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ApproveVerification error for id {id}", id);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // Reject verification request
        [HttpPost("verification/reject/{id}")]
        public async Task<IActionResult> RejectVerification(string id, [FromBody] RejectionReason reason)
        {
            if (!await IsAdminAsync())
                return Forbid("Admin privileges required.");

            try
            {
                var updates = new Dictionary<string, object>
                {
                    { "status", "rejected" },
                    { "reviewedAt", Timestamp.FromDateTime(DateTime.UtcNow) },
                    { "comment", reason?.Reason ?? string.Empty }
                };

                await _firestoreService.UpdateDocumentAsync("verifications", id, updates);
                return Ok(new { message = "Verification rejected." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "RejectVerification error for id {id}", id);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // Server-side paged listing for verifications (secure)
        // GET: api/admin/verification/list?status=pending&pageSize=8&startAfterId=abc
        [HttpGet("verification/list")]
        public async Task<IActionResult> ListVerifications([FromQuery] string status, [FromQuery] int pageSize = 8, [FromQuery] string? startAfterId = null)
        {
            if (!await IsAdminAsync())
                return Forbid("Admin privileges required.");

            if (string.IsNullOrEmpty(status))
                return BadRequest(new { error = "status query parameter is required (pending|approved|rejected)." });

            try
            {
                var col = _firestoreService.Db.Collection("verifications");
                Query q = col.WhereEqualTo("status", status).OrderByDescending("createdAt").Limit(pageSize);

                if (!string.IsNullOrEmpty(startAfterId))
                {
                    var startSnap = await col.Document(startAfterId).GetSnapshotAsync();
                    if (startSnap.Exists)
                    {
                        q = q.StartAfter(startSnap);
                    }
                    else
                    {
                        return BadRequest(new { error = "startAfterId not found. Reset cursor and try again." });
                    }
                }

                var snap = await q.GetSnapshotAsync();

                var items = snap.Documents.Select(ds =>
                {
                    var dict = new Dictionary<string, object>();
                    foreach (var kv in ds.ToDictionary())
                    {
                        if (kv.Value is Timestamp ts)
                        {
                            dict[kv.Key] = ts.ToDateTime().ToUniversalTime().ToString("o");
                        }
                        else
                        {
                            dict[kv.Key] = kv.Value;
                        }
                    }
                    return new { id = ds.Id, data = dict };
                }).ToList();

                var lastId = snap.Documents.LastOrDefault()?.Id;
                var hasMore = snap.Documents.Count == pageSize;

                return Ok(new { items, lastId, hasMore });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ListVerifications error for status {status}", status);
                return StatusCode(500, new { error = _env.IsDevelopment() ? ex.ToString() : "Server error while listing verifications." });
            }
        }

        // GET: api/admin/verification/stats
        [HttpGet("verification/stats")]
        public async Task<IActionResult> GetVerificationStats()
        {
            if (!await IsAdminAsync())
                return Forbid("Admin privileges required.");

            try
            {
                var col = _firestoreService.Db.Collection("verifications");
                var pendingSnap = await col.WhereEqualTo("status", "pending").GetSnapshotAsync();
                var approvedSnap = await col.WhereEqualTo("status", "approved").GetSnapshotAsync();
                var rejectedSnap = await col.WhereEqualTo("status", "rejected").GetSnapshotAsync();

                return Ok(new
                {
                    pending = pendingSnap.Count,
                    approved = approvedSnap.Count,
                    rejected = rejectedSnap.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetVerificationStats error");
                return StatusCode(500, new { error = _env.IsDevelopment() ? ex.ToString() : "Server error while counting verifications." });
            }
        }

        // ------------------------
        // Appeals endpoints
        // ------------------------

        // GET: api/admin/appeal/list?status=pending&pageSize=8&startAfterId=abc
        [HttpGet("appeal/list")]
        public async Task<IActionResult> ListAppeals([FromQuery] string status, [FromQuery] int pageSize = 8, [FromQuery] string? startAfterId = null)
        {
            if (!await IsAdminAsync())
                return Forbid("Admin privileges required.");

            if (string.IsNullOrEmpty(status))
                return BadRequest(new { error = "status query parameter is required (pending|approved|rejected)." });

            try
            {
                var col = _firestoreService.Db.Collection("appeals");
                Query q = col.WhereEqualTo("status", status).OrderByDescending("createdAt").Limit(pageSize);

                if (!string.IsNullOrEmpty(startAfterId))
                {
                    var startSnap = await col.Document(startAfterId).GetSnapshotAsync();
                    if (startSnap.Exists)
                    {
                        q = q.StartAfter(startSnap);
                    }
                    else
                    {
                        return BadRequest(new { error = "startAfterId not found. Reset cursor and try again." });
                    }
                }

                var snap = await q.GetSnapshotAsync();

                var items = snap.Documents.Select(ds =>
                {
                    var dict = new Dictionary<string, object>();
                    foreach (var kv in ds.ToDictionary())
                    {
                        if (kv.Value is Timestamp ts)
                        {
                            dict[kv.Key] = ts.ToDateTime().ToUniversalTime().ToString("o");
                        }
                        else
                        {
                            dict[kv.Key] = kv.Value;
                        }
                    }
                    return new { id = ds.Id, data = dict };
                }).ToList();

                var lastId = snap.Documents.LastOrDefault()?.Id;
                var hasMore = snap.Documents.Count == pageSize;

                return Ok(new { items, lastId, hasMore });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ListAppeals error for status {status}", status);
                return StatusCode(500, new { error = _env.IsDevelopment() ? ex.ToString() : "Server error while listing appeals." });
            }
        }

        // GET: api/admin/appeal/stats
        [HttpGet("appeal/stats")]
        public async Task<IActionResult> GetAppealStats()
        {
            if (!await IsAdminAsync())
                return Forbid("Admin privileges required.");

            try
            {
                var col = _firestoreService.Db.Collection("appeals");
                var pendingSnap = await col.WhereEqualTo("status", "pending").GetSnapshotAsync();
                var approvedSnap = await col.WhereEqualTo("status", "approved").GetSnapshotAsync();
                var rejectedSnap = await col.WhereEqualTo("status", "rejected").GetSnapshotAsync();

                return Ok(new
                {
                    pending = pendingSnap.Count,
                    approved = approvedSnap.Count,
                    rejected = rejectedSnap.Count
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetAppealStats error");
                return StatusCode(500, new { error = _env.IsDevelopment() ? ex.ToString() : "Server error while counting appeals." });
            }
        }

        // POST api/admin/appeal/approve/{id}
        [HttpPost("appeal/approve/{id}")]
        public async Task<IActionResult> ApproveAppeal(string id)
        {
            if (!await IsAdminAsync())
                return Forbid("Admin privileges required.");

            try
            {
                // Update appeal
                var appealUpdates = new Dictionary<string, object>
                {
                    { "status", "approved" },
                    { "reviewedAt", Timestamp.FromDateTime(DateTime.UtcNow) }
                };
                await _firestoreService.UpdateDocumentAsync("appeals", id, appealUpdates);

                // Load appeal to get verificationId and update verification to approved
                var aSnap = await _firestoreService.Db.Collection("appeals").Document(id).GetSnapshotAsync();
                if (aSnap.Exists)
                {
                    var ad = aSnap.ToDictionary();
                    if (ad.TryGetValue("verificationId", out var vIdObj) && vIdObj != null)
                    {
                        var vId = vIdObj.ToString();
                        try
                        {
                            var verUpdates = new Dictionary<string, object>
                            {
                                { "status", "approved" },
                                { "reviewedAt", Timestamp.FromDateTime(DateTime.UtcNow) }
                            };
                            await _firestoreService.UpdateDocumentAsync("verifications", vId, verUpdates);
                        }
                        catch (Exception exInner)
                        {
                            _logger.LogWarning(exInner, "Could not update linked verification {vId} when approving appeal {id}", vId, id);
                        }
                    }
                }

                return Ok(new { message = "Appeal approved." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ApproveAppeal error for id {id}", id);
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // POST api/admin/appeal/reject/{id}
        [HttpPost("appeal/reject/{id}")]
        public async Task<IActionResult> RejectAppeal(string id, [FromBody] RejectionReason reason)
        {
            if (!await IsAdminAsync())
                return Forbid("Admin privileges required.");

            try
            {
                var updates = new Dictionary<string, object>
                {
                    { "status", "rejected" },
                    { "reviewedAt", Timestamp.FromDateTime(DateTime.UtcNow) },
                    { "comment", reason?.Reason ?? string.Empty }
                };

                await _firestoreService.UpdateDocumentAsync("appeals", id, updates);

                return Ok(new { message = "Appeal rejected." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "RejectAppeal error for id {id}", id);
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }

    public class RejectionReason
    {
        public string? Reason { get; set; }
    }
}