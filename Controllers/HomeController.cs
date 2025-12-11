using Microsoft.AspNetCore.Mvc;

namespace Employee_System.Controllers
{
    public class HomeController : Controller
    {
        public IActionResult Login() => View();
    }
}
