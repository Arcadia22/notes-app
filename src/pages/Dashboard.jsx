import { Link } from "react-router-dom";

function Dashboard() {
  const sections = [
    { name: "Goals", path: "/goals", color: "bg-pink-100 text-pink-700", emoji: "🎯" },
    { name: "Events", path: "/events", color: "bg-blue-100 text-blue-700", emoji: "📅" },
    { name: "Tasks", path: "/tasks", color: "bg-green-100 text-green-700", emoji: "✅" },
    { name: "Habits", path: "/habits", color: "bg-yellow-100 text-yellow-700", emoji: "🔥" },
  ];

  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl md:text-3xl font-bold text-indigo-600">Dashboard</h1>
      <p className="mt-2 text-gray-600 text-sm md:text-base">
        Today's goals, events, and tasks will show up here.
      </p>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map((section) => (
          <Link
            key={section.path}
            to={section.path}
            className={`rounded-xl p-6 shadow-sm hover:shadow-md transition ${section.color}`}
          >
            <div className="text-3xl">{section.emoji}</div>
            <div className="mt-2 font-semibold">{section.name}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;