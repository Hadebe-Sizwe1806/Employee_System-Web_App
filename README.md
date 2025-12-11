# Employee_System

This is a scaffolded ASP.NET Core MVC (.NET 8) project preconfigured with Firebase integration.

## What it includes
- Employee login (home page) with employee-number -> email mapping (employeeNumber@company.local)
- Admin login (separate page with clean gray card UI)
- One-time automatic admin seeding for `222078272@company.local` using the Admin SDK (serviceAccount.json must be in project root)
- Role-based redirects after login: Admin -> /Admin/Dashboard, Employee -> /Employee/Dashboard
- Friendly login error messages

## Setup
1. Place your `serviceAccount.json` in the project root (next to Program.cs).
2. Fill Firebase config placeholders in `Views/Shared/_Layout.cshtml`.
3. Optionally update admin email in Program.cs if needed.
4. Run:
   ```bash
   dotnet restore
   dotnet build
   dotnet run
   ```

Note: This scaffold provides placeholders for dashboards and minimal server services. Tighten up security rules and validation before production.
