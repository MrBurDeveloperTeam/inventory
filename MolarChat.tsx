import React, { useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Sparkles, Activity, Zap, ShieldCheck } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatHistory } from './types';

// --- Text Extraction for Logic ---
const getText = (node: any): string => {
    if (!node) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(getText).join("");
    if (node.props && node.props.children) return getText(node.props.children);
    return "";
};

// --- Custom Markdown Components (Light Mode) ---
const MARKDOWN_COMPONENTS = {
    strong: ({ node, ...props }: any) => {
        const text = getText(props.children);
        const isExpired = text.includes('(EXP)');
        const isSoon = text.includes('(SOON)');
        return (
            <strong
                className={`font-semibold ${isExpired ? 'text-rose-700' :
                    isSoon ? 'text-amber-700' :
                        'text-slate-800'
                    }`}
                {...props}
            />
        );
    },
    table: ({ node, ...props }: any) => (
        <div className="my-4 overflow-hidden rounded-xl border border-slate-200 bg-white/60 shadow-sm w-full max-w-full">
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
                <table className="w-full text-left text-xs border-collapse" {...props} />
            </div>
        </div>
    ),
    thead: ({ node, ...props }: any) => <thead className="bg-slate-50/80 border-b border-slate-200" {...props} />,
    th: ({ node, ...props }: any) => <th className="px-4 py-3 font-semibold text-slate-500 uppercase tracking-wider text-[10px]" {...props} />,
    tr: ({ node, ...props }: any) => (
        <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors" {...props} />
    ),
    td: ({ node, ...props }: any) => {
        const cellText = getText(props.children);
        const isExpired = cellText.includes('(EXP)');
        const isSoon = cellText.includes('(SOON)');
        return (
            <td
                className={`px-4 py-3 text-xs font-medium whitespace-nowrap ${isExpired ? 'text-rose-600 font-semibold' :
                    isSoon ? 'text-amber-600 font-semibold' :
                        'text-slate-600'
                    }`}
                {...props}
            />
        );
    },
    p: ({ node, ...props }: any) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
    ul: ({ node, ...props }: any) => <ul className="list-disc pl-4 mb-2 space-y-1 text-slate-700" {...props} />,
    li: ({ node, ...props }: any) => <li className="pl-1 marker:text-emerald-500" {...props} />
};

const MemoizedMessage = React.memo(({ text }: { text: string }) => {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {text}
        </ReactMarkdown>
    );
});

interface MolarChatProps {
    isOpen: boolean;
    onClose: () => void;
    chatHistory: ChatHistory[];
    isChatLoading: boolean;
    chatInput: string;
    setChatInput: (val: string) => void;
    onSendMessage: (e?: React.FormEvent) => void;
    chatEndRef: React.RefObject<HTMLDivElement>;
}

