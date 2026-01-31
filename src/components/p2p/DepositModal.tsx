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
import {
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  QrCode,
  Wallet
} from 'lucide-react';
import { usePezkuwi } from '@/contexts/PezkuwiContext';
import { useWallet } from '@/contexts/WalletContext';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import {
  getPlatformWalletAddress,
  type CryptoToken
} from '@shared/lib/p2p-fiat';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type DepositStep = 'select' | 'send' | 'verify' | 'success';

export function DepositModal({ isOpen, onClose, onSuccess }: DepositModalProps) {
  const { api, selectedAccount } = usePezkuwi();
  const { balances, signTransaction } = useWallet();

  const [step, setStep] = useState<DepositStep>('select');
  const [token, setToken] = useState<CryptoToken>('HEZ');
  const [amount, setAmount] = useState('');
  const [platformWallet, setPlatformWallet] = useState<string>('');
  const [txHash, setTxHash] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Fetch platform wallet address on mount
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
    setStep('select');
    setToken('HEZ');
    setAmount('');
    setTxHash('');
    setLoading(false);
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
      toast.success('Address copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy address');
    }
  };

  const getAvailableBalance = () => {
    if (token === 'HEZ') return balances.HEZ;
    if (token === 'PEZ') return balances.PEZ;
    return '0';
  };

  const handleSendDeposit = async () => {
    if (!api || !selectedAccount) {
      toast.error('Please connect your wallet');
      return;
    }

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    setLoading(true);

    try {
      // Build the transfer transaction
      const DECIMALS = 12;
      const amountBN = BigInt(Math.floor(depositAmount * 10 ** DECIMALS));

      let tx;
      if (token === 'HEZ') {
        // Native transfer
        tx = api.tx.balances.transferKeepAlive(platformWallet, amountBN);
      } else {
        // Asset transfer (PEZ = asset ID 1)
        const assetId = token === 'PEZ' ? 1 : 0;
        tx = api.tx.assets.transfer(assetId, platformWallet, amountBN);
      }

      toast.info('Please sign the transaction in your wallet...');

      // Sign and send
      const hash = await signTransaction(tx);

      if (hash) {
        setTxHash(hash);
        setStep('verify');
        toast.success('Transaction sent! Please verify your deposit.');
      }
    } catch (error: unknown) {
      console.error('Deposit transaction error:', error);
      const message = error instanceof Error ? error.message : 'Transaction failed';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyDeposit = async () => {
    if (!txHash) {
      toast.error('Please enter the transaction hash');
      return;
    }

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      toast.error('Invalid amount');
      return;
    }

    setVerifying(true);

    try {
      // Call the Edge Function for secure deposit verification
      // This verifies the transaction on-chain before crediting balance
      const { data, error } = await supabase.functions.invoke('verify-deposit', {
        body: {
          txHash,
          token,
          expectedAmount: depositAmount
        }
      });

      if (error) {
        throw new Error(error.message || 'Verification failed');
      }

      if (data?.success) {
        toast.success(`Deposit verified! ${data.amount} ${token} added to your balance.`);
        setStep('success');
        onSuccess?.();
      } else {
        throw new Error(data?.error || 'Verification failed');
      }
    } catch (error) {
      console.error('Verify deposit error:', error);
      const message = error instanceof Error ? error.message : 'Verification failed';
      toast.error(message);
    } finally {
      setVerifying(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'select':
        return (
          <div className="space-y-6">
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

            <div className="space-y-2">
              <Label>Amount to Deposit</Label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  min="0"
                  step="0.0001"
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {token}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Wallet Balance: {parseFloat(getAvailableBalance()).toFixed(4)} {token}
              </p>
            </div>

            <Alert>
              <Wallet className="h-4 w-4" />
              <AlertDescription>
                You will send {token} from your connected wallet to the P2P platform escrow.
                After confirmation, the amount will be credited to your P2P internal balance.
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => setStep('send')}
                disabled={!amount || parseFloat(amount) <= 0}
              >
                Continue
              </Button>
            </DialogFooter>
          </div>
        );

      case 'send':
        return (
          <div className="space-y-6">
            <div className="p-4 rounded-lg bg-muted/50 border space-y-4">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-3 rounded-xl bg-primary/10 flex items-center justify-center">
                  <QrCode className="h-8 w-8 text-primary" />
                </div>
                <p className="text-sm font-medium">Send {amount} {token} to:</p>
              </div>

              {platformWallet ? (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-background border font-mono text-xs break-all">
                    {platformWallet}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={handleCopyAddress}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Address
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <Skeleton className="h-16 w-full" />
              )}
            </div>

            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Only send {token} on the PezkuwiChain network. Sending other tokens or using
                other networks will result in permanent loss of funds.
              </AlertDescription>
            </Alert>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep('select')}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleSendDeposit}
                disabled={loading || !platformWallet}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    Send {amount} {token}
                  </>
                )}
              </Button>
            </div>
          </div>
        );

      case 'verify':
        return (
          <div className="space-y-6">
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <AlertDescription>
                Transaction sent! Please verify your deposit to credit your P2P balance.
              </AlertDescription>
            </Alert>

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

            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Token</p>
                  <p className="font-semibold">{token}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-semibold">{amount}</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={handleVerifyDeposit}
                disabled={verifying || !txHash}
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify Deposit'
                )}
              </Button>
            </DialogFooter>
          </div>
        );

      case 'success':
        return (
          <div className="space-y-6 text-center">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>

            <div>
              <h3 className="text-xl font-semibold text-green-500">
                Deposit Successful!
              </h3>
              <p className="text-muted-foreground mt-2">
                {amount} {token} has been added to your P2P internal balance.
              </p>
            </div>

            <div className="p-4 rounded-lg bg-muted/50 border">
              <p className="text-sm text-muted-foreground">
                You can now create sell offers or trade P2P using your internal balance.
                No blockchain fees during P2P trades!
              </p>
            </div>

            <Button onClick={handleClose} className="w-full">
              Done
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Deposit to P2P Balance
          </DialogTitle>
          {step !== 'success' && (
            <DialogDescription>
              {step === 'select' && 'Deposit crypto from your wallet to P2P internal balance'}
              {step === 'send' && 'Send tokens to the platform escrow wallet'}
              {step === 'verify' && 'Verify your transaction to credit your balance'}
            </DialogDescription>
          )}
        </DialogHeader>

        {renderStepContent()}
      </DialogContent>
    </Dialog>
  );
}
