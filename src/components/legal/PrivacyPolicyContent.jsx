import { SUPPORT_EMAIL_DISPLAY, SUPPORT_EMAIL_MAILTO } from "@/lib/contactEmail";

// Shared privacy policy body — rendered by the in-app /privacy page and the
// PUBLIC /privacy-policy page (required by Apple App Store / createPlus).
export default function PrivacyPolicyContent() {
  return (
    <div className="rounded-xl border border-border bg-card p-8 space-y-8 text-sm text-muted-foreground leading-relaxed">

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">1. Introduction</h2>
        <p>
          SkyWave LLC ("Company," "we," "us," or "our") operates the SiteHawk platform ("Service"), available via web
          and mobile applications (including iOS). This Privacy Policy explains how we collect, use, disclose, and
          safeguard your information when you use our Service. Please read this policy carefully. By using the Service,
          you consent to the practices described herein.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">2. Information We Collect</h2>
        <p><span className="font-medium text-foreground">Account Information:</span> When you register, we collect your name, email address, and any profile information you provide.</p>
        <p><span className="font-medium text-foreground">Payment Information:</span> Subscription billing is processed by Stripe. We do not store your full credit card details — only a Stripe customer ID linked to your account.</p>
        <p><span className="font-medium text-foreground">Usage Data:</span> We collect data about how you interact with the Service, including search coordinates, scan history, results viewed, and AI chat queries.</p>
        <p><span className="font-medium text-foreground">Device & Log Data:</span> We may collect browser/device type, IP address, operating system, and pages visited for security and analytics purposes.</p>
        <p><span className="font-medium text-foreground">Location Data:</span> The Service operates on locations you enter (coordinates, addresses, parcels). We do not collect your device's precise GPS location in the background.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">3. How We Use Your Information</h2>
        <p>We use the information we collect to:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Provide, operate, and improve the Service.</li>
          <li>Process subscription payments and manage billing.</li>
          <li>Personalize your experience and deliver AI-powered scan results.</li>
          <li>Send transactional emails (account updates, billing receipts).</li>
          <li>Respond to customer support requests.</li>
          <li>Detect, investigate, and prevent fraudulent or unauthorized activity.</li>
          <li>Comply with legal obligations.</li>
        </ul>
        <p>We do not sell your personal information to third parties.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">4. App Privacy Summary (Apple App Store)</h2>
        <p>For users of our iOS app, the following summarizes our data practices as disclosed in App Store Connect:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li><span className="font-medium text-foreground">Data used to track you:</span> None. We do not track you across other companies' apps or websites, and we do not use advertising identifiers (IDFA).</li>
          <li><span className="font-medium text-foreground">Data linked to your identity:</span> Contact info (name, email), user content (searches, saved sites, documents you upload), purchase history (subscription status), and usage data — used solely for app functionality, billing, and support.</li>
          <li><span className="font-medium text-foreground">Data not linked to your identity:</span> Diagnostic and log data used for security and app performance.</li>
          <li><span className="font-medium text-foreground">Third-party advertising:</span> None. The app contains no third-party ad networks or ad SDKs.</li>
        </ul>
        <p>
          Privacy choices: you may access, correct, or delete your data at any time — see "Your Rights" below. Account
          deletion is available in-app under Billing → Delete Account, or by contacting us.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">5. Third-Party Data Sources</h2>
        <p>
          SiteHawk aggregates data from third-party sources including government parcel databases, zoning records, FAA datasets,
          and commercial skip trace providers. This third-party data is used solely to deliver scan results to you and is subject
          to the terms and privacy policies of those data providers.
        </p>
        <p>
          Skip trace results (property owner contact information) are sourced from licensed data vendors. You are solely responsible
          for using this data in compliance with applicable privacy and communications laws (including TCPA and CAN-SPAM).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">6. Sharing of Information</h2>
        <p>We may share your information with:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li><span className="font-medium text-foreground">Service Providers:</span> Trusted vendors (e.g., Stripe for payments, Supabase for infrastructure, AI model providers) who assist in delivering the Service and are bound by confidentiality obligations.</li>
          <li><span className="font-medium text-foreground">Legal Requirements:</span> When required by law, court order, or to protect the rights, property, or safety of SkyWave LLC, our users, or the public.</li>
          <li><span className="font-medium text-foreground">Business Transfers:</span> In connection with a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">7. Data Retention</h2>
        <p>
          We retain your account and usage data for as long as your account is active or as needed to provide the Service.
          Search history and scan results are retained to support your dashboard and historical reporting. You may request
          deletion of your data at any time by contacting us at <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">{SUPPORT_EMAIL_DISPLAY}</a>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">8. Cookies and Tracking</h2>
        <p>
          We use cookies and similar tracking technologies to maintain session state and improve user experience.
          You may configure your browser to refuse cookies, though some features of the Service may not function properly without them.
          We do not use cookies for third-party advertising.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">9. Security</h2>
        <p>
          We implement industry-standard technical and organizational safeguards to protect your information, including encrypted
          data transmission (TLS), access controls, and secure infrastructure. However, no method of transmission over the internet
          is 100% secure, and we cannot guarantee absolute security.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">10. Your Rights</h2>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Access the personal information we hold about you.</li>
          <li>Request correction of inaccurate data.</li>
          <li>Request deletion of your personal data ("right to be forgotten").</li>
          <li>Object to or restrict certain processing of your data.</li>
          <li>Data portability (receive a copy of your data in a structured format).</li>
        </ul>
        <p>To exercise any of these rights, contact us at <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">{SUPPORT_EMAIL_DISPLAY}</a>.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">11. Children's Privacy</h2>
        <p>
          The Service is not directed to individuals under the age of 18. We do not knowingly collect personal information
          from minors. If you believe a minor has provided us with personal information, please contact us immediately.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">12. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you of material changes via email or a notice
          within the Service. Your continued use of the Service after such changes constitutes acceptance of the updated policy.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-heading font-semibold text-base text-foreground">13. Contact Us</h2>
        <p>If you have questions or concerns about this Privacy Policy, please contact us:</p>
        <div className="pt-1 space-y-1">
          <p><span className="font-medium text-foreground">SkyWave LLC</span> — Michigan, USA</p>
          <p>Email: <a href={`mailto:${SUPPORT_EMAIL_MAILTO}`} className="text-primary hover:underline">{SUPPORT_EMAIL_DISPLAY}</a></p>
          <p>Website: <a href="https://sitehawk.com" target="_blank" rel="noreferrer" className="text-primary hover:underline">sitehawk.com</a></p>
        </div>
      </section>

    </div>
  );
}