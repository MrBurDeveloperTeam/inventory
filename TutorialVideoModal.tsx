import React from 'react';
import { X, PlayCircle } from 'lucide-react';

interface TutorialVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TutorialVideoModal: React.FC<TutorialVideoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            <PlayCircle className="text-[#004aad]" size={20} />
            Snabbb Inventory Tutorial
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="bg-black">
          <video
            className="w-full aspect-video"
            src="/video/snabbb-inventory-tutorial.mp4"
            controls
            autoPlay
            playsInline
          >
            Sorry, your browser doesn't support embedded videos.
          </video>
        </div>

        <div className="p-4 flex justify-end bg-slate-50/50 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#004aad] text-white text-sm font-bold hover:bg-[#003a8a] transition-colors"
          >
            Got it, let's go
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialVideoModal;
