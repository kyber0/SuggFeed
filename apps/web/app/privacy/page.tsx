// @privacy-policy
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | SuggFeed",
  description: "How SuggFeed collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  const lastUpdated = "27 September 2026";

  return (
    <main className="sf-legal-page">
      <div className="sf-legal-container">
        <nav className="sf-legal-breadcrumb">
          <Link href="/">Back to SuggFeed</Link>
        </nav>

        <header className="sf-legal-header">
          <h1>Privacy Policy</h1>
          <p className="sf-legal-meta">Last updated: {lastUpdated}</p>
        </header>

        <article className="sf-legal-content">
          <section>
            <h2>1. Introduction</h2>
            <p>
              SuggFeed is a school feedback platform that lets students share suggestions anonymously
              and track their progress. This policy explains what data we collect, why we collect it,
              and how we protect it.
            </p>
          </section>

          <section>
            <h2>2. What We Collect</h2>
            <h3>2.1 Submissions</h3>
            <p>
              When you submit a suggestion, we store the text content, category, optional attachments,
              and a randomly generated anonymous tracking token. We do <strong>not</strong> store your
              name, school ID, or any other personally identifiable information alongside your
              submission.
            </p>
            <h3>2.2 Tracking Tokens</h3>
            <p>
              A one-time tracking token is generated in your browser when you submit a suggestion. It
              is stored locally on your device and is the only way to look up the status of your own
              submission. We cannot link a tracking token back to you.
            </p>
            <h3>2.3 Authenticated Staff Accounts</h3>
            <p>
              Staff and admin users sign in with an email and password managed by Supabase Auth. We
              store your email address, hashed password (never plaintext), and role assignment. Login
              events are logged for security auditing.
            </p>
            <h3>2.4 Usage Data</h3>
            <p>
              We collect anonymised usage metrics (page views, error events) via our analytics
              provider. No cross-site tracking cookies are used.
            </p>
          </section>

          <section>
            <h2>3. How We Use Your Data</h2>
            <ul>
              <li>To display approved suggestions in the public feed.</li>
              <li>To allow you to track the status of your own submission.</li>
              <li>To enable staff to review, respond to, and moderate submissions.</li>
              <li>To detect abuse and enforce our acceptable-use policy.</li>
              <li>To improve the platform through aggregated analytics.</li>
            </ul>
          </section>

          <section>
            <h2>4. Data Retention</h2>
            <p>
              Approved or actioned submissions are retained indefinitely as part of the public record.
              Rejected or spam submissions are deleted after 90 days. Tracking tokens stored in your
              browser expire after 12 months of inactivity.
            </p>
          </section>

          <section>
            <h2>5. Third-Party Services</h2>
            <ul>
              <li><strong>Supabase</strong> - database, authentication, and file storage.</li>
              <li><strong>Cloudflare Turnstile</strong> - bot/spam protection at submission time.</li>
              <li><strong>Vercel</strong> - hosting and edge functions.</li>
            </ul>
          </section>

          <section>
            <h2>6. Your Rights</h2>
            <p>
              Because submissions are anonymous, we cannot locate records tied to a specific individual
              without a tracking token. If you have your tracking token and wish to request deletion of
              your submission, contact us at the address below and we will process your request within
              30 days.
            </p>
            <p>
              Staff account holders may request access to or deletion of their personal data at any
              time.
            </p>
          </section>

          <section>
            <h2>7. Security</h2>
            <p>
              All data is encrypted in transit (TLS 1.2+) and at rest. We implement Row-Level Security
              on all database tables, HTTP security headers (CSP, HSTS, X-Frame-Options), and rate
              limiting on all public endpoints.
            </p>
          </section>

          <section>
            <h2>8. Contact</h2>
            <p>
              Questions about this policy? Email us at{" "}
              <a href="mailto:privacy@suggfeed.app">privacy@suggfeed.app</a>.
            </p>
          </section>
        </article>

        <footer className="sf-legal-footer">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/">Home</Link>
        </footer>
      </div>
    </main>
  );
}