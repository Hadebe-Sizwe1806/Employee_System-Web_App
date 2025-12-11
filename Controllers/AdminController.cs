using Microsoft.AspNetCore.Mvc;

namespace Employee_System.Controllers
{
    public class AdminController : Controller
    {
        public IActionResult Dashboard() => View();
        public IActionResult Login() => View();
    }
}
