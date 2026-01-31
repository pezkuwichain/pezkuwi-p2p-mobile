import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Send,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  CheckCheck,
  Clock,
  Bot,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  trade_id: string;
  sender_id: string;
  message: string;
  message_type: 'text' | 'image' | 'system';
  attachment_url?: string;
  is_read: boolean;
  created_at: string;
}

interface TradeChatProps {
  tradeId: string;
  counterpartyId: string;
  counterpartyWallet: string;
  isTradeActive: boolean;
}

export function TradeChat({
  tradeId,
  counterpartyId,
  counterpartyWallet,
  isTradeActive,
}: TradeChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('p2p_messages')
        .select('*')
        .eq('trade_id', tradeId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);

      // Mark messages as read
      if (user && data && data.length > 0) {
        const unreadIds = data
          .filter(m => m.sender_id !== user.id && !m.is_read)
          .map(m => m.id);

        if (unreadIds.length > 0) {
          await supabase
            .from('p2p_messages')
            .update({ is_read: true })
            .in('id', unreadIds);
        }
      }
    } catch (error) {
      console.error('Fetch messages error:', error);
    } finally {
      setLoading(false);
    }
  }, [tradeId, user]);

  // Initial fetch
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${tradeId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'p2p_messages',
          filter: `trade_id=eq.${tradeId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });

          // Mark as read if from counterparty
          if (user && newMsg.sender_id !== user.id) {
            supabase
              .from('p2p_messages')
              .update({ is_read: true })
              .eq('id', newMsg.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tradeId, user]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Send message
  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user || sending) return;

    const messageText = newMessage.trim();
    setNewMessage('');
    setSending(true);

    try {
      const { error } = await supabase.from('p2p_messages').insert({
        trade_id: tradeId,
        sender_id: user.id,
        message: messageText,
        message_type: 'text',
        is_read: false,
      });

      if (error) throw error;

      // Create notification for counterparty
      await supabase.from('p2p_notifications').insert({
        user_id: counterpartyId,
        type: 'new_message',
        title: 'New Message',
        message: messageText.slice(0, 100),
        reference_type: 'trade',
        reference_id: tradeId,
        is_read: false,
      });
    } catch (error) {
      console.error('Send message error:', error);
      toast.error('Failed to send message');
      setNewMessage(messageText); // Restore message
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Upload image
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploading(true);

    try {
      // Upload to Supabase Storage
      const fileName = `${tradeId}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('p2p-chat-images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('p2p-chat-images')
        .getPublicUrl(uploadData.path);

      // Insert message with image
      const { error: msgError } = await supabase.from('p2p_messages').insert({
        trade_id: tradeId,
        sender_id: user.id,
        message: 'Sent an image',
        message_type: 'image',
        attachment_url: urlData.publicUrl,
        is_read: false,
      });

      if (msgError) throw msgError;

      // Create notification
      await supabase.from('p2p_notifications').insert({
        user_id: counterpartyId,
        type: 'new_message',
        title: 'New Image',
        message: 'Sent an image',
        reference_type: 'trade',
        reference_id: tradeId,
        is_read: false,
      });

      toast.success('Image sent');
    } catch (error) {
      console.error('Upload image error:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Format timestamp
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Render message
  const renderMessage = (message: Message) => {
    const isOwn = message.sender_id === user?.id;
    const isSystem = message.message_type === 'system';

    if (isSystem) {
      return (
        <div key={message.id} className="flex justify-center my-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full text-xs text-gray-400">
            <Bot className="w-3 h-3" />
            {message.message}
          </div>
        </div>
      );
    }

    return (
      <div
        key={message.id}
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-3`}
      >
        <div className={`flex items-end gap-2 max-w-[75%] ${isOwn ? 'flex-row-reverse' : ''}`}>
          {!isOwn && (
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-gray-700 text-xs">
                {counterpartyWallet.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
          <div>
            <div
              className={`
                px-3 py-2 rounded-2xl
                ${isOwn
                  ? 'bg-green-600 text-white rounded-br-sm'
                  : 'bg-gray-700 text-white rounded-bl-sm'
                }
              `}
            >
              {message.message_type === 'image' && message.attachment_url ? (
                <a
                  href={message.attachment_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <img
                    src={message.attachment_url}
                    alt="Shared image"
                    className="max-w-[200px] max-h-[200px] rounded-lg"
                  />
                </a>
              ) : (
                <p className="text-sm whitespace-pre-wrap break-words">{message.message}</p>
              )}
            </div>
            <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
              <span className="text-xs text-gray-500">{formatTime(message.created_at)}</span>
              {isOwn && (
                message.is_read ? (
                  <CheckCheck className="w-3 h-3 text-blue-400" />
                ) : (
                  <Clock className="w-3 h-3 text-gray-500" />
                )
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className="bg-gray-900 border-gray-800 h-[400px] flex flex-col">
      <CardHeader className="py-3 px-4 border-b border-gray-800">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <span>Chat</span>
          {messages.filter(m => m.sender_id !== user?.id && !m.is_read).length > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-green-500 text-white rounded-full">
              {messages.filter(m => m.sender_id !== user?.id && !m.is_read).length}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <AlertCircle className="w-8 h-8 mb-2" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs">Start the conversation</p>
            </div>
          ) : (
            messages.map(renderMessage)
          )}
        </ScrollArea>

        {/* Input */}
        {isTradeActive ? (
          <div className="p-3 border-t border-gray-800">
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleImageUpload}
                className="hidden"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-gray-400 hover:text-white"
              >
                {uploading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ImageIcon className="w-5 h-5" />
                )}
              </Button>
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
              <Button
                size="sm"
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || sending}
                className="bg-green-600 hover:bg-green-700"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3 border-t border-gray-800 text-center">
            <p className="text-sm text-gray-500">
              Chat is disabled for completed/cancelled trades
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
