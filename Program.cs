using FirebaseAdmin;
using Google.Apis.Auth.OAuth2;
using FirebaseAdmin.Auth;
using Employee_System.Services;
using Google.Cloud.Firestore.V1;
using Google.Cloud.Firestore;
using System.IO;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();
builder.Services.AddRazorPages().AddRazorRuntimeCompilation();

// Build and register FirestoreDb explicitly using serviceAccount.json
var projectId = builder.Configuration["Firebase:ProjectId"] ?? "employeesystem-692ce";
var credentialsRelative = builder.Configuration["Firebase:CredentialsPath"] ?? "serviceAccount.json";
var credentialsPath = Path.Combine(AppContext.BaseDirectory, credentialsRelative);

if (!File.Exists(credentialsPath))
{
    // Fail fast with clear message so developer knows to place the file in output
    Console.WriteLine($"❌ serviceAccount.json not found at: {credentialsPath}");
    throw new FileNotFoundException("serviceAccount.json not found. Place it in the application's output folder.", credentialsPath);
}
else
{
    var json = File.ReadAllText(credentialsPath);
    var firestoreClient = new FirestoreClientBuilder { JsonCredentials = json }.Build();
    var firestoreDb = FirestoreDb.Create(projectId, firestoreClient);
    builder.Services.AddSingleton(firestoreDb);
    Console.WriteLine($"✅ FirestoreDb registered for project: {projectId}");
}

// Register Firestore and related services for DI (FirestoreService now receives FirestoreDb)
builder.Services.AddSingleton<FirestoreService>();
builder.Services.AddScoped<AdminService>();
builder.Services.AddScoped<VerificationService>();

// CORS: allow Authorization header from local origins (adjust origins as required)
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowLocalDev", policy =>
    {
        policy
            .WithOrigins("https://localhost:44395", "https://localhost:5001", "http://localhost:5000")
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = 104857600; // 100 MB
});

builder.Services.Configure<IISServerOptions>(options =>
{
    options.MaxRequestBodySize = 200 * 1024 * 1024; // 200 MB
});

var app = builder.Build();

// Developer exception page (local only)
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}

// Initialize Firebase Admin (serviceAccount.json must be in project root/output)
if (File.Exists(credentialsPath))
{
    try
    {
        if (FirebaseApp.DefaultInstance == null)
        {
            FirebaseApp.Create(new AppOptions
            {
                Credential = GoogleCredential.FromFile(credentialsPath)
            });
        }

        // One-time admin seeding
        var flagPath = Path.Combine(AppContext.BaseDirectory, "admin_seed_done.txt");
        if (!File.Exists(flagPath))
        {
            try
            {
                var auth = FirebaseAuth.DefaultInstance;
                // NOTE: ensure this email matches your intended admin (see appsettings.json)
                var user = auth.GetUserByEmailAsync("222078272@stud.cut.ac.za").GetAwaiter().GetResult();
                auth.SetCustomUserClaimsAsync(user.Uid, new System.Collections.Generic.Dictionary<string, object> { { "role", "admin" } }).GetAwaiter().GetResult();
                File.WriteAllText(flagPath, "Admin seeding done at: " + DateTime.UtcNow.ToString("o"));
                Console.WriteLine("✅ Admin user 222078272@stud.cut.ac.za successfully tagged as admin.");
            }
            catch (Exception ex)
            {
                Console.WriteLine("⚠️ Admin seeding failed: " + ex.Message);
            }
        }
        else
        {
            Console.WriteLine("ℹ️ Admin seeding already completed previously.");
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine("⚠️ Firebase initialization error: " + ex.Message);
    }
}
else
{
    Console.WriteLine("⚠️ serviceAccount.json not found in project root/output. Place your serviceAccount.json there for Admin SDK features.");
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseCors("AllowLocalDev");
app.UseAuthorization();

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Login}/{id?}");

app.Run();
