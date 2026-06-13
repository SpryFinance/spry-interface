import { isSpryChain } from '@spry/config'
import { TradingApi } from '@universe/api'
import { isValidHexString } from '@universe/encoding'
import ms from 'ms'
import { useCallback, useEffect, useMemo } from 'react'
import { TradingApiClient } from 'uniswap/src/data/apiClients/tradingApi/TradingApiClient'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { RetryOptions, UniverseChainId } from 'uniswap/src/features/chains/types'
import { InterfaceEventName } from 'uniswap/src/features/telemetry/constants'
import { sendAnalyticsEvent } from 'uniswap/src/features/telemetry/send'
import { checkedTransaction } from 'uniswap/src/features/transactions/slice'
import { getSpryPublicClient } from 'uniswap/src/features/transactions/swap/services/tradeService/spryLocalQuote'
import { isUniswapX } from 'uniswap/src/features/transactions/swap/utils/routing'
import { toTradingApiSupportedChainId } from 'uniswap/src/features/transactions/swap/utils/tradingApi'
import { TransactionReceipt, TransactionStatus } from 'uniswap/src/features/transactions/types/transactionDetails'
import { receiptFromViemReceipt } from 'uniswap/src/features/transactions/utils/receipt'
import { shouldCheckTransaction } from 'uniswap/src/utils/polling'
import { usePublicClient } from 'wagmi'
import { useAccount } from '~/hooks/useAccount'
import { useCurrentBlockTimestamp } from '~/hooks/useCurrentBlockTimestamp'
import { useBlockNumber } from '~/lib/hooks/useBlockNumber'
import { CanceledError, RetryableError, retry } from '~/state/activity/polling/retry'
import { ActivityUpdateTransactionType, OnActivityUpdate } from '~/state/activity/types'
import { useAppDispatch } from '~/state/hooks'
import { useMultichainTransactions, useTransactionRemover } from '~/state/transactions/hooks'
import { PendingTransactionDetails } from '~/state/transactions/types'
import { isPendingTx } from '~/state/transactions/utils'

interface ReceiptWithStatus {
  status: 'success' | 'reverted'
  receipt: TransactionReceipt
}

function usePendingTransactions(chainId?: UniverseChainId): PendingTransactionDetails[] {
  const multichainTransactions = useMultichainTransactions()
  return useMemo(() => {
    if (!chainId) {
      return []
    }
    return multichainTransactions.flatMap(([tx, txChainId]) => {
      // Avoid polling for already-deposited bridge transactions, as they will be finalized by the bridge updater.
      // Also avoid polling UniswapX orders, as they are polled by usePollPendingOrders using the UniswapX backend API.
      if (isPendingTx(tx, /* skipDepositedBridgeTxs = */ true) && txChainId === chainId && !isUniswapX(tx)) {
        // Ignore batch txs which need to be polled against wallet instead of chain.
        return tx.batchInfo ? [] : [tx]
      }
      return []
    })
  }, [chainId, multichainTransactions])
}

const SWAP_STATUS_TO_FINALIZED_STATUS: Partial<Record<TradingApi.SwapStatus, 'success' | 'reverted'>> = {
  [TradingApi.SwapStatus.SUCCESS]: 'success',
  [TradingApi.SwapStatus.FAILED]: 'reverted',
  [TradingApi.SwapStatus.EXPIRED]: 'reverted',
}

