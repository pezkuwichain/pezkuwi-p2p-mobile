import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Star, Loader2, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface RatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  tradeId: string;
  counterpartyId: string;
  counterpartyWallet: string;
  isBuyer: boolean;
}

export function RatingModal({
  isOpen,
  onClose,
  tradeId,
  counterpartyId,
  counterpartyWallet,
  isBuyer,
}: RatingModalProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!user || rating === 0) {
      toast.error('Please select a rating');
      return;
    }

    setLoading(true);

    try {
      // Check if already rated
      const { data: existingRating } = await supabase
        .from('p2p_ratings')
        .select('id')
        .eq('trade_id', tradeId)
        .eq('rater_id', user.id)
        .single();

      if (existingRating) {
        toast.error('You have already rated this trade');
        onClose();
        return;
      }

      // Insert rating
      const { error: ratingError } = await supabase.from('p2p_ratings').insert({
        trade_id: tradeId,
        rater_id: user.id,
        rated_id: counterpartyId,
        rating,
        review: review.trim() || null,
      });

      if (ratingError) throw ratingError;

      // Update reputation score
      const { data: repData } = await supabase
        .from('p2p_reputation')
        .select('*')
        .eq('user_id', counterpartyId)
        .single();

      if (repData) {
        // Calculate new average rating
        const { data: allRatings } = await supabase
          .from('p2p_ratings')
          .select('rating')
          .eq('rated_id', counterpartyId);

        const totalRatings = allRatings?.length || 0;
        const avgRating = allRatings
          ? allRatings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
          : rating;

        // Update reputation
        await supabase
          .from('p2p_reputation')
          .update({
            reputation_score: Math.round(avgRating * 20), // Convert 5-star to 100-point scale
          })
          .eq('user_id', counterpartyId);
      }

      // Create notification
      await supabase.from('p2p_notifications').insert({
        user_id: counterpartyId,
        type: 'new_rating',
        title: 'New Rating Received',
        message: `You received a ${rating}-star rating`,
        reference_type: 'trade',
        reference_id: tradeId,
        is_read: false,
      });

      toast.success('Rating submitted successfully');
      onClose();
    } catch (error) {
      console.error('Submit rating error:', error);
      toast.error('Failed to submit rating');
    } finally {
      setLoading(false);
    }
  };

  const renderStars = () => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => setRating(star)}
            onMouseEnter={() => setHoveredRating(star)}
            onMouseLeave={() => setHoveredRating(0)}
            className="p-1 transition-transform hover:scale-110"
          >
            <Star
              className={`w-8 h-8 transition-colors ${
                star <= (hoveredRating || rating)
                  ? 'fill-yellow-400 text-yellow-400'
                  : 'text-gray-600'
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  const getRatingLabel = (r: number): string => {
    switch (r) {
      case 1: return 'Poor';
      case 2: return 'Fair';
      case 3: return 'Good';
      case 4: return 'Very Good';
      case 5: return 'Excellent';
      default: return 'Select a rating';
    }
  };

  const quickReviews = [
    { icon: ThumbsUp, text: 'Fast payment', positive: true },
    { icon: ThumbsUp, text: 'Good communication', positive: true },
    { icon: ThumbsUp, text: 'Smooth transaction', positive: true },
    { icon: ThumbsDown, text: 'Slow response', positive: false },
    { icon: ThumbsDown, text: 'Delayed payment', positive: false },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Your Experience</DialogTitle>
          <DialogDescription className="text-gray-400">
            How was your trade with {counterpartyWallet.slice(0, 6)}...{counterpartyWallet.slice(-4)}?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Star Rating */}
          <div className="flex flex-col items-center gap-2">
            {renderStars()}
            <p className={`text-sm font-medium ${
              rating >= 4 ? 'text-green-400' :
              rating >= 3 ? 'text-yellow-400' :
              rating >= 1 ? 'text-red-400' : 'text-gray-500'
            }`}>
              {getRatingLabel(hoveredRating || rating)}
            </p>
          </div>

          {/* Quick Review Buttons */}
          <div>
            <Label className="text-gray-400 text-sm">Quick feedback (optional)</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {quickReviews.map((qr, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setReview(prev =>
                    prev ? `${prev}, ${qr.text}` : qr.text
                  )}
                  className={`
                    flex items-center gap-1 px-3 py-1.5 rounded-full text-sm
                    border transition-colors
                    ${qr.positive
                      ? 'border-green-500/30 text-green-400 hover:bg-green-500/10'
                      : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                    }
                  `}
                >
                  <qr.icon className="w-3 h-3" />
                  {qr.text}
                </button>
              ))}
            </div>
          </div>

          {/* Review Text */}
          <div>
            <Label htmlFor="review" className="text-gray-400 text-sm">
              Additional comments (optional)
            </Label>
            <Textarea
              id="review"
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="Share your experience..."
              className="mt-2 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 resize-none"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-gray-500 text-right mt-1">
              {review.length}/500
            </p>
          </div>

          {/* Role Badge */}
          <div className="flex items-center justify-center">
            <span className={`
              px-3 py-1 rounded-full text-xs
              ${isBuyer
                ? 'bg-green-500/20 text-green-400'
                : 'bg-blue-500/20 text-blue-400'
              }
            `}>
              Rating as {isBuyer ? 'Buyer' : 'Seller'}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="border-gray-700"
          >
            Skip
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={rating === 0 || loading}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Rating'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
