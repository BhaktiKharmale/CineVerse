import React from "react";

interface AgentCostMeterProps {
  steps: number;
  tokens: number;
}

export function AgentCostMeter({ steps, tokens }: AgentCostMeterProps) {
  return (
    <div className="flex items-center gap-3 text-xs text-gray-400">
      <div className="flex items-center gap-1">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 font-semibold text-emerald-300">
          ₹
        </span>
        <span>
          Cost steps: <span className="font-medium text-gray-200">{steps}</span>
        </span>
      </div>
      <div className="flex items-center gap-1">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 font-semibold text-sky-300">
          Ⓣ
        </span>
        <span>
          Tokens: <span className="font-medium text-gray-200">{tokens}</span>
        </span>
      </div>
    </div>
  );
}

export default AgentCostMeter;