export function usePollPendingTransactions(onActivityUpdate: OnActivityUpdate) {
  const account = useAccount()
  const publicClient = usePublicClient()

  const pendingTransactions = usePendingTransactions(account.chainId)
  const hasPending = pendingTransactions.length > 0
  const blockTimestamp = useCurrentBlockTimestamp({ refetchInterval: !hasPending ? false : undefined })

  const lastBlockNumber = useBlockNumber()
  const removeTransaction = useTransactionRemover()
  const dispatch = useAppDispatch()

  const getReceiptWithTradingApi = useCallback(
    (tx: PendingTransactionDetails): { promise: Promise<ReceiptWithStatus>; cancel: () => void } => {
      const chainId = toTradingApiSupportedChainId(account.chainId)
      if (!account.chainId || !chainId) {
        throw new Error('No chainId')
      }

      const pollingInterval = getChainInfo(account.chainId).tradingApiPollingIntervalMs
      const retryOptions: RetryOptions = {
        n: 20,
        minWait: pollingInterval,
        medWait: pollingInterval,
        maxWait: pollingInterval,
      }

      // SPRY: Spry chains have no Trading API swap-status endpoint (it 401s), so
      // confirm transactions directly from the on-chain receipt instead. Use the
      // Spry per-chain viem client (the chain's own RPC, CSP-allowed), NOT wagmi's
      // current-chain client, whose transport may not cover this Spry chain - that
      // is why the confirmation toast never fired on chains other than the one the
      // wagmi client happened to serve.
      if (isSpryChain(account.chainId)) {
        const spryClient = getSpryPublicClient(account.chainId)
        // Testnet blocks are ~1-2s, so poll over a longer window than the 150ms
        // trading-api interval (the effect also restarts each new block). This spans
        // real mine time and avoids burning RPC on sub-block retries.
        const receiptRetryOptions: RetryOptions = { n: 20, minWait: 1_500, medWait: 1_500, maxWait: 1_500 }
        return retry(async () => {
          if (!tx.hash || !isValidHexString(tx.hash)) {
            throw new Error('Invalid transaction hash')
          }
          let adaptedReceipt: TransactionReceipt | undefined
          let isSuccess = false
          try {
            const viemReceipt = await spryClient.getTransactionReceipt({ hash: tx.hash })
            adaptedReceipt = receiptFromViemReceipt(viemReceipt)
            isSuccess = viemReceipt.status === 'success'
          } catch {
            // Not mined yet (or a transient RPC error). Drop transactions past their
            // deadline (or, if none, older than 6h) so they don't poll forever;
            // otherwise keep polling. Mirrors the gateway path's cleanup.
            if (account.isConnected) {
              if (tx.deadline) {
                if (blockTimestamp && tx.deadline < Number(blockTimestamp)) {
                  removeTransaction(tx.id)
                }
              } else if (tx.addedTime + ms(`6h`) < Date.now()) {
                removeTransaction(tx.id)
              }
            }
            throw new RetryableError()
          }
          if (!adaptedReceipt) {
            throw new RetryableError()
          }
          return { status: isSuccess ? 'success' : 'reverted', receipt: adaptedReceipt } as ReceiptWithStatus
        }, receiptRetryOptions) as { promise: Promise<ReceiptWithStatus>; cancel: () => void }
      }

      return retry(() => {
        if (!tx.hash) {
          throw new Error(`Invalid transaction hash: hash not defined`)
        }
        return TradingApiClient.fetchSwaps({ txHashes: [tx.hash], chainId })
          .then(async (res) => {
            const status = res.swaps?.[0]?.status
            const finalizedStatus = status ? SWAP_STATUS_TO_FINALIZED_STATUS[status] : undefined

            if (!finalizedStatus) {
              if (account.isConnected) {
                // Remove transactions past their deadline or - if there is no deadline - older than 6 hours.
                if (tx.deadline) {
                  // Deadlines are expressed as seconds since epoch, as they are used on-chain.
                  if (blockTimestamp && tx.deadline < Number(blockTimestamp)) {
                    removeTransaction(tx.id)
                  }
                } else if (tx.addedTime + ms(`6h`) < Date.now()) {
                  removeTransaction(tx.id)
                }
              }

              throw new RetryableError()
            }

            sendAnalyticsEvent(InterfaceEventName.SwapConfirmedOnClient, {
              time: Date.now() - tx.addedTime,
              swap_success: finalizedStatus === 'success',
              success: finalizedStatus === 'success',
              chainId: account.chainId,
              txHash: tx.hash ?? '',
              transactionType: tx.typeInfo.type,
              routing: 'classic',
            })

            let adaptedReceipt: TransactionReceipt | undefined

            if (publicClient && tx.hash && isValidHexString(tx.hash)) {
              try {
                const viemReceipt = await publicClient.getTransactionReceipt({ hash: tx.hash })
                adaptedReceipt = receiptFromViemReceipt(viemReceipt)
                if (!adaptedReceipt) {
                  throw new Error('Error converting viem receipt to transaction receipt')
                }
              } catch {
                // ignore errors and fallback to dummy
              }
            }

            if (!adaptedReceipt) {
              adaptedReceipt = {
                transactionIndex: 0,
                blockHash: tx.hash ?? '',
                blockNumber: 0,
                confirmedTime: Date.now(),
                gasUsed: 0,
                effectiveGasPrice: 0,
              }
            }

            return { status: finalizedStatus, receipt: adaptedReceipt } as ReceiptWithStatus
          })
          .catch((_error) => {
            throw new RetryableError()
          })
      }, retryOptions) as { promise: Promise<ReceiptWithStatus>; cancel: () => void }
    },
    [account.chainId, account.isConnected, blockTimestamp, removeTransaction, publicClient],
  )

  useEffect(() => {
    if (!account.address || !account.chainId || !publicClient || !lastBlockNumber || !hasPending) {
      return undefined
    }

    const cancels = pendingTransactions
      .filter((tx) => shouldCheckTransaction(lastBlockNumber, tx))
      .map((tx) => {
        const { promise, cancel } = getReceiptWithTradingApi(tx)
        promise
          .then(({ status, receipt }) => {
            if (!account.chainId) {
              return
            }
            onActivityUpdate({
              type: ActivityUpdateTransactionType.BaseTransaction,
              chainId: account.chainId,
              original: tx,
              update: {
                status: status === 'success' ? TransactionStatus.Success : TransactionStatus.Failed,
                typeInfo: tx.typeInfo,
                receipt,
                hash: tx.hash,
                networkFee: tx.networkFee,
              },
            })
          })
          .catch((error) => {
            if (error instanceof CanceledError || !account.chainId) {
              return
            }
            dispatch(
              checkedTransaction({
                chainId: account.chainId!,
                id: tx.id,
                address: account.address!,
                blockNumber: lastBlockNumber,
              }),
            )
          })
        return cancel
      })

    return () => {
      cancels.forEach((cancel) => cancel())
    }
  }, [
    account.address,
    account.chainId,
    publicClient,
    lastBlockNumber,
    pendingTransactions,
    hasPending,
    dispatch,
    onActivityUpdate,
    getReceiptWithTradingApi,
  ])
}
