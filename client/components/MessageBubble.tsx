import React from 'react';
import { ChatMessage } from '../types';
import { Check, CheckCheck } from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
  isRepeatedSender?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isRepeatedSender }) => {
  const { text, timestamp, isSelf, name } = message;

  return (
    <div className={`flex w-full flex-col ${isSelf ? 'items-end' : 'items-start'} ${isRepeatedSender ? 'mt-1' : 'mt-4'}`}>
      
      {!isSelf && !isRepeatedSender && (
        <span className="mb-1 ml-1 text-xs font-bold text-gray-500">{name}</span>
      )}
      
      <div
        className={`relative min-w-[80px] max-w-[85%] md:max-w-[70%] rounded-xl px-4 py-2 pb-6 shadow-sm ${
          isSelf 
            ? 'rounded-tr-none bg-[#Dcf8c6] text-gray-900' // WhatsApp-like green
            : 'rounded-tl-none bg-white text-gray-900'
        }`}
      >
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed break-words">{text}</p>
        
        <div className="absolute bottom-1 right-2 flex items-center space-x-1">
            <span className={`text-[11px] ${isSelf ? 'text-gray-500' : 'text-gray-400'}`}>
                {timestamp}
            </span>
            {isSelf && (
                 <CheckCheck size={14} className="text-blue-500" />
            )}
        </div>
      </div>
    </div>
  );
};