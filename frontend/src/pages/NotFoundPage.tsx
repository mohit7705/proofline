import { Footer } from "../components/layout/Footer";
import { PublicNav } from "../components/layout/PublicNav";
import { ButtonLink } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";

export function NotFoundPage() {
  return (
    <>
      <PublicNav />
      <main id="main" className="container notfound">
        <span className="notfound-icon bracketed" aria-hidden="true">
          <Icon name="search" size={26} />
        </span>
        <h1>That page doesn't exist</h1>
        <p>The link may be old or mistyped. Head back to the start.</p>
        <ButtonLink to="/" variant="primary">
          Go to the home page
        </ButtonLink>
      </main>
      <Footer />
    </>
  );
}
