/**
 * Deposit Modal - Mobile P2P
 *
 * Shows platform wallet address for user to send tokens.
 * After sending, user enters tx hash to verify deposit.
 * Actual verification happens in backend Edge Function.
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
  Copy,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Wallet
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { getPlatformWalletAddress, type CryptoToken } from '@/lib/p2p-fiat';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type DepositStep = 'info' | 'verify' | 'success';

export function DepositModal({ isOpen, onClose, onSuccess }: DepositModalProps) {
  const [step, setStep] = useState<DepositStep>('info');
  const [token, setToken] = useState<CryptoToken>('HEZ');
  const [amount, setAmount] = useState('');
  const [platformWallet, setPlatformWallet] = useState<string>('');
  const [txHash, setTxHash] = useState('');
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchPlatformWallet();
    }
  }, [isOpen]);

  const fetchPlatformWallet = async () => {
    const address = await getPlatformWalletAddress();
    setPlatformWallet(address);
  };

  const resetModal = () => {
    setStep('info');
    setToken('HEZ');
    setAmount('');
    setTxHash('');
    setCopied(false);
    setVerifying(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleCopyAddress = async () => {
    try {
      await navigator.clipboard.writeText(platformWallet);
      setCopied(true);
      toast.success('Address copied!');
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred('success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleVerifyDeposit = async () => {
    if (!txHash) {
      toast.error('Please enter the transaction hash');
      return;
    }

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      toast.error('Please enter the deposit amount');
      return;
    }

    // Get session token for Telegram auth
    const sessionToken = localStorage.getItem('p2p_session');
    if (!sessionToken) {
      toast.error('Session expired. Please refresh the page.');
      return;
    }

    setVerifying(true);

    try {
      // Use verify-deposit-telegram for Telegram MiniApp users
      const { data, error } = await supabase.functions.invoke('verify-deposit-telegram', {
        body: { sessionToken, txHash, token, expectedAmount: depositAmount }
      });

      if (error) throw new Error(error.message || 'Verification failed');

      if (data?.success) {
        toast.success(`Deposit verified! ${data.amount} ${token} added.`);
        window.Telegram?.WebApp.HapticFeedback.notificationOccurred('success');
        setStep('success');
        onSuccess?.();
      } else {
        throw new Error(data?.error || 'Verification failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Verification failed';
      toast.error(message);
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred('error');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Deposit
          </DialogTitle>
          {step !== 'success' && (
            <DialogDescription>
              {step === 'info' && 'Send tokens to the platform wallet'}
              {step === 'verify' && 'Enter transaction hash to verify'}
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 'info' && (
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
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.0001"
              />
            </div>

            <div className="p-4 rounded-lg bg-muted/50 border space-y-3">
              <p className="text-sm font-medium text-center">Send {token} to:</p>
              <div className="p-2 rounded bg-background border font-mono text-xs break-all text-center">
                {platformWallet || 'Loading...'}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleCopyAddress}
                disabled={!platformWallet}
              >
                {copied ? (
                  <><CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />Copied!</>
                ) : (
                  <><Copy className="h-4 w-4 mr-2" />Copy Address</>
                )}
              </Button>
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Only send {token} on PezkuwiChain. Wrong network = lost funds.
              </AlertDescription>
            </Alert>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={() => setStep('verify')}
                disabled={!amount || parseFloat(amount) <= 0}
                className="flex-1"
              >
                I've Sent
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Transaction Hash</Label>
              <div className="flex gap-2">
                <Input
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="0x..."
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(`https://explorer.pezkuwichain.io/tx/${txHash}`, '_blank')}
                  disabled={!txHash}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/50 border text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Token</span>
                <span className="font-medium">{token}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{amount}</span>
              </div>
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('info')} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleVerifyDeposit}
                disabled={verifying || !txHash}
                className="flex-1"
              >
                {verifying ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying...</>
                ) : (
                  'Verify Deposit'
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'success' && (
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-500">Deposit Successful!</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {amount} {token} added to your P2P balance.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full">Done</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
