
import { useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { signIn } from "../lib/ecovision/auth";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await signIn(email.trim(), password);
      await navigate({ to: "/dashboard" });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="eco-login">
      <video
        className="eco-login__video"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src="/videos/wildlife-bg.mp4" type="video/mp4" />
      </video>

      <div className="eco-login__overlay" />

      <div className="eco-login__content">
        <section className="eco-login__card">
          <header className="eco-login__brand">
            <svg
              viewBox="0 0 40 40"
              fill="none"
              className="eco-login__logo"
              aria-hidden="true"
            >
              <path
                d="M20 34C10 28 7 19 12 7C24 8 32 15 32 24C32 30 27 34 20 34Z"
                fill="#329B68"
              />
              <path
                d="M13 12L21 31"
                stroke="#D4F3DE"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>

            <h1>EcoVision</h1>
            <p>Wildlife Monitoring Platform</p>
          </header>

          <form onSubmit={handleSubmit}>
            <div className="eco-login__field">
              <label htmlFor="eco-email">Email address</label>
              <input
                id="eco-email"
                type="email"
                placeholder="you@example.com"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className="eco-login__field">
              <label htmlFor="eco-password">Password</label>
              <input
                id="eco-password"
                type="password"
                placeholder="Enter your password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>

            {error && (
              <div className="eco-login__error" role="alert">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="eco-login__secure">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>Protected by Supabase</span>
          </div>
        </section>
      </div>

      <style>{`
        .eco-login {
          position: relative;
          isolation: isolate;
          min-height: 100vh;
          min-height: 100svh;
          width: 100%;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 28px 18px;
          box-sizing: border-box;
          background: #07140e;
          color: #f5f8f5;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system,
            BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        .eco-login *,
        .eco-login *::before,
        .eco-login *::after {
          box-sizing: border-box;
        }

        .eco-login__video {
          position: absolute;
          z-index: -3;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
        }

        .eco-login__overlay {
          position: absolute;
          z-index: -2;
          inset: 0;
          background:
            radial-gradient(
              ellipse at center,
              rgba(4, 15, 9, 0.30) 0%,
              rgba(3, 12, 7, 0.66) 60%,
              rgba(2, 9, 5, 0.84) 100%
            ),
            linear-gradient(
              180deg,
              rgba(3, 12, 7, 0.46),
              rgba(3, 12, 7, 0.20) 45%,
              rgba(3, 12, 7, 0.72)
            );
          backdrop-filter: blur(2px);
        }

        .eco-login__content {
          width: 100%;
          max-width: 384px;
          margin: auto;
          animation: eco-login-appear 650ms ease-out both;
        }

        .eco-login__card {
          padding: 32px;
          border: 1px solid rgba(226, 245, 231, 0.16);
          border-radius: 9px;
          background: rgba(9, 22, 15, 0.84);
          box-shadow:
            0 28px 90px rgba(0, 0, 0, 0.38),
            inset 0 1px 0 rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(22px);
          -webkit-backdrop-filter: blur(22px);
        }

        .eco-login__brand {
          text-align: center;
          margin-bottom: 28px;
        }

        .eco-login__logo {
          display: block;
          width: 38px;
          height: 38px;
          margin: 0 auto 8px;
        }

        .eco-login__brand h1 {
          margin: 0;
          font-size: 25px;
          line-height: 1.3;
          font-weight: 600;
          letter-spacing: -0.7px;
        }

        .eco-login__brand p {
          margin: 7px 0 0;
          color: #a6afa8;
          font-size: 12px;
          font-weight: 400;
        }

        .eco-login__field {
          margin-bottom: 20px;
        }

        .eco-login__field label {
          display: block;
          margin-bottom: 9px;
          color: #e5e9e5;
          font-size: 12px;
          font-weight: 400;
        }

        .eco-login__field input {
          display: block;
          width: 100%;
          min-width: 0;
          height: 42px;
          padding: 0 12px;
          border: 1px solid #39443d;
          border-radius: 5px;
          outline: none;
          background: rgba(255, 255, 255, 0.025);
          color: #fff;
          font: inherit;
          font-size: 13px;
          transition: border-color 150ms ease,
            background 150ms ease;
        }

        .eco-login__field input::placeholder {
          color: #828b84;
        }

        .eco-login__field input:focus {
          border-color: #54ad7c;
          background: rgba(255, 255, 255, 0.045);
        }

        .eco-login__card button {
          display: block;
          width: 100%;
          min-height: 42px;
          margin-top: 2px;
          border: 0;
          border-radius: 5px;
          background: #278b5c;
          color: #fff;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: background 150ms ease;
        }

        .eco-login__card button:hover:not(:disabled) {
          background: #329c6b;
        }

        .eco-login__card button:disabled {
          opacity: 0.7;
          cursor: wait;
        }

        .eco-login__error {
          margin: 0 0 16px;
          padding: 10px 12px;
          border: 1px solid rgba(252, 165, 165, 0.28);
          border-radius: 5px;
          background: rgba(127, 29, 29, 0.25);
          color: #fecaca;
          font-size: 12px;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .eco-login__secure {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          margin-top: 27px;
          color: #8f9b92;
          font-size: 11px;
        }

        .eco-login__secure svg {
          flex-shrink: 0;
        }

        @keyframes eco-login-appear {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 480px) {
          .eco-login {
            padding: 20px 15px;
          }

          .eco-login__card {
            padding: 27px 23px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .eco-login__content {
            animation: none;
          }

          .eco-login__card button {
            transition: none;
          }
        }
      `}</style>
    </main>
  );
}
