import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip } from 'lucide-react';
import { ChatMessage, User } from '../types';
import { MessageBubble } from './MessageBubble';

interface ChatWindowProps {
  messages: ChatMessage[];
  currentUser: User;
  onSendMessage: (text: string) => void;
  isConnected: boolean;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({ messages, currentUser, onSendMessage, isConnected }) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (inputText.trim() && isConnected) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Reverse messages for display since the hook adds new ones to the front for array efficiency, 
  // but typically we render top-down. 
  // Actually, standard flex-col renders top-down. 
  // If the hook uses `[new, ...prev]`, then index 0 is newest.
  // We should render `[...messages].reverse()` to have oldest at top, newest at bottom.
  const displayMessages = [...messages].reverse();

  return (
    <>
        {/* Messages Area */}
        <div 
            className="flex-1 overflow-y-auto px-4 pb-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat bg-fixed opacity-100"
            style={{ backgroundColor: '#EFE7DD' }}
        >
            <div className="flex flex-col justify-end min-h-full pb-2">
                {displayMessages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center text-gray-500 opacity-60">
                        <div className="rounded-full bg-white/50 p-6 mb-4">
                            <Send size={48} className="text-gray-400" />
                        </div>
                        <p className="text-sm">No messages yet. Say hello!</p>
                    </div>
                ) : (
                    displayMessages.map((msg, index) => {
                        const prevMsg = displayMessages[index - 1];
                        const isRepeatedSender = prevMsg && prevMsg.name === msg.name && prevMsg.type === 'message';
                        return (
                            <MessageBubble 
                                key={msg.id || index} 
                                message={msg} 
                                isRepeatedSender={!!isRepeatedSender}
                            />
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>
        </div>

        {/* Input Area */}
        <div className="bg-[#F0F2F5] px-4 py-3 md:px-6">
            <div className="flex items-end gap-2 rounded-3xl bg-white px-4 py-2 shadow-sm border border-gray-100">
                <button className="mb-2 text-gray-400 hover:text-gray-600 transition-colors">
                    <Smile size={24} />
                </button>
                <button className="mb-2 text-gray-400 hover:text-gray-600 transition-colors hidden sm:block">
                    <Paperclip size={22} />
                </button>
                
                <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    className="max-h-32 min-h-[44px] w-full resize-none overflow-y-auto bg-transparent py-3 text-gray-800 placeholder-gray-400 focus:outline-none"
                    rows={1}
                />
                
                <button 
                    onClick={handleSend}
                    disabled={!inputText.trim() || !isConnected}
                    className={`mb-1 rounded-full p-2 transition-all ${
                        inputText.trim() 
                            ? 'bg-primary text-white hover:bg-primary-dark shadow-md' 
                            : 'bg-transparent text-gray-400'
                    }`}
                >
                    <Send size={20} className={inputText.trim() ? "ml-0.5" : ""} />
                </button>
            </div>
        </div>
    </>
  );
};