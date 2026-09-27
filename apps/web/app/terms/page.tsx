// @terms-of-service
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | SuggFeed",
  description: "The rules and guidelines for using SuggFeed.",
};

export default function TermsPage() {
  const lastUpdated = "27 September 2026";

  return (
    <main className="sf-legal-page">
      <div className="sf-legal-container">
        <nav className="sf-legal-breadcrumb">
          <Link href="/">Back to SuggFeed</Link>
        </nav>

        <header className="sf-legal-header">
          <h1>Terms of Service</h1>
          <p className="sf-legal-meta">Last updated: {lastUpdated}</p>
        </header>

        <article className="sf-legal-content">
          <section>
            <h2>1. Acceptance</h2>
            <p>
              By accessing or using SuggFeed you agree to be bound by these Terms of Service. If you
              do not agree, please do not use the platform.
            </p>
          </section>

          <section>
            <h2>2. Eligibility</h2>
            <p>
              SuggFeed is provided to students, staff, and administrators of the participating school.
              Access may be revoked at any time at the discretion of school administrators.
            </p>
          </section>

          <section>
            <h2>3. Acceptable Use</h2>
            <p>You agree <strong>not</strong> to:</p>
            <ul>
              <li>Submit content that is abusive, discriminatory, defamatory, or harassing.</li>
              <li>Include personal information about other individuals without their consent.</li>
              <li>Attempt to de-anonymise other users submissions.</li>
              <li>Abuse the platform with spam, automated scripts, or denial-of-service attacks.</li>
              <li>Impersonate a staff member or administrator.</li>
              <li>Submit false or misleading information with the intent to deceive.</li>
            </ul>
          </section>

          <section>
            <h2>4. Content Ownership</h2>
            <p>
              You retain ownership of content you submit. By submitting, you grant SuggFeed a
              non-exclusive, royalty-free licence to display and process your submission for the
              purposes of operating the platform.
            </p>
            <p>
              Approved submissions may be visible in the public feed and may be cited in school
              communications. Anonymous attribution will be used.
            </p>
          </section>

          <section>
            <h2>5. Moderation</h2>
            <p>
              All submissions are subject to review before appearing publicly. Staff may reject,
              request changes to, or remove any submission that violates these terms. Rejected
              submissions will receive a reason via the tracking status page.
            </p>
          </section>

          <section>
            <h2>6. Anonymity Limitations</h2>
            <p>
              While SuggFeed is designed to protect anonymity, we may be required to disclose tracking
              tokens or associated metadata if compelled by law, or to prevent serious harm.
            </p>
          </section>

          <section>
            <h2>7. Availability</h2>
            <p>
              We aim for high availability but do not guarantee uninterrupted access. Scheduled
              maintenance will be communicated in advance where possible.
            </p>
          </section>

          <section>
            <h2>8. Limitation of Liability</h2>
            <p>
              SuggFeed is provided as is. To the fullest extent permitted by law, we exclude all
              warranties and shall not be liable for any indirect, incidental, or consequential
              damages arising from your use of the platform.
            </p>
          </section>

          <section>
            <h2>9. Changes to These Terms</h2>
            <p>
              We may update these terms from time to time. Continued use of SuggFeed after changes
              are posted constitutes acceptance of the revised terms.
            </p>
          </section>

          <section>
            <h2>10. Contact</h2>
            <p>
              Questions about these terms? Email us at{" "}
              <a href="mailto:legal@suggfeed.app">legal@suggfeed.app</a>.
            </p>
          </section>
        </article>

        <footer className="sf-legal-footer">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/">Home</Link>
        </footer>
      </div>
    </main>
  );
}