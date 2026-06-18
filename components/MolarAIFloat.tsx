import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MolarChat } from '../MolarChat';
import { ChatHistory } from '../types';

interface MolarAIFloatProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  chatHistory: ChatHistory[];
  isChatLoading: boolean;
  chatInput: string;
  setChatInput: (value: string) => void;
  onSendMessage: (e?: React.FormEvent) => void;
  onClearChat: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
  onPetToggle?: () => void;
  disabled?: boolean;
}

export default function MolarAIFloat({
  isOpen,
  onOpen,
  onClose,
  chatHistory,
  isChatLoading,
  chatInput,
  setChatInput,
  onSendMessage,
  onClearChat,
  chatEndRef,
  onPetToggle,
  disabled = false,
}: MolarAIFloatProps) {
  const [badgeText, setBadgeText] = useState(disabled ? 'Log In' : 'Ask Me');

  useEffect(() => {
    const labels = disabled ? ['Log In', 'Get Started'] : ['Ask Me', 'Try Me!', 'SNAI'];
    let index = 0;
    setBadgeText(labels[index]);

    const interval = window.setInterval(() => {
      index = (index + 1) % labels.length;
      setBadgeText(labels[index]);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [disabled]);

  return (
    <>
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col items-center group">
          <div className="relative flex items-center justify-center">
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-[70] pointer-events-none">
              <AnimatePresence mode="wait">
                <motion.div
                  key={badgeText}
                  initial={{ opacity: 0, y: 5, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.9 }}
                  className="bg-white text-emerald-500 text-[12px] font-bold tracking-wider px-2 py-0.5 rounded-full shadow-lg shadow-emerald-500/40 whitespace-nowrap"
                >
                  {badgeText}
                </motion.div>
              </AnimatePresence>
            </div>
            <button
              type="button"
              onClick={onOpen}
              disabled={disabled}
              className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-lg transition-all shadow-[#1F7A6F]/30 relative overflow-hidden ${
                disabled
                  ? 'bg-slate-300 grayscale cursor-not-allowed opacity-70'
                  : 'bg-[#1F7A6F] hover:scale-105 hover:shadow-xl'
              }`}
              aria-label="Open SNAI chat"
            >
              <img src="/icons/ai_logo.png" alt="SNAI" className="w-10 h-10 object-contain drop-shadow-sm transition-transform" />
            </button>
          </div>
        </div>
      )}

      <MolarChat
        isOpen={isOpen}
        onClose={onClose}
        chatHistory={chatHistory}
        isChatLoading={isChatLoading}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendMessage={onSendMessage}
        onClearChat={onClearChat}
        chatEndRef={chatEndRef}
        onPetToggle={onPetToggle}
      />
    </>
  );
}
