import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";
import DefaultWeekPreview from "../components/DefaultWeekPreview";
import { Sakura } from "../components/Decorations";

function DefaultWeekTemplate() {
  return (
    <PageLayout title="Default Week">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">
        <Link
          to="/routine"
          className="inline-flex items-center gap-1 text-xs text-accent-500 dark:text-accent-300 font-medium mb-3"
        >
          &#8249; Back to Routine
        </Link>

        <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100 mb-2 flex items-center gap-2">
          <Sakura className="w-4 h-4" />
          DEFAULT WEEK
        </h2>
        <p className="text-xs text-brand-400 dark:text-brand-500 mb-4">
          A preview of your fixed blocks. To change what's here, edit the blocks themselves in your library.
        </p>

        <DefaultWeekPreview scrollHeight={360} />

        <Link
          to="/routine"
          className="block text-center mt-4 text-xs text-brand-400 dark:text-brand-500 hover:text-accent-500 dark:hover:text-accent-300"
        >
          Manage your fixed blocks in Routine
        </Link>
      </div>
    </PageLayout>
  );
}

export default DefaultWeekTemplate;
