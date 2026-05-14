"use client"

import * as React from 'react'
import { Info } from 'lucide-react'

export interface RoleItemProps {
    id: string;
    name: string;
    value: string;
    setter?: (val: string) => void;
    description: string;
}

export function RoleItem({ name, value, setter, description }: RoleItemProps) {
    const [showInfo, setShowInfo] = React.useState(false);

    const handleSetter = (statusId: string) => {
        if (setter) {
            setter(statusId);
        }
    };

    return (
        <div className="bg-slate-900/50 border border-slate-600/30 rounded-lg p-3 transition-all duration-300">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-white font-medium text-sm">{name}</span>
                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        className={`p-1 rounded-full transition-colors ${showInfo ? 'bg-slate-200/20 text-slate-200' : 'text-slate-600 hover:text-slate-300'}`}
                        title="Kliknij, aby dowiedzieć się więcej"
                    >
                        <Info size={14} />
                    </button>
                </div>
            </div>

            {showInfo && (
                <div className="mb-3 p-3 rounded bg-slate-200/5 border border-slate-200/10 text-[11px] text-slate-300 leading-relaxed animate-in fade-in slide-in-from-top-1">
                    {description}
                </div>
            )}

            <div className="flex gap-2">
                {[
                    { statusId: 'active', label: 'Aktywny', color: 'bg-green-500/20 text-green-400 border border-green-500/50' },
                    { statusId: 'interested', label: 'Zainteresowany', color: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' },
                    { statusId: 'not_interested', label: 'To nie dla mnie', color: 'bg-red-500/20 text-red-400 border border-red-500/50' }
                ].map(({ statusId, label, color }) => (
                    <button
                        key={statusId}
                        onClick={() => handleSetter(statusId)}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition ${value === statusId ? color : 'bg-white/5 text-slate-600 hover:bg-white/10 border border-transparent'
                            }`}
                    >
                        {label}
                    </button>
                ))}
            </div>
        </div>
    );
}
