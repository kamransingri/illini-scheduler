import Link from "next/link";
import NotFoundRedirect from "@/components/NotFoundRedirect";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <NotFoundRedirect />
      <h1 className="font-display text-2xl font-bold text-heading">404: page not found</h1>
      <p className="text-muted">That course or page could not be found. Course pages look like /course/CS/124/.</p>
      <Link href="/" className="font-semibold text-action underline">
        Search for a course
      </Link>
    </div>
  );
}
