import { useCallback, useEffect, useState } from 'react';
import {
  isConnected,
  requestAccess,
  getAddress,
  signTransaction,
} from '@stellar/freighter-api';
import {
  Address,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk';

const SOROBAN_RPC = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const PAYMENT_EXECUTOR_ID =
  import.meta.env.VITE_PAYMENT_EXECUTOR_ID ?? '';
const REGISTRY_ID = import.meta.env.VITE_REGISTRY_ID ?? '';
const SUBSCRIPTION_PRICE_XLM = 50;
const SUBSCRIPTION_DAYS = 30;
const MIN_BALANCE_BUFFER = 1;

type LoadingState = 'idle' | 'connecting' | 'subscribing';

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function parseErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Something went wrong. Please try again.';

  const lower = raw.toLowerCase();

  if (
    lower.includes('insufficient') ||
    lower.includes('underfunded') ||
    lower.includes('not enough')
  ) {
    return 'Insufficient balance';
  }
  if (
    lower.includes('user declined') ||
    lower.includes('user rejected') ||
    lower.includes('access denied') ||
    lower.includes('denied')
  ) {
    return 'Transaction cancelled';
  }
  if (
    lower.includes('freighter') ||
    lower.includes('not installed') ||
    lower.includes('connection') ||
    lower.includes('not connected')
  ) {
    return 'Connection failed';
  }
  if (lower.includes('contract not configured')) {
    return 'Service unavailable. Contract not configured.';
  }

  return raw.length > 120 ? `${raw.slice(0, 120)}…` : raw;
}

async function fetchNativeBalance(publicKey: string): Promise<number> {
  const response = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);

  if (response.status === 404) {
    return 0;
  }

  if (!response.ok) {
    throw new Error('Unable to fetch account balance');
  }

  const data = (await response.json()) as {
    balances: Array<{ asset_type: string; balance: string }>;
  };

  const native = data.balances.find((b) => b.asset_type === 'native');
  return native ? parseFloat(native.balance) : 0;
}

