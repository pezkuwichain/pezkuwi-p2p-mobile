/**
 * Withdraw Modal - Mobile P2P
 *
 * Request withdrawal from internal P2P balance to external wallet.
 * Backend processes the actual blockchain transaction.
 */
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
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowUpFromLine
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  requestWithdraw,
  getInternalBalance,
  type CryptoToken,
  type InternalBalance
} from '@/lib/p2p-fiat';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function WithdrawModal({ isOpen, onClose, onSuccess }: WithdrawModalProps) {
  const { user } = useAuth();
  const [token, setToken] = useState<CryptoToken>('HEZ');
  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [balance, setBalance] = useState<InternalBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      fetchBalance();
      // Pre-fill wallet from user profile
      if (user.wallet_address) {
        setWalletAddress(user.wallet_address);
      }
    }
  }, [isOpen, user, token]);

  const fetchBalance = async () => {
    const bal = await getInternalBalance(token);
    setBalance(bal);
  };

  const resetModal = () => {
    setAmount('');
    setLoading(false);
    setSuccess(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleWithdraw = async () => {
    if (!walletAddress) {
      toast.error('Please enter wallet address');
      return;
    }

    const withdrawAmount = parseFloat(amount);
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (balance && withdrawAmount > balance.available_balance) {
      toast.error('Insufficient balance');
      return;
    }

    setLoading(true);

    try {
      await requestWithdraw(token, withdrawAmount, walletAddress);
      setSuccess(true);
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred('success');
      onSuccess?.();
    } catch (error) {
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  };

  const handleSetMax = () => {
    if (balance) {
      setAmount(balance.available_balance.toString());
    }
  };

  if (success) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-sm">
          <div className="space-y-4 text-center py-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-500">Request Submitted!</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {amount} {token} withdrawal is being processed.
              </p>
              <p className="text-muted-foreground text-xs mt-2">
                Usually completes within 5-10 minutes.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpFromLine className="h-5 w-5" />
            Withdraw
          </DialogTitle>
          <DialogDescription>
            Withdraw from P2P balance to your wallet
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Token</Label>
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

          <div className="space-y-2">
            <div className="flex justify-between">
              <Label>Amount</Label>
              <button
                onClick={handleSetMax}
                className="text-xs text-primary hover:underline"
              >
                Max: {balance?.available_balance.toFixed(4) || '0'} {token}
              </button>
            </div>
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="0"
              max={balance?.available_balance}
              step="0.0001"
            />
          </div>

          <div className="space-y-2">
            <Label>Wallet Address</Label>
            <Input
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="5..."
              className="font-mono text-xs"
            />
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Withdrawals are processed by the platform. Network fee will be deducted.
            </AlertDescription>
          </Alert>

          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={loading || !amount || !walletAddress}
              className="flex-1"
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing...</>
              ) : (
                'Withdraw'
              )}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
