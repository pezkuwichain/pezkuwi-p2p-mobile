import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowUpFromLine,
  Clock,
  Info
} from 'lucide-react';
import { usePezkuwi } from '@/contexts/PezkuwiContext';
import { toast } from 'sonner';
import {
  getInternalBalances,
  requestWithdraw,
  getDepositWithdrawHistory,
  type CryptoToken,
  type InternalBalance,
  type DepositWithdrawRequest
} from '@shared/lib/p2p-fiat';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type WithdrawStep = 'form' | 'confirm' | 'success';

export function WithdrawModal({ isOpen, onClose, onSuccess }: WithdrawModalProps) {
  const { selectedAccount } = usePezkuwi();

  const [step, setStep] = useState<WithdrawStep>('form');
  const [token, setToken] = useState<CryptoToken>('HEZ');
  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [balances, setBalances] = useState<InternalBalance[]>([]);
  const [pendingRequests, setPendingRequests] = useState<DepositWithdrawRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string>('');

  // Network fee estimate (in HEZ)
  const NETWORK_FEE = 0.01;
  const MIN_WITHDRAWAL = 0.1;

  // Fetch balances and pending requests on mount
  useEffect(() => {
    if (isOpen) {
      fetchData();
      // Pre-fill wallet address from connected account
      if (selectedAccount?.address) {
        setWalletAddress(selectedAccount.address);
      }
    }
  }, [isOpen, selectedAccount]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [balanceData, historyData] = await Promise.all([
        getInternalBalances(),
        getDepositWithdrawHistory()
      ]);
      setBalances(balanceData);
      // Filter for pending withdrawal requests
      setPendingRequests(
        historyData.filter(r => r.request_type === 'withdraw' && r.status === 'pending')
      );
    } catch (error) {
      console.error('Fetch data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetModal = () => {
    setStep('form');
    setAmount('');
    setSubmitting(false);
    setRequestId('');
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const getAvailableBalance = (): number => {
    const balance = balances.find(b => b.token === token);
    return balance?.available_balance || 0;
  };

  const getLockedBalance = (): number => {
    const balance = balances.find(b => b.token === token);
    return balance?.locked_balance || 0;
  };

  const getMaxWithdrawable = (): number => {
    const available = getAvailableBalance();
    // Subtract network fee for HEZ
    if (token === 'HEZ') {
      return Math.max(0, available - NETWORK_FEE);
    }
    return available;
  };

  const handleSetMax = () => {
    const max = getMaxWithdrawable();
    setAmount(max.toFixed(4));
  };

  const validateWithdrawal = (): string | null => {
    const withdrawAmount = parseFloat(amount);

    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      return 'Please enter a valid amount';
    }

    if (withdrawAmount < MIN_WITHDRAWAL) {
      return `Minimum withdrawal is ${MIN_WITHDRAWAL} ${token}`;
    }

    if (withdrawAmount > getMaxWithdrawable()) {
      return 'Insufficient available balance';
    }

    if (!walletAddress || walletAddress.length < 40) {
      return 'Please enter a valid wallet address';
    }

    // Check for pending requests
    const hasPendingForToken = pendingRequests.some(r => r.token === token);
    if (hasPendingForToken) {
      return `You already have a pending ${token} withdrawal request`;
    }

    return null;
  };

  const handleContinue = () => {
    const error = validateWithdrawal();
    if (error) {
      toast.error(error);
      return;
    }
    setStep('confirm');
  };

  const handleSubmitWithdrawal = async () => {
    const error = validateWithdrawal();
    if (error) {
      toast.error(error);
      return;
    }

    setSubmitting(true);

    try {
      const withdrawAmount = parseFloat(amount);
      const id = await requestWithdraw(token, withdrawAmount, walletAddress);
      setRequestId(id);
      setStep('success');
      onSuccess?.();
    } catch (error) {
      console.error('Submit withdrawal error:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const renderFormStep = () => (
    <div className="space-y-6">
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {/* Token Selection */}
          <div className="space-y-2">
            <Label>Select Token</Label>
            <Select value={token} onValueChange={(v) => setToken(v as CryptoToken)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HEZ">HEZ (Native)</SelectItem>
                <SelectItem value="PEZ">PEZ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Balance Display */}
          <div className="p-4 rounded-lg bg-muted/50 border">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Available</p>
                <p className="font-semibold text-green-500">
                  {getAvailableBalance().toFixed(4)} {token}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Locked (Escrow)</p>
                <p className="font-semibold text-yellow-500">
                  {getLockedBalance().toFixed(4)} {token}
                </p>
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label>Withdrawal Amount</Label>
            <div className="relative">
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.0001"
              />
              <div className="absolute right-14 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {token}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 text-xs"
                onClick={handleSetMax}
              >
                MAX
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Min: {MIN_WITHDRAWAL} {token} | Max: {getMaxWithdrawable().toFixed(4)} {token}
            </p>
          </div>

          {/* Wallet Address */}
          <div className="space-y-2">
            <Label>Destination Wallet Address</Label>
            <Input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="5..."
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Only PezkuwiChain addresses are supported
            </p>
          </div>

          {/* Network Fee Info */}
          {token === 'HEZ' && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Network fee: ~{NETWORK_FEE} HEZ (deducted from withdrawal amount)
              </AlertDescription>
            </Alert>
          )}

          {/* Pending Requests Warning */}
          {pendingRequests.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You have {pendingRequests.length} pending withdrawal request(s).
                Please wait for them to complete.
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleContinue}
              disabled={!amount || parseFloat(amount) <= 0}
            >
              Continue
            </Button>
          </DialogFooter>
        </>
      )}
    </div>
  );

  const renderConfirmStep = () => {
    const withdrawAmount = parseFloat(amount);
    const receiveAmount = token === 'HEZ' ? withdrawAmount - NETWORK_FEE : withdrawAmount;

    return (
      <div className="space-y-6">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Please review your withdrawal details carefully.
            This action cannot be undone.
          </AlertDescription>
        </Alert>

        <div className="p-4 rounded-lg bg-muted/50 border space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Token</span>
            <span className="font-semibold">{token}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Withdrawal Amount</span>
            <span className="font-semibold">{withdrawAmount.toFixed(4)} {token}</span>
          </div>
          {token === 'HEZ' && (
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Network Fee</span>
              <span className="text-yellow-500">-{NETWORK_FEE} HEZ</span>
            </div>
          )}
          <div className="border-t pt-4 flex justify-between items-center">
            <span className="text-muted-foreground">You Will Receive</span>
            <span className="font-bold text-lg text-green-500">
              {receiveAmount.toFixed(4)} {token}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-lg bg-muted/30 border">
          <p className="text-xs text-muted-foreground mb-1">Destination Address</p>
          <p className="font-mono text-xs break-all">{walletAddress}</p>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Processing time: Usually within 5-30 minutes</span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setStep('form')}>
            Back
          </Button>
          <Button
            onClick={handleSubmitWithdrawal}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ArrowUpFromLine className="h-4 w-4 mr-2" />
                Confirm Withdrawal
              </>
            )}
          </Button>
        </DialogFooter>
      </div>
    );
  };

  const renderSuccessStep = () => (
    <div className="space-y-6 text-center">
      <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
      </div>

      <div>
        <h3 className="text-xl font-semibold text-green-500">
          Withdrawal Request Submitted!
        </h3>
        <p className="text-muted-foreground mt-2">
          Your withdrawal request has been submitted for processing.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Request ID</span>
          <Badge variant="outline" className="font-mono text-xs">
            {requestId.slice(0, 8)}...
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">
            <Clock className="h-3 w-3 mr-1" />
            Processing
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-semibold">{amount} {token}</span>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          You can track your withdrawal status in the transaction history.
          Funds will arrive in your wallet within 5-30 minutes.
        </AlertDescription>
      </Alert>

      <Button onClick={handleClose} className="w-full">
        Done
      </Button>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpFromLine className="h-5 w-5" />
            Withdraw from P2P Balance
          </DialogTitle>
          {step !== 'success' && (
            <DialogDescription>
              {step === 'form' && 'Withdraw crypto from your P2P balance to external wallet'}
              {step === 'confirm' && 'Review and confirm your withdrawal'}
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 'form' && renderFormStep()}
        {step === 'confirm' && renderConfirmStep()}
        {step === 'success' && renderSuccessStep()}
      </DialogContent>
    </Dialog>
  );
}
