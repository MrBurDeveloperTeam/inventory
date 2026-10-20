import React from 'react';

/**
 * Full-screen loading screen. Intentionally IDENTICAL (markup, sizes, colours, text)
 * to the gallery's /opening.html and the splash inside index.html, so moving from
 * Snabbb -> Inventory looks like one continuous loading screen. The shared styles
 * live in index.html (#ls-css).
 */
interface LaunchScreenProps {
  title?: string;
  status?: string;
}

const LaunchScreen: React.FC<LaunchScreenProps> = ({
  title = 'Opening Inventory…',
  status = 'Signing you in…',
}) => (
  <div className="ls" role="status" aria-live="polite">
    <img
      className="ls-icon"
      src="https://app.snabbb.com/icons/new-icons/inventory.png?v=1"
      alt=""
      width={160}
      height={160}
    />
    <div className="ls-spinner" aria-hidden="true" />
    <h1 className="ls-title">{title}</h1>
    <p className="ls-status">{status}</p>
  </div>
);

export default LaunchScreen;
