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
import { consumeAtPassportCallback, startAtPassport } from "./atpassport";
import { ATPASSPORT_CALLBACK_PATH } from "../../shared/homepage-routing";

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
  const [pending, setPending] = useState<
    "signin" | "create" | "atpassport" | null
  >(null);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const callbackHandled = useRef(false);

  useEffect(() => {
    if (
      callbackHandled.current ||
      window.location.pathname !== ATPASSPORT_CALLBACK_PATH
    )
      return;
    callbackHandled.current = true;
    const callback = new URL(window.location.href);
    // Remove the returned identity hints before continuing or showing errors.
    window.history.replaceState(null, "", "/#sign-in");
    try {
      const selectedHandle = consumeAtPassportCallback(
        callback,
        sessionStorage,
      );
      setHandle(selectedHandle);
      setPending("atpassport");
      window.location.replace(authUrl(gateway, selectedHandle));
    } catch (cause) {
      setPending(null);
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn’t continue with AtPassport. Please try again.",
      );
    }
  }, []);

  function loginWithAtPassport() {
    if (pending) return;
    setError(undefined);
    try {
      const destination = startAtPassport(
        window.location.origin,
        sessionStorage,
      );
      setPending("atpassport");
      window.location.assign(destination);
    } catch {
      setPending(null);
      setError(
        "Couldn’t open AtPassport. Allow session storage or enter your handle below.",
      );
    }
  }

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
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="login-atpassport"
              isDisabled={pending !== null}
              onPress={loginWithAtPassport}
            >
              {pending === "atpassport" ? (
                <>
                  <LoaderCircle className="login-spinner" size={18} />{" "}
                  Connecting with AtPassport…
                </>
              ) : (
                <>
                  <svg
                    className="atpassport-mark"
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 128 128"
                    fill="currentColor"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path
                      d="M0 0 C1 0.5 2 1 3 1.5 C9.5 4.7 15.9 8.1 22.1 11.8 C25.2 13.2 27.3 13.3 30.7 12.9 C33.3 11.9 33.3 11.9 35.8 10.5 C44.4 5.8 54.9 5.7 64.5 7.5 C67.3 8.4 69.5 9.8 71.8 11.7 C73.2 15.3 72.9 17.3 71.7 20.9 C64.5 26.2 56.2 29.7 48.1 33.6 C46.6 34.3 45.2 35 43.7 35.7 C40 37.5 36.3 39.2 32.7 41 C29.9 42.3 27 43.7 24.2 45 C20.5 46.8 16.8 48.6 13.2 50.3 C9.2 52.2 5.3 54.1 1.3 56 C0.3 56.5 -0.8 57 -1.8 57.6 C-3.9 58.5 -5.9 59.5 -7.9 60.5 C-8.8 60.9 -9.7 61.4 -10.6 61.8 C-11.4 62.2 -12.2 62.6 -13 63 C-18.7 65.3 -24.9 66.1 -30.8 64.1 C-36.8 61.3 -41 57.8 -45.3 52.9 C-46 52.2 -46.6 51.6 -47.3 50.9 C-52.6 45 -52.6 45 -53.3 40.9 C-52 40.1 -50.7 39.3 -49.4 38.5 C-48.7 38 -48 37.6 -47.3 37.1 C-43.7 34.9 -41.5 34.6 -37.3 34.9 C-34.4 36.3 -31.8 38 -29.1 39.7 C-25.5 41.3 -24.1 41.1 -20.3 39.9 C-16.9 38.4 -13.7 36.7 -10.4 34.9 C-9.1 34.2 -9.1 34.2 -7.8 33.4 C-5.6 32.3 -3.5 31.1 -1.3 29.9 C-3.6 26.9 -5.9 24.2 -8.8 21.8 C-13 18.3 -17 14.6 -21 10.8 C-24 8.1 -27.1 5.5 -30.3 2.9 C-30.3 0.6 -30.3 0.6 -29.3 -2.1 C-18.8 -7.6 -10.1 -5.2 0 0 Z"
                      transform="translate(54.3,21.1)"
                    />
                    <path
                      d="M0 0 C1 -0 2.1 -0 3.2 -0 C4.3 -0 5.5 -0 6.7 -0 C7.9 -0 9.1 -0 10.3 -0 C13.6 -0 17 -0 20.3 -0 C23.8 -0 27.2 -0 30.7 -0 C36.5 -0 42.4 -0 48.2 -0 C54.9 0 61.7 0 68.4 -0 C74.2 -0 80 -0 85.8 -0 C89.2 -0 92.7 -0 96.1 -0 C100 -0 103.8 -0 107.7 -0 C109.4 -0 109.4 -0 111.2 -0 C112.8 -0 112.8 -0 114.4 0 C115.3 0 116.2 0 117.1 0 C119.2 0.1 119.2 0.1 120.2 1.1 C120.3 3.1 120.3 5.1 120.3 7.1 C120.3 8.8 120.3 8.8 120.3 10.4 C120.2 13.1 120.2 13.1 119.2 14.1 C117.6 14.2 116 14.3 114.4 14.3 C113.3 14.3 112.3 14.3 111.2 14.3 C110 14.3 108.9 14.3 107.7 14.3 C106.5 14.3 105.3 14.3 104 14.3 C100.7 14.3 97.4 14.3 94.1 14.3 C90.6 14.3 87.1 14.3 83.7 14.3 C77.8 14.3 72 14.3 66.2 14.3 C59.4 14.3 52.7 14.3 45.9 14.3 C40.2 14.3 34.4 14.3 28.6 14.3 C25.1 14.3 21.7 14.3 18.2 14.3 C14.4 14.3 10.5 14.3 6.7 14.3 C4.9 14.3 4.9 14.3 3.2 14.3 C1.6 14.3 1.6 14.3 0 14.3 C-0.9 14.3 -1.8 14.3 -2.8 14.3 C-4.8 14.1 -4.8 14.1 -5.8 13.1 C-5.9 11.1 -6 9.1 -5.9 7.1 C-5.9 6 -6 4.9 -6 3.8 C-5.7 -0.7 -4.1 0 0 0 Z"
                      transform="translate(6.8,97.9)"
                    />
                  </svg>{" "}
                  Login with @atpassport <ArrowUpRight size={17} />
                </>
              )}
            </Button>
            <p className="login-atpassport-hint">
              Choose a saved handle, then continue to sign in.
            </p>
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
