import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { CHAIN_ID, evmProvider, getRegistrationReadiness, mintTestTokens, registerEvm, type RegistrationReadiness } from "../../evm/client";
import MobileWalletLinks from "../../components/auth/MobileWalletLinks";

const NETWORK_NAME = CHAIN_ID === 56 ? "BNB Smart Chain" : CHAIN_ID === 97 ? "BNB Smart Chain Testnet" : CHAIN_ID === 31337 ? "Local Hardhat" : "chain " + CHAIN_ID;
const GAS_SYMBOL = CHAIN_ID === 56 ? "BNB" : CHAIN_ID === 97 ? "tBNB" : CHAIN_ID === 31337 ? "ETH" : "native";
const FAUCET_URL = CHAIN_ID === 97 ? "https://www.bnbchain.org/en/testnet-faucet" : "";

export default function SignUpForm() {
  const navigate = useNavigate();

  // Only use a sponsor that was supplied by an actual referral link. A direct
  // visit must not silently credit the contract's bootstrap/root account.
  const [linkedSponsor] = useState(
    () => new URLSearchParams(window.location.search).get("ref")?.trim() ?? ""
  );
  const [sponsorId, setSponsorId] = useState(linkedSponsor);
  const [walletAddress, setWalletAddress] = useState("");
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"info" | "error" | "success">("info");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("");
  const [ready, setReady] = useState<RegistrationReadiness | null>(null);

  const say = useCallback((text: string, kind: "info" | "error" | "success" = "info") => {
    setTone(kind);
    setMessage(text);
  }, []);

  // Readiness drives the button state, so the page can explain what is missing
  // before the user clicks Register and waits for a wallet prompt that the
  // preflight would never reach.
  const refresh = useCallback(async () => {
    const state = await getRegistrationReadiness(sponsorId.trim() || undefined);
    setReady(state);
    if (state.address) setWalletAddress(state.address);
    return state;
  }, [sponsorId]);

  useEffect(() => {
    void refresh();
    const onUpdate = () => void refresh();
    window.addEventListener("boss:updated", onUpdate);
    return () => window.removeEventListener("boss:updated", onUpdate);
  }, [refresh]);

  async function connectWallet() {
    const wallet = evmProvider();

    if (!wallet) {
      say("No wallet was detected in this browser. Open this page inside your mobile wallet below.", "error");
      return;
    }

    try {
      setLoading(true);
      say("Approve the connection request in your wallet.");

      const response = await wallet.connect();
      const address = response.publicKey.toString();

      if (!address) {
        say("Your wallet returned no address. Unlock it and try again.", "error");
        return;
      }

      setWalletAddress(address);
      const state = await refresh();
      say(state.funded ? "Wallet connected. You are ready to register." : "Wallet connected.", "success");
    } catch (error) {
      const code = (error as { code?: number }).code;
      say(
        code === 4001
          ? "You rejected the connection request in your wallet."
          : error instanceof Error
            ? error.message
            : "Unable to connect to your wallet.",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }

  // One button drives the whole path: connect, switch network, mint the test
  // tokens, approve, join. A new user should never have to work out which
  // prerequisite is missing or what order to do things in.
  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (loading) return;

    if (!sponsorId.trim()) {
      say("Enter a sponsor address or user ID.", "error");
      return;
    }

    setLoading(true);
    try {
      let state = await refresh();

      if (!state.walletDetected) {
        say("No wallet was detected in this browser. Open this page inside your mobile wallet below.", "error");
        return;
      }

      // Connect covers the network switch too: the provider prompts to add or
      // switch to the configured chain before returning.
      if (!state.address || !state.chainOk) {
        setStep("Connecting your wallet");
        const wallet = evmProvider();
        if (!wallet) {
          say("No wallet was detected in this browser. Open this page inside your mobile wallet below.", "error");
          return;
        }
        await wallet.connect();
        state = await refresh();
        if (!state.address) {
          say("Your wallet returned no address. Unlock it and try again.", "error");
          return;
        }
        if (!state.chainOk) {
          say("Your wallet is still on the wrong network. Switch it to " + NETWORK_NAME + ".", "error");
          return;
        }
      }

      if (state.joined) {
        say("This wallet is already registered. Opening your dashboard.", "success");
        navigate("/dashboard" + window.location.search);
        return;
      }

      if (!state.hasGas) {
        say(
          "You have no " + GAS_SYMBOL + " for gas. Get some from the faucet linked below, then try again.",
          "error"
        );
        return;
      }

      if (state.sponsorOk === false) {
          say("That sponsor is not registered. Check the address or user ID.", "error");
        return;
      }

      const total = state.funded ? 1 : 2;

      if (!state.funded) {
        if (!state.canFund) {
          say("You need " + state.required + " USDT to register.", "error");
          return;
        }
        setStep("Step 1 of " + total + " — adding test USDT");
        await mintTestTokens((text) => say(text));
        state = await refresh();
        if (!state.funded) {
          say("Funding did not arrive. Try again in a moment.", "error");
          return;
        }
      }

      setStep("Step " + total + " of " + total + " — registering");
      await registerEvm(sponsorId.trim(), (text) => say(text));
      say("Registered. Opening your dashboard.", "success");
      navigate("/dashboard" + window.location.search);
    } catch (error) {
      const code = (error as { code?: number }).code;
      say(
        code === 4001
          ? "You rejected the request in your wallet. Nothing was charged — press Register to try again."
          : error instanceof Error
            ? error.message
            : "Registration failed.",
        "error"
      );
      void refresh();
    } finally {
      setStep("");
      setLoading(false);
    }
  }

  const connected = Boolean(ready?.address);
  const alreadyJoined = connected && Boolean(ready?.joined);
  const needsFunding = connected && ready !== null && !ready.funded && ready.canFund && !ready.joined;
  const selfSponsor =
    connected &&
    !alreadyJoined &&
    sponsorId.trim().toLowerCase() === (ready?.address ?? "").toLowerCase();
  // A missing test-token balance is not worth warning about: pressing Register
  // mints it as step one. Only surface what the user has to resolve themselves.
  const showBlocker =
    connected && Boolean(ready?.blocker) && !alreadyJoined && !needsFunding;

  return (
    <>
      <div className="register-page">

        {/* Background */}
        <div className="register-background"></div>

        {/* Dark Overlay */}
        <div className="register-overlay"></div>

        <div className="register-section">

          <div className="register-container">

            <div className="register-card">

              {/* =========================
                  LOGO
              ========================== */}

              <div className="register-logo">

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
                  MESSAGE
              ========================== */}

              {message && (
                <div className={"register-alert " + tone} role="status">
                  <span className="register-alert-icon">
                    {tone === "error" ? "!" : tone === "success" ? "✓" : "ℹ"}
                  </span>
                  <span className="register-alert-text">{message}</span>
                </div>
              )}

              {/* =========================
                  READINESS PANEL
              ========================== */}

              <div className="register-status">

                <div className="status-row">
                  <span className="status-label">Network</span>
                  <span className={"status-value " + (ready && !ready.chainOk && connected ? "bad" : "ok")}>
                    {NETWORK_NAME}
                  </span>
                </div>

                <div className="status-row">
                  <span className="status-label">Wallet</span>
                  <span className={"status-value " + (connected ? "ok" : "muted")}>
                    {connected
                      ? walletAddress.slice(0, 6) + "..." + walletAddress.slice(-4)
                      : "Not connected"}
                  </span>
                </div>

                <div className="status-row">
                  <span className="status-label">{CHAIN_ID === 56 ? "USDT" : "Test USDT"}</span>
                  <span className={"status-value " + (!connected || alreadyJoined ? "muted" : ready?.funded ? "ok" : "bad")}>
                    {alreadyJoined
                      ? "Not needed"
                      : connected && ready
                        ? ready.balance + " / " + ready.required + " needed"
                        : ready?.required
                          ? ready.required + " required"
                          : "--"}
                  </span>
                </div>

                <div className="status-row">
                  <span className="status-label">Gas</span>
                  <span className={"status-value " + (!connected ? "muted" : ready?.hasGas ? "ok" : "bad")}>
                    {connected && ready
                      ? ready.hasGas
                        ? Number(ready.gas.toFixed(4)) + " " + GAS_SYMBOL
                        : "No " + GAS_SYMBOL
                      : "--"}
                  </span>
                </div>

              </div>

              {alreadyJoined ? (
                <div className="register-joined">
                  <strong>This wallet is already registered.</strong>
                  <span>
                    Open your dashboard, or switch to a different account in
                    your wallet to register a new member.
                  </span>
                  <button
                    type="button"
                    className="btn-dashboard"
                    onClick={() => navigate("/dashboard")}
                  >
                    Go to dashboard
                  </button>
                </div>
              ) : showBlocker && (
                <div className="register-blocker">
                  {ready?.blocker}
                  {ready && !ready.hasGas && " Use the faucet link below, then press Register."}
                </div>
              )}

              {selfSponsor && (
                <div className="register-blocker">
                  The sponsor is your own wallet. Enter the address of the
                  member who invited you.
                </div>
              )}

              {/* =========================
                  FORM
              ========================== */}

              <form onSubmit={handleRegister}>

                <h4 className="register-title">
                  Register
                </h4>

                {/* =====================
                    SPONSOR ID
                ====================== */}

                <div className="form-field">

                  <label className="field-label" htmlFor="sponser_id">
                    Sponsor address or user ID
                    {ready?.sponsorOk === false && (
                      <span className="field-warn"> &mdash; not registered</span>
                    )}
                  </label>

                  <input
                    id="sponser_id"
                    type="text"
                    name="sponser_id"
                    value={sponsorId}
                    readOnly={Boolean(linkedSponsor)}
                    onChange={(e) =>
                      setSponsorId(e.target.value)
                    }
                    className="form-control"
                    placeholder="Enter the member who invited you"
                    autoComplete="off"
                  />

                  <span className="field-icon">
                    <i className="fas fa-user"></i>
                  </span>

                </div>

                {/* =====================
                    WALLET
                ====================== */}

                <div className="form-field">

                  <label className="field-label" htmlFor="walletAddress">
                    Your wallet
                  </label>

                  <input
                    id="walletAddress"
                    type="text"
                    name="walletAddress"
                    value={walletAddress}
                    placeholder={
                      loading
                        ? "Connecting..."
                        : "Click to connect your wallet"
                    }
                    className="form-control"
                    readOnly
                    onClick={connectWallet}
                  />

                  <span className="field-icon">
                    <i className="fas fa-wallet"></i>
                  </span>

                </div>

                {/* =====================
                    HIDDEN VALUES
                ====================== */}

                <input
                  type="hidden"
                  name="lvlUser"
                  value="1"
                />

                <input
                  type="hidden"
                  name="amount"
                  value="30"
                />

                <input
                  type="hidden"
                  name="position"
                  value="left"
                />

                {/* =====================
                    CONNECT / REGISTER
                ====================== */}

                <div className="register-actions">

                  {ready === null ? (
                    // Until the first readiness check lands we cannot tell a
                    // connected wallet from a fresh visitor; guessing would
                    // show Connect Wallet and then swap it out under a click.
                    <button type="button" className="btn-primary" disabled>
                      Checking wallet...
                    </button>
                  ) : !connected ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={connectWallet}
                      disabled={loading}
                    >
                      {loading ? "Connecting..." : "Connect Wallet"}
                    </button>
                  ) : alreadyJoined ? null : (
                    <>
                      <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading || selfSponsor}
                      >
                        {loading ? step || "Check your wallet..." : "Register"}
                      </button>

                      {!loading && !selfSponsor && (
                        <p className="register-hint">
                          Costs {ready?.required ?? 30} test USDT.{" "}
                          {needsFunding
                            ? "One click does everything: it adds your test USDT, then registers you. Confirm each request in your wallet."
                            : "Your wallet will ask you to confirm twice: the token approval, then the registration."}
                        </p>
                      )}
                    </>
                  )}

                  {ready && !ready.walletDetected && <MobileWalletLinks />}

                  {connected && !alreadyJoined && ready && !ready.hasGas && FAUCET_URL && (
                    <a
                      className="faucet-link"
                      href={FAUCET_URL}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Get free {GAS_SYMBOL} from the faucet &rarr;
                    </a>
                  )}

                </div>

              </form>

              {/* =========================
                  LOGIN
              ========================== */}

              <div className="already-account">

                <p>
                  Already have account?{" "}

                  <button
                    type="button"
                    onClick={() => navigate("/login" + window.location.search)}
                  >
                    Login
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
           MAIN PAGE
        ================================================= */

        .register-page {
          position: relative;

          width: 100%;
          min-height: 100vh;

          overflow: hidden;

          background-color: #050505;

          background-image:
            linear-gradient(
              rgba(0, 0, 0, 0.28),
              rgba(0, 0, 0, 0.58)
            ),
            url("https://usdtboss.live/Assets/img/backImage.png");

          background-repeat: no-repeat;

          background-position: center center;

          background-size: cover;
        }

        /* ================================================
           BACKGROUND GLOW
        ================================================= */

        .register-page::before {
          content: "";

          position: absolute;

          inset: 0;

          pointer-events: none;

          background:
            radial-gradient(
              circle at center,

              rgba(
                255,
                183,
                36,
                0.10
              ) 0%,

              rgba(
                0,
                0,
                0,
                0.15
              ) 35%,

              rgba(
                0,
                0,
                0,
                0.72
              ) 100%
            );
        }

        /* ================================================
           OVERLAY
        ================================================= */

        .register-overlay {
          position: absolute;

          inset: 0;

          background:
            linear-gradient(
              90deg,
              rgba(0, 0, 0, 0.35),
              rgba(0, 0, 0, 0.10),
              rgba(0, 0, 0, 0.35)
            );

          z-index: 1;
        }

        /* ================================================
           SECTION
        ================================================= */

        .register-section {
          position: relative;

          z-index: 5;

          width: 100%;

          min-height: 100vh;

          display: flex;

          align-items: center;

          justify-content: center;

          padding: 25px 20px;
        }

        /* ================================================
           CONTAINER
        ================================================= */

        .register-container {
          width: 100%;

          max-width: 430px;
        }

        /* ================================================
           CARD
        ================================================= */

        .register-card {
          width: 100%;

          padding:

            30px
            38px
            23px;

          background:

            rgba(
              8,
              8,
              8,
              0.73
            );

          border:

            1px solid
            rgba(
              220,
              166,
              45,
              0.65
            );

          border-radius: 8px;

          box-shadow:

            0 0 25px
            rgba(
              213,
              158,
              35,
              0.16
            ),

            inset 0 0 30px
            rgba(
              255,
              190,
              50,
              0.035
            );

          backdrop-filter: blur(5px);
        }

        /* ================================================
           LOGO
        ================================================= */

        .register-logo {
          width: 100%;

          display: flex;

          justify-content: center;

          align-items: center;

          margin-bottom: 10px;
        }

        .register-logo a {
          display: flex;

          justify-content: center;

          align-items: center;
        }

        .register-logo img {
          width: 125px;

          height: auto;

          display: block;

          border-radius: 10px;

          filter:

            drop-shadow(
              0 0 12px
              rgba(
                255,
                190,
                40,
                0.35
              )
            );
        }

        /* ================================================
           MESSAGE
        ================================================= */

        .register-message {
          width: 100%;

          text-align: center;

          color: #ff5c5c;

          font-size: 12px;

          line-height: 18px;

          margin-bottom: 10px;
        }

        .register-message.success {
          color: #4ade80;
        }

        /* ================================================
           ALERT
        ================================================= */

        .register-alert {
          display: flex;
          align-items: flex-start;
          gap: 9px;

          width: 100%;

          padding: 10px 12px;
          margin-bottom: 14px;

          border-radius: 6px;

          font-size: 13px;
          line-height: 19px;

          border: 1px solid transparent;

          word-break: break-word;
        }

        .register-alert-icon {
          flex: 0 0 18px;

          width: 18px;
          height: 18px;

          margin-top: 1px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 50%;

          font-size: 11px;
          font-weight: 700;
        }

        .register-alert.error {
          color: #ffc9c9;
          background: rgba(190, 40, 40, 0.16);
          border-color: rgba(255, 92, 92, 0.5);
        }

        .register-alert.error .register-alert-icon {
          color: #2b0000;
          background: #ff5c5c;
        }

        .register-alert.success {
          color: #bcf5d0;
          background: rgba(32, 150, 78, 0.15);
          border-color: rgba(74, 222, 128, 0.45);
        }

        .register-alert.success .register-alert-icon {
          color: #04220f;
          background: #4ade80;
        }

        .register-alert.info {
          color: #ffe6b0;
          background: rgba(220, 165, 44, 0.13);
          border-color: rgba(220, 165, 44, 0.45);
        }

        .register-alert.info .register-alert-icon {
          color: #221703;
          background: #dca52c;
        }

        /* ================================================
           READINESS PANEL
        ================================================= */

        .register-status {
          width: 100%;

          padding: 11px 13px;
          margin-bottom: 14px;

          background: rgba(0, 0, 0, 0.34);

          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 6px;
        }

        .status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;

          gap: 12px;

          padding: 4px 0;

          font-size: 12px;
          line-height: 18px;
        }

        .status-label {
          color: #9d9d9d;

          letter-spacing: 0.2px;
        }

        .status-value {
          font-weight: 600;

          text-align: right;

          word-break: break-all;
        }

        .status-value.ok { color: #4ade80; }
        .status-value.bad { color: #ff8f6b; }
        .status-value.muted { color: #7d7d7d; }

        /* ================================================
           ALREADY REGISTERED
        ================================================= */

        .register-joined {
          display: flex;
          flex-direction: column;

          gap: 10px;

          width: 100%;

          padding: 13px 14px;
          margin-bottom: 14px;

          background: rgba(32, 150, 78, 0.12);

          border: 1px solid rgba(74, 222, 128, 0.45);
          border-radius: 6px;
        }

        .register-joined strong {
          color: #bcf5d0;

          font-size: 13.5px;
          font-weight: 600;
        }

        .register-joined span {
          color: #a9c9b4;

          font-size: 12px;
          line-height: 18px;
        }

        .btn-dashboard {
          width: 100%;
          height: 40px;

          color: #04220f;

          background:

            linear-gradient(
              180deg,
              #35d07f 0%,
              #1c9d5a 100%
            );

          border: 1px solid #3ee08d;
          border-radius: 4px;

          font-size: 13.5px;
          font-weight: 600;

          cursor: pointer;
        }

        .btn-dashboard:hover {
          box-shadow: 0 5px 18px rgba(53, 208, 127, 0.3);
        }

        /* ================================================
           BLOCKER
        ================================================= */

        .register-blocker {
          width: 100%;

          padding: 9px 12px;
          margin-bottom: 14px;

          color: #ffd8a8;

          background: rgba(255, 145, 60, 0.12);

          border-left: 3px solid #ff913c;
          border-radius: 4px;

          font-size: 12px;
          line-height: 18px;
        }

        /* ================================================
           TITLE
        ================================================= */

        .register-title {
          margin:

            5px 0
            18px;

          text-align: center;

          color: #ffffff;

          font-size: 19px;

          font-weight: 600;

          letter-spacing: 0.3px;
        }

        /* ================================================
           FORM FIELD
        ================================================= */

        .form-field {
          position: relative;

          width: 100%;

          margin-bottom: 18px;
        }

        .field-label {
          display: block;

          margin-bottom: 6px;

          color: #b9b9b9;

          font-size: 11.5px;
          font-weight: 500;

          letter-spacing: 0.2px;
        }

        .field-warn {
          color: #ff8f6b;
        }

        .form-control {
          width: 100%;

          height: 48px;

          padding:

            0 48px
            0 15px;

          color: #ffffff;

          background:

            rgba(
              0,
              0,
              0,
              0.32
            ) !important;

          border:

            1px solid
            rgba(
              255,
              255,
              255,
              0.28
            );

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
            rgba(
              220,
              165,
              44,
              0.20
            );
        }

        /* ================================================
           ICON
        ================================================= */

        .field-icon {
          position: absolute;

          right: 15px;

          /* Anchored to the input, not the field, so the label above it
             cannot push the icon off centre. */
          bottom: 24px;

          transform:
            translateY(50%);

          color: #dca52c;

          font-size: 15px;

          pointer-events: none;
        }

        /* ================================================
           BUTTON
        ================================================= */

        .register-actions {
          width: 100%;

          display: flex;
          flex-direction: column;

          gap: 10px;

          margin-top: 4px;
        }

        .register-hint {
          margin: 2px 0 0;

          color: #a9a9a9;

          font-size: 11.5px;
          line-height: 17px;

          text-align: center;
        }

        .faucet-link {
          display: block;

          padding: 9px 12px;

          color: #ffd35a;

          background: rgba(220, 165, 44, 0.10);

          border: 1px dashed rgba(220, 165, 44, 0.55);
          border-radius: 4px;

          font-size: 12.5px;
          font-weight: 600;

          text-align: center;
          text-decoration: none;
        }

        .faucet-link:hover {
          background: rgba(220, 165, 44, 0.18);
        }

        .btn-fund {
          background:

            linear-gradient(
              180deg,
              #35d07f 0%,
              #1c9d5a 100%
            ) !important;

          border-color: #3ee08d !important;

          color: #04220f !important;
        }

        .register-btn {
          width: 100%;

          display: flex;

          justify-content: center;

          margin-top: 4px;
        }

        .register-actions button,
        .register-btn button {
          width: 100%;

          height: 44px;

          padding: 0 20px;

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

        .register-actions button:hover,
        .register-btn button:hover {
          transform:
            translateY(-1px);

          box-shadow:

            0 5px 18px
            rgba(
              226,
              170,
              39,
              0.35
            );
        }

        .register-actions button:disabled,
        .register-btn button:disabled {
          opacity: 0.55;

          cursor: not-allowed;

          transform: none;
        }

        /* ================================================
           LOGIN LINK
        ================================================= */

        .already-account {
          width: 100%;

          text-align: center;

          margin-top: 18px;
        }

        .already-account p {
          margin: 0;

          color: #ffffff;

          font-size: 13px;

          line-height: 20px;
        }

        .already-account button {
          padding: 0;

          margin-left: 4px;

          border: none;

          background: transparent;

          color: #31c76a;

          font-size: 13px;

          cursor: pointer;
        }

        .already-account button:hover {
          color: #64ef98;

          text-decoration: underline;
        }

        /* ================================================
           MOBILE
        ================================================= */

        @media (max-width: 575px) {

          .register-section {
            padding: 20px 15px;
          }

          .register-card {
            padding:

              27px
              22px
              21px;
          }

          .register-logo img {
            width: 105px;
          }

          .register-title {
            font-size: 18px;

            margin-bottom: 16px;
          }

          .form-control {
            height: 46px;

            font-size: 12px;
          }

          .register-actions button,
          .register-btn button {
            height: 42px;

            font-size: 13px;
          }

          .already-account p,
          .already-account button {
            font-size: 12px;
          }

        }

      `}</style>
    </>
  );
}
