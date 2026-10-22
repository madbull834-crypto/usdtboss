import { useState } from "react";
import { useNavigate } from "react-router";
import { evmProvider } from "../../evm/client";

export default function SignInForm() {
  const [wallet, setWallet] = useState("");
  const [status, setStatus] = useState("Wallet Not Connected");
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  async function connectWallet() {
    const phantom = evmProvider();
    if (!phantom) {
      setMessage(
        "Please install EVM Wallet and open this site over HTTPS. Connect with an EVM wallet such as MetaMask."
      );
      
      return;
    }

    try {
      const response = await phantom.connect();

      const address = response.publicKey.toString();

      setWallet(address);
      setStatus("Wallet Connected");
      setMessage("Wallet connected. Continue to registration from the dashboard.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Wallet connection failed.");
    }
  }

  function registerUser() {
    if (!wallet) {
      setMessage("Please connect wallet first.");
      return;
    }

    navigate("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#0b1d1b] flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md space-y-6">

        <div className="bg-[#181818] border border-gray-700 rounded-2xl p-8">

          <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2 bg-[#242424] px-4 py-2 rounded-full">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-white font-semibold">
                {status}
              </span>
            </div>
          </div>

          <button
            onClick={connectWallet}
            className="w-full bg-yellow-400 text-black font-bold py-4 rounded-lg"
          >
            Connect Wallet
          </button>

        </div>

        <div className="bg-[#181818] border border-gray-700 rounded-2xl p-8">

          <div className="border-2 border-yellow-400 rounded-lg px-4 py-4 text-white break-all">
            {wallet || "Wallet Address"}
          </div>

          <button
            onClick={registerUser}
            className="w-full mt-6 bg-yellow-400 text-black font-bold py-4 rounded-lg"
          >
            Continue to Dashboard
          </button>

          {message && (
            <p className="mt-4 text-sm text-gray-300">
              {message}
            </p>
          )}

        </div>

      </div>
    </div>
  );
}
