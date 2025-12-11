using Microsoft.AspNetCore.Mvc;

namespace Employee_System.Controllers
{
    public class EmployeeController : Controller
    {
        public IActionResult Dashboard() => View();
        public IActionResult Profile() => View();
    }
}
