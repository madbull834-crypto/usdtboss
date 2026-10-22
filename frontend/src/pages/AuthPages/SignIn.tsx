import { useState } from "react";
import { useNavigate } from "react-router";
import { evmProvider } from "../../evm/client";
import MobileWalletLinks from "../../components/auth/MobileWalletLinks";

export default function SignInForm() {
  const [walletAddress, setWalletAddress] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  // Connect EVM Wallet
  async function connectWallet() {
    if (loading) return;
    const phantom = evmProvider();

    if (!phantom) {
      setMessage("No wallet was detected in this browser. Open this page inside your mobile wallet below.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const response = await phantom.connect();

      const address = response.publicKey.toString();

      if (!address) {
        setMessage("No wallet address found.");
        return;
      }

      setWalletAddress(address);
      return address;
    } catch (error) {
      setWalletAddress("");
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to connect to wallet!"
      );
    } finally {
      setLoading(false);
    }
  }

  // Login
  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;
    // Connect from the Login button too, and validate the current wallet/network.
    const address = await connectWallet();
    if (!address) return;
    navigate("/dashboard");
  }

  return (
    <>
      <div className="main-form-page">

        <div className="login-section">

          <div className="login-container">

            <div className="login-card">

              {/* =========================
                  LOGO
              ========================== */}
              <div className="login-heading">

                <a
                  href="/"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate("/");
                  }}
                >
                  <img
                    src="/web_assets/logo.png"
                    alt="USDT Boss Logo"
                  />
                </a>

              </div>

              {/* =========================
                  ERROR / SUCCESS MESSAGE
              ========================== */}
              {message && (
                <div
                  className={
                    walletAddress
                      ? "login-message success"
                      : "login-message"
                  }
                >
                  {message}
                </div>
              )}

              {!evmProvider() && <MobileWalletLinks />}

              {/* =========================
                  LOGIN FORM
              ========================== */}
              <form onSubmit={handleLogin}>

                <h4 className="login-title">
                  Login
                </h4>

                <div className="panel-form">

                  <div className="form-field">

                    <input
                      type="text"
                      className="form-control"
                      name="walletAddress"
                      value={walletAddress}
                      placeholder={
                        loading
                          ? "Connecting..."
                          : "Connecting Dapp..."
                      }
                      readOnly
                      onClick={connectWallet}
                    />

                    <span className="wallet-icon">
                      <i className="fas fa-wallet"></i>
                    </span>

                  </div>

                </div>

                {/* =========================
                    LOGIN BUTTON
                ========================== */}
                <div className="login-btn">

                  <button
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? "Connecting..." : "Login"}
                  </button>

                </div>

              </form>

              {/* =========================
                  REGISTER
              ========================== */}
              <div className="create-acc">

                <p>
                  Still no account?{" "}

                  <button
                    type="button"
                    className="register-link"
                    onClick={() => navigate("/register" + window.location.search)}
                  >
                    Create new account
                  </button>
                </p>

              </div>

            </div>

          </div>

        </div>

      </div>

      {/* =================================================
          INLINE CSS
      ================================================== */}
      <style>{`

        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100%;
        }

        /* ================================================
           MAIN LOGIN PAGE
        ================================================= */

        .main-form-page {
          width: 100%;
          min-height: 100vh;

          position: relative;

          overflow: hidden;

          background-color: #050505;

          background-image:
            linear-gradient(
              rgba(0, 0, 0, 0.28),
              rgba(0, 0, 0, 0.55)
            ),
            url("https://usdtboss.live/Assets/img/backImage.png");

          background-repeat: no-repeat;

          background-position:
            center center;

          background-size: cover;
        }

        /* ================================================
           GOLD GLOW / BACKGROUND EFFECT
        ================================================= */

        .main-form-page::before {
          content: "";

          position: absolute;

          inset: 0;

          pointer-events: none;

          background:
            radial-gradient(
              circle at 50% 50%,
              rgba(255, 183, 36, 0.10) 0%,
              rgba(0, 0, 0, 0.15) 35%,
              rgba(0, 0, 0, 0.70) 100%
            );
        }

        /* ================================================
           LOGIN SECTION
        ================================================= */

        .login-section {
          position: relative;

          z-index: 2;

          width: 100%;
          min-height: 100vh;

          display: flex;

          align-items: center;

          justify-content: center;

          padding: 30px 20px;
        }

        /* ================================================
           CONTAINER
        ================================================= */

        .login-container {
          width: 100%;

          max-width: 430px;

          display: flex;

          justify-content: center;

          align-items: center;
        }

        /* ================================================
           LOGIN CARD
        ================================================= */

        .login-card {
          width: 100%;

          padding: 35px 38px 25px;

          background:
            rgba(8, 8, 8, 0.72);

          border:

            1px solid
            rgba(220, 166, 45, 0.65);

          border-radius: 8px;

          box-shadow:

            0 0 25px
            rgba(213, 158, 35, 0.16),

            inset 0 0 30px
            rgba(255, 190, 50, 0.035);

          backdrop-filter: blur(5px);
        }

        /* ================================================
           LOGO
        ================================================= */

        .login-heading {
          width: 100%;

          display: flex;

          justify-content: center;

          align-items: center;

          margin-bottom: 10px;
        }

        .login-heading a {
          display: inline-flex;

          align-items: center;

          justify-content: center;
        }

        .login-heading img {
          width: 125px;

          max-width: 100%;

          height: auto;

          display: block;

          border-radius: 10px;

          filter:

            drop-shadow(
              0 0 12px
              rgba(255, 190, 40, 0.35)
            );
        }

        /* ================================================
           LOGIN TITLE
        ================================================= */

        .login-title {
          color: #ffffff;

          text-align: center;

          font-size: 19px;

          font-weight: 600;

          margin:

            5px 0
            20px;

          letter-spacing: 0.3px;
        }

        /* ================================================
           MESSAGE
        ================================================= */

        .login-message {
          width: 100%;

          text-align: center;

          color: #ff5c5c;

          font-size: 12px;

          line-height: 18px;

          margin-bottom: 12px;
        }

        .login-message.success {
          color: #4ade80;
        }

        /* ================================================
           FORM FIELD
        ================================================= */

        .panel-form {
          width: 100%;

          margin-bottom: 18px;
        }

        .form-field {
          position: relative;

          width: 100%;
        }

        .form-control {
          width: 100%;

          height: 48px;

          padding:

            0 48px
            0 15px;

          color: #ffffff;

          background:

            rgba(0, 0, 0, 0.32) !important;

          border:

            1px solid
            rgba(255, 255, 255, 0.28);

          border-radius: 5px;

          outline: none;

          font-size: 13px;

          transition: all 0.25s ease;
        }

        .form-control::placeholder {
          color: #bcbcbc;

          opacity: 1;
        }

        .form-control:focus {
          border-color: #dca52c;

          box-shadow:

            0 0 8px
            rgba(220, 165, 44, 0.20);
        }

        .wallet-icon {
          position: absolute;

          right: 15px;

          top: 50%;

          transform: translateY(-50%);

          color: #dca52c;

          font-size: 16px;

          pointer-events: none;
        }

        /* ================================================
           LOGIN BUTTON
        ================================================= */

        .login-btn {
          width: 100%;

          display: flex;

          justify-content: center;

          align-items: center;
        }

        .login-btn button {
          min-width: 105px;

          height: 43px;

          padding:

            0 25px;

          color: #171717;

          background:

            linear-gradient(
              180deg,
              #ffd35a 0%,
              #e0a52a 100%
            );

          border:

            1px solid
            #f1c04d;

          border-radius: 4px;

          font-size: 14px;

          font-weight: 600;

          cursor: pointer;

          transition:

            transform 0.2s ease,
            box-shadow 0.2s ease,
            opacity 0.2s ease;
        }

        .login-btn button:hover {
          transform: translateY(-1px);

          box-shadow:

            0 5px 18px
            rgba(226, 170, 39, 0.35);
        }

        .login-btn button:active {
          transform: translateY(0);
        }

        .login-btn button:disabled {
          opacity: 0.55;

          cursor: not-allowed;

          transform: none;
        }

        /* ================================================
           CREATE ACCOUNT
        ================================================= */

        .create-acc {
          width: 100%;

          text-align: center;

          margin-top: 18px;
        }

        .create-acc p {
          margin: 0;

          color: #ffffff;

          font-size: 13px;

          line-height: 20px;
        }

        .register-link {
          margin-left: 4px;

          padding: 0;

          border: 0;

          background: transparent;

          color: #31c76a;

          font-size: 13px;

          cursor: pointer;

          transition: color 0.2s ease;
        }

        .register-link:hover {
          color: #64ef98;

          text-decoration: underline;
        }

        /* ================================================
           MOBILE
        ================================================= */

        @media (max-width: 575px) {

          .login-section {
            padding: 20px 15px;
          }

          .login-card {
            padding:

              28px 22px
              22px;
          }

          .login-heading img {
            width: 105px;
          }

          .login-title {
            font-size: 18px;

            margin-bottom: 17px;
          }

          .form-control {
            height: 46px;

            font-size: 12px;
          }

          .login-btn button {
            height: 42px;

            font-size: 13px;
          }

          .create-acc p,
          .register-link {
            font-size: 12px;
          }
        }

      `}</style>
    </>
  );
}
