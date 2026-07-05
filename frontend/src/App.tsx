import { useCallback, useEffect, useState } from 'react';
import {
  isConnected,
  requestAccess,
  getAddress,
  signTransaction,
} from '@stellar/freighter-api';
import {
  Account,
  Address,
  Contract,
  Networks,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk';
import {
  truncateAddress,
  parseErrorMessage,
  formatTxErrorResult,
  formatExpirationDate,
  daysRemaining,
} from './utils';

const SOROBAN_RPC = 'https://soroban-testnet.stellar.org';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;
const PAYMENT_EXECUTOR_ID =
  import.meta.env.VITE_PAYMENT_EXECUTOR_ID ?? '';
const REGISTRY_ID = import.meta.env.VITE_REGISTRY_ID ?? '';
const SUBSCRIPTION_PRICE_XLM = 50;
const SUBSCRIPTION_DAYS = 30;
const MIN_BALANCE_BUFFER = 1;
const TX_POLL_INTERVAL_MS = 1000;
const TX_POLL_MAX_ATTEMPTS = 10;

type LoadingState = 'idle' | 'connecting' | 'subscribing';
type SubscriptionStatus = 'Active' | 'Inactive' | null;

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

// Waits for a submitted transaction to land on-chain before we re-read
// contract state. sendTransaction only confirms *submission*, not
// confirmation, so reading state immediately after can race the ledger.
async function waitForTransactionConfirmation(
  server: rpc.Server,
  hash: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < TX_POLL_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await server.getTransaction(hash);
      if (response.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return true;
      }
      if (response.status === rpc.Api.GetTransactionStatus.FAILED) {
        return false;
      }
    } catch {
      /* not yet available, keep polling */
    }
    await new Promise((resolve) => setTimeout(resolve, TX_POLL_INTERVAL_MS));
  }
  // Timed out waiting — don't throw, the tx may still confirm shortly after.
  return false;
}

export default function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<SubscriptionStatus>(null);
  const [expiration, setExpiration] = useState<number>(0);
  const [loading, setLoading] = useState<LoadingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [justSubscribed, setJustSubscribed] = useState(false);

  const checkSubscriptionStatus = useCallback(async (address: string) => {
    if (!REGISTRY_ID) {
      setSubscriptionStatus(null);
      setExpiration(0);
      return;
    }

    try {
      const server = new rpc.Server(SOROBAN_RPC);
      const contract = new Contract(REGISTRY_ID);

      let sourceAccount: Account;
      try {
        sourceAccount = await server.getAccount(address);
      } catch {
        sourceAccount = new Account(address, '0');
      }

      const userScVal = Address.fromString(address).toScVal();

      const statusTx = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(contract.call('get_status', userScVal))
        .setTimeout(30)
        .build();

      const expTx = new TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(contract.call('get_exp', userScVal))
        .setTimeout(30)
        .build();

      const [statusSim, expSim] = await Promise.all([
        server.simulateTransaction(statusTx),
        server.simulateTransaction(expTx),
      ]);

      if (rpc.Api.isSimulationError(statusSim)) {
        throw new Error(
          statusSim.error ||
            'Failed to read subscription status from the registry contract',
        );
      }

      if (!rpc.Api.isSimulationSuccess(statusSim) || !statusSim.result?.retval) {
        setSubscriptionStatus('Inactive');
      } else {
        const status = scValToNative(statusSim.result.retval);
        setSubscriptionStatus(status === 'Active' ? 'Active' : 'Inactive');
      }

      if (
        rpc.Api.isSimulationSuccess(expSim) &&
        expSim.result?.retval
      ) {
        const exp = scValToNative(expSim.result.retval);
        setExpiration(typeof exp === 'bigint' ? Number(exp) : Number(exp ?? 0));
      } else {
        setExpiration(0);
      }
    } catch (err) {
      console.error('Failed to check subscription status:', err);
      setSubscriptionStatus(null);
      setExpiration(0);
    }
  }, []);

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

  useEffect(() => {
    if (!walletAddress) {
      setSubscriptionStatus(null);
      setExpiration(0);
      return;
    }

    void checkSubscriptionStatus(walletAddress);
  }, [walletAddress, checkSubscriptionStatus]);

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

  const handleDisconnect = () => {
    setWalletAddress(null);
    setSubscriptionStatus(null);
    setExpiration(0);
    setError(null);
    setSuccess(null);
    setJustSubscribed(false);
  };

  const handleSubscribe = async () => {
    setError(null);
    setSuccess(null);
    setJustSubscribed(false);

    if (!walletAddress) {
      setError('Connect your wallet to subscribe.');
      return;
    }

    if (!PAYMENT_EXECUTOR_ID || !REGISTRY_ID) {
      setError('Service unavailable. Contract not configured.');
      return;
    }

    if (subscriptionStatus === 'Active') {
      setError('Your plan is already active.');
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
        throw new Error(formatTxErrorResult(result.errorResult));
      }

      // Wait for on-chain confirmation before re-reading subscription state,
      // otherwise we may read stale data from before the extend() call landed.
      await waitForTransactionConfirmation(server, result.hash);

      await checkSubscriptionStatus(walletAddress);
      setJustSubscribed(true);
      setSuccess('Subscription active. Your storage plan is now extended.');
    } catch (err) {
      console.error('Contract interaction failed during subscribe:', err);

      if (err instanceof SyntaxError) {
        console.error('JSON parse error during contract interaction:', err);
        setError('Received an invalid response from the network. Please try again.');
      } else {
        setError(parseErrorMessage(err));
      }
    } finally {
      setLoading('idle');
    }
  };

  const isConnecting = loading === 'connecting';
  const isSubscribing = loading === 'subscribing';
  const isBusy = loading !== 'idle';
  const isActive = subscriptionStatus === 'Active';
  const remaining = daysRemaining(expiration);
  const expirationLabel = expiration ? formatExpirationDate(expiration) : '';

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

        .vault-expiration {
          margin: 0;
          font-size: 12px;
          letter-spacing: 0.04em;
          color: #737373;
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
                  onClick={handleDisconnect}
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

            {isActive && expirationLabel && (
              <p className="vault-expiration">
                Renews on {expirationLabel} · {remaining} day
                {remaining === 1 ? '' : 's'} remaining
              </p>
            )}

            <hr className="vault-divider" />

            <div className="vault-feedback" role="status" aria-live="polite">
              {error && <p className="vault-error">{error}</p>}
              {!error && justSubscribed && success && (
                <p className="vault-success">{success}</p>
              )}
              {!error && !justSubscribed && isActive && (
                <p className="vault-success">Your plan is already active.</p>
              )}
            </div>

            <button
              type="button"
              className="vault-btn"
              disabled={isBusy || !walletAddress || isActive}
              onClick={() => void handleSubscribe()}
            >
              {isSubscribing
                ? 'Processing transaction…'
                : isActive
                  ? 'Plan active'
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