export default function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const restoreSession = useCallback(async () => {
    try {
      const connected = await isConnected();
      if (!connected.isConnected) return;

      const addressResult = await getAddress();
      if (addressResult.error || !addressResult.address) return;

      setWalletAddress(addressResult.address);
    } catch {
      /* silent restore */
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const handleConnect = async () => {
    setError(null);
    setSuccess(null);
    setLoading('connecting');

    try {
      const connected = await isConnected();
      if (!connected.isConnected) {
        throw new Error(
          'Freighter wallet not found. Please install the extension.',
        );
      }

      const access = await requestAccess();
      if (access.error || !access.address) {
        throw new Error(access.error?.message ?? 'Connection failed');
      }

      setWalletAddress(access.address);
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setLoading('idle');
    }
  };

  const handleSubscribe = async () => {
    setError(null);
    setSuccess(null);

    if (!walletAddress) {
      setError('Connect your wallet to subscribe.');
      return;
    }

    if (!PAYMENT_EXECUTOR_ID || !REGISTRY_ID) {
      setError('Service unavailable. Contract not configured.');
      return;
    }

    setLoading('subscribing');

    try {
      const balance = await fetchNativeBalance(walletAddress);
      if (balance < SUBSCRIPTION_PRICE_XLM + MIN_BALANCE_BUFFER) {
        throw new Error('Insufficient balance');
      }

      const server = new rpc.Server(SOROBAN_RPC);
      const sourceAccount = await server.getAccount(walletAddress);
      const contract = new Contract(PAYMENT_EXECUTOR_ID);
      const userAddress = Address.fromString(walletAddress);
      const registryAddress = Address.fromString(REGISTRY_ID);

      const tx = await server.prepareTransaction(
        new TransactionBuilder(sourceAccount, {
          fee: '100000',
          networkPassphrase: NETWORK_PASSPHRASE,
        })
          .addOperation(
            contract.call(
              'pay_and_extend',
              userAddress.toScVal(),
              registryAddress.toScVal(),
              nativeToScVal(SUBSCRIPTION_DAYS, { type: 'u64' }),
            ),
          )
          .setTimeout(30)
          .build(),
      );

      const signed = await signTransaction(tx.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: walletAddress,
      });

      if (signed.error || !signed.signedTxXdr) {
        throw new Error(signed.error?.message ?? 'Transaction signing failed');
      }

      const signedTx = TransactionBuilder.fromXDR(
        signed.signedTxXdr,
        NETWORK_PASSPHRASE,
      );

      const result = await server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new Error(
          result.errorResult?.toString() ?? 'Transaction failed on network',
        );
      }

      setSuccess('Subscription active. Your storage plan is now extended.');
    } catch (err) {
      setError(parseErrorMessage(err));
    } finally {
      setLoading('idle');
    }
  };

  const isConnecting = loading === 'connecting';
  const isSubscribing = loading === 'subscribing';
  const isBusy = loading !== 'idle';

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }

        .vault-app {
          min-height: 100svh;
          width: 100%;
          margin: 0;
          padding: 0;
          background: #fafafa;
          color: #0a0a0a;
          font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
          -webkit-font-smoothing: antialiased;
          letter-spacing: 0.02em;
          line-height: 1.5;
        }

        .vault-shell {
          max-width: 480px;
          margin: 0 auto;
          padding: 48px 24px 64px;
          display: flex;
          flex-direction: column;
          gap: 48px;
        }

        @media (min-width: 640px) {
          .vault-shell {
            padding: 72px 32px 96px;
            max-width: 520px;
          }
        }

        .vault-header {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .vault-eyebrow {
          margin: 0;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #737373;
        }

        .vault-title {
          margin: 0;
          font-size: clamp(28px, 7vw, 36px);
          font-weight: 400;
          letter-spacing: -0.03em;
          line-height: 1.1;
          color: #0a0a0a;
        }

        .vault-subtitle {
          margin: 0;
          font-size: 15px;
          color: #525252;
          max-width: 36ch;
        }

        .vault-wallet-row {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .vault-btn {
          appearance: none;
          border: 1px solid #0a0a0a;
          background: #0a0a0a;
          color: #fafafa;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 16px 24px;
          cursor: pointer;
          transition: background 0.2s ease, color 0.2s ease, opacity 0.2s ease;
          width: 100%;
        }

        .vault-btn:hover:not(:disabled) {
          background: #262626;
          border-color: #262626;
        }

        .vault-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .vault-btn--outline {
          background: transparent;
          color: #0a0a0a;
        }

        .vault-btn--outline:hover:not(:disabled) {
          background: #0a0a0a;
          color: #fafafa;
        }

        .vault-address {
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.08em;
          color: #737373;
          text-transform: uppercase;
        }

        .vault-card {
          border: 1px solid #d4d4d4;
          background: #ffffff;
          padding: 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 28px;
        }

        @media (min-width: 640px) {
          .vault-card {
            padding: 40px 36px;
          }
        }

        .vault-card-label {
          margin: 0;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: #737373;
        }

        .vault-card-title {
          margin: 8px 0 0;
          font-size: 22px;
          font-weight: 400;
          letter-spacing: -0.02em;
          color: #0a0a0a;
        }

        .vault-divider {
          height: 1px;
          background: #e5e5e5;
          border: none;
          margin: 0;
        }

        .vault-price-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
        }

        .vault-price {
          margin: 0;
          font-size: 32px;
          font-weight: 300;
          letter-spacing: -0.04em;
          color: #0a0a0a;
        }

        .vault-price-unit {
          margin: 0;
          font-size: 13px;
          letter-spacing: 0.06em;
          color: #737373;
          text-transform: uppercase;
        }

        .vault-features {
          margin: 0;
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .vault-features li {
          font-size: 14px;
          color: #404040;
          padding-left: 16px;
          position: relative;
        }

        .vault-features li::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0.65em;
          width: 6px;
          height: 1px;
          background: #0a0a0a;
        }

        .vault-feedback {
          min-height: 20px;
          font-size: 13px;
          letter-spacing: 0.02em;
        }

        .vault-error {
          margin: 0;
          color: #b91c1c;
        }

        .vault-success {
          margin: 0;
          color: #404040;
        }

        .vault-footer {
          margin: 0;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #a3a3a3;
          text-align: center;
        }
      `}</style>

      <div className="vault-app">
        <main className="vault-shell">
          <header className="vault-header">
            <p className="vault-eyebrow">Stellar · Soroban</p>
            <h1 className="vault-title">Cloud Vault</h1>
            <p className="vault-subtitle">
              Secure decentralized storage. Pay monthly in XLM. Cancel anytime.
            </p>
          </header>

          <section className="vault-wallet-row" aria-label="Wallet connection">
            {walletAddress ? (
              <>
                <p className="vault-address">
                  Connected · {truncateAddress(walletAddress)}
                </p>
                <button
                  type="button"
                  className="vault-btn vault-btn--outline"
                  disabled={isBusy}
                  onClick={() => {
                    setWalletAddress(null);
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                className="vault-btn"
                disabled={isBusy}
                onClick={() => void handleConnect()}
              >
                {isConnecting ? 'Connecting…' : 'Connect Wallet'}
              </button>
            )}
          </section>

          <article className="vault-card" aria-labelledby="plan-title">
            <div>
              <p className="vault-card-label">Monthly plan</p>
              <h2 id="plan-title" className="vault-card-title">
                50 GB Cloud Storage
              </h2>
            </div>

            <hr className="vault-divider" />

            <div className="vault-price-row">
              <p className="vault-price">50 XLM</p>
              <p className="vault-price-unit">per month</p>
            </div>

            <ul className="vault-features">
              <li>End-to-end encrypted object storage</li>
              <li>30-day rolling subscription on-chain</li>
              <li>Instant activation after confirmation</li>
            </ul>

            <hr className="vault-divider" />

            <div className="vault-feedback" role="status" aria-live="polite">
              {error && <p className="vault-error">{error}</p>}
              {!error && success && (
                <p className="vault-success">{success}</p>
              )}
            </div>

            <button
              type="button"
              className="vault-btn"
              disabled={isBusy || !walletAddress}
              onClick={() => void handleSubscribe()}
            >
              {isSubscribing
                ? 'Processing transaction…'
                : walletAddress
                  ? 'Subscribe'
                  : 'Connect wallet to subscribe'}
            </button>
          </article>

          <p className="vault-footer">Powered by Freighter · Stellar Testnet</p>
        </main>
      </div>
    </>
  );
}
