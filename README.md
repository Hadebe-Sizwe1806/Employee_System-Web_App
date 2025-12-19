# 🚀 Employee_System-Web_App  
### ASP.NET Core MVC • .NET 8 • Firebase

A **secure ASP.NET Core MVC web application** developed to authenticate and manage employees using Firebase.  
This project demonstrates **modern .NET development**, **role-based access control**, and **secure Firebase integration**, making it suitable for **academic assessment** and **professional portfolios**.

---

## 📌 Project Overview

The Employee Verification System provides a structured login flow for **Employees** and **Administrators**, with role-based redirects and secure authentication powered by Firebase. The application follows **industry best practices** by excluding sensitive credentials from version control and providing example configuration files for safe setup.

---

## ✨ Key Features

- 🔐 Secure authentication using Firebase Authentication
- 👥 Separate login flows for **Employees** and **Admins**
- 🧑‍💼 Automatic one-time admin seeding via Firebase Admin SDK
- 🔀 Role-based redirects:
  - Admin → `/Admin/Dashboard`
  - Employee → `/Employee/Dashboard`
- ⚠️ Friendly and clear login error messages
- 🎨 Clean Bootstrap-based UI with responsive layout
- 🔒 Sensitive credentials excluded from GitHub

---

## 🛠️ Technology Stack

| Layer | Technologies |
|------|-------------|
| Frontend | Razor Views, HTML5, CSS3, Bootstrap 5 |
| Backend | ASP.NET Core MVC (.NET 8) |
| Authentication | Firebase Authentication |
| Database | Cloud Firestore |
| Admin Tools | Firebase Admin SDK |
| Tooling | Visual Studio 2022, Git, GitHub |

---

## What it includes
- Employee login (home page) with employee-number -> email mapping (employeeNumber@company.local)
- Admin login (separate page with clean gray card UI)
- One-time automatic admin seeding for `222078272@company.local` using the Admin SDK (serviceAccount.json must be in project root)
- Role-based redirects after login: Admin -> /Admin/Dashboard, Employee -> /Employee/Dashboard
- Friendly login error messages

---

## Setup
1. Place your `serviceAccount.json` in the project root (next to Program.cs).
2. Fill Firebase config placeholders in `Views/Shared/_Layout_example.cshtml` then rename it to _Layout.cshtml.
3. Optionally update admin email in Program.cs if needed.
4. Run:
   ```bash
   git clone https://github.com/Hadebe-Sizwe1806/Employee_System-Web_App.git
   cd Employee_System-Web_App
   dotnet restore
   dotnet build
   dotnet run
   ```

Note: This scaffold provides placeholders for dashboards and minimal server services. Tighten up security rules and validation before production.
