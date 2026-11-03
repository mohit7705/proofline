import { Footer } from "../components/layout/Footer";
import { PublicNav } from "../components/layout/PublicNav";
import { ButtonLink } from "../components/ui/Button";
import { Icon, type IconName } from "../components/ui/Icon";

const SECTIONS: { id: string; icon: IconName; title: string; points: string[] }[] = [
  {
    id: "access",
    icon: "lock",
    title: "Who can see and do what",
    points: [
      "There are two roles: manager and worker. New accounts start as workers. Only a manager can change someone's role, and no one can change their own.",
      "The server checks the role on every request. Hiding a button in the interface is never what keeps data safe.",
      "A worker can only open work orders assigned to them, and can only upload to tasks assigned to them or to no one.",
      "Sign-in tokens expire after 30 minutes. When one expires you are returned to the sign-in page rather than shown stale data.",
    ],
  },
  {
    id: "evidence",
    icon: "hash",
    title: "How evidence is handled",
    points: [
      "Uploads accept JPEG, PNG and WebP images up to 25 MiB, and MP4 and WebM video up to 100 MiB.",
      "The file's real signature is checked, not just its name, and unsafe file names are cleaned before storage.",
      "Each file is fingerprinted with SHA-256 on arrival. The fingerprint, size, time and uploader are kept with the record.",
      "Files are stored outside the web root and are not served from a public address.",
    ],
  },
  {
    id: "privacy",
    icon: "eye",
    title: "People in the footage",
    points: [
      "Video of a workplace can include people and private rooms. Workers should point the camera at the work area and avoid capturing faces or personal belongings.",
      "Access to a job's evidence is limited by role and by assignment.",
      "Consent notices, retention periods and deletion controls are part of the security review still ahead of this prototype. Until then, do not upload footage you would not be comfortable storing.",
    ],
  },
];

export function SecurityPage() {
  return (
    <>
      <PublicNav />
      <main id="main" className="info-page">
        <header className="info-hero">
          <div className="container">
            <h1>Security and privacy</h1>
            <p>
              What Proofline protects today, what is still ahead, and what a “verified” result does and does
              not mean.
            </p>
          </div>
        </header>

        <div className="container info-body">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="info-block">
              <h2>
                <Icon name={s.icon} size={20} />
                {s.title}
              </h2>
              <ul>
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          ))}

          <section id="limits" className="info-block info-block-emphasis">
            <h2>
              <Icon name="shield" size={20} />
              What “verified” means, and what it doesn't
            </h2>
            <ul>
              <li>
                Verified means the checklist you set was supported by evidence that can be traced to real
                frames.
              </li>
              <li>
                It does not certify electrical safety, structural quality, legal compliance or anything a
                camera cannot show. Those stay with a qualified person.
              </li>
              <li>
                No tool catches every fake. A suspicious signal sends the task to a person for review. It is
                never treated as proof that a worker cheated.
              </li>
            </ul>
          </section>

          <div className="info-cta">
            <ButtonLink to="/register" variant="primary" size="l">
              Create your account
            </ButtonLink>
            <ButtonLink to="/how-it-works" variant="secondary" size="l">
              How it works
            </ButtonLink>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
