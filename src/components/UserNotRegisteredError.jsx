import React from 'react';
import BrandHero from './BrandHero';

const UserNotRegisteredError = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background px-4">
      <div className="max-w-md w-full">
        <BrandHero />
        <div className="rounded-xl border border-border bg-card p-8 shadow-xl">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-destructive/10">
              <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="font-heading font-bold text-xl text-foreground">Access Restricted</h2>
            <p className="text-muted-foreground text-sm mt-2">
              You're not registered to use SiteHawk. Contact the administrator to request access.
            </p>
          </div>
          <div className="rounded-lg bg-secondary border border-border p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground mb-2">To resolve this:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Verify you're logged in with the correct account</li>
              <li>Contact the app administrator for access</li>
              <li>Try logging out and back in again</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;