export const MolarChat = React.memo(({
    isOpen,
    onClose,
    chatHistory,
    isChatLoading,
    chatInput,
    setChatInput,
    onSendMessage,
    chatEndRef
}: MolarChatProps) => {
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop for mobile */}
            <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-[2px] z-[9998] md:hidden" onClick={onClose} />

            {/* Main Capsule Container */}
            <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 w-[90vw] md:w-[420px] h-[75vh] md:h-[700px] max-h-[85vh] flex flex-col font-sans z-[9999] animate-in slide-in-from-bottom-[5%] duration-500 ease-out-back overflow-hidden rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-white/40 bg-white/80 backdrop-blur-2xl ring-1 ring-slate-900/5">

                {/* Background Ambience */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-10%] right-[-10%] w-[350px] h-[350px] bg-emerald-100/50 rounded-full blur-[80px] animate-pulse-slow mix-blend-multiply"></div>
                    <div className="absolute bottom-[-10%] left-[-10%] w-[300px] h-[300px] bg-teal-100/50 rounded-full blur-[60px] animate-pulse-slow delay-1000 mix-blend-multiply"></div>
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.2] mix-blend-overlay"></div>
                </div>

                {/* Header (Status Bar Style) */}
                <div className="flex items-center justify-between px-6 py-4 relative z-10 border-b border-white/10 bg-gradient-to-r from-emerald-600 to-teal-600 shadow-md">
                    {/* Noise Texture Overlay for the Header */}
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>

                    <div className="flex items-center gap-3 relative z-10">
                        <div className="relative">
                            <div className="w-11 h-11 rounded-full border border-white/20 shadow-inner overflow-hidden bg-white/90">
                                <img src="/images/MolarAI.png" alt="Molar AI" className="w-full h-full object-cover scale-125 translate-y-1" />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-base text-white tracking-tight drop-shadow-sm">Molar AI</h3>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-200 animate-pulse shadow-[0_0_8px_rgba(167,243,208,0.8)]"></span>
                                <p className="text-[10px] font-semibold text-emerald-50/90 uppercase tracking-widest leading-none">System Online</p>
                            </div>
                        </div>
                    </div>

                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="relative z-10 p-1 text-white hover:text-white/80 transition-transform duration-200 hover:scale-110 active:scale-95"
                        aria-label="Close chat"
                    >
                        <X className="w-7 h-7" />
                    </button>

                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 scroll-smooth scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent relative z-10">
                    {chatHistory.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-center pb-12 animate-in fade-in zoom-in-95 duration-700">
                            <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-white to-slate-50 border border-white flex items-center justify-center mb-6 shadow-xl shadow-slate-200/60 rotate-3">
                                <Sparkles className="w-8 h-8 text-emerald-500" />
                            </div>
                            <p className="text-slate-500 text-sm max-w-[260px] leading-relaxed mb-8 font-medium">
                                Ready to analyze inventory streams and track supply metrics.
                            </p>

                            <div className="grid grid-cols-1 gap-2.5 w-full max-w-[280px]">
                                <button onClick={() => setChatInput("Check expiring stock")} className="group flex items-center gap-3 w-full p-3 rounded-2xl bg-white border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all shadow-sm hover:shadow-md text-left">
                                    <div className="w-8 h-8 rounded-full bg-emerald-100/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <Zap className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <span className="text-xs font-semibold text-slate-600 group-hover:text-emerald-700">Check expiring stock</span>
                                </button>
                                <button onClick={() => setChatInput("Total inventory value")} className="group flex items-center gap-3 w-full p-3 rounded-2xl bg-white border border-slate-100 hover:border-teal-200 hover:bg-teal-50/30 transition-all shadow-sm hover:shadow-md text-left">
                                    <div className="w-8 h-8 rounded-full bg-teal-100/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <ShieldCheck className="w-4 h-4 text-teal-600" />
                                    </div>
                                    <span className="text-xs font-semibold text-slate-600 group-hover:text-teal-700">Total inventory value</span>
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="space-y-5 pt-2 pb-0">
                        {chatHistory.map((msg, idx) => {
                            const isUser = msg.role === 'user';
                            return (
                                <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-500`}>
                                    <div className={`max-w-[100%] relative ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                                        <div className={`px-4 py-2 text-sm leading-relaxed backdrop-blur-sm shadow-sm border max-w-full overflow-hidden ${isUser
                                            ? 'bg-emerald-600 border-transparent text-white rounded-[1.2rem] rounded-br-sm shadow-md shadow-emerald-500/20'
                                            : 'bg-slate-100/70 text-slate-700 border-slate-200/80 rounded-[1.2rem] rounded-tl-sm'
                                            }`}>
                                            <MemoizedMessage text={msg.parts[0].text} />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {isChatLoading && (
                            <div className="flex justify-start animate-in fade-in duration-300">
                                <div className="px-5 py-4 bg-white/80 border border-slate-100 rounded-[1.2rem] rounded-tl-sm flex gap-2 items-center shadow-sm">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_-0.3s]"></div>
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite_-0.15s]"></div>
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-[bounce_1s_infinite]"></div>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>
                </div>

                {/* Footer Input Area */}
                <div className="p-3 relative z-20">
                    <button
                        onClick={onClose}
                        className="absolute -top-16 right-0 w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 flex items-center justify-center hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all duration-300 md:hidden pointer-events-auto shadow-lg"
                    >
                        <X className="w-4 h-4" />
                    </button>

                    <form onSubmit={onSendMessage} className="relative w-full max-w-xl mx-auto">
                        {/* Container */}
                        <div
                            className="
                        relative flex items-center gap-2 p-1.5 rounded-full transition-all duration-300 ease-out
                        bg-slate-100
                        shadow-[inset_2px_2px_5px_rgba(148,163,184,0.25),inset_0px_-3px_6px_rgba(148,163,184,0.15),inset_-3px_-3px_7px_rgba(255,255,255,1)]
                        ring-1 ring-white/60 border border-slate-300/70
                        focus-within:shadow-[inset_3px_3px_6px_rgba(148,163,184,0.35),inset_0px_-4px_8px_rgba(148,163,184,0.25),inset_-3px_-3px_6px_rgba(255,255,255,1)]
                        focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500/50
                        "
                        >
                            <input
                                ref={inputRef}
                                className="
                            flex-1 bg-transparent border-0 px-5 py-3 text-sm text-slate-700
                            placeholder:text-slate-400/80 font-medium tracking-wide
                            focus:outline-none focus:ring-0
                        "
                                placeholder="Type your command..."
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                            />

                            <button
                                type="submit"
                                disabled={!chatInput.trim() || isChatLoading}
                                className={`
                            p-2.5 rounded-full flex items-center justify-center transition-all duration-300 ease-out
                            ${chatInput.trim() && !isChatLoading
                                        ? 'bg-emerald-500 text-white shadow-[3px_3px_6px_rgba(16,185,129,0.4),-2px_-2px_5px_rgba(255,255,255,0.8)] hover:scale-105 hover:bg-emerald-400 active:scale-95 active:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.1)]'
                                        : 'bg-slate-200/50 text-slate-400 cursor-not-allowed shadow-none'
                                    }
                        `}
                            >
                                <Send className={`w-4 h-4 ${chatInput.trim() ? 'ml-0' : ''}`} />
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Custom Animations */}
            <style>{`
                .animate-pulse-slow {
                    animation: pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
                .ease-out-back {
                    transition-timing-function: cubic-bezier(0.34, 1.56, 0.64, 1);
                }
            `}</style>
        </>
    );
});
