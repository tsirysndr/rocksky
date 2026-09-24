import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@heroui/react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Eye,
  EyeOff,
  LockKeyhole,
  Globe2,
  Headphones,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { authUrl, handleError, normalizeHandle, passwordSignIn } from "./auth";
import { storeSessionToken } from "../../shared/browser-session";
import { appUrl } from "./data";

const gateway =
  import.meta.env.VITE_ROCKSKY_AUTH_URL || "https://rocksky.pages.dev/loading";

export default function LoginScreen() {
  const [passwordLogin, setPasswordLogin] = useState(
    new URLSearchParams(window.location.search).get("login") === "password",
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<"signin" | "create" | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const title = document.title;
    document.title = "Sign in — Rocksky";
    window.scrollTo(0, 0);
    heading.current?.focus({ preventScroll: true });
    const reset = () => setPending(null);
    window.addEventListener("pageshow", reset);
    return () => {
      document.title = title;
      window.removeEventListener("pageshow", reset);
    };
  }, []);

  function continueToAccount(create = false) {
    if (pending) return;
    const validation = create ? undefined : handleError(handle);
    if (validation) {
      setError(validation);
      input.current?.focus();
      return;
    }
    setError(undefined);
    setPending(create ? "create" : "signin");
    try {
      window.location.assign(authUrl(gateway, create ? undefined : handle));
    } catch {
      setPending(null);
      setError("We couldn’t open sign-in. Please try again.");
    }
  }

  function chooseLoginMode(usePassword: boolean) {
    setPasswordLogin(usePassword);
    setPassword("");
    setShowPassword(false);
    setError(undefined);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordLogin) return continueToAccount();
    if (pending) return;
    if (window.location.origin !== new URL(appUrl).origin) {
      const destination = new URL(appUrl);
      destination.searchParams.set("login", "password");
      destination.hash = "sign-in";
      window.location.assign(destination.href);
      return;
    }
    const validation = handleError(handle);
    if (validation || !password.trim()) {
      setError(validation || "Enter your password to continue.");
      (validation ? input : passwordInput).current?.focus();
      return;
    }
    setError(undefined);
    setPending("signin");
    try {
      const token = await passwordSignIn(
        import.meta.env.VITE_ROCKSKY_API_URL || "https://api.rocksky.app",
        handle,
        password,
      );
      storeSessionToken(token);
      setPassword("");
      window.location.assign(new URL("/?__rocksky_app=1", appUrl).href);
    } catch (cause) {
      setPending(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Sign-in failed. Please try again.",
      );
    }
  }

  return (
    <div className="login-screen">
      <header className="login-header site-header">
        <div className="container nav-bar">
          <a className="brand" href="#" aria-label="Rocksky home">
            Rocksky
          </a>
          <a className="login-back" href="#">
            <ArrowLeft size={16} /> Back to Rocksky
          </a>
        </div>
      </header>
      <main className="login-layout container">
        <section className="login-story" aria-labelledby="login-story-title">
          <div className="eyebrow">
            <span className="live-dot" /> YOUR ROCKSKY ACCOUNT
          </div>
          <h2 id="login-story-title">
            Put another
            <br />
            record <em>on.</em>
          </h2>
          <p>
            Sign in to check your recent listens,
            <br />
            see your stats, and catch up with
            <br />
            the people you follow.
          </p>
          <div className="login-record-scene" aria-hidden="true">
            <div className="login-record-orbit" />
            <span className="login-spark spark-a">✦</span>
            <span className="login-spark spark-b">✧</span>
            <div className="login-record">
              <div className="vinyl">
                <div className="vinyl-label">
                  <AudioLines size={32} />
                  <span>Rocksky</span>
                  <div className="spindle" />
                  <small>SIDE A</small>
                </div>
              </div>
            </div>
            <div className="login-record-caption">
              <Headphones size={20} />
              <div>
                <strong>Your listening history</strong>
                <span>Scrobbles, albums, and artists.</span>
              </div>
              <span className="equalizer">
                <i />
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
          <div className="login-story-note">
            <span>SCROBBLES.</span>
            <span>STATS.</span>
            <span>FRIENDS.</span>
          </div>
        </section>
        <section className="login-form-section" aria-labelledby="login-title">
          <div className="login-form-content">
            <span className="login-account-icon">
              <Globe2 size={26} />
            </span>
            <div className="eyebrow">SIGN IN</div>
            <h1 id="login-title" ref={heading} tabIndex={-1}>
              Welcome to Rocksky.
            </h1>
            <p className="login-intro">Sign in with your Atmosphere Account.</p>
            <form onSubmit={submit} noValidate aria-busy={pending !== null}>
              <div
                className="login-methods"
                role="group"
                aria-label="Sign-in method"
              >
                <button
                  type="button"
                  aria-pressed={!passwordLogin}
                  disabled={pending !== null}
                  onClick={() => chooseLoginMode(false)}
                >
                  OAuth Login
                </button>
                <button
                  type="button"
                  aria-pressed={passwordLogin}
                  disabled={pending !== null}
                  onClick={() => chooseLoginMode(true)}
                >
                  Password Login
                </button>
              </div>
              <label className="login-label" htmlFor="atmosphere-handle">
                Your Atmosphere handle
              </label>
              <div
                className={`login-handle-field ${error ? "login-field-error" : ""}`}
              >
                <span aria-hidden="true">@</span>
                <input
                  ref={input}
                  id="atmosphere-handle"
                  name="handle"
                  type="text"
                  value={handle}
                  onChange={(event) => {
                    setHandle(event.target.value);
                    setError(undefined);
                  }}
                  onBlur={() => setHandle(normalizeHandle(handle))}
                  placeholder="you.bsky.social"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={254}
                  required
                  disabled={pending !== null}
                  aria-invalid={!!error}
                  aria-describedby={
                    error ? "login-hint login-error" : "login-hint"
                  }
                />
              </div>
              <p id="login-hint" className="login-hint">
                Your Bluesky handle or a custom domain works here.
              </p>
              {passwordLogin && (
                <div className="login-password">
                  <label className="login-label" htmlFor="account-password">
                    Password
                  </label>
                  <div className="login-handle-field">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      ref={passwordInput}
                      id="account-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value);
                        setError(undefined);
                      }}
                      placeholder="Your password or app password"
                      autoComplete="current-password"
                      required
                      disabled={pending !== null}
                      aria-invalid={!!error}
                      aria-describedby={error ? "login-error" : undefined}
                    />
                    <button
                      type="button"
                      className="login-password-toggle"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      aria-pressed={showPassword}
                      disabled={pending !== null}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
              )}
              {error && (
                <p className="login-error" id="login-error" role="alert">
                  {error}
                </p>
              )}
              <Button
                type="submit"
                className="login-submit"
                size="lg"
                isDisabled={pending !== null}
              >
                {pending === "signin" ? (
                  <>
                    <LoaderCircle className="login-spinner" size={18} /> Signing
                    in…
                  </>
                ) : (
                  <>
                    {passwordLogin
                      ? "Sign in with password"
                      : "Continue with OAuth"}{" "}
                    <ArrowRight size={18} />
                  </>
                )}
              </Button>
              <div className="login-trust">
                <ShieldCheck size={16} />
                <span>
                  {passwordLogin
                    ? "Use your account password or an app password."
                    : "You’ll sign in securely with your account provider."}
                </span>
              </div>
            </form>
            <div className="login-divider">
              <span>CREATE AN ACCOUNT</span>
            </div>
            <p className="login-create-copy">
              Don't have an atproto handle yet?
            </p>
            <div className="login-create-options">
              You can create one at{" "}
              <button
                type="button"
                onClick={() => continueToAccount(true)}
                disabled={pending !== null}
              >
                selfhosted.social
              </button>
              ,{" "}
              <a
                href="https://bsky.app"
                target="_blank"
                rel="noopener noreferrer"
              >
                Bluesky
              </a>{" "}
              or any other AT Protocol service.
            </div>
            <p className="login-help">
              Need help signing in?{" "}
              <a
                href="https://docs.rocksky.app/quickstart"
                target="_blank"
                rel="noopener noreferrer"
              >
                Read the getting started guide <ArrowUpRight size={12} />
              </a>
            </p>
          </div>
        </section>
      </main>
      <footer className="login-footer container">
        <span>
          Baked with <span className="login-heart">♥</span> in Antananarivo ©
          2026 Rocksky
        </span>
        <a href="https://atproto.com" target="_blank" rel="noopener noreferrer">
          Built on AT Protocol <ArrowUpRight size={13} />
        </a>
      </footer>
    </div>
  );
}
