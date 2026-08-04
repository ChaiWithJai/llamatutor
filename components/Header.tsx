import Image from "next/image";
import Link from "next/link";

const Header = ({
  userEmail,
  sessionActive,
  onOpenAuth,
  onManageAccount,
  onLogout,
}: {
  userEmail?: string | null;
  sessionActive: boolean;
  onOpenAuth: () => void;
  onManageAccount: () => void;
  onLogout: () => void;
}) => {
  return (
    <header className="product-header">
      <div className="product-lockup">
        <a
          href="https://dharmicdata.org"
          aria-label="Visit Dharmic Data"
          className="product-lockup"
        >
          <Image
            src="/dharmic-data-logo.svg"
            alt="Dharmic Data"
            width={300}
            height={72}
            priority
          />
        </a>
        <span className="product-lockup-divider" aria-hidden="true" />
        <Link href="/" className="product-lockup-name">
          Tutor
        </Link>
      </div>
      <nav className="header-links" aria-label="Product navigation">
        {!sessionActive && (
          <Link className="header-experiment" href="/mental-health">
            Reflection lab
          </Link>
        )}
        {!sessionActive && <a href="#how-it-works">How it works</a>}
        <a
          href="https://github.com/ChaiWithJai/llamatutor"
          target="_blank"
          rel="noreferrer"
        >
          GitHub source
        </a>
        {userEmail ? (
          <>
            <button
              className="account-email"
              type="button"
              title="Manage saved progress"
              onClick={onManageAccount}
            >
              {userEmail}
            </button>
            <button className="header-account" type="button" onClick={onLogout}>
              Sign out
            </button>
          </>
        ) : (
          <button className="header-account" type="button" onClick={onOpenAuth}>
            Sign in
          </button>
        )}
        {sessionActive ? (
          <Link className="header-cta" href="/">
            New topic
          </Link>
        ) : (
          <a className="header-cta" href="#learn">
            Start learning
          </a>
        )}
      </nav>
    </header>
  );
};

export default Header;
