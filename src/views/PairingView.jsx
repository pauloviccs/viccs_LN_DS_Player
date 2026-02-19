import React from 'react';
import { Loader2, Monitor, Wifi } from 'lucide-react';
import { getDeviceId } from '../lib/device';

export default function PairingView({ code }) {
    return (
        <div className="relative flex flex-col items-center justify-center min-h-screen overflow-hidden bg-black text-white p-8">
            {/* Ambient Background */}
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-600/30 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-600/30 rounded-full blur-[120px] animate-pulse delay-1000" />

            {/* Solid Card for TV Performance */}
            <div className="relative z-10 w-full max-w-lg bg-[#111111] border border-white/20 rounded-3xl p-12 shadow-2xl flex flex-col items-center text-center animate-fade-in-up">

                {/* Header Icon */}
                <div className="mb-8 p-4 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl border border-white/10 shadow-inner">
                    <Monitor size={48} className="text-blue-400 drop-shadow-glow" />
                </div>

                {/* Title */}
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent mb-2">
                    Lumia Player
                </h1>
                <p className="text-white/40 font-light text-lg mb-10">
                    Conecte esta tela ao seu painel
                </p>

                <div className="relative group mb-10">
                    {/* Simplified Background */}
                    <div className="absolute -inset-1 bg-blue-900/50 rounded-2xl opacity-20" />
                    <div className="relative bg-[#000000] border border-white/20 rounded-2xl px-12 py-6">
                        <span className="text-7xl font-mono font-bold tracking-[0.2em] text-white drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
                            {code}
                        </span>
                    </div>
                </div>

                {/* Status Indicator */}
                <div className="flex items-center space-x-3 bg-white/10 px-4 py-2 rounded-full border border-white/10">
                    <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </div>
                    <span className="text-sm font-medium text-white/60 tracking-wider">AGUARDANDO CONEXÃO</span>
                </div>

            </div>

            {/* Footer */}
            <div className="absolute bottom-8 flex flex-col items-center space-y-2 opacity-30">
                <div className="flex items-center space-x-2 text-xs font-mono">
                    <Wifi size={12} />
                    <span>DEVICE ID: {getDeviceId()}</span>
                </div>
                <p className="text-[10px] uppercase tracking-widest">Lumia Digital Signage v1.2</p>
            </div>
        </div>
    );
}
