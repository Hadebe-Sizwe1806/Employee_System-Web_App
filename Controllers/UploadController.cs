
using Microsoft.AspNetCore.Mvc;
using FirebaseAdmin.Auth;
using System.Threading.Tasks;
using System.IO;
using Microsoft.AspNetCore.Http;
using System;
using System.Linq;

namespace Employee_System.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class UploadController : ControllerBase
    {
        // POST api/upload
        [HttpPost]
        public async Task<IActionResult> PostAsync()
        {
            try
            {
                // Check Authorization header
                var auth = Request.Headers["Authorization"].FirstOrDefault();
                if (string.IsNullOrEmpty(auth) || !auth.StartsWith("Bearer "))
                    return Unauthorized(new { error = "No Authorization header provided" });

                var idToken = auth.Substring("Bearer ".Length).Trim();
                var decoded = await FirebaseAuth.DefaultInstance.VerifyIdTokenAsync(idToken);
                var uid = decoded.Uid ?? "unknown";

                if (!Request.HasFormContentType || Request.Form == null)
                    return BadRequest(new { error = "Expected multipart/form-data" });

                var files = Request.Form.Files;
                if (files == null || files.Count == 0)
                    return BadRequest(new { error = "No files uploaded" });

                // Build target directory: ./bin/Debug/net8.0/PrivateUploads/verifications/{uid}/
                var targetDir = Path.Combine(Directory.GetCurrentDirectory(), "bin", "Debug", "net8.0", "PrivateUploads", "verifications", uid);
                Directory.CreateDirectory(targetDir);

                var saved = new System.Collections.Generic.List<string>();
                foreach (var file in files)
                {
                    var origName = Path.GetFileName(file.FileName);
                    var timestamp = DateTime.Now.ToString("yyyyMMddHHmmss");
                    var safeName = timestamp + "_" + Guid.NewGuid().ToString("N").Substring(0,8) + "_" + origName;
                    var savePath = Path.Combine(targetDir, safeName);

                    using (var fs = new FileStream(savePath, FileMode.Create))
                    {
                        await file.CopyToAsync(fs);
                    }

                    saved.Add(Path.GetRelativePath(Directory.GetCurrentDirectory(), savePath).Replace("\\", "/"));
                }

                return Ok(new { success = true, files = saved });
            }
            catch (FirebaseAuthException fae)
            {
                return Unauthorized(new { error = "Invalid Firebase token", details = fae.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = ex.Message });
            }
        }
    }
}
